import * as THREE from 'three';
import { createClient } from '@supabase/supabase-js';
import { Html5QrcodeScanner } from "html5-qrcode";

const supabaseUrl = 'https://jlinwbohgjckloovrbid.supabase.co' // Link to database
const supabaseKey = 'sb_publishable_nP5vXP8wvcTvQ2jPbo9KoQ_-z3LltPe' // Key to access database
const supabase = createClient(supabaseUrl, supabaseKey); // Assign supabase to variable to link to database in functions

// This is the new master checklist tracking setup
const REQUIRED_TOOLS = ["screwdriver", "spanner", "track_gauge", "torch"]; // Set up tool checklist
let scannedToolsSession = new Set<string>(); 
let activeScanner: Html5QrcodeScanner | null = null;
 // 
let arScene: THREE.Scene | null = null;
let arCamera: THREE.PerspectiveCamera | null = null;
let arRenderer: THREE.WebGLRenderer | null = null;
let videoElement: HTMLVideoElement | null = null;

let isScanningForAnomalies = true;
let currentMfaCode: string = "000000";


// Processes each QR code read by the camera locally
async function processScan(scannedInput: string) {
    const toolName = scannedInput.trim();

    // Check if the tool is on the checklist 
    if (!REQUIRED_TOOLS.includes(toolName)) {
        const feedback = document.getElementById('scan-feedback');
        if (feedback) {
            // If it is not on the checklist, ignore it and display 'unknown asset' to user
            feedback.innerText = `Unknown Asset: "${toolName}" ignored.`;
            feedback.style.color = "#d32f2f";
        }
        return;
    }

    // Marks the tool as registered and added to current inventory count
    scannedToolsSession.add(toolName);
    updateChecklistUI();
}

// Updates the screen text so the engineer knows what's left
function updateChecklistUI() {
    const feedback = document.getElementById('scan-feedback');
    if (feedback) {
        const remaining = REQUIRED_TOOLS.filter(tool => !scannedToolsSession.has(tool));
        
        if (remaining.length === 0) { 
            // If all 4 tools are present, displays a message confirming this to user
            feedback.innerText = "All Tools Accounted For - Submit report";
            feedback.style.color = "#2e7d32";
        } else {
            feedback.innerText = `(${scannedToolsSession.size}/4) tools scanned, Missing: ${remaining.join(', ')}`;
            // Whilst there are tools missing, displays a message of how many have been accounted for and which tools are missing
            feedback.style.color = "#f57c00";
        }
    }
}

// Submits report when user chooses, whether all tools are present or not, unless none have been scanned at all 
async function submitFinalReport() {
    if (scannedToolsSession.size === 0) {
        alert("You haven't scanned any tools yet!");
        return;
    }
    
    // Assigns any missing tools to a separate array to be included in the submitted report
    const missingTools = REQUIRED_TOOLS.filter(tool => !scannedToolsSession.has(tool));
    
    let statusSummary = "";
    if (missingTools.length === 0) {
        statusSummary = "All Tools Present";
    } else {
        // Tells the user which tools are missing in final summary
        statusSummary = `Missing: ${missingTools.join(', ')}`; 
    }

    const reportData = {
        engineer_name: "Technician 01", //Could be made into an input field or pull from a login process
        tool_status: statusSummary,

    };

    const { error } = await supabase
        .from('reports')
        .insert([reportData]);

    if (error) {
        console.error("Database Error:", error.message);
        // Informs user if there is an error saving to database
        alert("Error saving report to database.");
    } else {
        alert("Inspection report submitted successfully!");
        
        // Reset everything for the next tool count
        scannedToolsSession.clear();
        updateChecklistUI();
        refreshReportsList(); 
    }
}

