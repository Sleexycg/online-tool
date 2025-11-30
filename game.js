// game.js

// 假设 THREE 和 Hands 已经被 index.html 导入并挂载到了 window 对象上
const THREE = window.THREE;
const Hands = window.Hands;

// =========================================================================
// 核心变量
// =========================================================================

let camera, scene, renderer;
let videoElement;
let hands;
let targets = []; // 虚拟目标数组

// =========================================================================
// I. 初始化函数
// =========================================================================

export function initGame() {
    videoElement = document.getElementById('webcam');

    // 1. 设置 Three.js 场景
    initThreeJS();

    // 2. 启动摄像头
    setupWebcam()
        .then(() => {
            // 3. 初始化 MediaPipe Hands
            initMediaPipe();
            
            // 4. 移除加载遮罩
            document.getElementById('loading-overlay').style.display = 'none';

            // 5. 创建游戏目标
            createTargets();
            
            // 6. 启动游戏循环
            animate();
        })
        .catch(error => {
            console.error("无法访问摄像头:", error);
            alert("错误：无法访问摄像头。请检查设备权限。");
        });
}

function initThreeJS() {
    const container = document.getElementById('game-container');
    
    // 使用透视相机
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    scene = new THREE.Scene();
    
    // 添加环境光，照亮场景
    scene.add(new THREE.AmbientLight(0xffffff, 0.5)); 
    
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0); // 透明背景，以便看到摄像头视频
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// 启动摄像头
function setupWebcam() {
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
        .then(stream => {
            videoElement.srcObject = stream;
            videoElement.play();
            // 等待视频元数据加载，以获取实际尺寸
            return new Promise(resolve => {
                videoElement.onloadedmetadata = () => {
                    // 让视频流可见，但仍使用 opacity: 0 (在 style.css 中设置)
                    videoElement.style.opacity = 1; 
                    resolve();
                };
            });
        });
}

// =========================================================================
// II. MediaPipe 初始化和手势处理
// =========================================================================

function initMediaPipe() {
    // 实例化 Hands 对象，并配置模型路径
    hands = new Hands({
        locateFile: (file) => {
            // MediaPipe 会使用这个 CDN 路径来加载它的模型依赖文件。
            // 这样可以避免手动下载几十个 tflite/wasm 文件。
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
    });

    hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1, // 1 或 0
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7
    });

    hands.onResults(onResults); // 设置结果回调函数
}

// MediaPipe 每次处理完一帧后的回调
function onResults(results) {
    // 清除上一次渲染的手部视觉指示器 (如果您有的话)
    
    if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {
            
            // ----------------------------------------------------
            // TODO: 1. 实现手势识别逻辑
            // ----------------------------------------------------
            const isGunGesture = detectGunGesture(landmarks);
            
            if (isGunGesture) {
                // ----------------------------------------------------
                // TODO: 2. 实现 Raycasting 射击逻辑
                // ----------------------------------------------------
                performRaycastShoot(landmarks);
            }
        }
    }
}

// 启动 MediaPipe 实时处理循环
function processVideo() {
    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
        hands.send({ image: videoElement });
    }
    requestAnimationFrame(processVideo);
}


// =========================================================================
// III. 游戏逻辑 (简化占位符)
// =========================================================================

function createTargets() {
    const geometry = new THREE.SphereGeometry(0.5, 32, 32);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: false });

    for (let i = 0; i < 3; i++) {
        const target = new THREE.Mesh(geometry, material);
        // 放置目标在相机前方 -3 到 3 的随机位置
        target.position.set(
            (Math.random() - 0.5) * 6,
            (Math.random() - 0.5) * 4,
            -5 - Math.random() * 5
        );
        scene.add(target);
        targets.push(target);
    }
}

/**
 * 简化版手枪手势识别 (食指伸出，其他手指弯曲)
 * @param {Array} landmarks MediaPipe 手部关键点数组
 * @returns {boolean} 是否为手枪手势
 */
