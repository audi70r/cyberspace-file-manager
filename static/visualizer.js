// Global variables
let camera, scene, renderer;
let controls;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let moveUp = false;
let moveDown = false;
let boost = false;
let prevTime = performance.now();
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let filesystemData;
let hoverInfo = document.getElementById('hover-info');
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let objects = [];
let objectDetails = new Map(); // Store object details for hover info
let font; // Store loaded font
let highlightedObject = null; // Store currently highlighted object
let highlightedMaterial = null; // Store original material
let objectsById = new Map(); // Store objects by file/folder path for searching
let isFlying = false; // Flag to indicate if camera is automatically flying
let flyingTarget = null; // Target position for automatic flying
let flyingLookAt = null; // Look at position for automatic flying
let searchFocused = false; // Flag to track if search is focused

// Initialize the scene
function init() {
    // Load font first
    const fontLoader = new THREE.FontLoader();
    fontLoader.load('https://cdn.jsdelivr.net/npm/three@0.132.2/examples/fonts/helvetiker_regular.typeface.json', function(loadedFont) {
        font = loadedFont;
        // Once font is loaded, load filesystem data
        loadFilesystemData();
    });
    
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.0006);

    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('container').appendChild(renderer.domElement);

    // Create camera with greater far plane for large grid structures
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 15000);
    camera.position.y = 20;
    camera.position.z = 50;
    
    // Set up PointerLockControls - this will give the proper FPS feel
    controls = new THREE.PointerLockControls(camera, document.body);

    // Click event to request pointer lock or interact with objects
    document.addEventListener('click', function() {
        // If pointer is not locked, lock it
        if (!document.pointerLockElement) {
            controls.lock();
            return;
        }
        
        // If pointer is locked and we have a highlighted object, interact with it
        if (highlightedObject) {
            const details = objectDetails.get(highlightedObject.id);
            if (details) {
                if (details.type === 'Directory') {
                    // For directories, open in file explorer
                    openInFileSystem(details.path);
                } else {
                    // For files, open in browser
                    window.open(getUrlForPath(details.path, false), '_blank');
                }
            }
        }
    });

    // Add event listener for pointer lock changes
    document.addEventListener('pointerlockchange', onPointerLockChange);
    
    // Handle Ctrl+F to focus search
    document.addEventListener('keydown', function(e) {
        // Check if Ctrl+F was pressed
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault(); // Prevent browser's default search
            document.getElementById('search-bar').focus();
        }
    });
    
    // Grid removed for cleaner visualization

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x444444);
    scene.add(ambientLight);

    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
    directionalLight.position.set(1, 1, 1).normalize();
    scene.add(directionalLight);

    // Add controls object to scene
    scene.add(controls.getObject());

    // Set up keyboard controls for WASD movement
    // Store references to event handlers so they can be properly removed
    window.onKeyDownHandler = onKeyDown;
    window.onKeyUpHandler = onKeyUp;
    
    document.addEventListener('keydown', window.onKeyDownHandler);
    document.addEventListener('keyup', window.onKeyUpHandler);

    // Mouse move event for raycasting
    document.addEventListener('mousemove', onMouseMove);

    // Window resize event
    window.addEventListener('resize', onWindowResize);
    
    // Prevent context menu (right click)
    document.addEventListener('contextmenu', function(event) {
        event.preventDefault();
    });
}

// Handle pointer lock change
function onPointerLockChange() {
    const infoPanel = document.getElementById('info');
    
    if (document.pointerLockElement === document.body) {
        // Pointer is locked
        document.body.style.cursor = 'none';
        infoPanel.style.opacity = '0.3';
    } else {
        // Pointer is unlocked
        document.body.style.cursor = 'default';
        infoPanel.style.opacity = '1';
    }
}

