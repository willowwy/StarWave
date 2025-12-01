import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

// ---------- helpers ----------

// simple linear interpolation
const lerp = (a, b, t) => a * (1 - t) + b * t;

// particle texture (soft round dot)
const generateParticleTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    return new THREE.CanvasTexture(canvas);
};

// extract particle positions from canvas drawing
const extractParticlesFromCanvas = (canvas, count) => {
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    const width = canvas.width;
    const height = canvas.height;

    // Collect all drawn pixels
    const drawnPixels = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = (y * width + x) * 4;
            // Check if pixel is white or has any color (not black)
            const r = pixels[index];
            const g = pixels[index + 1];
            const b = pixels[index + 2];
            const alpha = pixels[index + 3];

            if (alpha > 50 && (r > 50 || g > 50 || b > 50)) { // Threshold for drawn pixels
                drawnPixels.push({ x, y });
            }
        }
    }

    console.log('Drawn pixels found:', drawnPixels.length);

    if (drawnPixels.length === 0) {
        // Return a small default pattern if nothing drawn
        const defaultParticles = [];
        for (let i = 0; i < count; i++) {
            defaultParticles.push({
                x: (Math.random() - 0.5) * 0.2,
                y: (Math.random() - 0.5) * 0.2,
                z: (Math.random() - 0.5) * 0.1
            });
        }
        return defaultParticles;
    }

    // Sample particles from drawn pixels
    const particles = [];
    const step = Math.max(1, Math.floor(drawnPixels.length / count));

    for (let i = 0; i < drawnPixels.length && particles.length < count; i += step) {
        const pixel = drawnPixels[i];

        // Convert pixel coordinates to 3D space (-1 to 1)
        const x = (pixel.x / width - 0.5) * 2;
        const y = -(pixel.y / height - 0.5) * 2; // Flip Y
        const z = (Math.random() - 0.5) * 0.3; // Small Z variation

        particles.push({ x, y, z });
    }

    // Fill remaining particles if needed
    while (particles.length < count) {
        const randomPixel = drawnPixels[Math.floor(Math.random() * drawnPixels.length)];
        particles.push({
            x: (randomPixel.x / width - 0.5) * 2,
            y: -(randomPixel.y / height - 0.5) * 2,
            z: (Math.random() - 0.5) * 0.3
        });
    }

    return particles;
};

