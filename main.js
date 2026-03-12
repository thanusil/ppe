// DOM Elements
const video = document.getElementById('webcam');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const detectionCountEl = document.getElementById('detectionCount');
const fpsDisplayEl = document.getElementById('fpsDisplay');
const toggleScanBtn = document.getElementById('toggleScanBtn');
const scanBtnText = document.getElementById('scanBtnText');
const switchCameraBtn = document.getElementById('switchCameraBtn');
const scanningFx = document.querySelector('.scanning-fx');
// State
let model = null;
let isScanning = false;
let currentFacingMode = 'environment';
let animationId = null;
let lastTime = performance.now();
let frames = 0;
// Initialize System
async function init() {
    try {
        // 1. Request Camera Access
        await setupCamera();
        
        // 2. Load the Model (COCO-SSD as Proof of Concept)
        statusText.innerText = "Loading AI Model...";
        model = await cocoSsd.load();
        
        // Setup UI for ready state
        statusText.innerText = "System Ready";
        statusDot.className = "dot ready";
        toggleScanBtn.disabled = false;
        
        // Event Listeners
        toggleScanBtn.addEventListener('click', toggleScanning);
        switchCameraBtn.addEventListener('click', switchCamera);
        
        // Handle window resize for canvas matching
        window.addEventListener('resize', resizeCanvas);
        
        // Allow time for video to correctly size
        setTimeout(resizeCanvas, 500);
    } catch (err) {
        console.error("Initialization error:", err);
        statusText.innerText = "Camera Access Denied";
        statusDot.style.backgroundColor = "var(--accent)";
        alert("Please allow camera access to use PPE Shield.");
    }
}
// Setup WebRTC Camera
async function setupCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Browser API navigator.mediaDevices.getUserMedia not available");
    }
    // Stop existing stream
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
    }
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
            facingMode: currentFacingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 }
        }
    });
    
    video.srcObject = stream;
    
    return new Promise((resolve) => {
        video.onloadedmetadata = () => {
            video.play();
            resizeCanvas();
            resolve();
        };
    });
}
// Switch front/back camera
async function switchCamera() {
    currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    
    // Pause scanning safely
    const wasScanning = isScanning;
    if (isScanning) stopScanning();
    
    try {
        await setupCamera();
        if (wasScanning) startScanning();
    } catch (e) {
        console.error("Error switching camera", e);
    }
}
// Ensure Canvas exact matches Video
function resizeCanvas() {
    if (!video.videoWidth) return;
    
    // Set internal canvas resolution to match video source
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
}
// Start/Stop Logic
function toggleScanning() {
    if (isScanning) {
        stopScanning();
    } else {
        startScanning();
    }
}
function startScanning() {
    isScanning = true;
    scanBtnText.innerText = "Stop Scan";
    toggleScanBtn.classList.add('active');
    statusDot.className = "dot scanning";
    statusText.innerText = "Scanning Area...";
    scanningFx.classList.add('active');
    
    detectFrame();
}
function stopScanning() {
    isScanning = false;
    scanBtnText.innerText = "Start Scan";
    toggleScanBtn.classList.remove('active');
    statusDot.className = "dot ready";
    statusText.innerText = "System Ready";
    scanningFx.classList.remove('active');
    
    // Clear canvas & reset UI
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    detectionCountEl.innerText = "0";
    
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
}
// Main Detection Loop
async function detectFrame() {
    if (!isScanning || !model || video.readyState !== 4) {
        if(isScanning) animationId = requestAnimationFrame(detectFrame);
        return;
    }
    try {
        // Run inference
        const predictions = await model.detect(video);
        
        // Calculate FPS metric
        calculateFPS();
        
        // Update Target Count
        detectionCountEl.innerText = predictions.length;
        
        // Render Bounding Boxes
        drawPredictions(predictions);
        
    } catch(e) {
        console.error("Detection error:", e);
    }
    
    // Loop
    if (isScanning) {
        animationId = requestAnimationFrame(detectFrame);
    }
}
// Render bounding boxes with Premium UI
function drawPredictions(predictions) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    predictions.forEach(prediction => {
        const [x, y, width, height] = prediction.bbox;
        const className = prediction.class;
        const confidence = Math.round(prediction.score * 100);
        
        // Color coding for visual interest (Mocking PPE vs Common Objects)
        // Since we are using COCO-SSD, person=primary, others=warning
        let primaryColor = '#00f2fe';
        let bgColor = 'rgba(0, 242, 254, 0.2)';
        
        if (className !== 'person') {
            primaryColor = '#f5af19';
            bgColor = 'rgba(245, 175, 25, 0.2)';
        }
        // Draw Box Background (Glass effect)
        ctx.fillStyle = bgColor;
        ctx.fillRect(x, y, width, height);
        // Draw Box Border
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, width, height);
        
        // Corner markers (Premium feel)
        const size = 15;
        ctx.lineWidth = 5;
        ctx.beginPath();
        // Top Left
        ctx.moveTo(x, y + size); ctx.lineTo(x, y); ctx.lineTo(x + size, y);
        // Top Right
        ctx.moveTo(x + width - size, y); ctx.lineTo(x + width, y); ctx.lineTo(x + width, y + size);
        // Bottom Left
        ctx.moveTo(x, y + height - size); ctx.lineTo(x, y + height); ctx.lineTo(x + size, y + height);
        // Bottom Right
        ctx.moveTo(x + width - size, y + height); ctx.lineTo(x + width, y + height); ctx.lineTo(x + width, y + height - size);
        ctx.stroke();
        // Label Background
        ctx.fillStyle = primaryColor;
        ctx.font = '600 16px Outfit, sans-serif';
        const textStr = `${className.toUpperCase()} ${confidence}%`;
        const textWidth = ctx.measureText(textStr).width;
        
        // Draw pill shape label
        const padX = 10;
        const padY = 6;
        ctx.beginPath();
        ctx.roundRect(x, y - 30, textWidth + (padX * 2), 24, 6);
        ctx.fill();
        // Label Text
        ctx.fillStyle = '#0f172a';
        ctx.fillText(textStr, x + padX, y - 13);
    });
}
// Simple FPS counter
function calculateFPS() {
    frames++;
    const now = performance.now();
    const elapsed = now - lastTime;
    
    if (elapsed >= 1000) {
        fpsDisplayEl.innerText = Math.round((frames * 1000) / elapsed);
        frames = 0;
        lastTime = now;
    }
}
// Boot application
window.onload = init;
