console.log("Clean Mobile Script starting...");

// --- SOUND CONFIGURATION ---
const HIT_SOUND_URL = 'slide sound.mp3'; 
const MAX_VOLUME = 0.6;
const MIN_IMPACT = 0.5;
const AUDIO_POOL_SIZE = 8;

// --- PHYSICS CONFIGURATION ---
const REPEL_RADIUS = 180;    
const PUSH_STRENGTH = 1.2;   
const RETURN_SPEED = 0.008;  
const SLIPPERINESS = 0.97;   
const BOUNCINESS = 0.2;      
const GRAVITY_SENSITIVITY = 0.8; 

// --- GLOBAL VARIABLES ---
const compressors = [];
const audioPool = []; 
let mouseX = -9999;
let mouseY = -9999;
let globalScale = 1;
let motionEnabled = false;

// --- INITIALIZATION ---
window.addEventListener('load', () => {
    fitToScreen();
    initAudio(); 

    const allImages = document.querySelectorAll('.building-container img');
    
    allImages.forEach((el, index) => {
        const id = el.id || "";
        if (id === 'layer-54' || id === 'layer-01') return;
        if (el.offsetWidth === 0) return;

        const radius = el.offsetWidth / 2; 

        compressors.push({
            id: index,
            element: el,
            x: 0, 
            vx: 0, 
            radius: radius,
            lastHit: 0 
        });
    });

    // INVISIBLE ACTIVATION
    // We wait for the user to touch the screen ONCE to unlock Sound & Shake
    document.addEventListener('touchstart', activateFeatures, { once: true });
    document.addEventListener('click', activateFeatures, { once: true });

    console.log(`Mobile Mode started for ${compressors.length} items.`);
    animate();
});

// --- ACTIVATION FUNCTION (Runs once on first touch) ---
function activateFeatures() {
    // 1. Unlock Audio
    const s = audioPool[0];
    if (s) {
        s.play().catch(() => {});
        s.pause();
    }

    // 2. Request Motion Permissions (iOS requirement)
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(response => {
                if (response === 'granted') {
                    window.addEventListener('devicemotion', handleMotion);
                    motionEnabled = true;
                }
            })
            .catch(console.error);
    } else {
        window.addEventListener('devicemotion', handleMotion);
        motionEnabled = true;
    }
}

// --- AUDIO ENGINE ---
function initAudio() {
    for (let i = 0; i < AUDIO_POOL_SIZE; i++) {
        const audio = new Audio(HIT_SOUND_URL);
        audio.preload = 'auto';
        audioPool.push(audio);
    }
}

function playImpactSound(velocity) {
    let volume = (velocity - MIN_IMPACT) / 10; 
    if (volume > MAX_VOLUME) volume = MAX_VOLUME;
    if (volume < 0.05) return; 

    const player = audioPool.find(a => a.paused || a.ended);
    if (player) {
        player.volume = volume;
        player.currentTime = 0; 
        player.play().catch(e => { });
    }
}

// --- AUTO SCALING ---
function fitToScreen() {
    const bg = document.getElementById('layer-54');
    const scaler = document.getElementById('scaler');
    if (!bg || !scaler) return;

    const imgHeight = bg.naturalHeight || 1080;
    const screenHeight = window.innerHeight;
    const padding = 40; 
    let scale = (screenHeight - padding) / imgHeight;
    if (scale <= 0 || isNaN(scale)) scale = 1; 

    scaler.style.transform = `scale(${scale})`;
    globalScale = scale;
}
window.addEventListener('resize', fitToScreen);

// --- INPUT TRACKING (MOUSE + TOUCH) ---

document.addEventListener('mousemove', (e) => {
    updateInputPos(e.clientX, e.clientY);
});

document.addEventListener('touchmove', (e) => {
    if(e.target.closest('.building-container')) e.preventDefault();
    const touch = e.touches[0];
    updateInputPos(touch.clientX, touch.clientY);
}, { passive: false });