// Key down event handler
function onKeyDown(event) {
    // If search is focused, don't handle keyboard events for camera controls
    if (searchFocused || document.querySelector('.modal-overlay')) {
        return;
    }
    
    switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
            moveForward = true;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            moveLeft = true;
            break;
        case 'KeyS':
        case 'ArrowDown':
            moveBackward = true;
            break;
        case 'KeyD':
        case 'ArrowRight':
            moveRight = true;
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            boost = true;
            break;
        // Space key moves up continuously
        case 'Space':
            if (boost) {
                // If Shift is pressed, move down
                moveDown = true;
            } else {
                // Otherwise move up
                moveUp = true;
            }
            break;
        case 'Escape':
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }
            break;
        case 'Delete':
        case 'Backspace': // For Mac users who don't have a dedicated Delete key
            if (highlightedObject) {
                const details = objectDetails.get(highlightedObject.id);
                if (details) {
                    // Temporarily exit pointer lock
                    if (document.pointerLockElement) {
                        document.exitPointerLock();
                    }
                    
                    // Create custom modal for confirming deletion
                    const overlay = document.createElement('div');
                    overlay.className = 'modal-overlay';
                    
                    // Disable camera controls while modal is open
                    moveForward = false;
                    moveBackward = false;
                    moveLeft = false;
                    moveRight = false;
                    moveUp = false;
                    moveDown = false;
                    
                    // Stop any camera movement immediately
                    velocity.set(0, 0, 0);
                    
                    const modal = document.createElement('div');
                    modal.className = 'modal';
                    
                    const header = document.createElement('div');
                    header.className = 'modal-header';
                    header.textContent = `Delete ${details.type}`;
                    
                    const message = document.createElement('div');
                    message.className = 'modal-message';
                    message.innerHTML = `Are you sure you want to delete <strong>${details.name}</strong>?<br><br><span class="warning">This action cannot be undone.</span>`;
                    
                    const buttonsDiv = document.createElement('div');
                    buttonsDiv.className = 'modal-buttons';
                    
                    const cancelBtn = document.createElement('button');
                    cancelBtn.className = 'modal-button modal-cancel';
                    cancelBtn.textContent = 'Cancel';
                    
                    const confirmBtn = document.createElement('button');
                    confirmBtn.className = 'modal-button modal-delete';
                    confirmBtn.textContent = 'Delete';
                    
                    // Assemble modal
                    buttonsDiv.appendChild(cancelBtn);
                    buttonsDiv.appendChild(confirmBtn);
                    
                    modal.appendChild(header);
                    modal.appendChild(message);
                    modal.appendChild(buttonsDiv);
                    
                    overlay.appendChild(modal);
                    document.body.appendChild(overlay);
                    
                    // Prevent clicks on overlay from interacting with the scene
                    overlay.addEventListener('click', function(e) {
                        // Only cancel if clicking directly on overlay (not on modal)
                        if (e.target === overlay) {
                            cancelBtn.click();
                        }
                        e.stopPropagation();
                    });
                    
                    // Return a promise that resolves with the confirmation
                    return new Promise((resolve) => {
                        // Function to remove modal and restore controls
                        const closeModal = () => {
                            document.body.removeChild(overlay);
                            
                            // Only restore keyboard controls if search is not focused
                            if (!document.activeElement || document.activeElement !== document.getElementById('search-bar')) {
                                // Re-enable keyboard event handling for movement
                                document.addEventListener('keydown', window.onKeyDownHandler);
                                document.addEventListener('keyup', window.onKeyUpHandler);
                            }
                        };
                        
                        // Temporarily remove keyboard event listeners to prevent movement
                        document.removeEventListener('keydown', window.onKeyDownHandler);
                        document.removeEventListener('keyup', window.onKeyUpHandler);
                        
                        cancelBtn.addEventListener('click', function() {
                            closeModal();
                            resolve(false); // Don't delete
                        });
                        
                        confirmBtn.addEventListener('click', function() {
                            closeModal();
                            resolve(true); // Confirm delete
                        });
                    }).then(confirmed => {
                        if (confirmed) {
                            // Send delete request to server
                            fetch('/api/delete', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    path: details.path
                                })
                            })
                            .then(response => {
                                if (!response.ok) {
                                    throw new Error('Error deleting file/folder');
                                }
                                return response.json();
                            })
                            .then(data => {
                                console.log('Delete successful:', data);
                                // Reset highlighted object since we're reloading
                                if (highlightedObject && highlightedMaterial) {
                                    highlightedObject.material = highlightedMaterial;
                                    highlightedObject = null;
                                    highlightedMaterial = null;
                                }
                                // Reload filesystem data to update visualization
                                loadFilesystemData();
                            })
                            .catch(error => {
                                console.error('Error deleting:', error);
                                alert('Failed to delete. Check console for details.');
                            });
                        }
                    });
                }
            }
            break;
            
        case 'KeyR':
            if (highlightedObject) {
                const details = objectDetails.get(highlightedObject.id);
                if (details) {
                    // Temporarily exit pointer lock
                    if (document.pointerLockElement) {
                        document.exitPointerLock();
                    }
                    
                    // Create custom modal for renaming
                    const overlay = document.createElement('div');
                    overlay.className = 'modal-overlay';
                    
                    // Disable camera controls while modal is open
                    moveForward = false;
                    moveBackward = false;
                    moveLeft = false;
                    moveRight = false;
                    moveUp = false;
                    moveDown = false;
                    
                    // Stop any camera movement immediately
                    velocity.set(0, 0, 0);
                    
                    const modal = document.createElement('div');
                    modal.className = 'modal';
                    
                    const header = document.createElement('div');
                    header.className = 'modal-header';
                    header.textContent = `Rename ${details.type}`;
                    
                    const input = document.createElement('input');
                    input.className = 'modal-input';
                    input.type = 'text';
                    input.value = details.name;
                    input.select(); // Select all text by default
                    
                    const buttonsDiv = document.createElement('div');
                    buttonsDiv.className = 'modal-buttons';
                    
                    const cancelBtn = document.createElement('button');
                    cancelBtn.className = 'modal-button modal-cancel';
                    cancelBtn.textContent = 'Cancel';
                    
                    const confirmBtn = document.createElement('button');
                    confirmBtn.className = 'modal-button modal-confirm';
                    confirmBtn.textContent = 'Rename';
                    
                    // Assemble modal
                    buttonsDiv.appendChild(cancelBtn);
                    buttonsDiv.appendChild(confirmBtn);
                    
                    modal.appendChild(header);
                    modal.appendChild(input);
                    modal.appendChild(buttonsDiv);
                    
                    overlay.appendChild(modal);
                    document.body.appendChild(overlay);
                    
                    // Prevent clicks on overlay from interacting with the scene
                    overlay.addEventListener('click', function(e) {
                        // Only cancel if clicking directly on overlay (not on modal)
                        if (e.target === overlay) {
                            cancelBtn.click();
                        }
                        e.stopPropagation();
                    });
                    
                    // Focus input after modal is added to DOM
                    setTimeout(() => input.focus(), 0);
                    
                    // Handle input events - need a separate event handler
                    // that doesn't trigger the main keyboard controls
                    const handleInputKeys = function(e) {
                        // Prevent event propagation to avoid triggering movement
                        e.stopPropagation();
                        
                        if (e.key === 'Enter') {
                            confirmBtn.click();
                        } else if (e.key === 'Escape') {
                            cancelBtn.click();
                        }
                    };
                    
                    // Add the event listener directly to the input element
                    input.addEventListener('keydown', handleInputKeys);
                    
                    // Return a promise that resolves with the new name
                    return new Promise((resolve) => {
                        // Function to remove modal and restore controls
                        const closeModal = () => {
                            document.body.removeChild(overlay);
                            
                            // Remove the input's keydown listener
                            input.removeEventListener('keydown', handleInputKeys);
                            
                            // Only restore keyboard controls if search is not focused
                            if (!document.activeElement || document.activeElement !== document.getElementById('search-bar')) {
                                // Re-enable keyboard event handling for movement
                                document.addEventListener('keydown', window.onKeyDownHandler);
                                document.addEventListener('keyup', window.onKeyUpHandler);
                            }
                        };
                        
                        // Temporarily remove keyboard event listeners to prevent movement
                        document.removeEventListener('keydown', window.onKeyDownHandler);
                        document.removeEventListener('keyup', window.onKeyUpHandler);
                        
                        cancelBtn.addEventListener('click', function() {
                            closeModal();
                            resolve(null); // Null indicates cancel
                        });
                        
                        confirmBtn.addEventListener('click', function() {
                            const newName = input.value.trim();
                            closeModal();
                            resolve(newName.length > 0 ? newName : null);
                        });
                    }).then(newName => {
                        // If user provided a new name, send to server
                        if (newName && newName !== details.name) {
                            fetch('/api/rename', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    path: details.path,
                                    newName: newName
                                })
                            })
                            .then(response => {
                                if (!response.ok) {
                                    throw new Error('Error renaming file/folder');
                                }
                                return response.json();
                            })
                            .then(data => {
                                console.log('Rename successful:', data);
                                // Reset highlighted object since we're reloading
                                if (highlightedObject && highlightedMaterial) {
                                    highlightedObject.material = highlightedMaterial;
                                    highlightedObject = null;
                                    highlightedMaterial = null;
                                }
                                // Reload filesystem data to update visualization
                                loadFilesystemData();
                            })
                            .catch(error => {
                                console.error('Error renaming:', error);
                                alert('Failed to rename. Check console for details.');
                            });
                        }
                    });
                }
            }
            break;
    }
}

