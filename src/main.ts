import * as THREE from 'three';

import { createClient } from '@supabase/supabase-js';
import { Html5QrcodeScanner } from "html5-qrcode";

// ==========================================
// 1. CONFIGURATION & TOP-LEVEL TRACKING
// ==========================================
const supabaseUrl = 'https://jlinwbohgjckloovrbid.supabase.co'
const supabaseKey = 'sb_publishable_nP5vXP8wvcTvQ2jPbo9KoQ_-z3LltPe'
const supabase = createClient(supabaseUrl, supabaseKey);

// This is the new master checklist tracking setup
const REQUIRED_TOOLS = ["screwdriver", "spanner", "track_gauge", "torch"];
let scannedToolsSession = new Set<string>();
let activeScanner: Html5QrcodeScanner | null = null;

let arScene: THREE.Scene | null = null;
let arCamera: THREE.PerspectiveCamera | null = null;
let arRenderer: THREE.WebGLRenderer | null = null;
let videoElement: HTMLVideoElement | null = null;

let isScanningForAnomalies = true;
// ==========================================
// 2. CHECKLIST & SCANNING LOGIC
// ==========================================

// Processes each QR code read by the camera locally
async function processScan(scannedInput: string) {
    const toolName = scannedInput.trim();

    // Ignore things that aren't on our official manifest
    if (!REQUIRED_TOOLS.includes(toolName)) {
        const feedback = document.getElementById('scan-feedback');
        if (feedback) {
            feedback.innerText = `Unknown Asset: "${toolName}" ignored.`;
            feedback.style.color = "#d32f2f";
        }
        return;
    }

    // Mark the tool as scanned in this session
    scannedToolsSession.add(toolName);
    updateChecklistUI();
}

// Updates the screen text so the engineer knows what's left
function updateChecklistUI() {
    const feedback = document.getElementById('scan-feedback');
    if (feedback) {
        const remaining = REQUIRED_TOOLS.filter(tool => !scannedToolsSession.has(tool));
        
        if (remaining.length === 0) {
            feedback.innerText = "All 4 tools scanned! Ready to submit report.";
            feedback.style.color = "#2e7d32";
        } else {
            feedback.innerText = `Scanned (${scannedToolsSession.size}/4). Missing: ${remaining.join(', ')}`;
            feedback.style.color = "#f57c00";
        }
    }
}

// Compiles the entire session and sends ONE log entry to the cloud
async function submitFinalReport() {
    if (scannedToolsSession.size === 0) {
        alert("You haven't scanned any tools yet!");
        return;
    }
    
    const missingTools = REQUIRED_TOOLS.filter(tool => !scannedToolsSession.has(tool));
    
    let statusSummary = "";
    if (missingTools.length === 0) {
        statusSummary = "All 4 Present";
    } else {
    // Example output: "Missing: Digital Caliper"
        statusSummary = `Missing: ${missingTools.join(', ')}`; 
    }
   

    const reportData = {
        engineer_name: "Eastleigh Tech 01",
        tool_status: statusSummary,

    };

    const { error } = await supabase
        .from('reports')
        .insert([reportData]);

    if (error) {
        console.error("Database Error:", error.message);
        alert("Error saving report to Supabase.");
    } else {
        alert("Inspection report submitted successfully!");
        
        // Reset everything for the next inspection check
        scannedToolsSession.clear();
        updateChecklistUI();
        displayHistory(); 
    }
}

// ==========================================
// 3. DATABASE HISTORY FETCHING
// ==========================================
async function displayHistory() {
    const { data, error } = await supabase
        .from('reports')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error loading history:", error.message);
        return;
    }

    const historyList = document.getElementById('history-list');
    if (historyList) {
        if (!data || data.length === 0) {
            historyList.innerHTML = '<p style="color: #999; text-align: center;">No logs found.</p>';
            return;
        }

        historyList.innerHTML = data.map((row: any) => `
            <div class="history-item">
                <strong>${row.engineer_name}</strong> - ${row.sector}<br>
                <span style="color: #555;">${row.tool_status}</span>
            </div>
        `).join('');
    }
}

