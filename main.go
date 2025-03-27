package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// FileNode represents a file or directory in the filesystem
type FileNode struct {
	Name     string     `json:"name"`
	Path     string     `json:"path"`
	Size     int64      `json:"size"`
	IsDir    bool       `json:"isDir"`
	Modified time.Time  `json:"modified"`
	Children []FileNode `json:"children,omitempty"`
}

func scanDirectory(path string) (FileNode, error) {
	info, err := os.Stat(path)
	if err != nil {
		return FileNode{}, err
	}

	// For file paths in the API, we want to store relative paths
	// Calculate the relative path to the root
	relPath, err := filepath.Rel(absPath, path)
	if err != nil {
		// If we can't get relative path, just use the basename
		relPath = filepath.Base(path)
	}

	// For the root directory, use "." as the relative path
	if relPath == "" {
		relPath = "."
	}

	node := FileNode{
		Name:     filepath.Base(path),
		Path:     relPath,
		Size:     info.Size(),
		IsDir:    info.IsDir(),
		Modified: info.ModTime(),
	}

	if node.IsDir {
		entries, err := os.ReadDir(path)
		if err != nil {
			return node, err
		}

		for _, entry := range entries {
			entryName := entry.Name()

			// Skip hidden files/directories unless showHidden is true
			if !showHidden && strings.HasPrefix(entryName, ".") {
				continue
			}

			// Skip directories that are in the ignore list
			if entry.IsDir() && ignoreDirMap[entryName] {
				fmt.Printf("Ignoring directory: %s\n", entryName)
				continue
			}

			childPath := filepath.Join(path, entryName)
			child, err := scanDirectory(childPath)
			if err != nil {
				fmt.Printf("Error scanning %s: %v\n", childPath, err)
				continue
			}
			node.Children = append(node.Children, child)
		}
	}

	return node, nil
}

// Make global variables available so scanDirectory can access them
var (
	absPath      string
	showHidden   bool
	ignoreDirs   []string        // Dirs to ignore
	ignoreDirMap map[string]bool // For faster lookups
)

