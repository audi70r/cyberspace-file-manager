# 3DFS - Cyberpunk Filesystem Visualizer

A 3D cyberpunk-style visualization of your filesystem as a city.

## Features

- Visualizes directories as districts and files as buildings
- Cyberpunk visual style with neon colors and grid effects
- WASD + mouse controls for flying around the city
- File/directory information display on hover
- Buildings sized according to file size
- File types colored differently based on extension

## Requirements

- Go 1.16+
- Modern web browser with WebGL support

## Installation

Clone this repository:

```
git clone https://github.com/yourusername/3dfs.git
cd 3dfs
```

## Usage

Run the application with a path to visualize:

```
go run main.go /path/to/directory
```

Or specify a custom port:

```
go run main.go -port 8888 /path/to/directory
```

Then open your browser and navigate to `http://localhost:8080` (or the port you specified).

## Controls

- **WASD** - Move around
- **Mouse** - Look around (hold left mouse button)
- **Left-click** - Lock/unlock mouse for camera control
- **ESC** - Unlock mouse
- **Hover** over buildings or districts to see information

## How It Works

The application scans the specified directory recursively and generates a 3D city representation:

- Directories are shown as flat platforms (districts)
- Files are shown as buildings, with height based on file size
- Buildings are colored according to file type
- Districts are connected by roads for easy navigation

## License

MIT# cyberspace-file-manager