// Key up event handler
function onKeyUp(event) {
    // If search is focused, don't handle keyboard events for camera controls
    if (searchFocused || document.querySelector('.modal-overlay')) {
        return;
    }
    
    switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
            moveForward = false;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            moveLeft = false;
            break;
        case 'KeyS':
        case 'ArrowDown':
            moveBackward = false;
            break;
        case 'KeyD':
        case 'ArrowRight':
            moveRight = false;
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            boost = false;
            break;
        case 'Space':
            moveUp = false;
            moveDown = false;
            break;
    }
}

function onMouseMove(event) {
    // Calculate mouse position in normalized device coordinates
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function loadFilesystemData() {
    // Clear current objects and scene
    objects = [];
    objectDetails = new Map();
    objectsById = new Map();
    
    // Remove all objects from the scene except camera and controls
    while(scene.children.length > 0){ 
        scene.remove(scene.children[0]); 
    }
    
    // Add back the camera and lights
    scene.add(controls.getObject());
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x444444);
    scene.add(ambientLight);

    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
    directionalLight.position.set(1, 1, 1).normalize();
    scene.add(directionalLight);
    
    // Fetch new filesystem data
    fetch('/api/fs')
        .then(response => response.json())
        .then(data => {
            console.log('Filesystem data loaded:', data);
            filesystemData = data;
            createVisualization(filesystemData);
            // Initialize search functionality after data is loaded
            initSearch();
        })
        .catch(error => console.error('Error loading filesystem data:', error));
}

function createVisualization(node) {
    // Create the root node and add it to the scene
    // No need for parent size since we now use the grid-based approach
    const rootNode = createNode(node, 0, 0, 0);
    scene.add(rootNode);
}

// Constants for grid-based layout
const CELL_SIZE = 1.0; // Base cell size unit
const FILE_CELLS = 3; // Number of cells in one dimension of a file (3x3x3 = 27 cells)
const PADDING_CELLS = 1; // Padding cells around each element
const GRID_DEBUG = false; // Enable grid visualization for debugging

// Helper function to calculate the grid cells required for an element
function calculateGridCells(node) {
    if (!node.isDir) {
        // Files are always 3x3x3 (with 1 cell padding all around)
        return {
            width: FILE_CELLS + (PADDING_CELLS * 2),
            height: FILE_CELLS + (PADDING_CELLS * 2),
            depth: FILE_CELLS + (PADDING_CELLS * 2),
            totalCells: Math.pow(FILE_CELLS + (PADDING_CELLS * 2), 3)
        };
    }
    
    // For directories, calculate based on children
    const childrenCount = node.children ? node.children.length : 0;
    
    if (childrenCount === 0) {
        // Empty directories are treated like files
        return {
            width: FILE_CELLS + (PADDING_CELLS * 2),
            height: FILE_CELLS + (PADDING_CELLS * 2),
            depth: FILE_CELLS + (PADDING_CELLS * 2),
            totalCells: Math.pow(FILE_CELLS, 3)
        };
    }
    
    // Calculate total cells required by all children
    let totalChildCells = 0;
    const childrenMetrics = [];
    
    for (const child of node.children) {
        const childMetrics = calculateGridCells(child);
        childrenMetrics.push(childMetrics);
    }
    
    // Get the maximum dimension across all children
    // This ensures each child gets allocated enough space
    const maxChildDimension = childrenMetrics.reduce((max, metrics) => 
        Math.max(max, metrics.width, metrics.height, metrics.depth), 0);
    
    // Calculate how many children we can fit in each dimension
    // based on the maximum child size to ensure no overlaps
    const gridDimension = Math.ceil(Math.cbrt(childrenCount));
    
    // Each child needs its allocated space based on the largest child
    // Use a smaller gap between items to keep them closer together
    const gridSpacing = maxChildDimension + 1; // 1 cell gap between items
    
    // Calculate container size needed for all children
    // We need to ensure the container properly wraps all children
    // Total container size = grid dimension × spacing between cells
    const containerSize = (gridDimension * gridSpacing) + (PADDING_CELLS * 2);
    
    return {
        width: containerSize,
        height: containerSize,
        depth: containerSize,
        totalCells: Math.pow(containerSize, 3),
        childrenMetrics: childrenMetrics,
        gridDimension: gridDimension,
        cellsPerGrid: gridSpacing,
        maxChildDimension: maxChildDimension
    };
}

