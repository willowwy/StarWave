import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

// --- 助手函数 ---

// 线性插值 (Lerp)，用于实现所有平滑动画
const lerp = (a, b, t) => a * (1 - t) + b * t;

// 限制函数，确保值在 min 和 max 之间
const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

// 生成粒子纹理 (一个柔和的圆点)
const generateParticleTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    return new THREE.CanvasTexture(canvas);
};

// 粒子图案生成函数
const generateParticleData = (pattern, count) => {
    const positions = new Float32Array(count * 3);
    const targetPositions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const baseColor = new THREE.Color();
    const scale = 3; // 统一缩放

    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const pos = new THREE.Vector3();

        switch (pattern) {
            case 'sphere': {
                const phi = Math.acos(-1 + (2 * i) / count);
                const theta = Math.sqrt(count * Math.PI) * phi;
                pos.setFromSphericalCoords(scale, phi, theta);
                break;
            }
            case 'cube': {
                pos.set(
                    (Math.random() - 0.5),
                    (Math.random() - 0.5),
                    (Math.random() - 0.5)
                ).normalize().multiplyScalar(scale * 1.2);

                const max = Math.max(Math.abs(pos.x), Math.abs(pos.y), Math.abs(pos.z));
                pos.divideScalar(max).multiplyScalar(scale * 0.8);
                break;
            }
            case 'torus': {
                const angle1 = (i / count) * Math.PI * 2;
                const angle2 = ((i * 7) % count / count) * Math.PI * 2;
                const R = scale * 0.7;
                const r = scale * 0.3;
                pos.set(
                    (R + r * Math.cos(angle2)) * Math.cos(angle1),
                    r * Math.sin(angle2),
                    (R + r * Math.cos(angle2)) * Math.sin(angle1)
                );
                break;
            }
            case 'helix': {
                const t = (i / count) * Math.PI * 12;
                const radius = scale * 0.5;
                pos.set(
                    radius * Math.cos(t),
                    t * 0.2 - (scale * 0.6),
                    radius * Math.sin(t)
                );
                break;
            }

            // --- 'heart' 逻辑 (已调整为更圆润的形状) ---
            case 'heart': {
                // 1. 计算心形轮廓上的基础点
                const t = (i / count) * Math.PI * 2;
                const hScale = scale * 0.12;
                const baseX = hScale * 16 * Math.pow(Math.sin(t), 3);
                // 使用更简洁、更圆润的公式
                const baseY = hScale * (13 * Math.cos(t) - 5 * Math.cos(2*t)) - (scale * 0.3);

                // 2. 创建一个随机的 3D 扩散方向
                const dirX = Math.random() - 0.5;
                const dirY = Math.random() - 0.5;
                const dirZ = Math.random() - 0.5;
                const len = Math.sqrt(dirX*dirX + dirY*dirY + dirZ*dirZ) + 0.0001;
                const nX = dirX / len;
                const nY = dirY / len;
                const nZ = dirZ / len;

                // 3. 创建非线性分布的偏移距离 (实现边缘密集, 向外弥散)
                const densityPower = 3.0;
                const maxSpread = scale * 0.6;
                const finalMagnitude = Math.pow(Math.random(), densityPower) * maxSpread;

                // 4. 将偏移量应用到基础点上
                pos.x = baseX + nX * finalMagnitude;
                pos.y = baseY + nY * finalMagnitude;
                pos.z = nZ * finalMagnitude;
                break;
            }

            case 'wave': {
                const gridSize = Math.ceil(Math.sqrt(count));
                const x = ((i % gridSize) / gridSize - 0.5) * scale * 2;
                const z = (Math.floor(i / gridSize) / gridSize - 0.5) * scale * 2;
                const y = Math.sin(x * 1.5) * Math.cos(z * 1.5) * scale * 0.3;
                pos.set(x, y, z);
                break;
            }
            default: // Galaxy as default
                const angle = (i / count) * Math.PI * 8;
                const radius = (i / count) * scale;
                pos.set(
                    radius * Math.cos(angle),
                    (Math.random() - 0.5) * 0.2,
                    radius * Math.sin(angle)
                );
                break;
        }

        // 基础位置
        positions[i3] = pos.x;
        positions[i3 + 1] = pos.y;
        positions[i3 + 2] = pos.z;

        // 目标位置（初始与基础位置相同）
        targetPositions[i3] = pos.x;
        targetPositions[i3 + 1] = pos.y;
        targetPositions[i3 + 2] = pos.z;

        // 随机尺寸
        sizes[i] = Math.random() * 0.5 + 0.1;

        // 随机颜色 (粉色/品红)
        baseColor.setHSL(Math.random() * 0.1 + 0.85, 0.7, Math.random() * 0.5 + 0.3);
        colors[i3] = baseColor.r;
        colors[i3 + 1] = baseColor.g;
        colors[i3 + 2] = baseColor.b;
    }

    // 初始位置设为原点 (用于入场动画)
    for (let i = 0; i < count * 3; i++) {
        positions[i] = (Math.random() - 0.5) * 0.1;
    }

    return { positions, targetPositions, sizes, colors };
};