// generate particle positions / sizes / colors
const generateParticleData = (pattern, count, customCanvas = null) => {
    const positions = new Float32Array(count * 3);
    const targetPositions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const baseColor = new THREE.Color();

    let scale = 3;
    if (pattern === 'heart' || pattern === 'cube') scale = 2;
    if (pattern === 'custom') scale = 4;

    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const pos = new THREE.Vector3();

        switch (pattern) {
            case 'sphere': {
                // sphere with clear outline:
                // - majority of particles on a shell
                // - fewer particles inside
                // - some shell particles gently pushed outward (glow)
                const edgeBias = 0.7;     // shell probability
                const glowChance = 0.25;  // chance to push a shell particle outward

                // random direction on a unit sphere
                const u = Math.random();
                const v = Math.random();
                const theta = 2 * Math.PI * u;
                const phi = Math.acos(2 * v - 1);
                const dir = new THREE.Vector3(
                    Math.sin(phi) * Math.cos(theta),
                    Math.sin(phi) * Math.sin(theta),
                    Math.cos(phi)
                );

                let r;
                if (Math.random() < edgeBias) {
                    // near outer shell
                    r = scale * (0.9 + 0.1 * Math.random());
                    // small outward spread on the edge (glow)
                    if (Math.random() < glowChance) {
                        const glow = 1.02 + 0.05 * Math.random();
                        r *= glow;
                    }
                } else {
                    // inner region with lower density towards center
                    const t = Math.random(); // 0..1
                    // map so that inner radius is less likely than mid/outer
                    const innerFactor = 0.9 * (1 - t * t);
                    r = scale * innerFactor;
                }

                pos.copy(dir.multiplyScalar(r));
                break;
            }

            case 'cube': {
                // cube with clear outline:
                // - many particles on the faces (outline)
                // - fewer particles inside
                // - some face particles pushed slightly outward (glow)
                const edgeBias = 0.7;     // face probability
                const glowChance = 0.25;  // chance to push a face particle outward

                // random point in [-1, 1]^3
                let x = Math.random() * 2 - 1;
                let y = Math.random() * 2 - 1;
                let z = Math.random() * 2 - 1;

                if (Math.random() < edgeBias) {
                    // project onto the surface of the cube (one coord reaches ±1)
                    const maxAbs = Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) || 1;
                    let factor = 1 / maxAbs; // brings point onto the surface

                    // small outward spread for some edge particles
                    if (Math.random() < glowChance) {
                        factor *= 1.02 + 0.05 * Math.random();
                    }

                    x *= factor * scale;
                    y *= factor * scale;
                    z *= factor * scale;
                } else {
                    // inner cube with smaller size (less density near center)
                    const innerScale = scale * 0.7;
                    x *= innerScale;
                    y *= innerScale;
                    z *= innerScale;
                }

                pos.set(x, y, z);
                break;
            }

            case 'torus': {
                const angle1 = Math.random() * Math.PI * 2;
                const angle2 = Math.random() * Math.PI * 2;
                const R = scale * 0.7;
                const rMax = scale * 0.3;
                const r = Math.sqrt(Math.random()) * rMax;

                pos.set(
                    (R + r * Math.cos(angle2)) * Math.cos(angle1),
                    r * Math.sin(angle2),
                    (R + r * Math.cos(angle2)) * Math.sin(angle1)
                );
                break;
            }

            case 'heart': {
                // keep heart as is: clear outline, inner density falloff
                const hScale = scale * 0.1;
                const t = Math.random() * Math.PI * 2;

                const isTopIndent = t < Math.PI * 0.15 || t > Math.PI * 1.85;
                const isBottomTip = t > Math.PI * 0.9 && t < Math.PI * 1.1;

                let densityFactor = 1;
                if (isTopIndent) densityFactor = 0.6;
                else if (isBottomTip) densityFactor = 0.7;

                const baseX = 16 * Math.pow(Math.sin(t), 3);
                const baseY =
                    13 * Math.cos(t) -
                    5 * Math.cos(2 * t) -
                    2 * Math.cos(3 * t) -
                    Math.cos(4 * t);

                let r;
                const outerThreshold = 0.3 * densityFactor;
                if (Math.random() < outerThreshold) {
                    r = 0.9 + Math.random() * 0.1;
                } else {
                    const innerBias = densityFactor < 1 ? 0.5 : 0.3;
                    r = Math.pow(Math.random(), innerBias) * 0.9;
                }

                pos.x = hScale * baseX * r;
                pos.y = hScale * baseY * r;

                const zThickness = r * scale * 0.3;
                pos.z = (Math.random() - 0.5) * zThickness;
                break;
            }

            case 'wave': {
                const gridSize = Math.ceil(Math.sqrt(count));
                const x = ((i % gridSize) / gridSize - 0.5) * scale * 2;
                const z = (Math.floor(i / gridSize) / gridSize - 0.5) * scale * 2;

                const baseY = Math.sin(x * 1.5) * Math.cos(z * 1.5) * scale * 0.4;
                const yOffset = (Math.random() - 0.5) * scale * 0.2;

                pos.set(x, baseY + yOffset, z);
                break;
            }

            case 'galaxy': {
                const arms = 3;
                const armIndex = i % arms;
                const angleOffset = (armIndex / arms) * Math.PI * 2;
                const radius = Math.pow(Math.random(), 0.5) * scale;
                const angle = angleOffset + (radius / scale) * Math.PI * 4;

                const offsetX = (Math.random() - 0.5) * 0.3;
                const offsetY = (Math.random() - 0.5) * 0.15;
                const offsetZ = (Math.random() - 0.5) * 0.3;

                pos.set(
                    radius * Math.cos(angle) + offsetX,
                    offsetY,
                    radius * Math.sin(angle) + offsetZ
                );
                break;
            }

            case 'custom': {
                // Custom drawn pattern from canvas
                // Note: customParticles is pre-computed outside the loop
                if (window.customParticlesCache && window.customParticlesCache[i]) {
                    const p = window.customParticlesCache[i];
                    pos.set(p.x * scale, p.y * scale, p.z * scale);
                } else {
                    // Fallback: small sphere
                    const phi = Math.acos(-1 + (2 * i) / count);
                    const theta = Math.sqrt(count * Math.PI) * phi;
                    const r = Math.pow(Math.random(), 1 / 3) * scale * 0.5;
                    pos.setFromSphericalCoords(r, phi, theta);
                }
                break;
            }

            default: {
                // fallback: solid-ish sphere
                const phi = Math.acos(-1 + (2 * i) / count);
                const theta = Math.sqrt(count * Math.PI) * phi;
                const r = Math.pow(Math.random(), 1 / 3) * scale;
                pos.setFromSphericalCoords(r, phi, theta);
                break;
            }
        }

        positions[i3] = pos.x;
        positions[i3 + 1] = pos.y;
        positions[i3 + 2] = pos.z;

        targetPositions[i3] = pos.x;
        targetPositions[i3 + 1] = pos.y;
        targetPositions[i3 + 2] = pos.z;

        sizes[i] = Math.random() * 0.5 + 0.1;

        baseColor.setHSL(Math.random() * 0.1 + 0.5, 0.7, Math.random() * 0.5 + 0.3);
        colors[i3] = baseColor.r;
        colors[i3 + 1] = baseColor.g;
        colors[i3 + 2] = baseColor.b;
    }

    // start slightly around origin for entry animation
    for (let i = 0; i < count * 3; i++) {
        positions[i] = (Math.random() - 0.5) * 0.1;
    }

    return { positions, targetPositions, sizes, colors };
};