function createNode(node, x, y, z, parentMetrics) {
    // Calculate the grid metrics for this node
    const nodeMetrics = calculateGridCells(node);
    
    // Calculate physical size based on cell dimensions
    const nodeWidth = nodeMetrics.width * CELL_SIZE;
    const nodeHeight = nodeMetrics.height * CELL_SIZE;
    const nodeDepth = nodeMetrics.depth * CELL_SIZE;
    
    // Create a group to hold this node and its children
    const nodeGroup = new THREE.Group();
    nodeGroup.position.set(x, y, z);
    
    if (node.isDir) {
        // Directory - semi-transparent cube with color based on name
        // For directories, use the exact calculated size without additional padding reduction
        // This ensures the container properly wraps all its children
        const contentWidth = nodeWidth;
        const contentHeight = nodeHeight;
        const contentDepth = nodeDepth;
        
        const dirGeometry = new THREE.BoxGeometry(contentWidth, contentHeight, contentDepth);
        
        // Generate a color based on the folder name (for visual distinction)
        let hash = 0;
        for (let i = 0; i < node.name.length; i++) {
            hash = node.name.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        // Convert hash to RGB color in blue/teal/purple range
        const baseR = 30 + ((hash & 0xFF) % 100); // 30-130 range
        const baseG = 100 + ((hash >> 8 & 0xFF) % 155); // 100-255 range
        const baseB = 150 + ((hash >> 16 & 0xFF) % 105); // 150-255 range
        
        const dirColor = (baseR << 16) | (baseG << 8) | baseB;
        
        const dirMaterial = new THREE.MeshLambertMaterial({
            color: dirColor,
            opacity: 0.25,
            transparent: true,
            wireframe: false,
            side: THREE.DoubleSide
        });
        
        const dirMesh = new THREE.Mesh(dirGeometry, dirMaterial);
        nodeGroup.add(dirMesh);
        
        // Add wireframe overlay for better visibility
        const wireGeometry = new THREE.BoxGeometry(contentWidth, contentHeight, contentDepth);
        
        // Create brighter version of the color for wireframe
        const wireR = Math.min(255, ((dirColor >> 16) & 0xFF) + 100);
        const wireG = Math.min(255, ((dirColor >> 8) & 0xFF) + 80);
        const wireB = Math.min(255, (dirColor & 0xFF) + 50);
        const brightColor = (wireR << 16) | (wireG << 8) | wireB;
        
        const wireMaterial = new THREE.MeshBasicMaterial({
            color: brightColor,
            wireframe: true,
            transparent: true,
            opacity: 0.6
        });
        const wireframe = new THREE.Mesh(wireGeometry, wireMaterial);
        nodeGroup.add(wireframe);
        
        // Add grid visualization for debugging
        const gridHelper = new THREE.GridHelper(nodeWidth, nodeMetrics.width);
        gridHelper.position.y = -contentHeight/2; // Position at bottom of container
        gridHelper.material.opacity = 0.2;
        gridHelper.material.transparent = true;
        nodeGroup.add(gridHelper);
        
        // Add label for directory
        addLabel(node.name, nodeGroup, contentWidth);
        
        // Add to objects array for raycasting
        objects.push(dirMesh);
        objectDetails.set(dirMesh.id, {
            name: node.name,
            path: node.path,
            type: 'Directory',
            children: node.children ? node.children.length : 0,
            modified: new Date(node.modified).toLocaleString()
        });
        
        // Store object reference by path for search functionality
        objectsById.set(node.path, {
            object: dirMesh,
            position: dirMesh.position.clone(),
            parentGroup: nodeGroup,
            type: 'Directory'
        });
        
        // Position children inside this container
        const childrenCount = node.children ? node.children.length : 0;
        
        if (childrenCount > 0) {
            // Use the pre-calculated grid dimension from metrics
            const gridDimension = nodeMetrics.gridDimension;
            
            // Use the full container size for content positioning
            // This makes sure the visual container matches the actual space used
            const contentSize = nodeWidth;
            
            // Use the pre-calculated grid spacing from metrics
            const gridSpacing = nodeMetrics.cellsPerGrid * CELL_SIZE;
            
            // Create a visual grid for debugging
            const gridLines = new THREE.Group();
            
            // Create horizontal and vertical grid lines
            for (let i = 0; i <= gridDimension; i++) {
                const pos = -contentSize/2 + (i * (contentSize / gridDimension));
                
                // X grid lines
                const xLineGeometry = new THREE.BufferGeometry();
                const xLineVertices = new Float32Array([
                    pos, -contentHeight/2, -contentSize/2,
                    pos, -contentHeight/2, contentSize/2
                ]);
                xLineGeometry.setAttribute('position', new THREE.BufferAttribute(xLineVertices, 3));
                const xLine = new THREE.Line(
                    xLineGeometry,
                    new THREE.LineBasicMaterial({ color: 0xff00ff, opacity: 0.5, transparent: true })
                );
                gridLines.add(xLine);
                
                // Z grid lines
                const zLineGeometry = new THREE.BufferGeometry();
                const zLineVertices = new Float32Array([
                    -contentSize/2, -contentHeight/2, pos,
                    contentSize/2, -contentHeight/2, pos
                ]);
                zLineGeometry.setAttribute('position', new THREE.BufferAttribute(zLineVertices, 3));
                const zLine = new THREE.Line(
                    zLineGeometry,
                    new THREE.LineBasicMaterial({ color: 0xff00ff, opacity: 0.5, transparent: true })
                );
                gridLines.add(zLine);
            }
            
            nodeGroup.add(gridLines);
            
            // Calculate grid cell allocation
            const cellSize = nodeMetrics.maxChildDimension * CELL_SIZE;
            
            // Calculate total grid size with tighter spacing
            const totalGridSize = gridDimension * (cellSize + CELL_SIZE); // Add only 1 cell spacing
            
            // Starting position for the first child - make sure it fits exactly within container
            const startX = -contentSize/2 + (cellSize/2) + CELL_SIZE; // Offset by half cell size + padding
            const startY = startX;
            const startZ = startX;
            
            // Position children in 3D grid with proper spacing
            let index = 0;
            for (let i = 0; i < gridDimension && index < childrenCount; i++) {
                for (let j = 0; j < gridDimension && index < childrenCount; j++) {
                    for (let k = 0; k < gridDimension && index < childrenCount; k++) {
                        const child = node.children[index];
                        const childMetrics = nodeMetrics.childrenMetrics[index];
                        
                        // Position each child with tighter spacing
                        const spacing = cellSize + CELL_SIZE; // Cell size plus only 1-cell gap
                        const childX = startX + (i * spacing);
                        const childY = startY + (j * spacing);
                        const childZ = startZ + (k * spacing);
                        
                        // Add a marker sphere at grid point for debugging
                        const marker = new THREE.Mesh(
                            new THREE.SphereGeometry(CELL_SIZE * 0.2),
                            new THREE.MeshBasicMaterial({ color: 0x00ffff })
                        );
                        marker.position.set(childX, childY, childZ);
                        nodeGroup.add(marker);
                        
                        // Draw cell boundary box for debugging
                        const boundaryBox = new THREE.LineSegments(
                            new THREE.EdgesGeometry(new THREE.BoxGeometry(
                                childMetrics.width * CELL_SIZE,
                                childMetrics.height * CELL_SIZE,
                                childMetrics.depth * CELL_SIZE
                            )),
                            new THREE.LineBasicMaterial({ color: 0x00ff00, opacity: 0.3, transparent: true })
                        );
                        boundaryBox.position.set(childX, childY, childZ);
                        nodeGroup.add(boundaryBox);
                        
                        // Create child node and add to this node's group with precisely calculated position
                        const childNode = createNode(child, childX, childY, childZ, childMetrics);
                        nodeGroup.add(childNode);
                        
                        index++;
                    }
                }
            }
        }
    } else {
        // File - a solid cube in the middle with padding all around
        const contentWidth = FILE_CELLS * CELL_SIZE;
        const contentHeight = FILE_CELLS * CELL_SIZE;
        const contentDepth = FILE_CELLS * CELL_SIZE;
        
        // Different colors based on extension
        const extension = node.name.split('.').pop().toLowerCase();
        let color;
        
        switch (extension) {
            // Code files
            case 'js': case 'mjs':
                color = 0xf7df1e; // JavaScript yellow
                break;
            case 'ts': 
                color = 0x3178c6; // TypeScript blue
                break;
            case 'jsx': case 'tsx':
                color = 0x61dafb; // React blue
                break;
            case 'html': case 'htm': 
                color = 0xe34c26; // HTML orange
                break;
            case 'css': 
                color = 0x264de4; // CSS blue
                break;
            case 'scss': case 'sass':
                color = 0xcd6799; // SASS/SCSS pink
                break;
            case 'less':
                color = 0x1d365d; // Less dark blue
                break;
            case 'php':
                color = 0x777bb4; // PHP purple
                break;
            case 'py': case 'pyc': case 'pyd': case 'pyo':
                color = 0x3776ab; // Python blue
                break;
            case 'rb': case 'erb':
                color = 0xcc342d; // Ruby red
                break;
            case 'java': case 'class': case 'jar':
                color = 0xf89820; // Java orange
                break;
            case 'c': case 'h':
                color = 0x555555; // C gray
                break;
            case 'cpp': case 'cc': case 'cxx': case 'hpp':
                color = 0x00599c; // C++ blue
                break;
            case 'cs':
                color = 0x178600; // C# green
                break;
            case 'go':
                color = 0x00add8; // Go blue
                break;
            case 'rs':
                color = 0xdea584; // Rust orange
                break;
            case 'swift':
                color = 0xffac45; // Swift orange
                break;
            case 'kt': case 'kts':
                color = 0xa97bff; // Kotlin purple
                break;
            case 'dart':
                color = 0x0175c2; // Dart blue
                break;
            case 'r':
                color = 0x276dc3; // R blue
                break;
            case 'scala':
                color = 0xdc322f; // Scala red
                break;
            case 'lua':
                color = 0x000080; // Lua navy blue
                break;
            case 'pl': case 'pm':
                color = 0x0073a1; // Perl blue
                break;
            case 'sh': case 'bash': case 'zsh':
                color = 0x4eaa25; // Shell green
                break;
                
            // Config/Data files
            case 'json': 
                color = 0x000000; // JSON black
                break;
            case 'xml': case 'svg':
                color = 0xff6347; // XML/SVG tomato
                break;
            case 'yml': case 'yaml':
                color = 0x8bc34a; // YAML green
                break;
            case 'toml': case 'ini': case 'conf':
                color = 0x6d8086; // Config files gray-blue
                break;
            case 'sql': case 'db': case 'sqlite':
                color = 0x336791; // SQL/Database blue
                break;
            case 'csv': case 'tsv': case 'xls': case 'xlsx':
                color = 0x217346; // Spreadsheet green
                break;
                
            // Documentation files
            case 'md':
                color = 0x083fa1; // Markdown blue
                break;
            case 'txt': 
                color = 0xffffff; // Text white
                break;
            case 'rtf': case 'doc': case 'docx': case 'odt':
                color = 0x2b579a; // Document files blue
                break;
            case 'pdf':
                color = 0xf40f02; // PDF red
                break;
                
            // Media files
            case 'jpg': case 'jpeg': case 'png':
                color = 0xff00ff; // Image magenta
                break;
            case 'gif':
                color = 0x00ff00; // GIF green
                break;
            case 'webp': case 'bmp': case 'tiff': case 'tif':
                color = 0xff66b3; // Other images pink
                break;
            case 'ico': case 'icns':
                color = 0xb5b5b5; // Icon files gray
                break;
            case 'mp3': case 'wav': case 'ogg': case 'flac': case 'm4a': case 'aac':
                color = 0xffcc00; // Audio yellow
                break;
            case 'mp4': case 'webm': case 'avi': case 'mov': case 'mkv': case 'flv':
                color = 0xff0000; // Video red
                break;
                
            // Archive files
            case 'zip': case 'tar': case 'gz': case 'bz2': case '7z': case 'rar':
                color = 0x880e4f; // Archive dark pink
                break;
                
            // Executable files
            case 'exe': case 'dll': case 'so': case 'dylib': case 'app':
                color = 0xb71c1c; // Executable dark red
                break;
                
            // Font files
            case 'ttf': case 'otf': case 'woff': case 'woff2': case 'eot':
                color = 0x9c27b0; // Font files purple
                break;
                
            // Binary/other
            case 'bin': case 'dat':
                color = 0x212121; // Binary dark gray
                break;
                
            default:
                // Check if it's a hidden file (no extension but starts with dot)
                if (node.name.startsWith('.')) {
                    color = 0x607d8b; // Hidden files blue-gray
                } else {
                    color = 0xcccccc; // Default gray
                }
        }
        
        // Scale the file size using a logarithmic scale
        const maxFileSize = 1024 * 1024 * 10; // 10MB reference size
        const fileScaleFactor = Math.max(0.5, Math.min(1.0, (Math.log10(node.size + 1) / Math.log10(maxFileSize))));
        
        // Create the file cube (actual content)
        const fileGeometry = new THREE.BoxGeometry(contentWidth, contentHeight * fileScaleFactor, contentDepth);
        const fileMaterial = new THREE.MeshLambertMaterial({ color: color });
        
        // Position content cube in the center of the allocated space
        const fileMesh = new THREE.Mesh(fileGeometry, fileMaterial);
        fileMesh.position.y = ((fileScaleFactor - 1) * contentHeight) / 2; // Adjust y position for height scaling
        nodeGroup.add(fileMesh);
        
        // Add wireframe to show exact dimensions
        const wireGeometry = new THREE.BoxGeometry(contentWidth, contentHeight * fileScaleFactor, contentDepth);
        const wireMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            wireframe: true,
            transparent: true,
            opacity: 0.3
        });
        const wireframe = new THREE.Mesh(wireGeometry, wireMaterial);
        wireframe.position.y = ((fileScaleFactor - 1) * contentHeight) / 2;
        nodeGroup.add(wireframe);
        
        // Add grid visualization for debugging
        const gridHelper = new THREE.GridHelper(nodeWidth, nodeMetrics.width);
        gridHelper.position.y = -contentHeight/2; // Position at bottom of allocated space
        gridHelper.material.opacity = 0.2;
        gridHelper.material.transparent = true;
        nodeGroup.add(gridHelper);
        
        // Add label for file
        addLabel(node.name, nodeGroup, contentWidth);
        
        // Add to objects array for raycasting
        objects.push(fileMesh);
        objectDetails.set(fileMesh.id, {
            name: node.name,
            path: node.path,
            type: 'File',
            size: formatFileSize(node.size),
            modified: new Date(node.modified).toLocaleString()
        });
        
        // Store object reference by path for search functionality
        objectsById.set(node.path, {
            object: fileMesh,
            position: new THREE.Vector3(
                nodeGroup.position.x + fileMesh.position.x,
                nodeGroup.position.y + fileMesh.position.y,
                nodeGroup.position.z + fileMesh.position.z
            ),
            parentGroup: nodeGroup,
            type: 'File'
        });
    }
    
    return nodeGroup;
}