func main() {
	var rootPath string
	var port int

	// Define ignore directory flag as a comma-separated string
	var ignoreDirsFlag string

	// Parse command line arguments
	flag.StringVar(&rootPath, "path", ".", "Path to directory to visualize")
	flag.IntVar(&port, "port", 8080, "Port to serve on")
	flag.BoolVar(&showHidden, "hidden", false, "Show hidden files and directories")
	flag.StringVar(&ignoreDirsFlag, "ignore", "", "Comma-separated list of directories to ignore")
	flag.Parse()

	// Process ignore directories if provided
	if ignoreDirsFlag != "" {
		ignoreDirs = strings.Split(ignoreDirsFlag, ",")
		ignoreDirMap = make(map[string]bool)
		for _, dir := range ignoreDirs {
			ignoreDirMap[strings.TrimSpace(dir)] = true
		}
	} else {
		// Initialize empty map
		ignoreDirMap = make(map[string]bool)
	}

	// If positional argument is provided, use it as rootPath
	if flag.NArg() > 0 {
		rootPath = flag.Arg(0)
	}

	// Resolve to absolute path
	var err error
	absPath, err = filepath.Abs(rootPath)
	if err != nil {
		log.Fatalf("Error resolving path: %v", err)
	}

	// Serve static files
	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))

	// API endpoint to get filesystem data
	http.HandleFunc("/api/fs", func(w http.ResponseWriter, r *http.Request) {
		rootNode, err := scanDirectory(absPath)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(rootNode)
	})

	// Serve the main page
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "templates/index.html")
	})

	// Endpoint to open a file
	http.HandleFunc("/api/open", func(w http.ResponseWriter, r *http.Request) {
		relativePath := r.URL.Query().Get("path")
		if relativePath == "" {
			http.Error(w, "Path parameter is required", http.StatusBadRequest)
			return
		}

		// Convert to absolute path for server-side processing
		path := filepath.Join(absPath, relativePath)

		// Security check - only allow paths within our root directory
		if !strings.HasPrefix(path, absPath) {
			http.Error(w, "Access denied: path outside of root directory", http.StatusForbidden)
			return
		}

		info, err := os.Stat(path)
		if err != nil {
			http.Error(w, fmt.Sprintf("Error accessing path: %v", err), http.StatusInternalServerError)
			return
		}

		if info.IsDir() {
			// For directories, send a list of files
			entries, err := os.ReadDir(path)
			if err != nil {
				http.Error(w, fmt.Sprintf("Error reading directory: %v", err), http.StatusInternalServerError)
				return
			}

			files := []map[string]interface{}{}
			for _, entry := range entries {
				// Skip hidden files/directories unless showHidden is true
				if !showHidden && strings.HasPrefix(entry.Name(), ".") {
					continue
				}

				entryInfo, err := entry.Info()
				if err != nil {
					continue
				}

				// Calculate relative path for each entry
				entryRelPath, _ := filepath.Rel(absPath, filepath.Join(path, entry.Name()))

				files = append(files, map[string]interface{}{
					"name":     entry.Name(),
					"path":     entryRelPath,
					"size":     entryInfo.Size(),
					"isDir":    entry.IsDir(),
					"modified": entryInfo.ModTime(),
				})
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(files)
		} else {
			// For files, serve the file directly
			http.ServeFile(w, r, path)
		}
	})

	// Endpoint to rename a file or directory
	http.HandleFunc("/api/rename", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed. Use POST.", http.StatusMethodNotAllowed)
			return
		}

		// Parse the JSON body
		var requestData struct {
			Path    string `json:"path"`
			NewName string `json:"newName"`
		}

		if err := json.NewDecoder(r.Body).Decode(&requestData); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if requestData.Path == "" || requestData.NewName == "" {
			http.Error(w, "Path and newName are required", http.StatusBadRequest)
			return
		}

		// Convert relative path to absolute path
		oldPath := filepath.Join(absPath, requestData.Path)

		// Security check - only allow paths within our root directory
		if !strings.HasPrefix(oldPath, absPath) {
			http.Error(w, "Access denied: path outside of root directory", http.StatusForbidden)
			return
		}

		// Get the directory containing the file/folder
		dir := filepath.Dir(oldPath)

		// Create the new path with the new name
		newPath := filepath.Join(dir, requestData.NewName)

		// Check if the new path already exists
		if _, err := os.Stat(newPath); err == nil {
			http.Error(w, "A file or directory with that name already exists", http.StatusBadRequest)
			return
		}

		// Rename the file or directory
		if err := os.Rename(oldPath, newPath); err != nil {
			http.Error(w, fmt.Sprintf("Error renaming: %v", err), http.StatusInternalServerError)
			return
		}

		// Calculate new relative path
		newRelPath, _ := filepath.Rel(absPath, newPath)

		// Return success response
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"oldPath": requestData.Path,
			"newPath": newRelPath,
			"message": "Renamed successfully",
		})
	})

	// Endpoint to delete a file or directory
	http.HandleFunc("/api/delete", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed. Use POST.", http.StatusMethodNotAllowed)
			return
		}

		// Parse the JSON body
		var requestData struct {
			Path string `json:"path"`
		}

		if err := json.NewDecoder(r.Body).Decode(&requestData); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if requestData.Path == "" {
			http.Error(w, "Path is required", http.StatusBadRequest)
			return
		}

		// Convert relative path to absolute path
		fullPath := filepath.Join(absPath, requestData.Path)

		// Security check - only allow paths within our root directory
		if !strings.HasPrefix(fullPath, absPath) {
			http.Error(w, "Access denied: path outside of root directory", http.StatusForbidden)
			return
		}

		// Check if path exists
		info, err := os.Stat(fullPath)
		if err != nil {
			http.Error(w, fmt.Sprintf("Error accessing path: %v", err), http.StatusInternalServerError)
			return
		}

		var deleteErr error
		if info.IsDir() {
			// For directories, remove recursively
			deleteErr = os.RemoveAll(fullPath)
		} else {
			// For files, simply remove
			deleteErr = os.Remove(fullPath)
		}

		if deleteErr != nil {
			http.Error(w, fmt.Sprintf("Error deleting: %v", deleteErr), http.StatusInternalServerError)
			return
		}

		// Return success response
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"path":    requestData.Path,
			"message": "Deleted successfully",
		})
	})

	// Endpoint to open a directory in the file system explorer
	http.HandleFunc("/api/open-directory", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed. Use POST.", http.StatusMethodNotAllowed)
			return
		}

		relativePath := r.URL.Query().Get("path")
		if relativePath == "" {
			http.Error(w, "Path parameter is required", http.StatusBadRequest)
			return
		}

		// Convert to absolute path for server-side processing
		path := filepath.Join(absPath, relativePath)

		// Security check - only allow paths within our root directory
		if !strings.HasPrefix(path, absPath) {
			http.Error(w, "Access denied: path outside of root directory", http.StatusForbidden)
			return
		}

		info, err := os.Stat(path)
		if err != nil {
			http.Error(w, fmt.Sprintf("Error accessing path: %v", err), http.StatusInternalServerError)
			return
		}

		if !info.IsDir() {
			http.Error(w, "Path is not a directory", http.StatusBadRequest)
			return
		}

		// Detect OS and open file explorer accordingly
		var cmd *exec.Cmd
		switch runtime.GOOS {
		case "darwin": // macOS
			cmd = exec.Command("open", path)
		case "windows":
			cmd = exec.Command("explorer", path)
		case "linux":
			cmd = exec.Command("xdg-open", path)
		default:
			http.Error(w, fmt.Sprintf("Unsupported operating system: %s", runtime.GOOS), http.StatusInternalServerError)
			return
		}

		// Execute the command
		err = cmd.Run()
		if err != nil {
			http.Error(w, fmt.Sprintf("Error opening directory: %v", err), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, "Directory opened: %s", path)
	})

	// Start the server
	serverAddr := ":" + strconv.Itoa(port)
	fmt.Printf("Cyberspace File Manager\n")
	fmt.Printf("======================\n")
	fmt.Printf("Server running at http://localhost%s\n", serverAddr)
	fmt.Printf("Visualizing directory: %s\n", absPath)
	if len(ignoreDirs) > 0 {
		fmt.Printf("Ignoring directories: %s\n", strings.Join(ignoreDirs, ", "))
	}
	fmt.Printf("Press Ctrl+C to exit\n")
	log.Fatal(http.ListenAndServe(serverAddr, nil))
}