// ==========================================
// 4. ENGINE INITIALIZATION & VIEW CONTROLS
// ==========================================
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
            // Leaving this completely empty removes the error argument type issue entirely
        }
    );
}

async function loadDashboardReports() {
    const dashboardList = document.getElementById('dashboard-history-list');
    if (!dashboardList) return;

    dashboardList.innerHTML = '<p style="color: #666; text-align: center;">Fetching data streams...</p>';

    // Pull rows sorted by newest timestamp
    const { data, error } = await supabase
        .from('reports')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Dashboard error:", error.message);
        dashboardList.innerHTML = `<p style="color: #d32f2f;">Failed to retrieve records: ${error.message}</p>`;
        return;
    }

    if (!data || data.length === 0) {
        dashboardList.innerHTML = '<p style="color: #999; text-align: center;">No inspections have been filed yet.</p>';
        return;
    }

    // Map out rows dynamically into clean data blocks
    dashboardList.innerHTML = data.map((row: any) => {
        const dateFormatted = new Date(row.created_at).toLocaleString('en-GB', { 
            dateStyle: 'short', 
            timeStyle: 'short' 
        });

        const isMissing = row.tool_status.includes("MISSING");
        const cardBorderColor = isMissing ? "#d32f2f" : "#2e7d32";
        const badgeBg = isMissing ? "#ffebee" : "#e8f5e9";
        const badgeColor = isMissing ? "#c62828" : "#2e7d32";

        return `
            <div style="background: #fdfdfd; border: 1px solid #e0e0e0; border-left: 5px solid ${cardBorderColor}; padding: 15px; margin-bottom: 12px; border-radius: 6px;">
                <div style="display: flex; justify-content: space-between; font-size: 13px; color: #777; margin-bottom: 5px;">
                    <span>📅 ${dateFormatted}</span>
                </div>
                <div style="font-weight: bold; font-size: 15px; color: #111; margin-bottom: 6px;">
                    Inspector: ${row.engineer_name}
                </div>
                <div style="padding: 8px; background: ${badgeBg}; color: ${badgeColor}; border-radius: 4px; font-family: monospace; font-size: 13px; word-break: break-word;">
                    ${row.tool_status}
                </div>
            </div>
        `;
    }).join('');
}

async function initARSession() {
    const faultView = document.getElementById('fault-view');
    const statusText = document.getElementById('xr-status');
    if (!faultView || !statusText) return;

    statusText.innerText = "Accessing Camera...";

    // 1. Create the Background Video Feed
    if (!videoElement) {
        videoElement = document.createElement('video');
        videoElement.setAttribute('autoplay', '');
        videoElement.setAttribute('muted', '');
        videoElement.setAttribute('playsinline', '');
        // Stretch the background video to fit the entire screen fully
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
        // Request the device's rear camera feed
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { exact: "environment" } },
            audio: false
        });
        videoElement.srcObject = stream;
    } catch (err) {
        console.warn("Rear camera blocked, falling back to any available camera:", err);
        try {
            // Fallback for computers/emulators that don't have a specific "environment" camera
            const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            videoElement.srcObject = fallbackStream;
        } catch (finalErr) {
            statusText.innerText = "Camera Denied";
            alert("Could not access device camera feed.");
            return;
        }
    }

    // 2. Setup Three.js 3D Graphics Canvas environment
    arScene = new THREE.Scene();
    
    // Setup camera lens matching browser screen dimensional ratio
    arCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    arCamera.position.set(0, 0, 5); // Position camera in the center

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

    // 3. Fire up the continuous animation frame loop
    function animate() {
        if (!arRenderer || !arScene || !arCamera || faultView?.style.display === 'none') return;
        
        requestAnimationFrame(animate);
        arRenderer.render(arScene, arCamera);
    }
    isScanningForAnomalies = true;
    animate();
    analyzeSurfaceForAnomalies(); // Start the scanning stream loop immediately
}