async function refreshReportsList() {
    const historyListContainer = document.getElementById('dashboard-history-list');
    if (!historyListContainer) return;

    // 1. Fetch latest data from Supabase
    const { data, error } = await supabase
        .from('faults')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Fetch error:", error.message);
        historyListContainer.innerHTML = `<p style="color:red;">Error loading logs.</p>`;
        return;
    }

    // 2. Clear the "Loading..." message
    historyListContainer.innerHTML = '';

    if (!data || data.length === 0) {
        historyListContainer.innerHTML = `<p style="text-align:center; color:#999;">No faults logged yet.</p>`;
        return;
    }

    // 3. Generate the HTML for every report found
    data.forEach((fault) => {
        const date = new Date(fault.created_at).toLocaleString();
        const card = document.createElement('div');
        card.className = 'section-box'; // Using your existing CSS class
        card.style.borderLeft = fault.severity === 'CRITICAL' ? '5px solid #d32f2f' : '5px solid #ffa000';
        card.style.marginBottom = '10px';
        card.style.padding = '15px';

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div>
                    <strong style="font-size: 16px;">${fault.fault_type}</strong>
                    <div style="font-size: 12px; color: #666;">${date}</div>
                </div>
                <span style="font-size: 10px; padding: 4px 8px; border-radius: 4px; background: #eee; font-weight: bold;">
                    ${fault.severity}
                </span>
            </div>
            <div style="margin-top: 8px; font-family: monospace; font-size: 11px; color: #444; background: #f9f9f9; padding: 5px; border-radius: 4px;">
                LOC: [X:${fault.coord_x}, Y:${fault.coord_y}, Z:${fault.coord_z}]
            </div>
        `;
        historyListContainer.appendChild(card);
    });
}


// Initialises QR code scanner 
function startCameraScanner() {
    activeScanner = new Html5QrcodeScanner(
        "qr-reader", 
        { fps: 10, qrbox: { width: 250, height: 250 }, rememberLastUsedCamera: true },
        false
    );

    activeScanner.render(
        (decodedText: string) => {
            processScan(decodedText); 
        },
        () => { 
        }
    );
}

// Initialises AR session 
async function initARSession() {
    const faultView = document.getElementById('fault-view');
    const statusText = document.getElementById('xr-status');
    if (!faultView || !statusText) return;

    statusText.innerText = "Loading Camera Feed...";

    // Background video 
    if (!videoElement) {
        videoElement = document.createElement('video');
        videoElement.setAttribute('autoplay', '');
        videoElement.setAttribute('muted', '');
        videoElement.setAttribute('playsinline', '');
        // Get the video to cover the full screen behind Three.js canvas
        videoElement.style.position = 'absolute';
        videoElement.style.top = '0';
        videoElement.style.left = '0';
        videoElement.style.width = '100vw';
        videoElement.style.height = '100vh';
        videoElement.style.objectFit = 'cover';
        videoElement.style.zIndex = '1';
        faultView.appendChild(videoElement);
    }

    try {
        // Getting access to the rear camera 
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { exact: "environment" } },
            audio: false
        });
        videoElement.srcObject = stream;
    } catch (err) {
        console.warn("Rear camera blocked, falling back to any available camera:", err);
        try {
            //Back up to use any available camera if the device doesn't have a specific 'environment' facing camera
            const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            videoElement.srcObject = fallbackStream;
        } catch (finalErr) {
            //Last resort: Displaying an error message and exiting AR mode 
            statusText.innerText = "Camera Denied";
            alert("Cannot access device camera.");
            return;
        }
    }

    // Set up new Three.js scene
    arScene = new THREE.Scene();
    
    // Setup camera lens matching browser aspect ratio
    arCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    arCamera.position.set(0, 0, 5); // Position camera centrally

    // Create the WebGL 3D renderer and link it transparently over the video
    arRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    arRenderer.setSize(window.innerWidth, window.innerHeight);
    arRenderer.domElement.style.position = 'absolute';
    arRenderer.domElement.style.top = '0';
    arRenderer.domElement.style.left = '0';
    arRenderer.domElement.style.zIndex = '2'; // Canvas sits directly over the background video
    faultView.appendChild(arRenderer.domElement);

    statusText.innerText = "AR Mode Active";
    statusText.style.backgroundColor = "#2e7d32"; // Turn badge green

    //Continuous loop for AR scene to keep it responsive
    function animate() {
        if (!arRenderer || !arScene || !arCamera || faultView?.style.display === 'none') return;
        
        requestAnimationFrame(animate);
        arRenderer.render(arScene, arCamera);
    }
    isScanningForAnomalies = true;
    animate();
    analyzeSurfaceForAnomalies(); // Start the scanning stream loop immediately
}

// Tracking coordinates so they can be saved
let temporaryCoordinates = { x: 0, y: 0, z: 2 };



// Packages structural metadata form selection values and transmits directly to the cloud matrix
function analyzeSurfaceForAnomalies() {
    // End background loop if AR closed or already locked onto a defect
    if (!videoElement || !arScene || !isScanningForAnomalies) return;

    const faultView = document.getElementById('fault-view');
    if (faultView?.style.display === 'none') return;

    if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
        // Retry if device or camera feed is slow to boot up
        setTimeout(analyzeSurfaceForAnomalies, 300);
        return;
    }

    // Processing video feed without affecting main UI, this is to analyse the surface
    const processCanvas = document.createElement('canvas');
    const ctx = processCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const scanSize = 140;
    processCanvas.width = scanSize;
    processCanvas.height = scanSize;

    const sourceX = Math.floor((videoElement.videoWidth - scanSize) / 2);
    const sourceY = Math.floor((videoElement.videoHeight - scanSize) / 2);

    ctx.clearRect(0, 0, scanSize, scanSize);
    ctx.drawImage(videoElement, sourceX, sourceY, scanSize, scanSize, 0, 0, scanSize, scanSize);

    const imgData = ctx.getImageData(0, 0, scanSize, scanSize);
    const pixels = imgData.data;

    let totalBrightness = 0;
    let darkPixelCount = 0;
    let sumX = 0;
    let sumY = 0;

    for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        totalBrightness += brightness;
    }

    const averageBrightness = totalBrightness / (pixels.length / 4);
    const anomalyThreshold = averageBrightness * 0.65; // Sensitivity calibration index

    let index = 0;
    for (let y = 0; y < scanSize; y++) {
        for (let x = 0; x < scanSize; x++) {
            const r = pixels[index];
            const g = pixels[index + 1];
            const b = pixels[index + 2];
            const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;

            if (brightness < anomalyThreshold) {
                darkPixelCount++;
                sumX += x;
                sumY += y;
            }
            index += 4;
        }
    }

    const statusText = document.getElementById('xr-status');

    // Defect detection decision point 
    if (darkPixelCount > 30) { 
        // Sets threshold and stops scanning loop
        isScanningForAnomalies = false;
        
        //Calculate coordinates of the defect
        const centerX = sumX / darkPixelCount;
        const centerY = sumY / darkPixelCount;
        
        //2D into 3D coordinates
        const calculated3DX = ((centerX / scanSize) - 0.5) * 2;
        const calculated3DY = -((centerY / scanSize) - 0.5) * 2;
        const calculated3DZ = 2.0;

        //Rounding to 3 decimal places
        const cleanX = parseFloat(calculated3DX.toFixed(3));
        const cleanY = parseFloat(calculated3DY.toFixed(3));
        const cleanZ = parseFloat(calculated3DZ.toFixed(3));

        //Assigning coordinates to a variable to store until defect is logged to the database by the user
        temporaryCoordinates = { x: cleanX, y: cleanY, z: cleanZ };

        //Dropping a marker onto defect
        const lineThickness = 0.01;
        const crossSize = 0.2;
        const crossGeometry = new THREE.CylinderGeometry(lineThickness, lineThickness, crossSize, 8);
        const crossMaterial = new THREE.MeshBasicMaterial({ color: 0xd32f2f });

        const verticalLine = new THREE.Mesh(crossGeometry, crossMaterial);
        const horizontalLine = new THREE.Mesh(crossGeometry, crossMaterial);
        horizontalLine.rotation.z = Math.PI / 2;

        const faultCrossGroup = new THREE.Group();
        faultCrossGroup.add(verticalLine);
        faultCrossGroup.add(horizontalLine);
        
        faultCrossGroup.position.set(cleanX, cleanY, cleanZ);
        arScene.add(faultCrossGroup);

        if (statusText) {
            statusText.innerText = "Auto-locked to Defect";
            statusText.style.backgroundColor = "#e65100";
        }

        //Opens form for user to log details of the fault
        const modal = document.getElementById('fault-modal');
        if (modal) modal.style.display = 'flex';

    } else {
        // Keep scanning 
        if (statusText) {
            statusText.innerText = "Scanning for Defects...";
            statusText.style.backgroundColor = "#0288d1"; 
        }
        
        //Continuously keep scanning every 150ms until AR session ended or fault detected
        setTimeout(analyzeSurfaceForAnomalies, 150);
    }
}

// Packages structural metadata form selection values and transmits directly to the cloud matrix
async function saveFaultToDatabase() {
    const typeSelect = document.getElementById('modal-fault-type') as HTMLSelectElement;
    const severitySelect = document.getElementById('modal-fault-severity') as HTMLSelectElement;
    const modal = document.getElementById('fault-modal');

    if (!typeSelect || !severitySelect) return;

    // 1. Build the data payload using our auto-locked coordinates
    const payload = {
        fault_type: typeSelect.value,
        severity: severitySelect.value,
        coord_x: temporaryCoordinates.x,
        coord_y: temporaryCoordinates.y,
        coord_z: temporaryCoordinates.z
    };

    // 2. Push the payload row to your Supabase faults table
    const { error } = await supabase
        .from('faults')
        .insert([payload]);

    if (error) {
        console.error("Database Error:", error.message);
        alert(`Failed to submit fault report: ${error.message}`);

    } else {
        alert("Fault Reported Successfully");
        
        // Hide the form modal container safely
        if (modal) modal.style.display = 'none';
        
        // Clean up the 3D scene from the previous crosshair marker
        if (arScene) {
            while(arScene.children.length > 0) { 
                arScene.remove(arScene.children[0]); 
            }
        }
        
        // Set the status text to pause mode here too
        const statusText = document.getElementById('xr-status');
        if (statusText) {
            statusText.innerText = "Scanner Paused (2s)...";
            statusText.style.backgroundColor = "#616161";
        }
        
        // Wait 2 seconds before letting the camera scan for the NEXT anomaly
        setTimeout(() => {
            const currentView = document.getElementById('fault-view');
            if (currentView && currentView.style.display !== 'none') {
                isScanningForAnomalies = true;
                analyzeSurfaceForAnomalies(); 
            }
        }, 2000);
    }
}


function showView(viewId: string) {
    const allViews = ['login-view', 'mfa-view', 'menu-view'];
    console.log(`--- Attempting to show: ${viewId} ---`);

    allViews.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (id === viewId) {
                el.style.setProperty('display', 'flex', 'important');
                console.log(`✅ ${id} is now VISIBLE`);
            } else {
                el.style.display = 'none';
            }
        } else {
            console.warn(`⚠️ Element NOT FOUND: ${id}`);
        }
    });
}

function generateMfa() {
    // Generate a random 6-digit number
    currentMfaCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    const displayEl = document.getElementById('mfa-display-code');
    if (displayEl) displayEl.innerText = currentMfaCode;
    
    // Clear previous input
    const inputEl = document.getElementById('mfa-input') as HTMLInputElement;
    if (inputEl) inputEl.value = "";
}



// 1. Mock Login Function
async function handleLogin() {
    const emailInput = document.getElementById('login-email') as HTMLInputElement;
    const passwordInput = document.getElementById('login-password') as HTMLInputElement;
    

    // SET YOUR TEST CREDENTIALS HERE
    const testEmail = "admin";
    const testPass = "1234";

    if (emailInput.value === testEmail && passwordInput.value === testPass) {
        currentMfaCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        const displayEl = document.getElementById('mfa-display-code');
        if (displayEl) {
            displayEl.innerText = currentMfaCode;generateMfa();
        } 
        showView('mfa-view'); // Go to MFA instead of menu
        console.log("Stage 1 Clear: MFA Code is " + currentMfaCode);
    }
        
        showView('mfa-view')
}

function handleMfaVerify() {
    console.log("Current Code:", currentMfaCode)
    const mfaInput = document.getElementById('mfa-input') as HTMLInputElement;
    const mfaError = document.getElementById('mfa-error');

    // Compare what the user typed to the variable we generated in Step 1
    if (mfaInput.value === "000000") {
        console.log("Stage 2 Clear: Access Granted.");
        localStorage.setItem('isLoggedIn', 'true');
        showView('menu-view');
    } else {
        if (mfaError) {
            mfaError.innerText = "Invalid Verification Code";
            mfaError.style.display = 'block';
            showView('mfa-view'); // Stay on MFA view if code is wrong
        }
    }
}

// 2. Check Mock Session on Start
function checkUserSession() {
    const loggedIn = localStorage.getItem('isLoggedIn');
    
    if (loggedIn === 'true') {
        showView('menu-view');
    } else {
        showView('login-view');
    }
}

// 3. Mock Logout
function handleLogout() {
    localStorage.removeItem('isLoggedIn');
    location.reload(); 
}

// Wire everything up as soon as the browser windows hits readiness
window.addEventListener('DOMContentLoaded', () => {
    

    const menuView = document.getElementById('menu-view');
    const scannerView = document.getElementById('scanner-view');
    const reportsView = document.getElementById('reports-view');
    const launchVerifyBtn = document.getElementById('verify-launch-btn');
    const faultView = document.getElementById('fault-view');
    const launchFaultBtn = document.getElementById('fault-launch-btn');
    const placeFaultBtn = document.getElementById('place-fault-btn');
    const viewReportsBtn = document.getElementById('view-reports-btn');
    const submitBtn = document.getElementById('submit-inspection-btn');
    const modalElement = document.getElementById('fault-modal');
    const modalSaveBtn = document.getElementById('modal-save-btn');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const mfaSubmitBtn = document.getElementById('mfa-submit-btn');


    submitBtn?.addEventListener('click', submitFinalReport);
    placeFaultBtn?.addEventListener('click', analyzeSurfaceForAnomalies);
    modalSaveBtn?.addEventListener('click', saveFaultToDatabase);
    authSubmitBtn?.addEventListener('click', handleLogin);
        checkUserSession();
    logoutBtn?.addEventListener('click', handleLogout);
    mfaSubmitBtn?.addEventListener('click', handleMfaVerify);


    // Launch verification mode
    launchVerifyBtn?.addEventListener('click', () => {
        if (menuView && scannerView) {
            menuView.style.display = 'none';
            scannerView.style.display = 'block';
            startCameraScanner();
        }
    });

    viewReportsBtn?.addEventListener('click', () => {
        if (menuView && reportsView) {
            menuView.style.display = 'none';
            reportsView.style.display = 'block';
            
            // Fires the new Supabase fetch we created for the dashboard table
            refreshReportsList(); 
        }
    });

    launchFaultBtn?.addEventListener('click', () => {
        if (menuView && faultView) {
            menuView.style.display = 'none';
            // WebXR overlays look best taking up the whole screen canvas
            faultView.style.display = 'block'; 
            
            // Next step: Initialize our Three.js AR Environment here!
            initARSession();
        }
    });

    // Go back to the main portal menu
    document.querySelectorAll('.portal-back-btn').forEach(button => {
        button.addEventListener('click', async () => {
            // Safe shutdown of camera hardware if it was running
            if (activeScanner) {
                try { 
                    await activeScanner.clear(); 
                    console.log("Camera hardware cleared safely.");
                } catch(e) {
                    console.error("Camera clear error:", e);
                }
            }
            
            // Resets the screen states: Hides alternatives, shows main menu
            if (scannerView) scannerView.style.display = 'none';
            if (reportsView) reportsView.style.display = 'none';
            if (faultView) faultView.style.display = 'none';
            if (menuView) menuView.style.display = 'block';
        });
    });

    modalSaveBtn?.addEventListener('click', saveFaultToDatabase);

// Dismisses interaction profile screen if engineer cancels choice sequence
    // Binds interaction dismissal to your database cancel handling loop
    modalCancelBtn?.addEventListener('click', () => {
    try {
        const modalElement = document.getElementById('fault-modal');
        const statusText = document.getElementById('xr-status');

        // 1. Instantly hide the modal interface overlay
        if (modalElement) {
            modalElement.style.display = 'none';
        }
        
        // 2. Safe Scene Cleanup: Remove the misidentified 3D crosshair marker
        if (arScene && arScene.children && arScene.children.length > 0) {
            const lastAddedMarker = arScene.children[arScene.children.length - 1];
            if (lastAddedMarker) {
                arScene.remove(lastAddedMarker);
            }
        }

        // 3. Inform user that the system is pausing briefly to allow re-positioning
        if (statusText) {
            statusText.innerText = "⏸️ Scanner Paused (2s)...";
            statusText.style.backgroundColor = "#616161"; // Neutral gray pause state
        }

        // 4. DELAYED RE-BOOT: Wait exactly 2000ms (2 seconds) before restarting the loop
        setTimeout(() => {
            // Re-verify the user hasn't exited the AR view during those 2 seconds
            const currentView = document.getElementById('fault-view');
            if (currentView && currentView.style.display !== 'none') {
                isScanningForAnomalies = true;
                analyzeSurfaceForAnomalies();
            }
        }, 2000); // 2000ms = 2 second countdown grid delay

    } catch (err) {
        console.error("Error inside Cancel handling pipeline:", err);
        isScanningForAnomalies = true;
    }
});
});

// This ensures the app starts even if checkUserSession fails
console.log("Script loaded. Initializing login view...");
showView('login-view');