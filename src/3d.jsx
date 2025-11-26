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

// generate particle positions / sizes / colors
// generate particle positions / sizes / colors
const generateParticleData = (pattern, count) => {
    const positions = new Float32Array(count * 3);
    const targetPositions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const baseColor = new THREE.Color();

    let scale = 3;
    if (pattern === 'heart' || pattern === 'cube') scale = 2;

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
    { value: 'heart', label: '心形', icon: '❤️' },
    { value: 'cube', label: '立方体', icon: '⬛' },
    { value: 'sphere', label: '球体', icon: '⚪' },
    { value: 'torus', label: '圆环', icon: '⭕' },
    { value: 'galaxy', label: '星系', icon: '🌌' },
    { value: 'wave', label: '波浪', icon: '🌊' }
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

    const [isWebcamActive, setIsWebcamActive] = useState(false);
    const [selectedPattern, setSelectedPattern] = useState('heart');
    // default color is #f9c8f5
    const [particleColor, setParticleColor] = useState('#f9c8f5');
    const [handDistance, setHandDistance] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [isMediaPipeReady, setIsMediaPipeReady] = useState(false);

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
                alert('加载手势识别库失败，请刷新页面重试。');
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
            PARTICLE_COUNT
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
        const { targetPositions } = generateParticleData(
            selectedPattern,
            PARTICLE_COUNT
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

            {/* toggle control panel */}
            <button
                onClick={() => setShowControls(!showControls)}
                className="absolute top-4 right-4 bg-gray-800/80 backdrop-blur-sm text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-all shadow-lg z-20"
            >
                {showControls ? '隐藏控制' : '显示控制'}
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
                            选择图案
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
                            粒子颜色
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
                            手势控制
                        </label>
                        <button
                            onClick={() => setIsWebcamActive(!isWebcamActive)}
                            className={`w-full py-3 px-4 rounded-xl font-semibold transition-all ${
                                isWebcamActive
                                    ? 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30'
                                    : 'bg-green-500 hover:bg-green-600 shadow-lg shadow-green-500/30'
                            }`}
                        >
                            {isWebcamActive ? '🔴 停止摄像头' : '🎥 启动摄像头'}
                        </button>

                        {isWebcamActive && (
                            <div className="mt-3 bg-gray-700 p-3 rounded-xl">
                                <div className="text-xs text-gray-400 mb-2">
                                    手势缩放 + 旋转控制
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
                                    左右移动手：控制左右旋转；
                                    <br />
                                    上下移动手：控制上下旋转。
                                </div>
                            </div>
                        )}
                    </div>

                    {/* fullscreen button */}
                    <button
                        onClick={toggleFullscreen}
                        className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-xl font-semibold transition-all shadow-lg shadow-purple-500/30"
                    >
                        {isFullscreen ? '⤶ 退出全屏' : '⤢ 进入全屏'}
                    </button>

                    <div className="mt-4 text-xs text-gray-400 bg-gray-700/50 p-3 rounded-xl">
                        💡 <strong>提示:</strong> 启动摄像头后，通过
                        <strong>手掌的张开与合拢</strong>控制缩放，
                        左右/上下移动手控制图案旋转。
                    </div>
                </div>
            )}

            {/* status indicator */}
            {isWebcamActive && (
                <div className="absolute bottom-4 right-4 flex gap-2 z-10">
                    <div className="bg-red-500/80 backdrop-blur-sm text-white px-3 py-2 rounded-lg flex items-center gap-2 shadow-lg animate-pulse">
                        <div className="w-2 h-2 bg-white rounded-full" />
                        <span className="text-sm font-semibold">摄像头运行中</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ParticleGestureSystem;