function addLabel(text, parentGroup, nodeSize) {
    if (!font) return; // Skip if font isn't loaded
    
    // Display full text without truncation
    const displayText = text;
    
    // Create text geometry - scale based on node size, but keep smaller
    const textSize = Math.max(nodeSize * 0.05, 0.5);
    const textGeometry = new THREE.TextGeometry(displayText, {
        font: font,
        size: textSize,
        height: textSize * 0.1,
        curveSegments: 2,
        bevelEnabled: false
    });
    
    // Compute text dimensions
    textGeometry.computeBoundingBox();
    const textWidth = textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x;
    const textHeight = textGeometry.boundingBox.max.y - textGeometry.boundingBox.min.y;
    
    // Create background plane for better readability
    const padding = textSize * 0.3;
    const labelBackgroundGeometry = new THREE.PlaneGeometry(
        textWidth + padding * 2, 
        textHeight + padding * 2
    );
    const labelBackgroundMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x000000,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide
    });
    
    // Create text material
    const textMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    
    // Create meshes
    const textMesh = new THREE.Mesh(textGeometry, textMaterial);
    const backgroundMesh = new THREE.Mesh(labelBackgroundGeometry, labelBackgroundMaterial);
    
    // Create a group for label (text + background)
    const labelGroup = new THREE.Group();
    
    // Center text at origin for correct positioning
    textGeometry.translate(-textWidth / 2, -textHeight / 2, 0);
    
    // Add both to label group with background slightly behind
    backgroundMesh.position.z = -0.01;
    labelGroup.add(backgroundMesh);
    labelGroup.add(textMesh);
    
    // Create only one label for the front face (that the camera is facing when we start)
    // Position slightly in front of the cube face
    labelGroup.position.set(0, 0, nodeSize / 2 + 0.01);
    
    // Only keep this single label
    const labels = [labelGroup];
    
    // Add all labels to parent group
    labels.forEach(label => parentGroup.add(label));
}