function detectGunGesture(landmarks) {
    // 假设：食指尖端 (8) 离腕部 (0) 较远，且食指与其他手指的尖端距离较远
    // 这是一个非常简化的例子，实际应用需要更复杂的骨骼角度分析
    
    const wrist = new THREE.Vector3(landmarks[0].x, landmarks[0].y, landmarks[0].z);
    const indexTip = new THREE.Vector3(landmarks[8].x, landmarks[8].y, landmarks[8].z);
    
    // 计算食指与腕部的距离 (作为归一化参考)
    const indexDist = indexTip.distanceTo(wrist);
    
    // 检查中指尖端 (12) 是否靠近中指根部 (9) (即是否弯曲)
    const middleTip = new THREE.Vector3(landmarks[12].x, landmarks[12].y, landmarks[12].z);
    const middleProximal = new THREE.Vector3(landmarks[9].x, landmarks[9].y, landmarks[9].z);
    const middleBendDist = middleTip.distanceTo(middleProximal);

    // 粗略判断：如果食指伸展充分，而中指是弯曲的
    // 注意：MediaPipe 坐标是归一化坐标 (0-1)，需要转换为屏幕或世界坐标进行可靠判断
    // 这里的判断仅仅是占位符演示。
    if (indexDist > 0.3 && middleBendDist < 0.1) {
        return true;
    }
    return false;
}

/**
 * 执行射线投射和命中检测
 * @param {Array} landmarks 关键点
 */
function performRaycastShoot(landmarks) {
    // 假设射击方向沿着食指方向
    const indexTip = landmarks[8];
    
    // 1. 将归一化的 MediaPipe 坐标 (0-1) 转换为 Three.js 屏幕坐标 (-1 到 1)
    const normalizedX = (indexTip.x * 2) - 1;
    const normalizedY = -(indexTip.y * 2) + 1;

    const pointer = new THREE.Vector2(normalizedX, normalizedY);
    const raycaster = new THREE.Raycaster();
    
    // 2. 设置 Raycaster
    raycaster.setFromCamera(pointer, camera);

    // 3. 检查射线是否与目标相交
    const intersects = raycaster.intersectObjects(targets);

    if (intersects.length > 0) {
        const hitTarget = intersects[0].object;
        
        // 移除被击中的目标，并显示命中效果
        scene.remove(hitTarget);
        targets = targets.filter(t => t !== hitTarget);

        showHitEffect(intersects[0].point);
        
        // 重新创建一个目标
        createTargets(); 
    }
}

/**
 * 在命中点显示一个短暂的“HIT”效果
 * @param {THREE.Vector3} worldPosition 命中的世界坐标
 */
function showHitEffect(worldPosition) {
    const tempV = new THREE.Vector3();
    tempV.copy(worldPosition);
    
    // 将世界坐标转换为屏幕坐标
    tempV.project(camera); 

    const x = (tempV.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-tempV.y * 0.5 + 0.5) * window.innerHeight;

    const hitDiv = document.createElement('div');
    hitDiv.className = 'hit-effect';
    hitDiv.textContent = 'HIT!';
    hitDiv.style.left = `${x}px`;
    hitDiv.style.top = `${y}px`;

    document.getElementById('game-container').appendChild(hitDiv);

    // 移除动画完成后的元素
    setTimeout(() => {
        hitDiv.remove();
    }, 800);
}


// =========================================================================
// IV. 渲染循环
// =========================================================================

function animate() {
    requestAnimationFrame(animate);
    
    // 必须在每一帧将视频帧发送给 MediaPipe 进行处理
    processVideo(); 

    // 简单的目标旋转
    targets.forEach(target => {
        target.rotation.x += 0.01;
        target.rotation.y += 0.01;
    });

    renderer.render(scene, camera);
}

// 在 MediaPipe 加载完成后立即开始处理视频
hands.initialize().then(() => {
    // MediaPipe 模型资源加载成功
    processVideo();
});