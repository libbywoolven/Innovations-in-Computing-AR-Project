

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

// Wire everything up as soon as the browser windows hits readiness
window.addEventListener('DOMContentLoaded', () => {
    displayHistory();

    const startPageView = document.getElementById('start-page-view');
    const scannerView = document.getElementById('scanner-view');
    const reportsView = document.getElementById('reports-view');
    const launchVerifyBtn = document.getElementById('verify-launch-btn');
    //const backBtn = document.getElementById('back-btn');
    const viewReportsBtn = document.getElementById('view-reports-btn');
    //const submitBtn = document.getElementById('submit-inspection-btn');

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
            if (startPageView) startPageView.style.display = 'block';
        });
    });
});

    // Submit report button click event listener
    //submitBtn?.addEventListener('click', submitFinalReport);
//});