function formatFileSize(sizeInBytes) {
    if (sizeInBytes < 1024) {
        return sizeInBytes + ' B';
    } else if (sizeInBytes < 1024 * 1024) {
        return (sizeInBytes / 1024).toFixed(2) + ' KB';
    } else if (sizeInBytes < 1024 * 1024 * 1024) {
        return (sizeInBytes / (1024 * 1024)).toFixed(2) + ' MB';
    } else {
        return (sizeInBytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }
}

// Function to get a human-readable file type based on extension
function getFileType(extension) {
    const fileTypes = {
        // Code files
        'js': 'JavaScript', 'mjs': 'JavaScript Module',
        'ts': 'TypeScript',
        'jsx': 'React JSX', 'tsx': 'React TSX',
        'html': 'HTML', 'htm': 'HTML',
        'css': 'CSS', 'scss': 'SCSS', 'sass': 'SASS', 'less': 'LESS',
        'php': 'PHP',
        'py': 'Python', 'pyc': 'Python Compiled', 'pyd': 'Python DLL', 'pyo': 'Python Optimized',
        'rb': 'Ruby', 'erb': 'Ruby ERB',
        'java': 'Java', 'class': 'Java Class', 'jar': 'Java Archive',
        'c': 'C', 'h': 'C Header',
        'cpp': 'C++', 'cc': 'C++', 'cxx': 'C++', 'hpp': 'C++ Header',
        'cs': 'C#',
        'go': 'Go',
        'rs': 'Rust',
        'swift': 'Swift',
        'kt': 'Kotlin', 'kts': 'Kotlin Script',
        'dart': 'Dart',
        'r': 'R',
        'scala': 'Scala',
        'lua': 'Lua',
        'pl': 'Perl', 'pm': 'Perl Module',
        'sh': 'Shell Script', 'bash': 'Bash Script', 'zsh': 'ZSH Script',
        
        // Config/Data files
        'json': 'JSON',
        'xml': 'XML', 'svg': 'SVG',
        'yml': 'YAML', 'yaml': 'YAML',
        'toml': 'TOML', 'ini': 'INI', 'conf': 'Configuration',
        'sql': 'SQL', 'db': 'Database', 'sqlite': 'SQLite Database',
        'csv': 'CSV', 'tsv': 'TSV', 'xls': 'Excel', 'xlsx': 'Excel',
        
        // Documentation files
        'md': 'Markdown',
        'txt': 'Plain Text',
        'rtf': 'Rich Text', 'doc': 'Word Document', 'docx': 'Word Document', 'odt': 'OpenDocument Text',
        'pdf': 'PDF Document',
        
        // Media files
        'jpg': 'JPEG Image', 'jpeg': 'JPEG Image', 'png': 'PNG Image',
        'gif': 'GIF Image',
        'webp': 'WebP Image', 'bmp': 'Bitmap Image', 'tiff': 'TIFF Image', 'tif': 'TIFF Image',
        'ico': 'Icon', 'icns': 'Apple Icon',
        'mp3': 'MP3 Audio', 'wav': 'WAV Audio', 'ogg': 'OGG Audio', 'flac': 'FLAC Audio', 
        'm4a': 'M4A Audio', 'aac': 'AAC Audio',
        'mp4': 'MP4 Video', 'webm': 'WebM Video', 'avi': 'AVI Video', 
        'mov': 'QuickTime Video', 'mkv': 'Matroska Video', 'flv': 'Flash Video',
        
        // Archive files
        'zip': 'ZIP Archive', 'tar': 'TAR Archive', 'gz': 'GZip Archive', 
        'bz2': 'BZip2 Archive', '7z': '7-Zip Archive', 'rar': 'RAR Archive',
        
        // Executable files
        'exe': 'Windows Executable', 'dll': 'Windows Library', 
        'so': 'Shared Object', 'dylib': 'macOS Library', 'app': 'macOS Application',
        
        // Font files
        'ttf': 'TrueType Font', 'otf': 'OpenType Font', 
        'woff': 'Web Font', 'woff2': 'Web Font', 'eot': 'Embedded OpenType Font',
        
        // Binary/other
        'bin': 'Binary File', 'dat': 'Data File'
    };
    
    return fileTypes[extension] || 'Unknown';
}

function checkIntersections() {
    // Update the raycaster with the current camera and mouse position
    raycaster.setFromCamera(mouse, camera);
    
    // Calculate objects intersecting the ray
    const intersects = raycaster.intersectObjects(objects);
    
    // Reset cursor
    if (!document.pointerLockElement) {
        document.body.style.cursor = 'default';
    }
    
    // Reset crosshair
    const crosshair = document.getElementById('crosshair');
    crosshair.classList.remove('active');
    
    // Reset previously highlighted object if it exists
    if (highlightedObject && highlightedMaterial) {
        highlightedObject.material = highlightedMaterial;
        highlightedObject = null;
        highlightedMaterial = null;
    }
    
    if (intersects.length > 0) {
        const object = intersects[0].object;
        const details = objectDetails.get(object.id);
        
        if (details) {
            // Get file extension and type info for Files
            let fileType = '';
            if (details.type === 'File') {
                const extension = details.name.split('.').pop().toLowerCase();
                fileType = getFileType(extension);
            }
            
            // Update hover info
            let info = `<strong>${details.name}</strong>`;
            info += `<br><span style="color: #aaffaa;">${details.type}</span>`;
            
            if (details.type === 'File') {
                info += `<br><span style="color: #aaaaff;">Type:</span> ${fileType}`;
                info += `<br><span style="color: #aaaaff;">Size:</span> ${details.size}`;
            } else {
                info += `<br><span style="color: #aaaaff;">Items:</span> ${details.children}`;
            }
            
            info += `<br><span style="color: #aaaaff;">Path:</span> ${details.path}`;
            info += `<br><span style="color: #aaaaff;">Modified:</span> ${details.modified}`;
            
            if (details.type === 'Directory') {
                info += `<br><span style="color: #ffff99; font-weight: bold;">Click to open in file explorer</span>`;
            } else {
                info += `<br><span style="color: #ffff99; font-weight: bold;">Click to open in new tab</span>`;
            }
            
            hoverInfo.innerHTML = info;
            if (!document.pointerLockElement) {
                document.body.style.cursor = 'pointer';
            }
            
            // Highlight the object
            highlightedObject = object;
            highlightedMaterial = object.material.clone();
            
            // Create a new highlighted material that's brighter
            const highlightMaterial = object.material.clone();
            if (highlightMaterial.color) {
                // Make the color brighter for highlighting
                highlightMaterial.emissive = new THREE.Color(0xffff00);
                highlightMaterial.emissiveIntensity = 0.3;
            }
            
            // Apply highlight material
            object.material = highlightMaterial;
            
            // Update crosshair
            crosshair.classList.add('active');
        }
    } else {
        // No intersection, show default text
        hoverInfo.innerHTML = 'Hover over an object to see details';
    }
}

// Helper function to get URL for a path
function getUrlForPath(path, isDirectory) {
    // Use our server API to handle files
    return '/api/open?path=' + encodeURIComponent(path);
}

// Function to open directory in the file system
function openInFileSystem(path) {
    fetch('/api/open-directory?path=' + encodeURIComponent(path), {
        method: 'POST'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Error opening directory');
        }
        return response.text();
    })
    .then(data => {
        console.log('Directory opened:', data);
    })
    .catch(error => {
        console.error('Error opening directory:', error);
        alert('Failed to open directory. This may be due to security restrictions or the directory not being accessible.');
    });
}