// ---------- shaders ----------

const vertexShader = `
  attribute float a_size;
  attribute vec3 a_color;
  varying vec3 v_color;

  void main() {
    v_color = a_color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = a_size * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  uniform vec3 u_color;
  uniform sampler2D u_texture;
  varying vec3 v_color;

  void main() {
    vec4 texColor = texture2D(u_texture, gl_PointCoord);
    gl_FragColor = vec4(u_color * v_color, texColor.a);
  }
`;

// ---------- constants ----------

const PARTICLE_COUNT = 15000;

const PATTERNS = [
    { value: 'heart', label: 'Heart', icon: '❤️' },
    { value: 'cube', label: 'Cube', icon: '⬛' },
    { value: 'sphere', label: 'Sphere', icon: '⚪' },
    { value: 'torus', label: 'Torus', icon: '⭕' },
    { value: 'galaxy', label: 'Galaxy', icon: '🌌' },
    { value: 'wave', label: 'Wave', icon: '🌊' },
    { value: 'custom', label: 'Draw', icon: '✏️' }
];

// MediaPipe hand landmark connections
const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],  // thumb
    [0, 5], [5, 6], [6, 7], [7, 8],  // index finger
    [0, 9], [9, 10], [10, 11], [11, 12],  // middle finger
    [0, 13], [13, 14], [14, 15], [15, 16],  // ring finger
    [0, 17], [17, 18], [18, 19], [19, 20],  // pinky
    [5, 9], [9, 13], [13, 17]  // palm
];

