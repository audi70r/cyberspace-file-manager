# Cyberspace File Manager

A cyberpunk-style 3D visualization and management tool for your filesystem.

![Cyberspace File Manager](https://github.com/yourusername/cyberspace-file-manager/raw/main/screenshots/screenshot.png)

## Features

- Immersive 3D visualization with cyberpunk aesthetic
- Full file/directory management capabilities:
  - Browse your filesystem in 3D space
  - Rename files and folders
  - Delete files and folders
  - Open files and directories in your OS's default applications
- Fly through your filesystem with intuitive FPS-style controls
- Files and directories visualized as 3D structures with distinct colors by file type
- Detailed information on hover
- Size-based scaling for files
- Customizable view distance and rendering options
- Directory filtering for better performance

## Requirements

- Go 1.16+
- Modern web browser with WebGL support

## Installation

1. Clone this repository:

```bash
git clone https://github.com/yourusername/cyberspace-file-manager.git
cd cyberspace-file-manager
```

2. Build the application:

```bash
go build -o cfm main.go
```

## Usage

Run the application with a path to visualize:

```bash
./cfm /path/to/directory
```

### Command Line Options

```
-port int
    Port to serve on (default 8080)
-hidden
    Show hidden files and directories
-ignore string
    Comma-separated list of directories to ignore (e.g., "node_modules,dist,build")
```

Example with all options:

```bash
./cfm -port 8888 -hidden -ignore "node_modules,target,dist,build" /path/to/directory
```

Then open your browser and navigate to `http://localhost:8080` (or the port you specified).

## Controls

- **WASD/Arrow Keys** - Move horizontally
- **SPACE** - Move up
- **SHIFT+SPACE** - Move down
- **SHIFT** - Increase movement speed (boost)
- **Mouse** - Look around (click to lock/unlock mouse)
- **R** - Rename selected file/folder
- **DELETE/BACKSPACE** - Delete selected file/folder
- **Click** on objects to open them in the default application
- **ESC** - Unlock mouse cursor
- **Hover** over objects to see file/folder details

## File Type Color Coding

The visualization uses different colors for file types to make them easily distinguishable:

- **JavaScript/TypeScript**: Yellow/Blue
- **HTML/CSS**: Orange/Blue
- **Images**: Magenta/Green
- **Documents**: Blue/White
- **Audio/Video**: Yellow/Red
- **Archives**: Pink
- **Executable**: Red
- And many more...

## How It Works

The application builds a spatial representation of your filesystem:

1. Backend server scans the directory structure and serves it as JSON
2. Front-end builds a 3D visualization using Three.js
3. Files are rendered as 3D objects with height based on file size
4. Directories are shown as semi-transparent containers
5. The visualization uses a grid-based layout algorithm for optimal spatial arrangement

## License

MIT