function animate() {
    requestAnimationFrame(animate);
    
    // Update movement - this is the FPS game-like motion
    const time = performance.now();
    const delta = Math.min(0.1, (time - prevTime) / 1000); // Cap delta to prevent jumps
    
    if (isFlying && flyingTarget) {
        // Automatic flying to target object
        const cameraPosition = controls.getObject().position;
        const distanceToTarget = cameraPosition.distanceTo(flyingTarget);
        
        if (distanceToTarget > 5) { // Continue flying until we're close enough
            // Calculate direction to target
            const flyDirection = new THREE.Vector3().subVectors(flyingTarget, cameraPosition).normalize();
            
            // Calculate speed based on distance (slow down when approaching)
            const flySpeed = Math.min(500, Math.max(50, distanceToTarget * 30));
            
            // Move camera towards target
            controls.getObject().position.add(flyDirection.multiplyScalar(flySpeed * delta));
            
            // Gradually look at the target while flying
            if (flyingLookAt) {
                // Calculate current camera direction
                const currentDirection = new THREE.Vector3();
                camera.getWorldDirection(currentDirection);
                
                // Calculate target direction
                const targetDirection = new THREE.Vector3().subVectors(flyingLookAt, cameraPosition).normalize();
                
                // Interpolate between current and target direction
                const lerpFactor = 0.05; // Adjust for smoother rotation
                const newDirection = currentDirection.lerp(targetDirection, lerpFactor);
                
                // Create a quaternion from the interpolated direction
                const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(
                    new THREE.Vector3(0, 0, -1), // Camera forward direction
                    newDirection
                );
                
                // Apply rotation to camera
                camera.quaternion.slerp(targetQuaternion, 0.1);
            }
        } else {
            // We've reached the target, stop flying
            isFlying = false;
            flyingTarget = null;
            flyingLookAt = null;
        }
    } else {
        // Normal manual movement
        // Apply reduced friction to allow higher speeds
        velocity.x -= velocity.x * 2.0 * delta; // Less friction for faster acceleration
        velocity.z -= velocity.z * 2.0 * delta;
        velocity.y -= velocity.y * 2.0 * delta; // Apply same friction to vertical movement for consistent flying
        
        // Skip movement processing if search is focused or a modal is open
        if (!searchFocused && !document.querySelector('.modal-overlay')) {
            // Get camera's forward direction vector
            const cameraDirection = new THREE.Vector3();
            camera.getWorldDirection(cameraDirection);
            
            // Create a forward vector that preserves the camera's horizontal direction but doesn't go up/down
            // when moving forward/backward
            const forwardDirection = new THREE.Vector3(
                cameraDirection.x,
                0,
                cameraDirection.z
            ).normalize();
            
            // The up/down component is only used when looking steeply up or down
            const verticalComponent = new THREE.Vector3(
                0,
                cameraDirection.y,
                0
            );
            
            // Create movement direction based on camera's orientation and key presses
            direction.set(0, 0, 0);
            
            if (moveForward) {
                // When looking level, move horizontally
                direction.add(forwardDirection);
                // When looking steeply up/down, add vertical movement
                if (Math.abs(cameraDirection.y) > 0.5) {
                    direction.add(verticalComponent);
                }
            }
            if (moveBackward) {
                // Move in the opposite direction
                direction.sub(forwardDirection);
                // When looking steeply up/down, add inverted vertical movement
                if (Math.abs(cameraDirection.y) > 0.5) {
                    direction.sub(verticalComponent);
                }
            }
            
            // For sideways movement, calculate the right vector by crossing the camera direction with world up
            // This ensures correct right/left movement regardless of camera orientation
            const worldUp = new THREE.Vector3(0, 1, 0);
            const right = new THREE.Vector3();
            right.crossVectors(cameraDirection, worldUp).normalize();
            
            if (moveRight) {
                direction.add(right);
            }
            if (moveLeft) {
                direction.sub(right);
            }
            
            // Add direct up/down movement with Space and Shift+Space
            if (moveUp) {
                direction.y += 1.0;
            }
            if (moveDown) {
                direction.y -= 1.0;
            }
            
            // Normalize for consistent speed in all directions
            if (direction.length() > 0) {
                direction.normalize();
            }
            
            // For the grid-based visualization, we need much faster movement speed 
            // to navigate the potentially very large structures
            const speedFactor = boost ? 700 : 100; // 7x faster than before
            
            // Apply movement force in all dimensions
            velocity.x += direction.x * speedFactor * delta;
            velocity.z += direction.z * speedFactor * delta;
            // Allow vertical movement based on where the camera is pointing
            velocity.y += direction.y * speedFactor * delta;
        }
        
        // Calculate movement in world space
        const movement = new THREE.Vector3(
            velocity.x * delta,
            velocity.y * delta,
            velocity.z * delta
        );
        
        // Apply movement directly to the camera's position
        controls.getObject().position.add(movement);
    }
    
    prevTime = time;
    
    // Check for intersections for hover info
    checkIntersections();
    
    // Render scene
    renderer.render(scene, camera);
}