document.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    updateInputPos(touch.clientX, touch.clientY);
}, { passive: false });

document.addEventListener('touchend', () => {
    mouseX = -9999;
    mouseY = -9999;
});

function updateInputPos(clientX, clientY) {
    const bg = document.getElementById('layer-54');
    if (!bg) return;
    const rect = bg.getBoundingClientRect();
    mouseX = (clientX - rect.left) / globalScale;
    mouseY = (clientY - rect.top) / globalScale;
}

// --- MOTION HANDLER ---
let tiltForceX = 0;

function handleMotion(e) {
    const accX = e.accelerationIncludingGravity.x;
    if (accX !== null) {
        tiltForceX = accX * -GRAVITY_SENSITIVITY;
    }
}

// --- PHYSICS ENGINE ---
function animate() {
    const now = Date.now();

    compressors.forEach(item => {
        const el = item.element;
        const originX = el.offsetLeft + (el.offsetWidth / 2);
        const originY = el.offsetTop + (el.offsetHeight / 2);
        const currentX = originX + item.x;
        const currentY = originY; 

        // Mouse/Finger Push
        const dx = mouseX - currentX;
        const dy = mouseY - currentY;
        const distance = Math.sqrt(dx*dx + dy*dy);

        if (distance < REPEL_RADIUS) {
            let force = (REPEL_RADIUS - distance) / REPEL_RADIUS;
            force = force * force; 
            const directionX = dx > 0 ? -1 : 1;
            item.vx += directionX * force * PUSH_STRENGTH;
        }

        // Tilt Force
        if (motionEnabled) {
            item.vx += tiltForceX;
        }

        // Drift Back
        item.vx -= item.x * RETURN_SPEED;
    });

    // Double Physics Step
    for (let k = 0; k < 2; k++) {
        for (let i = 0; i < compressors.length; i++) {
            for (let j = i + 1; j < compressors.length; j++) {
                resolveLinearCollision(compressors[i], compressors[j], now);
            }
        }
    }

    // Move
    compressors.forEach(item => {
        item.vx *= SLIPPERINESS;
        item.x += item.vx;

        if (item.x > 300) { item.x = 300; item.vx *= -0.5; }
        if (item.x < -300) { item.x = -300; item.vx *= -0.5; }
        if (isNaN(item.x)) { item.x = 0; item.vx = 0; }

        item.element.style.transform = `translate3d(${item.x}px, 0, 0)`;
    });

    requestAnimationFrame(animate);
}

// --- COLLISION LOGIC ---
function resolveLinearCollision(p1, p2, now) {
    const el1 = p1.element;
    const el2 = p2.element;

    const p1y = el1.offsetTop;
    const p2y = el2.offsetTop;
    if (Math.abs(p1y - p2y) > 50) return; 

    const p1x = el1.offsetLeft + (el1.offsetWidth / 2) + p1.x;
    const p2x = el2.offsetLeft + (el2.offsetWidth / 2) + p2.x;
    
    const dx = p2x - p1x;
    const distance = Math.abs(dx);
    const minDistance = (p1.radius + p2.radius) * 0.90; 

    if (distance < minDistance) {
        const overlap = minDistance - distance;
        const sign = dx > 0 ? 1 : -1;

        p1.x -= overlap * 0.5 * sign; 
        p2.x += overlap * 0.5 * sign;

        const impactVelocity = Math.abs(p1.vx - p2.vx);
        if (impactVelocity > MIN_IMPACT && (now - p1.lastHit > 100) && (now - p2.lastHit > 100)) {
            playImpactSound(impactVelocity);
            p1.lastHit = now;
            p2.lastHit = now;
        }

        const v1 = p1.vx;
        const v2 = p2.vx;

        p1.vx = v1 * (1 - BOUNCINESS) + v2 * BOUNCINESS;
        p2.vx = v2 * (1 - BOUNCINESS) + v1 * BOUNCINESS;
        
        p1.vx *= 0.9;
        p2.vx *= 0.9;
    }
}