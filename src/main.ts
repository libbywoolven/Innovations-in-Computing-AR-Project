console.log("AR Tool is running!");
    import './style.css';
    
    import * as THREE from 'three';
    import { ARButton } from 'three/addons/webxr/ARButton.js';
    import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://jlinwbohgjckloovrbid.supabase.co'
const supabaseKey = 'sb_publishable_nP5vXP8wvcTvQ2jPbo9KoQ_-z3LltPe'
const supabase = createClient(supabaseUrl, supabaseKey)

    // Add a simple floor so we can see where we are
const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshStandardMaterial({ color: 0x222222 })
);


    // 1. Scene Setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// Add a bright light so your colors pop
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.position.set(5, 5, 5);
scene.add(sun, new THREE.AmbientLight(0xffffff, 0.5));

// Define the "Marker" you want the camera to look for
const imgElement = document.getElementById('marker-image') as HTMLImageElement;

const sessionInit = {
    requiredFeatures: ['image-tracking'],
    trackedImages: [
        {
            image: imgElement, // The image the camera is looking for
            widthInMeters: 0.1 // How big the physical image is in real life
        }
    ]
};

// Replace your old button line with this
document.body.appendChild(ARButton.createButton(renderer, sessionInit));

 // Function to create a menu button
function createMenuButton(text: string, color: number, xPosition: number) {
const group = new THREE.Group();

  // The Button Background
const geometry = new THREE.BoxGeometry(0.4, 0.2, 0.05);
const material = new THREE.MeshStandardMaterial({ color: color });
const buttonMesh = new THREE.Mesh(geometry, material);

group.add(buttonMesh);
group.position.set(xPosition, 1.4, -1); // Positioned at 1.4m high, 1m away
return group;
}

// Create your two buttons
const faultButton = createMenuButton("Detect Faults", 0xe74c3c, -0.25); // Red
const inventoryButton = createMenuButton("Tool Inventory", 0x2ecc71, 0.25); // Green

scene.add(faultButton, inventoryButton);

// Add a simple light so we can see the colors
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

// Get references to our HTML buttons
const faultBtn = document.getElementById('fault-btn');
const inventoryBtn = document.getElementById('inventory-btn');
const menuContainer = document.getElementById('main-menu');

faultBtn?.addEventListener('click', () => {
console.log("Entering Fault Detection Mode...");
  // Logic to start camera analysis would go here
if (menuContainer) menuContainer.style.display = 'none'; 
});

inventoryBtn?.addEventListener('click', () => {
alert("Inventory: \n1.Screwdriver \n2. Spanner \n3. Track Gauge \n4. Torch");
});

const submitBtn = document.getElementById('submit-report-btn');
const historyList = document.getElementById('history-list');






async function saveReport() {
    // 1. Prepare the data
    const reportData = {
        engineer_name: "Eastleigh Tech 01",
        tool_status: "All Tools Ready",
    };

    // 2. Send to Supabase
    const { data, error } = await supabase
        .from('reports')
        .insert([reportData]);

    if (error) {
        console.error("Error saving to database:", error);
        alert("Failed to sync with cloud.");
    } else {
        console.log("Synced with Supabase!");
        displayHistory(); // Refresh the list
    }
}

async function displayHistory() {
    // 1. Fetch data from the "reports" table in Supabase
    const { data, error } = await supabase
        .from('reports')
        .select('*')
        .order('created_at', { ascending: false }) // Newest reports first
        .limit(10);

    // 2. Handle errors (like no internet or wrong table name)
    if (error) {
        console.error("Database fetch error:", error.message);
        return;
    }

    // 3. Update the HTML
    if (historyList) {
        if (!data || data.length === 0) {
            historyList.innerHTML = '<p class="empty-msg">NO CLOUD LOGS FOUND</p>';
        } else {
            // Map through the database rows and create the HTML cards
            historyList.innerHTML = data.map(report => `
                <div class="report-card">
                    <small>${new Date(report.created_at).toLocaleString()}</small>
                    <p><strong>${report.engineer_name}</strong></p>
                    <p>${report.tool_status}</p>
                </div>
            `).join('');
        }
    }
}

// 3. Connect the button
submitBtn?.addEventListener('click', saveReport);

// Run on startup to show previous logs
displayHistory();

// --- UI NAVIGATION LOGIC ---

// 1. Select all the "Pages" and "Buttons"
const hub = document.getElementById('main-menu');
const inv = document.getElementById('inventory-screen');
const openInventoryBtn = document.getElementById('inventory-btn');
const closeInventoryBtn = document.getElementById('inventory-back-btn');

// 2. Function to switch to the Inventory Page
openInventoryBtn?.addEventListener('click', () => {
    console.log("Opening Inventory...");
    if (hub) hub.style.display = 'none';
    if (inv) inv.style.display = 'flex';
});

// 3. Function to switch back to the Hub
closeInventoryBtn?.addEventListener('click', () => {
    console.log("Returning to Hub...");
    if (inv) inv.style.display = 'none';
    if (hub) hub.style.display = 'flex';
});

// 4. (Optional) Check if things are working in the console
if (!openInventoryBtn) {
    console.error("The Inventory Button was not found! Check the ID in index.html");
}

window.addEventListener('DOMContentLoaded', async () => {
    await displayHistory();
});