// --- 自定义着色器 (更美观的粒子) ---
const vertexShader = `
  attribute float a_size;
  attribute vec3 a_color;
  varying vec3 v_color;
  varying float v_alpha;

  void main() {
    v_color = a_color;
    v_alpha = 1.0;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = a_size * (300.0 / -mvPosition.z); // 根据距离调整大小
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  uniform vec3 u_color;
  uniform sampler2D u_texture;
  varying vec3 v_color;
  varying float v_alpha;

  void main() {
    // 使用纹理和顶点色
    vec4 texColor = texture2D(u_texture, gl_PointCoord);
    gl_FragColor = vec4(u_color * v_color, texColor.a * v_alpha);
  }
`;

// --- React 组件 ---

const ParticleGestureSystem = () => {
    const containerRef = useRef(null);
    const videoRef = useRef(null);
    const [isWebcamActive, setIsWebcamActive] = useState(false);
    const [selectedPattern, setSelectedPattern] = useState('heart');
    const [particleColor, setParticleColor] = useState('#FD49A0'); // 默认粉色
    const [handDistance, setHandDistance] = useState(1.0); // 用于UI显示 (缩放)
    const [handRotation, setHandRotation] = useState({ x: 0, y: 0 }); // 用于UI显示 (旋转)
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [isMediaPipeReady, setIsMediaPipeReady] = useState(false);

    // Three.js 和 MediaPipe 的核心对象引用
    const threeRefs = useRef({});
    const mediaPipeRefs = useRef({});

    const particleCount = 10000; // 粒子数量

    // --- 核心动画循环 ---
    const animate = useCallback(() => {
        const { scene, camera, renderer, particles, geometry } = threeRefs.current;
        if (!scene || !particles) return;

        threeRefs.current.animationId = requestAnimationFrame(animate);

        const positions = geometry.attributes.position.array;
        const targetPositions = geometry.attributes.a_target.array;

        // 1. 平滑更新手势缩放比例
        const targetScale = threeRefs.current.handScaleTarget || 1.0;
        threeRefs.current.handScaleCurrent = lerp(
            threeRefs.current.handScaleCurrent || 1.0,
            targetScale,
            0.08 // 缩放平滑系数
        );

        // 2. 平滑更新手势旋转
        const targetRotX = threeRefs.current.handRotationTargetX || 0.0;
        const targetRotY = threeRefs.current.handRotationTargetY || 0.0;
        threeRefs.current.handRotationCurrentX = lerp(
            threeRefs.current.handRotationCurrentX || 0.0,
            targetRotX,
            0.05 // 旋转平滑系数
        );
        threeRefs.current.handRotationCurrentY = lerp(
            threeRefs.current.handRotationCurrentY || 0.0,
            targetRotY,
            0.05
        );

        // 3. 更新UI（使用 requestAnimationFrame 来节流）
        setHandDistance(threeRefs.current.handScaleCurrent);
        setHandRotation({
            x: threeRefs.current.handRotationCurrentX,
            y: threeRefs.current.handRotationCurrentY,
        });

        // 4. 遍历粒子，平滑更新其位置 (趋向形状 + 缩放)
        const scale = threeRefs.current.handScaleCurrent;
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            const targetX = targetPositions[i3] * scale;
            const targetY = targetPositions[i3 + 1] * scale;
            const targetZ = targetPositions[i3 + 2] * scale;
            positions[i3] = lerp(positions[i3], targetX, 0.05);
            positions[i3 + 1] = lerp(positions[i3 + 1], targetY, 0.05);
            positions[i3 + 2] = lerp(positions[i3 + 2], targetZ, 0.05);
        }
        geometry.attributes.position.needsUpdate = true;

        // 5. 旋转粒子云 (结合自动旋转和手势旋转)
        // 自动Y轴旋转 (持续增加)
        threeRefs.current.autoRotateY = (threeRefs.current.autoRotateY + 0.001) % (Math.PI * 2);

        // 应用手势旋转 (X轴)
        particles.rotation.x = threeRefs.current.handRotationCurrentX;
        // 应用自动旋转 + 手势旋转 (Y轴)
        particles.rotation.y = threeRefs.current.autoRotateY + threeRefs.current.handRotationCurrentY;

        // 6. 渲染
        renderer.render(scene, camera);
    }, []); // 依赖为空，因为所有状态都通过 ref 管理

    // --- 动态加载 MediaPipe 脚本 ---
    useEffect(() => {
        const loadScript = (src, id) => {
            return new Promise((resolve, reject) => {
                if (document.getElementById(id)) {
                    resolve(); // 脚本已加载
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
        };

        // 并行加载两个必需的库
        Promise.all([
            loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js', 'mediapipe-hands'),
            loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js', 'mediapipe-camera')
        ])
            .then(() => {
                setIsMediaPipeReady(true); // 标记 MediaPipe 已准备就绪
            })
            .catch((err) => {
                console.error("Failed to load MediaPipe scripts:", err);
                alert("加载手势识别库失败，请刷新页面重试。");
            });
    }, []);

    // --- 1. 初始化 Three.js 场景 ---
    useEffect(() => {
        if (!containerRef.current) return;
        const container = containerRef.current;

        // 场景 (纯黑背景)
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000);
        scene.fog = new THREE.FogExp2(0x000000, 0.1);

        // 相机
        const camera = new THREE.PerspectiveCamera(
            60,
            container.clientWidth / container.clientHeight,
            0.1,
            100
        );
        camera.position.z = 8;

        // 渲染器
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(renderer.domElement);

        // 生成初始粒子数据
        const { positions, targetPositions, sizes, colors } = generateParticleData(selectedPattern, particleCount);

        // 创建 BufferGeometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('a_target', new THREE.BufferAttribute(targetPositions, 3));
        geometry.setAttribute('a_size', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('a_color', new THREE.BufferAttribute(colors, 3));

        // 创建自定义着色器材质
        const material = new THREE.ShaderMaterial({
            uniforms: {
                u_color: { value: new THREE.Color(particleColor) },
                u_texture: { value: generateParticleTexture() },
            },
            vertexShader,
            fragmentShader,
            blending: THREE.AdditiveBlending, // 混合模式，让粒子发光
            depthWrite: false,
            transparent: true,
        });

        // 创建粒子系统
        const particles = new THREE.Points(geometry, material);
        scene.add(particles);

        // 保存所有 Three.js 核心对象的引用
        threeRefs.current = {
            scene,
            camera,
            renderer,
            particles,
            geometry,
            material,
            handScaleTarget: 1.0,
            handScaleCurrent: 1.0,
            autoRotateY: 0.0,
            handRotationTargetX: 0.0,
            handRotationTargetY: 0.0,
            handRotationCurrentX: 0.0,
            handRotationCurrentY: 0.0,
        };

        // 启动动画循环
        animate();

        // 窗口大小调整
        const handleResize = () => {
            if (!containerRef.current) return;
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
        };
        window.addEventListener('resize', handleResize);

        // 清理函数
        return () => {
            window.removeEventListener('resize', handleResize);
            if (threeRefs.current.animationId) {
                cancelAnimationFrame(threeRefs.current.animationId);
            }
            renderer.dispose();
            geometry.dispose();
            material.dispose();
            if (container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
        };
    }, [animate, particleColor]); // 依赖 animate 的 useCallback 版本和 particleColor


    // --- 2. 初始化 MediaPipe 手势识别 ---
    useEffect(() => {
        // 仅在摄像头激活且 MediaPipe 库准备就绪时运行
        if (!isWebcamActive || !isMediaPipeReady || !videoRef.current) {
            // 如果关闭摄像头，停止 MediaPipe
            if (mediaPipeRefs.current.camera) {
                mediaPipeRefs.current.camera.stop();
                mediaPipeRefs.current = {};
            }
            // 重置手势控制的目标值
            if (threeRefs.current) {
                threeRefs.current.handScaleTarget = 1.0;
                threeRefs.current.handRotationTargetX = 0.0;
                threeRefs.current.handRotationTargetY = 0.0;
            }
            return;
        }

        // 从 window 对象获取已加载的 Hands
        const hands = new window.Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        hands.setOptions({
            maxNumHands: 1, // 只检测一只手
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
            selfieMode: true, // 镜像模式
        });

        // 结果回调
        hands.onResults((results) => {
            // --- 关键的手势检测逻辑 ---
            if (results.multiHandLandmarks && results.multiHandLandmarks[0]) {
                const landmarks = results.multiHandLandmarks[0];

                // --- 1. 缩放 (Pinch) ---
                const t = landmarks[4]; // 拇指尖
                const i = landmarks[8]; // 食指尖
                const dist = Math.hypot(t.x - i.x, t.y - i.y, t.z - i.z);
                const w = landmarks[0]; // 手腕
                const m = landmarks[9]; // 中指根
                const baseDist = Math.hypot(w.x - m.x, w.y - m.y, w.z - m.z);

                if (baseDist > 0) {
                    const normalizedDist = dist / baseDist;
                    const minNorm = 0.1, maxNorm = 1.0;
                    const minScale = 0.3, maxScale = 2.5;
                    const t = Math.min(1.0, Math.max(0.0, (normalizedDist - minNorm) / (maxNorm - minNorm)));
                    threeRefs.current.handScaleTarget = lerp(minScale, maxScale, t);
                }

                // --- 2. 旋转 (Palm Position) ---
                const palm = landmarks[9]; // 中指根部作为手掌中心
                const maxRot = Math.PI / 2; // 最大旋转 90 度

                // --- 修改开始: 增加灵敏度 ---
                const sensitivity = 1.5; // 提高灵敏度

                // 映射 X 位置 (0.0 to 1.0) 到 Y 旋转 (-90deg to +90deg)
                // (palm.x - 0.5) * 2 -> 范围 [-1.0, 1.0]
                const normX = clamp((palm.x - 0.5) * 2 * sensitivity, -1.0, 1.0);
                threeRefs.current.handRotationTargetY = normX * maxRot;

                // 映射 Y 位置 (0.0 to 1.0) 到 X 旋转 (+90deg to -90deg)
                const normY = clamp((palm.y - 0.5) * 2 * sensitivity, -1.0, 1.0);
                // Y 轴是反的 (0 在顶部, 1 在底部), 所以我们反转它
                threeRefs.current.handRotationTargetX = -normY * maxRot;
                // --- 修改结束 ---

            } else {
                // 没有检测到手，恢复默认值
                threeRefs.current.handScaleTarget = 1.0;
                threeRefs.current.handRotationTargetX = 0.0;
                threeRefs.current.handRotationTargetY = 0.0;
            }
        });

        // 从 window 对象获取已加载的 Camera
        const camera = new window.Camera(videoRef.current, {
            onFrame: async () => {
                await hands.send({ image: videoRef.current });
            },
            width: 640,
            height: 480,
        });
        camera.start();

        mediaPipeRefs.current = { hands, camera };

        // 清理
        return () => {
            if (camera) camera.stop();
            if (hands) hands.close();
        };
    }, [isWebcamActive, isMediaPipeReady]); // 依赖摄像头状态和 MediaPipe 准备状态

    // --- 3. 响应状态变更 ---

    // 更新粒子图案
    useEffect(() => {
        if (threeRefs.current.geometry) {
            const { targetPositions } = generateParticleData(selectedPattern, particleCount);
            // 只更新目标位置，动画循环将处理平滑过渡
            threeRefs.current.geometry.attributes.a_target.copyArray(targetPositions);
            threeRefs.current.geometry.attributes.a_target.needsUpdate = true;
        }
    }, [selectedPattern]);

    // 更新粒子颜色
    useEffect(() => {
        if (threeRefs.current.material) {
            threeRefs.current.material.uniforms.u_color.value.set(particleColor);
        }
    }, [particleColor]);

    // --- 4. UI 事件处理 ---

    // 全屏切换
    const toggleFullscreen = () => {
        const container = containerRef.current;
        if (!document.fullscreenElement) {
            container?.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    // 图案定义
    const patterns = [
        {value: 'heart', label: '心形', icon: '❤️'},
        {value: 'sphere', label: '球体', icon: '⚪'},
        {value: 'galaxy', label: '星系', icon: '🌌'},
        {value: 'torus', label: '圆环', icon: '⭕'},
        {value: 'cube', label: '立方体', icon: '⬛'},
        {value: 'wave', label: '波浪', icon: '🌊'},
        {value: 'helix', label: '螺旋', icon: '🌀'},
    ];

    // --- 5. JSX 渲染 ---
    return (
        <div className="relative w-full h-screen bg-gray-900 overflow-hidden">
            {/* Three.js 容器 */}
            <div ref={containerRef} className="w-full h-full"/>

            {/* 隐藏的视频元素 (用于 MediaPipe) */}
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="hidden" // 保持隐藏
            />

            {/* 控制面板切换按钮 */}
            <button
                onClick={() => setShowControls(!showControls)}
                className="absolute top-4 right-4 bg-gray-800/80 backdrop-blur-sm text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-all shadow-lg z-20"
            >
                {showControls ? '隐藏控制' : '显示控制'}
            </button>

            {/* 控制面板 */}
            {showControls && (
                <div
                    className="absolute top-4 left-4 bg-gray-800/90 backdrop-blur-md text-white p-6 rounded-2xl shadow-2xl max-w-sm z-10 border border-gray-700">
                    <h2 className="text-2xl font-bold mb-6 text-cyan-400 flex items-center gap-2">
                        <span>✨</span> 粒子控制面板
                    </h2>

                    {/* 图案选择 */}
                    <div className="mb-6">
                        <label className="block text-sm font-semibold mb-3 text-gray-300">
                            选择图案
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {patterns.map(pattern => (
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

                    {/* 颜色选择 */}
                    <div className="mb-6">
                        <label className="block text-sm font-semibold mb-3 text-gray-300">
                            粒子颜色
                        </label>
                        <div className="flex gap-2 items-center">
                            <input
                                type="color"
                                value={particleColor}
                                onChange={(e) => setParticleColor(e.target.value)}
                                className="w-16 h-16 rounded-xl cursor-pointer border-2 border-gray-600"
                            />
                            <div className="flex-1 bg-gray-700 p-3 rounded-xl">
                                <code className="text-cyan-400 text-sm">{particleColor}</code>
                            </div>
                        </div>
                    </div>

                    {/* 手势控制 */}
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

                        {/* 手势状态显示 */}
                        {isWebcamActive && (
                            <div className="mt-3 bg-gray-700 p-3 rounded-xl space-y-3">
                                {/* 缩放 */}
                                <div>
                                    <div className="text-xs text-gray-400 mb-2">手势缩放 (开/合)</div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 bg-gray-600 h-2 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-300"
                                                style={{width: `${(handDistance / 3) * 100}%`}} // 假设最大3x
                                            />
                                        </div>
                                        <span className="text-cyan-400 font-mono text-sm w-12 text-right">
                                            {handDistance.toFixed(2)}x
                                        </span>
                                    </div>
                                </div>

                                {/* 旋转 */}
                                <div>
                                    <div className="text-xs text-gray-400 mb-2">手势旋转 (上/下/左/右)</div>
                                    {/* X 轴旋转 (上下) */}
                                    <div className="flex items-center gap-2">
                                        <span className="text-gray-400 text-xs w-4">X:</span>
                                        <div className="flex-1 bg-gray-600 h-2 rounded-full overflow-hidden">
                                            {/* 归一化: (值 / 最大值 * 50) + 50 */}
                                            <div
                                                className="h-full bg-gradient-to-r from-purple-400 to-pink-500 transition-all duration-300"
                                                style={{ width: `${(handRotation.x / (Math.PI / 2) * 50) + 50}%` }}
                                            />
                                        </div>
                                        <span className="text-purple-400 font-mono text-sm w-12 text-right">
                                            {(handRotation.x * 180 / Math.PI).toFixed(1)}°
                                        </span>
                                    </div>
                                    {/* Y 轴旋转 (左右) */}
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className="text-gray-400 text-xs w-4">Y:</span>
                                        <div className="flex-1 bg-gray-600 h-2 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-purple-400 to-pink-500 transition-all duration-300"
                                                style={{ width: `${(handRotation.y / (Math.PI / 2) * 50) + 50}%` }}
                                            />
                                        </div>
                                        <span className="text-purple-400 font-mono text-sm w-12 text-right">
                                            {(handRotation.y * 180 / Math.PI).toFixed(1)}°
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 全屏按钮 */}
                    <button
                        onClick={toggleFullscreen}
                        className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-xl font-semibold transition-all shadow-lg shadow-purple-500/30"
                    >
                        {isFullscreen ? '⤶ 退出全屏' : '⤢ 进入全屏'}
                    </button>

                    {/* 提示 */}
                    <div className="mt-4 text-xs text-gray-400 bg-gray-700/50 p-3 rounded-xl">
                        💡 <strong>提示:</strong> 启动摄像头后，**张开/合拢**手掌控制缩放，**上下/左右**移动手掌控制旋转。
                    </div>
                </div>
            )}

            {/* 状态指示器 */}
            <div className="absolute bottom-4 right-4 flex gap-2 z-10">
                {isWebcamActive && (
                    <div
                        className="bg-red-500/80 backdrop-blur-sm text-white px-3 py-2 rounded-lg flex items-center gap-2 shadow-lg animate-pulse">
                        <div className="w-2 h-2 bg-white rounded-full"/>
                        <span className="text-sm font-semibold">摄像头运行中</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ParticleGestureSystem;