// Tracking coordinate state outside the scope so the save transaction can read it
let temporaryCoordinates = { x: 0, y: 0, z: 2 };



// Packages structural metadata form selection values and transmits directly to the cloud matrix
function analyzeSurfaceForAnomalies() {
    // If the module was closed, or we already locked onto a defect, terminate the background loop safely
    if (!videoElement || !arScene || !isScanningForAnomalies) return;

    const faultView = document.getElementById('fault-view');
    if (faultView?.style.display === 'none') return;

    if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
        // Camera isn't quite ready yet, try again in 300ms
        setTimeout(analyzeSurfaceForAnomalies, 300);
        return;
    }

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

    // DECISION GATE
    if (darkPixelCount > 30) { 
        // 1. ANOMALY DETECTED! Instantly freeze the auto-scanner so it stops searching
        isScanningForAnomalies = false;

        const centerX = sumX / darkPixelCount;
        const centerY = sumY / darkPixelCount;

        const calculated3DX = ((centerX / scanSize) - 0.5) * 2;
        const calculated3DY = -((centerY / scanSize) - 0.5) * 2;
        const calculated3DZ = 2.0;

        const cleanX = parseFloat(calculated3DX.toFixed(3));
        const cleanY = parseFloat(calculated3DY.toFixed(3));
        const cleanZ = parseFloat(calculated3DZ.toFixed(3));

        temporaryCoordinates = { x: cleanX, y: cleanY, z: cleanZ };

        // 2. Drop the streamlined 3D Crosshair right onto the detected anomaly coordinates
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
            statusText.innerText = "🎯 AUTO-LOCKED!";
            statusText.style.backgroundColor = "#e65100";
        }

        // 3. Open your form database entry modal cleanly
        const modal = document.getElementById('fault-modal');
        if (modal) modal.style.display = 'flex';

    } else {
        // NO ANOMALY SEEN: Update status and schedule the next frame scan in 150 milliseconds
        if (statusText) {
            statusText.innerText = "🔍 Scanning Surface...";
            statusText.style.backgroundColor = "#0288d1"; // Blue scanning state
        }
        
        // This creates a continuous background processing pipeline loop
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
        console.error("Supabase AR Stream Logging Error:", error.message);
        alert(`Failed to register defect telemetry: ${error.message}`);

    } else {
        alert("Spatial fault anomaly registered successfully!");
        
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
            statusText.innerText = "⏸️ Scanner Paused (2s)...";
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
// Wire everything up as soon as the browser windows hits readiness
window.addEventListener('DOMContentLoaded', () => {
    displayHistory();

    const startPageView = document.getElementById('start-page-view');
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



// Bind the click event to our new database pipeline function

    submitBtn?.addEventListener('click', submitFinalReport);
    placeFaultBtn?.addEventListener('click', analyzeSurfaceForAnomalies);
    modalSaveBtn?.addEventListener('click', saveFaultToDatabase);

    // Launch verification mode
    launchVerifyBtn?.addEventListener('click', () => {
        if (startPageView && scannerView) {
            startPageView.style.display = 'none';
            scannerView.style.display = 'block';
            startCameraScanner();
        }
    });

    viewReportsBtn?.addEventListener('click', () => {
        if (startPageView && reportsView) {
            startPageView.style.display = 'none';
            reportsView.style.display = 'block';
            
            // Fires the new Supabase fetch we created for the dashboard table
            loadDashboardReports(); 
        }
    });

    launchFaultBtn?.addEventListener('click', () => {
        if (startPageView && faultView) {
            startPageView.style.display = 'none';
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
            if (startPageView) startPageView.style.display = 'block';
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

    //Submit report button click event listener
   
//});