// Search functionality
function initSearch() {
    const searchBar = document.getElementById('search-bar');
    const searchResults = document.getElementById('search-results');
    
    // Listen for input on search bar
    searchBar.addEventListener('input', function(e) {
        const query = e.target.value.trim().toLowerCase();
        
        // Clear previous results
        searchResults.innerHTML = '';
        
        if (query.length < 2) {
            searchResults.style.display = 'none';
            return;
        }
        
        // Search through objects by name
        const results = [];
        for (const [path, details] of objectsById.entries()) {
            // Get the name from the path (last segment)
            const name = path.split('/').pop();
            
            if (name.toLowerCase().includes(query)) {
                results.push({
                    name: name,
                    path: path,
                    type: details.type
                });
            }
        }
        
        // Sort results: directories first, then alphabetically
        results.sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'Directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });
        
        // Display results
        if (results.length > 0) {
            results.slice(0, 10).forEach(result => {
                const resultElement = document.createElement('div');
                resultElement.className = `search-result ${result.type.toLowerCase()}`;
                
                // Highlight the matching text
                const highlightedName = result.name.replace(
                    new RegExp(`(${query})`, 'gi'),
                    '<span class="highlight">$1</span>'
                );
                
                resultElement.innerHTML = `
                    <div>${highlightedName}</div>
                    <div class="path">${result.path}</div>
                `;
                
                // Add click event to navigate to the object
                resultElement.addEventListener('click', function() {
                    flyToObject(result.path);
                    // Return focus to the 3D view after clicking a result
                    searchBar.blur();
                });
                
                searchResults.appendChild(resultElement);
            });
            
            if (results.length > 10) {
                const moreResults = document.createElement('div');
                moreResults.className = 'search-result';
                moreResults.innerHTML = `<div>${results.length - 10} more results...</div>`;
                searchResults.appendChild(moreResults);
            }
            
            searchResults.style.display = 'block';
        } else {
            const noResults = document.createElement('div');
            noResults.className = 'no-results';
            noResults.textContent = 'No results found';
            searchResults.appendChild(noResults);
            searchResults.style.display = 'block';
        }
    });
    
    // Close search results when clicking outside
    document.addEventListener('click', function(e) {
        if (!searchBar.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.style.display = 'none';
            
            // If search bar is focused and we click elsewhere, blur it to restore controls
            if (document.activeElement === searchBar) {
                searchBar.blur();
            }
        }
    });
    
    // Prevent clicks on search results from propagating (to avoid triggering camera controls)
    searchResults.addEventListener('click', function(e) {
        e.stopPropagation();
    });
    
    // Prevent search bar clicks from triggering camera lock
    searchBar.addEventListener('click', function(e) {
        e.stopPropagation();
    });
    
    // Focus events for search bar
    searchBar.addEventListener('focus', function() {
        searchFocused = true;
        document.removeEventListener('keydown', window.onKeyDownHandler);
        document.removeEventListener('keyup', window.onKeyUpHandler);
        
        // Reset movement state
        moveForward = false;
        moveBackward = false;
        moveLeft = false;
        moveRight = false;
        moveUp = false;
        moveDown = false;
        boost = false;
        
        // Stop any camera movement immediately
        velocity.set(0, 0, 0);
    });
    
    searchBar.addEventListener('blur', function() {
        searchFocused = false;
        
        // Only restore controls if no modal is open
        if (!document.querySelector('.modal-overlay')) {
            document.addEventListener('keydown', window.onKeyDownHandler);
            document.addEventListener('keyup', window.onKeyUpHandler);
        }
    });
}

// Function to fly to a specific object
function flyToObject(path) {
    const objectInfo = objectsById.get(path);
    if (!objectInfo) return;
    
    // Exit pointer lock if active
    if (document.pointerLockElement) {
        document.exitPointerLock();
    }
    
    // Set up flying to the object position
    isFlying = true;
    
    // Get world position of the object
    const worldPosition = new THREE.Vector3();
    objectInfo.object.getWorldPosition(worldPosition);
    
    // Set target position slightly offset from the object
    const offsetDistance = 20; // Distance to keep from the object
    
    // For directory, set position above and to the side a bit
    if (objectInfo.type === 'Directory') {
        flyingTarget = new THREE.Vector3(
            worldPosition.x + offsetDistance,
            worldPosition.y + offsetDistance,
            worldPosition.z + offsetDistance
        );
    } else {
        // For files, position in front of the object
        flyingTarget = new THREE.Vector3(
            worldPosition.x,
            worldPosition.y,
            worldPosition.z + offsetDistance
        );
    }
    
    // Set the look-at point to be the object's position
    flyingLookAt = worldPosition;
    
    // Close search results
    document.getElementById('search-results').style.display = 'none';
}

// Initialize and animate
init();
animate();