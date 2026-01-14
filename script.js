// Core variables
let hunting = false;
let audioCtx = null;
let analyser = null;
let micStream = null;
let magSensor = null;
let nfcReader = null;

// Radar canvas
const radarCtx = document.getElementById('radarCanvas').getContext('2d');
let radarAngle = 0;

// Spectrogram canvas
const specCtx = document.getElementById('spectrogramCanvas').getContext('2d');
const specWidth = 600, specHeight = 200;
let specData = new Uint8ClampedArray(specWidth * specHeight * 4); // RGBA buffer

// Start button
document.getElementById('startBtn').addEventListener('click', async () => {
    if (hunting) return;
    hunting = true;
    await initSensors();
    animate();
    document.getElementById('status').innerHTML = '<p>Scanning...</p>';
});

// Stop button
document.getElementById('stopBtn').addEventListener('click', () => {
    hunting = false;
    if (audioCtx) audioCtx.close();
    if (magSensor) magSensor.stop();
    if (nfcReader) nfcReader.abort();
    document.getElementById('status').innerHTML = '<p>Idle</p>';
});

// Initialize sensors
async function initSensors() {
    // Audio for ping and spectrogram
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    // Ping function: Emit tone and listen
    setInterval(() => {
        if (!hunting) return;
        const oscillator = audioCtx.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(18000, audioCtx.currentTime); // High freq ping
        oscillator.connect(audioCtx.destination);
        oscillator.start();
        setTimeout(() => oscillator.stop(), 100);
        checkEcho(); // Analyze response
    }, 1000);

    // Magnetometer for metal/mag stripe
    if ('Magnetometer' in window) {
        magSensor = new Magnetometer({ frequency: 60 });
        magSensor.addEventListener('reading', () => {
            const strength = Math.sqrt(magSensor.x**2 + magSensor.y**2 + magSensor.z**2);
            document.getElementById('metalStatus').textContent = `Metal/Mag Stripe: ${strength.toFixed(2)} μT`;
            if (strength > 50) alertSound(); // Threshold for alert
        });
        magSensor.start();
    } else {
        console.warn('Magnetometer not supported');
    }

    // NFC detector
    if ('NDEFReader' in window) {
        nfcReader = new NDEFReader();
        await nfcReader.scan();
        nfcReader.addEventListener('reading', event => {
            document.getElementById('nfcStatus').textContent = `NFC: Detected ${event.message.records.length} records`;
            alertSound();
        });
    } else {
        console.warn('Web NFC not supported');
    }

    // Optional Web3: Detect connected wallet (e.g., MetaMask)
    if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
            console.log('Web3 Wallet detected:', accounts[0]);
            // Could integrate further, e.g., scan for crypto ID-like data
        }
    }
}

// Check echo for ping
function checkEcho() {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);
    const avg = dataArray.reduce((a, b) => a + b) / bufferLength;
    document.getElementById('pingStatus').textContent = `Ping: Echo strength ${avg.toFixed(2)}`;
    if (avg > 100) alertSound(); // Threshold for "target"
    updateSpectrogram(dataArray);
}

// Update spectrogram (colored readout)
function updateSpectrogram(data) {
    // Shift left
    for (let x = 0; x < specWidth - 1; x++) {
        for (let y = 0; y < specHeight; y++) {
            const idx = (y * specWidth + x) * 4;
            const nextIdx = (y * specWidth + x + 1) * 4;
            specData[idx] = specData[nextIdx];
            specData[idx + 1] = specData[nextIdx + 1];
            specData[idx + 2] = specData[nextIdx + 2];
            specData[idx + 3] = specData[nextIdx + 3];
        }
    }
    // Add new column
    for (let y = 0; y < specHeight; y++) {
        const freqIdx = Math.floor((y / specHeight) * data.length);
        const val = data[freqIdx] || 0;
        const color = hsvToRgb(val / 255 * 360, 1, 1); // Rainbow: blue low, red high
        const idx = (y * specWidth + specWidth - 1) * 4;
        specData[idx] = color[0];
        specData[idx + 1] = color[1];
        specData[idx + 2] = color[2];
        specData[idx + 3] = 255;
    }
    const imageData = new ImageData(specData, specWidth, specHeight);
    specCtx.putImageData(imageData, 0, 0);
}

// HSV to RGB helper
function hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h / 60);
    const f = h / 60 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// Animate radar
function animate() {
    if (!hunting) return;
    radarCtx.clearRect(0, 0, 300, 300);
    // Draw circles
    radarCtx.strokeStyle = '#0f0';
    for (let r = 50; r <= 150; r += 50) {
        radarCtx.beginPath();
        radarCtx.arc(150, 150, r, 0, Math.PI * 2);
        radarCtx.stroke();
    }
    // Sweep arm
    radarCtx.beginPath();
    radarCtx.moveTo(150, 150);
    radarCtx.lineTo(150 + 150 * Math.cos(radarAngle), 150 + 150 * Math.sin(radarAngle));
    radarCtx.stroke();
    radarAngle += 0.1;
    if (radarAngle > Math.PI * 2) radarAngle = 0;
    // Random blips for demo (replace with real data)
    if (Math.random() > 0.9) {
        const blipAngle = Math.random() * Math.PI * 2;
        const blipDist = Math.random() * 150;
        radarCtx.fillStyle = '#f00';
        radarCtx.beginPath();
        radarCtx.arc(150 + blipDist * Math.cos(blipAngle), 150 + blipDist * Math.sin(blipAngle), 5, 0, Math.PI * 2);
        radarCtx.fill();
    }
    requestAnimationFrame(animate);
}

// Audible alert
function alertSound() {
    const osc = audioCtx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(440, audioCtx.currentTime); // Beep
    osc.connect(audioCtx.destination);
    osc.start();
    setTimeout(() => osc.stop(), 200);
}