// load external script once
const loadScript = (src, id) =>
    new Promise((resolve, reject) => {
        if (document.getElementById(id)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.id = id;
        script.src = src;
        script.crossOrigin = 'anonymous';
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
    });

// ---------- component ----------

const ParticleGestureSystem = () => {
    const containerRef = useRef(null);
    const videoRef = useRef(null);
    const drawCanvasRef = useRef(null);
    const previewCanvasRef = useRef(null);

    const [isWebcamActive, setIsWebcamActive] = useState(false);
    const [selectedPattern, setSelectedPattern] = useState('heart');
    // default color is #f9c8f5
    const [particleColor, setParticleColor] = useState('#f9c8f5');
    const [handDistance, setHandDistance] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [isMediaPipeReady, setIsMediaPipeReady] = useState(false);
    const [showDrawPanel, setShowDrawPanel] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);

    const threeRefs = useRef({});
    const mediaPipeRefs = useRef({});

    // main animation loop
    const animate = useCallback(() => {
        const { scene, camera, renderer, particles, geometry } = threeRefs.current;
        if (!scene || !particles) return;

        threeRefs.current.animationId = requestAnimationFrame(animate);

        const positions = geometry.attributes.position.array;
        const targetPositions = geometry.attributes.a_target.array;

        const targetScale = threeRefs.current.handScaleTarget ?? 1;
        const currentScale = threeRefs.current.handScaleCurrent ?? 1;
        const newScale = lerp(currentScale, targetScale, 0.12);

        threeRefs.current.handScaleCurrent = newScale;
        setHandDistance(newScale);

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const i3 = i * 3;
            const tx = targetPositions[i3] * newScale;
            const ty = targetPositions[i3 + 1] * newScale;
            const tz = targetPositions[i3 + 2] * newScale;

            positions[i3] = lerp(positions[i3], tx, 0.08);
            positions[i3 + 1] = lerp(positions[i3 + 1], ty, 0.08);
            positions[i3 + 2] = lerp(positions[i3 + 2], tz, 0.08);
        }

        geometry.attributes.position.needsUpdate = true;

        const hasHand = !!threeRefs.current.isHandDetected;
        const particlesRotation = particles.rotation;
        const currentPattern = threeRefs.current.currentPattern;

        if (hasHand) {
            // Hand detected: smooth rotation based on hand position
            const targetRotX = threeRefs.current.rotationXTarget ?? 0;
            const targetRotY = threeRefs.current.rotationYTarget ?? 0;

            particlesRotation.x = lerp(particlesRotation.x, targetRotX, 0.1);
            particlesRotation.y = lerp(particlesRotation.y, targetRotY, 0.1);
            particlesRotation.z = lerp(particlesRotation.z, 0, 0.1);
        } else {
            // No hand: idle rotation with pattern-specific tilt angles
            if (currentPattern === 'galaxy') {
                // Galaxy: tilted view
                const baseTiltX = Math.PI / 8;   // tilt towards user
                const baseTiltZ = Math.PI / 10;  // left high, right low
                particlesRotation.x = lerp(particlesRotation.x, baseTiltX, 0.1);
                particlesRotation.z = lerp(particlesRotation.z, baseTiltZ, 0.1);
            } else if (currentPattern === 'torus') {
                // Torus: slightly tilted view
                const baseTiltX = Math.PI / 8;
                const baseTiltZ = Math.PI / 14;
                particlesRotation.x = lerp(particlesRotation.x, baseTiltX, 0.1);
                particlesRotation.z = lerp(particlesRotation.z, baseTiltZ, 0.1);
            } else {
                // Other patterns: horizontal position
                particlesRotation.x = lerp(particlesRotation.x, 0, 0.1);
                particlesRotation.z = lerp(particlesRotation.z, 0, 0.1);
            }
            // Continuous rotation around Y axis for all patterns
            particlesRotation.y += 0.001;
        }

        renderer.render(scene, camera);
    }, []);

    // load MediaPipe scripts
    useEffect(() => {
        Promise.all([
            loadScript(
                'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js',
                'mediapipe-hands'
            ),
            loadScript(
                'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js',
                'mediapipe-camera'
            )
        ])
            .then(() => setIsMediaPipeReady(true))
            .catch(err => {
                console.error('Failed to load MediaPipe scripts:', err);
                alert('Failed to load gesture recognition library. Please refresh the page.');
            });
    }, []);

    // init three.js scene
    useEffect(() => {
        if (!containerRef.current) return;
        const container = containerRef.current;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x05000a);
        scene.fog = new THREE.FogExp2(0x05000a, 0.1);

        const camera = new THREE.PerspectiveCamera(
            60,
            container.clientWidth / container.clientHeight,
            0.1,
            100
        );
        camera.position.z = 8;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(renderer.domElement);

        const { positions, targetPositions, sizes, colors } = generateParticleData(
            selectedPattern,
            PARTICLE_COUNT,
            drawCanvasRef.current
        );

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute(
            'a_target',
            new THREE.BufferAttribute(targetPositions, 3)
        );
        geometry.setAttribute('a_size', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('a_color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.ShaderMaterial({
            uniforms: {
                u_color: { value: new THREE.Color(particleColor) },
                u_texture: { value: generateParticleTexture() }
            },
            vertexShader,
            fragmentShader,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true
        });

        const particles = new THREE.Points(geometry, material);
        scene.add(particles);

        threeRefs.current = {
            scene,
            camera,
            renderer,
            particles,
            geometry,
            material,
            handScaleTarget: 1,
            handScaleCurrent: 1,
            currentPattern: selectedPattern,
            isHandDetected: false,  // if a hand is currently detected
            rotationXTarget: 0,     // target rotation around X from hand
            rotationYTarget: 0      // target rotation around Y from hand
        };

        animate();

        const handleResize = () => {
            if (!containerRef.current) return;
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            if (threeRefs.current.animationId)
                cancelAnimationFrame(threeRefs.current.animationId);
            renderer.dispose();
            geometry.dispose();
            material.dispose();
            if (container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
            threeRefs.current = {};
        };
    }, [animate]);

    // init MediaPipe Hands
    useEffect(() => {
        if (!isWebcamActive || !isMediaPipeReady || !videoRef.current) {
            // when camera is off or not ready, reset scale and hand flags
            if (mediaPipeRefs.current.camera) {
                mediaPipeRefs.current.camera.stop();
            }
            mediaPipeRefs.current = {};
            if (threeRefs.current) {
                threeRefs.current.handScaleTarget = 1;
                threeRefs.current.isHandDetected = false;
                threeRefs.current.rotationXTarget = 0;
                threeRefs.current.rotationYTarget = 0;
            }
            return;
        }

        const hands = new window.Hands({
            locateFile: file =>
                `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
            selfieMode: true
        });

        hands.onResults(results => {
            // Draw video and hand landmarks on preview canvas
            const canvas = previewCanvasRef.current;
            if (canvas && videoRef.current) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    // Clear canvas
                    ctx.clearRect(0, 0, canvas.width, canvas.height);

                    // Draw video frame (mirrored for selfie mode)
                    ctx.save();
                    ctx.scale(-1, 1);
                    ctx.drawImage(videoRef.current, -canvas.width, 0, canvas.width, canvas.height);
                    ctx.restore();

                    // Draw hand landmarks if detected
                    if (results.multiHandLandmarks && results.multiHandLandmarks[0]) {
                        const landmarks = results.multiHandLandmarks[0];

                        // Draw connections
                        ctx.strokeStyle = '#00FF00';
                        ctx.lineWidth = 2;
                        HAND_CONNECTIONS.forEach(([start, end]) => {
                            const startPoint = landmarks[start];
                            const endPoint = landmarks[end];
                            ctx.beginPath();
                            ctx.moveTo(startPoint.x * canvas.width, startPoint.y * canvas.height);
                            ctx.lineTo(endPoint.x * canvas.width, endPoint.y * canvas.height);
                            ctx.stroke();
                        });

                        // Draw landmarks as circles (with mirrored X coordinates)
                        ctx.fillStyle = '#FF0000';
                        landmarks.forEach(landmark => {
                            ctx.beginPath();
                            ctx.arc((landmark.x) * canvas.width, landmark.y * canvas.height, 3, 0, 2 * Math.PI);
                            ctx.fill();
                        });
                    }
                }
            }

            if (results.multiHandLandmarks && results.multiHandLandmarks[0]) {
                const landmarks = results.multiHandLandmarks[0];

                // Check if this is the first detection
                const isFirstDetection = !threeRefs.current.isHandDetected;

                // key points for scale
                const t = landmarks[4];
                const i = landmarks[8];
                const w = landmarks[0];
                const m = landmarks[9];

                const dist = Math.hypot(t.x - i.x, t.y - i.y, t.z - i.z);
                const baseDist = Math.hypot(w.x - m.x, w.y - m.y, w.z - m.z);

                if (baseDist > 0) {
                    const normalizedDist = dist / baseDist;
                    const minNorm = 0.05;
                    const maxNorm = 1.2;
                    const minScale = 0.2;
                    const maxScale = 3;

                    const clamped = Math.min(
                        1,
                        Math.max(0, (normalizedDist - minNorm) / (maxNorm - minNorm))
                    );

                    threeRefs.current.handScaleTarget = lerp(minScale, maxScale, clamped);
                    threeRefs.current.isHandDetected = true;

                    // use middle finger base as reference for rotation control
                    // x controls left/right rotation, y controls up/down rotation
                    const ref = m;

                    // map from [0,1] image space to [-1,1]
                    const normX = (ref.x - 0.5) * 2; // left (-1) to right (+1)
                    const normY = (ref.y - 0.5) * 2; // up (-1) to down (+1)

                    const maxRotY = Math.PI / 4; // 45 degrees left/right
                    const maxRotX = Math.PI / 6; // 30 degrees up/down

                    // Invert Y so that moving hand up rotates shape upward
                    const newRotY = normX * maxRotY;
                    const newRotX = -normY * maxRotX;

                    // If first detection, initialize to current rotation to prevent jumps
                    if (isFirstDetection && threeRefs.current.particles) {
                        const currentRot = threeRefs.current.particles.rotation;
                        threeRefs.current.rotationXTarget = currentRot.x;
                        threeRefs.current.rotationYTarget = currentRot.y;
                    }

                    // Smoothly update rotation targets (extra smoothing at source)
                    const smoothing = isFirstDetection ? 0.05 : 0.2;
                    threeRefs.current.rotationXTarget = lerp(
                        threeRefs.current.rotationXTarget ?? newRotX,
                        newRotX,
                        smoothing
                    );
                    threeRefs.current.rotationYTarget = lerp(
                        threeRefs.current.rotationYTarget ?? newRotY,
                        newRotY,
                        smoothing
                    );
                }
            } else {
                // no hand detected: reset scale and rotation targets
                threeRefs.current.handScaleTarget = 1;
                threeRefs.current.isHandDetected = false;
                threeRefs.current.rotationXTarget = 0;
                threeRefs.current.rotationYTarget = 0;
            }
        });

        const camera = new window.Camera(videoRef.current, {
            onFrame: async () => {
                await hands.send({ image: videoRef.current });
            },
            width: 640,
            height: 480
        });

        camera.start();
        mediaPipeRefs.current = { hands, camera };

        return () => {
            camera.stop();
            hands.close();
        };
    }, [isWebcamActive, isMediaPipeReady]);

    // update pattern
    useEffect(() => {
        if (!threeRefs.current.geometry) return;

        // Show draw panel when custom pattern is selected
        if (selectedPattern === 'custom') {
            setShowDrawPanel(true);
            // Pre-compute custom particles if canvas exists
            if (drawCanvasRef.current && window.customParticlesCache) {
                const { targetPositions } = generateParticleData(
                    selectedPattern,
                    PARTICLE_COUNT,
                    drawCanvasRef.current
                );
                threeRefs.current.geometry.attributes.a_target.copyArray(targetPositions);
                threeRefs.current.geometry.attributes.a_target.needsUpdate = true;
            }
            threeRefs.current.currentPattern = selectedPattern;
            return;
        }

        const { targetPositions } = generateParticleData(
            selectedPattern,
            PARTICLE_COUNT,
            drawCanvasRef.current
        );
        threeRefs.current.geometry.attributes.a_target.copyArray(targetPositions);
        threeRefs.current.geometry.attributes.a_target.needsUpdate = true;
        threeRefs.current.currentPattern = selectedPattern;

        // reset rotation when switching pattern to keep shape nicely aligned
        if (threeRefs.current.particles) {
            threeRefs.current.particles.rotation.y = 0;
            threeRefs.current.particles.rotation.x = 0;
        }
    }, [selectedPattern]);

    // update color
    useEffect(() => {
        if (!threeRefs.current.material) return;
        threeRefs.current.material.uniforms.u_color.value.set(particleColor);
    }, [particleColor]);

    // drawing canvas handlers
    const initDrawCanvas = useCallback(() => {
        const canvas = drawCanvasRef.current;
        if (!canvas) return;

        canvas.width = 300;
        canvas.height = 300;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Initialize cache with empty canvas (small sphere)
        if (!window.customParticlesCache) {
            window.customParticlesCache = extractParticlesFromCanvas(canvas, PARTICLE_COUNT);
        }
    }, []);

    const clearDrawCanvas = () => {
        const canvas = drawCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Update cache after clearing
        window.customParticlesCache = extractParticlesFromCanvas(canvas, PARTICLE_COUNT);
        applyDrawing();
    };

    const applyDrawing = () => {
        if (!threeRefs.current.geometry || !drawCanvasRef.current) return;

        // Pre-compute particles from canvas (only once)
        const particles = extractParticlesFromCanvas(
            drawCanvasRef.current,
            PARTICLE_COUNT
        );

        console.log('Extracted particles:', particles?.length, 'First particle:', particles?.[0]);
        window.customParticlesCache = particles;

        const { targetPositions } = generateParticleData(
            'custom',
            PARTICLE_COUNT,
            drawCanvasRef.current
        );
        threeRefs.current.geometry.attributes.a_target.copyArray(targetPositions);
        threeRefs.current.geometry.attributes.a_target.needsUpdate = true;
    };

    const handleDrawStart = (e) => {
        e.preventDefault();
        setIsDrawing(true);
        const canvas = drawCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
        const y = (e.clientY ?? e.touches?.[0]?.clientY) - rect.top;
        const ctx = canvas.getContext('2d');

        // Ensure stroke style is set
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const handleDrawMove = (e) => {
        e.preventDefault();
        if (!isDrawing) return;
        const canvas = drawCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
        const y = (e.clientY ?? e.touches?.[0]?.clientY) - rect.top;
        const ctx = canvas.getContext('2d');
        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const handleDrawEnd = () => {
        setIsDrawing(false);
    };

    useEffect(() => {
        if (showDrawPanel) {
            initDrawCanvas();
            // Apply initial drawing after canvas is ready
            setTimeout(() => {
                if (selectedPattern === 'custom') {
                    applyDrawing();
                }
            }, 100);
        }
    }, [showDrawPanel, initDrawCanvas]);

    // fullscreen toggle
    const toggleFullscreen = () => {
        const container = containerRef.current;
        if (!container) return;

        if (!document.fullscreenElement) {
            container.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    return (
        <div className="relative w-full h-screen bg-gray-900 overflow-hidden">
            {/* three.js container */}
            <div ref={containerRef} className="w-full h-full" />

            {/* hidden video for MediaPipe */}
            <video ref={videoRef} autoPlay playsInline muted className="hidden" />

            {/* camera preview with hand tracking overlay */}
            {isWebcamActive && (
                <div className="absolute top-4 right-4 bg-gray-800/90 backdrop-blur-md rounded-xl shadow-2xl overflow-hidden border-2 border-cyan-500/50 z-20">
                    <canvas
                        ref={previewCanvasRef}
                        width="320"
                        height="240"
                        className="block"
                    />
                    <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                        Hand Tracking
                    </div>
                </div>
            )}

            {/* toggle control panel */}
            <button
                onClick={() => setShowControls(!showControls)}
                className="absolute top-4 left-1/2 -translate-x-1/2 bg-gray-800/80 backdrop-blur-sm text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-all shadow-lg z-20"
            >
                {showControls ? 'Hide Controls' : 'Show Controls'}
            </button>

            {/* control panel */}
            {showControls && (
                <div className="absolute top-4 left-4 bg-gray-800/90 backdrop-blur-md text-white p-6 rounded-2xl shadow-2xl max-w-sm z-10 border border-gray-700">
                    <h2 className="text-2xl font-bold mb-6 text-cyan-400 flex items-center gap-2">
                        <span>✨</span> StarWave
                    </h2>

                    {/* pattern selection */}
                    <div className="mb-6">
                        <label className="block text-sm font-semibold mb-3 text-gray-300">
                            Select Pattern
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {PATTERNS.map(pattern => (
                                <button
                                    key={pattern.value}
                                    onClick={() => setSelectedPattern(pattern.value)}
                                    className={`p-3 rounded-xl transition-all ${
                                        selectedPattern === pattern.value
                                            ? 'bg-cyan-500 text-white shadow-lg scale-105'
                                            : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                                    }`}
                                >
                                    <div className="text-2xl mb-1">{pattern.icon}</div>
                                    <div className="text-xs">{pattern.label}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* color picker */}
                    <div className="mb-6">
                        <label className="block text-sm font-semibold mb-3 text-gray-300">
                            Particle Color
                        </label>
                        <div className="flex gap-2 items-center">
                            <input
                                type="color"
                                value={particleColor}
                                onChange={e => setParticleColor(e.target.value)}
                                className="w-16 h-16 rounded-xl cursor-pointer border-2 border-gray-600"
                            />
                            <div className="flex-1 bg-gray-700 p-3 rounded-xl">
                                <code className="text-cyan-400 text-sm">{particleColor}</code>
                            </div>
                        </div>
                    </div>

                    {/* gesture control */}
                    <div className="mb-6">
                        <label className="block text-sm font-semibold mb-3 text-gray-300">
                            Gesture Control
                        </label>
                        <button
                            onClick={() => setIsWebcamActive(!isWebcamActive)}
                            className={`w-full py-3 px-4 rounded-xl font-semibold transition-all ${
                                isWebcamActive
                                    ? 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30'
                                    : 'bg-green-500 hover:bg-green-600 shadow-lg shadow-green-500/30'
                            }`}
                        >
                            {isWebcamActive ? '🔴 Stop Camera' : '🎥 Start Camera'}
                        </button>

                        {isWebcamActive && (
                            <div className="mt-3 bg-gray-700 p-3 rounded-xl">
                                <div className="text-xs text-gray-400 mb-2">
                                    Gesture Scale + Rotation
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 bg-gray-600 h-2 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-300"
                                            style={{ width: `${(handDistance / 3) * 100}%` }}
                                        />
                                    </div>
                                    <span className="text-cyan-400 font-mono text-sm">
                    {handDistance.toFixed(2)}x
                  </span>
                                </div>
                                <div className="mt-2 text-xs text-gray-400">
                                    Move hand left/right: rotate Y-axis
                                    <br />
                                    Move hand up/down: rotate X-axis
                                </div>
                            </div>
                        )}
                    </div>

                    {/* fullscreen button */}
                    <button
                        onClick={toggleFullscreen}
                        className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-xl font-semibold transition-all shadow-lg shadow-purple-500/30"
                    >
                        {isFullscreen ? '⤶ Exit Fullscreen' : '⤢ Fullscreen'}
                    </button>

                    <div className="mt-4 text-xs text-gray-400 bg-gray-700/50 p-3 rounded-xl">
                        💡 <strong>Tip:</strong> Pinch fingers to scale.
                        Move hand to rotate the pattern.
                    </div>
                </div>
            )}

            {/* drawing panel */}
            {showDrawPanel && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gray-800/95 backdrop-blur-md p-6 rounded-2xl shadow-2xl z-30 border border-cyan-500">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold text-cyan-400">Draw Your Pattern</h3>
                        <button
                            onClick={() => setShowDrawPanel(false)}
                            className="text-gray-400 hover:text-white text-2xl leading-none"
                        >
                            ×
                        </button>
                    </div>

                    <canvas
                        ref={drawCanvasRef}
                        width="300"
                        height="300"
                        style={{ width: '300px', height: '300px' }}
                        className="border-2 border-gray-600 rounded-lg cursor-crosshair bg-black mb-4"
                        onMouseDown={handleDrawStart}
                        onMouseMove={handleDrawMove}
                        onMouseUp={handleDrawEnd}
                        onMouseLeave={handleDrawEnd}
                        onTouchStart={handleDrawStart}
                        onTouchMove={handleDrawMove}
                        onTouchEnd={handleDrawEnd}
                    />

                    <div className="flex gap-2 mb-2">
                        <button
                            onClick={clearDrawCanvas}
                            className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-all"
                        >
                            Clear
                        </button>
                        <button
                            onClick={applyDrawing}
                            className="flex-1 py-2 px-4 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition-all"
                        >
                            Apply
                        </button>
                    </div>
                    <button
                        onClick={() => setShowDrawPanel(false)}
                        className="w-full py-2 px-4 bg-cyan-600 hover:bg-cyan-700 rounded-lg font-semibold transition-all"
                    >
                        Close
                    </button>

                    <p className="text-xs text-gray-400 mt-3 text-center">
                        Draw your pattern, then click <strong className="text-white">Apply</strong> to update particles
                    </p>
                </div>
            )}

            {/* status indicator */}
            {isWebcamActive && (
                <div className="absolute bottom-4 right-4 flex gap-2 z-10">
                    <div className="bg-red-500/80 backdrop-blur-sm text-white px-3 py-2 rounded-lg flex items-center gap-2 shadow-lg animate-pulse">
                        <div className="w-2 h-2 bg-white rounded-full" />
                        <span className="text-sm font-semibold">Camera Active</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ParticleGestureSystem;
