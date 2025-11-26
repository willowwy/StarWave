import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
// import { Hands } from '@mediapipe/hands'; // 修复：移除 import
// import { Camera } from '@mediapipe/camera_utils'; // 修复：移除 import

// --- 助手函数 ---

// 线性插值 (Lerp)，用于实现所有平滑动画
const lerp = (a, b, t) => a * (1 - t) + b * t;

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

    // 根据不同图案设置缩放
    let scale = 3; // 默认缩放
    if (pattern === 'heart' || pattern === 'cube') {
        scale = 2.6; // 爱心和立方体稍小一点
    }

    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const pos = new THREE.Vector3();

        switch (pattern) {
            case 'sphere': {
                // 实心球体：使用均匀分布
                const phi = Math.acos(-1 + (2 * i) / count);
                const theta = Math.sqrt(count * Math.PI) * phi;
                const r = Math.pow(Math.random(), 1/3) * scale; // 立方根确保体积均匀分布
                pos.setFromSphericalCoords(r, phi, theta);
                break;
            }
            case 'cube': {
                // 实心立方体：均匀分布
                pos.set(
                    (Math.random() - 0.5) * scale * 2,
                    (Math.random() - 0.5) * scale * 2,
                    (Math.random() - 0.5) * scale * 2
                );
                break;
            }
            case 'torus': {
                // 实心圆环：均匀填充环体
                const angle1 = Math.random() * Math.PI * 2;
                const angle2 = Math.random() * Math.PI * 2;
                const R = scale * 0.7;
                const r = scale * 0.3;

                // 在小圆内均匀分布
                const rOffset = Math.sqrt(Math.random()) * r;

                pos.set(
                    (R + rOffset * Math.cos(angle2)) * Math.cos(angle1),
                    rOffset * Math.sin(angle2),
                    (R + rOffset * Math.cos(angle2)) * Math.sin(angle1)
                );
                break;
            }
            case 'heart': {
                // 渐变心形：外轮廓密集，向中心递减
                const hScale = scale * 0.1;
                let t = Math.random() * Math.PI * 2;

                const isTopIndent = (t < Math.PI * 0.15 || t > Math.PI * 1.85);
                const isBottomTip = (t > Math.PI * 0.9 && t < Math.PI * 1.1);

                let densityFactor = 1.0;
                if (isTopIndent) {
                    densityFactor = 0.6;
                } else if (isBottomTip) {
                    densityFactor = 0.7;
                }

                const baseX = 16 * Math.pow(Math.sin(t), 3);
                const baseY = 13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t);

                let r;
                const outerThreshold = 0.3 * densityFactor;

                if (Math.random() < outerThreshold) {
                    r = 0.9 + Math.random() * 0.1;
                } else {
                    const innerBias = densityFactor < 1.0 ? 0.5 : 0.3;
                    r = Math.pow(Math.random(), innerBias) * 0.9;
                }

                pos.x = hScale * baseX * r;
                pos.y = hScale * baseY * r - scale * 0.4;

                const zThickness = r * scale * 0.3;
                pos.z = (Math.random() - 0.5) * zThickness;

                break;
            }
            case 'wave': {
                // 3D波浪：在波浪表面和内部分布
                const gridSize = Math.ceil(Math.sqrt(count));
                const x = ((i % gridSize) / gridSize - 0.5) * scale * 2;
                const z = (Math.floor(i / gridSize) / gridSize - 0.5) * scale * 2;

                // 波浪表面高度
                const baseY = Math.sin(x * 1.5) * Math.cos(z * 1.5) * scale * 0.4;

                // 添加垂直填充，使其有厚度
                const yOffset = (Math.random() - 0.5) * scale * 0.2;

                pos.set(x, baseY + yOffset, z);
                break;
            }
            case 'galaxy': // Galaxy
                // 螺旋星系：多臂螺旋结构
                const arms = 3; // 螺旋臂数量
                const armIndex = i % arms;
                const angleOffset = (armIndex / arms) * Math.PI * 2;

                const radius = Math.pow(Math.random(), 0.5) * scale; // 中心密集
                const angle = angleOffset + (radius / scale) * Math.PI * 4;

                // 添加随机扰动
                const offsetX = (Math.random() - 0.5) * 0.3;
                const offsetY = (Math.random() - 0.5) * 0.15;
                const offsetZ = (Math.random() - 0.5) * 0.3;

                pos.set(
                    radius * Math.cos(angle) + offsetX,
                    offsetY,
                    radius * Math.sin(angle) + offsetZ
                );
                break;
            default:
                // 默认为球体
                const phi = Math.acos(-1 + (2 * i) / count);
                const theta = Math.sqrt(count * Math.PI) * phi;
                const r = Math.pow(Math.random(), 1/3) * scale;
                pos.setFromSphericalCoords(r, phi, theta);
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

        // 随机颜色 (基于 HSL 色彩空间，产生更和谐的相近色)
        baseColor.setHSL(Math.random() * 0.1 + 0.5, 0.7, Math.random() * 0.5 + 0.3);
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
    const [particleColor, setParticleColor] = useState('#00ffff');
    const [handDistance, setHandDistance] = useState(1.0); // 用于UI显示
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [isMediaPipeReady, setIsMediaPipeReady] = useState(false); // 修复：添加状态

    // Three.js 和 MediaPipe 的核心对象引用
    const threeRefs = useRef({});
    const mediaPipeRefs = useRef({});

    const particleCount = 15000; // 增加粒子数量以获得更震撼、丝滑的效果

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
            0.12 // 更快的平滑系数，让手势响应更灵敏
        );

        // 更新UI（使用 requestAnimationFrame 来节流，避免过多渲染）
        setHandDistance(threeRefs.current.handScaleCurrent);

        // 2. 遍历粒子，平滑更新其位置
        // 粒子会同时趋向两个目标：
        // a) 切换形状 (positions -> targetPositions)
        // b) 手势缩放 (targetPositions -> targetPositions * handScaleCurrent)

        const scale = threeRefs.current.handScaleCurrent;

        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;

            // 计算最终目标位置（形状 * 缩放）
            const targetX = targetPositions[i3] * scale;
            const targetY = targetPositions[i3 + 1] * scale;
            const targetZ = targetPositions[i3 + 2] * scale;

            // 使用 Lerp 让当前位置平滑地趋近目标位置
            // 更大的系数 = 更快的响应速度，让变换更丝滑
            positions[i3] = lerp(positions[i3], targetX, 0.08);
            positions[i3 + 1] = lerp(positions[i3 + 1], targetY, 0.08);
            positions[i3 + 2] = lerp(positions[i3 + 2], targetZ, 0.08);
        }

        geometry.attributes.position.needsUpdate = true;

        // 3. 旋转粒子云（爱心不旋转）
        if (threeRefs.current.currentPattern !== 'heart') {
            particles.rotation.y += 0.001; // 旋转更慢，更优雅
            particles.rotation.x = Math.sin(Date.now() * 0.0002) * 0.1;
        }

        renderer.render(scene, camera);
    }, []);

    // --- 修复：动态加载 MediaPipe 脚本 ---
    useEffect(() => {
        const loadScript = (src, id) => {
            return new Promise((resolve, reject) => {
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
        };

        Promise.all([
            loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js', 'mediapipe-hands'),
            loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js', 'mediapipe-camera')
        ])
            .then(() => {
                setIsMediaPipeReady(true);
            })
            .catch((err) => {
                console.error("Failed to load MediaPipe scripts:", err);
                alert("加载手势识别库失败，请刷新页面重试。");
            });

        // 注意：清理脚本比较复杂，在此环境中我们简化处理，只加载一次
    }, []);

    // --- 1. 初始化 Three.js 场景 ---
    useEffect(() => {
        if (!containerRef.current) return;
        const container = containerRef.current;

        // 场景
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x05000a); // 深紫色背景
        scene.fog = new THREE.FogExp2(0x05000a, 0.1);

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
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
        });

        // 创建粒子系统
        const particles = new THREE.Points(geometry, material);
        scene.add(particles);

        // 保存引用
        threeRefs.current = {
            scene,
            camera,
            renderer,
            particles,
            geometry,
            material,
            handScaleTarget: 1.0, // 手势目标缩放
            handScaleCurrent: 1.0, // 当前平滑后的缩放
            currentPattern: selectedPattern, // 当前图案
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
    }, [animate]); // 依赖 animate 的 useCallback 版本

    // --- 2. 初始化 MediaPipe 手势识别 ---
    useEffect(() => {
        // 修复：添加 !isMediaPipeReady 条件
        if (!isWebcamActive || !isMediaPipeReady || !videoRef.current) {
            // 如果关闭摄像头，停止 MediaPipe
            if (mediaPipeRefs.current.camera) {
                mediaPipeRefs.current.camera.stop();
                mediaPipeRefs.current = {};
            }
            // 重置缩放
            if (threeRefs.current) {
                threeRefs.current.handScaleTarget = 1.0;
            }
            return;
        }

        // 修复：从 window 对象获取
        const hands = new window.Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
            selfieMode: true,
        });

        // 结果回调
        hands.onResults((results) => {
            if (results.multiHandLandmarks && results.multiHandLandmarks[0]) {
                const landmarks = results.multiHandLandmarks[0];

                // 计算拇指尖 (4) 和食指尖 (8) 之间的距离
                const t = landmarks[4];
                const i = landmarks[8];
                const dist = Math.hypot(t.x - i.x, t.y - i.y, t.z - i.z);

                // 计算手腕 (0) 和中指根部 (9) 的距离作为归一化基准
                const w = landmarks[0];
                const m = landmarks[9];
                const baseDist = Math.hypot(w.x - m.x, w.y - m.y, w.z - m.z);

                if (baseDist > 0) {
                    const normalizedDist = dist / baseDist;

                    // 映射归一化距离到缩放比例 (手张开 -> 距离大 -> 缩放大)
                    // (手合拢 -> 距离小 -> 缩放小)
                    // 调整范围让控制更灵敏
                    const minNorm = 0.05;
                    const maxNorm = 1.2;
                    const minScale = 0.2;
                    const maxScale = 3.0;

                    const t = Math.min(1.0, Math.max(0.0, (normalizedDist - minNorm) / (maxNorm - minNorm)));
                    const targetScale = lerp(minScale, maxScale, t);

                    threeRefs.current.handScaleTarget = targetScale;
                }
            } else {
                // 没有检测到手，恢复到 1.0
                threeRefs.current.handScaleTarget = 1.0;
            }
        });

        // 修复：从 window 对象获取
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
    }, [isWebcamActive, isMediaPipeReady]); // 修复：添加 isMediaPipeReady 依赖

    // --- 3. 响应状态变更 ---

    // 更新粒子图案
    useEffect(() => {
        if (threeRefs.current.geometry) {
            const { targetPositions } = generateParticleData(selectedPattern, particleCount);
            // 只更新目标位置，动画循环将处理平滑过渡
            threeRefs.current.geometry.attributes.a_target.copyArray(targetPositions);
            threeRefs.current.geometry.attributes.a_target.needsUpdate = true;
            // 更新当前图案引用
            threeRefs.current.currentPattern = selectedPattern;

            // 如果切换到爱心，重置旋转角度
            if (selectedPattern === 'heart' && threeRefs.current.particles) {
                threeRefs.current.particles.rotation.y = 0;
                threeRefs.current.particles.rotation.x = 0;
            }
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

    const patterns = [
        {value: 'heart', label: '心形', icon: '❤️'},
        {value: 'cube', label: '立方体', icon: '⬛'},
        {value: 'sphere', label: '球体', icon: '⚪'},
        {value: 'torus', label: '圆环', icon: '⭕'},
        {value: 'galaxy', label: '星系', icon: '🌌'},
        {value: 'wave', label: '波浪', icon: '🌊'},
    ];

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
                className="hidden"
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

                        {isWebcamActive && (
                            <div className="mt-3 bg-gray-700 p-3 rounded-xl">
                                <div className="text-xs text-gray-400 mb-2">手势缩放 (开/合)</div>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 bg-gray-600 h-2 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-300"
                                            style={{width: `${(handDistance / 3) * 100}%`}} // 假设最大3x
                                        />
                                    </div>
                                    <span className="text-cyan-400 font-mono text-sm">
                                        {handDistance.toFixed(2)}x
                                    </span>
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

                    <div className="mt-4 text-xs text-gray-400 bg-gray-700/50 p-3 rounded-xl">
                        💡 <strong>提示:</strong> 启动摄像头后，通过**手掌的张开与合拢**来控制粒子的缩放。
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