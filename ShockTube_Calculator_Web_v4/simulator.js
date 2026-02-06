// ============================================
// Shock Tunnel Simulator v3 - JavaScript
// 1D Euler Solver with HLLC (Inline Worker)
// ============================================

// Web Worker 코드 (인라인)
const workerCode = `
const R_universal = 8314.51;

const GAS_DATA = {
    air:  { mw: 28.9660, gamma: 1.4020, name: 'Air' },
    he:   { mw: 4.0026,  gamma: 1.6670, name: 'Helium' },
    h2:   { mw: 2.0160,  gamma: 1.4050, name: 'Hydrogen' },
    co2:  { mw: 44.0100, gamma: 1.2970, name: 'CO2' },
    ar:   { mw: 39.9480, gamma: 1.6670, name: 'Argon' },
    n2:   { mw: 28.0134, gamma: 1.4000, name: 'Nitrogen' }
};

function calcMixtureProperties(X_He) {
    const X_Air = 1 - X_He;
    const gas1 = GAS_DATA.air;
    const gas2 = GAS_DATA.he;
    const mw_mix = X_He * gas2.mw + X_Air * gas1.mw;
    const Y_He = (X_He * gas2.mw) / mw_mix;
    const Y_Air = 1 - Y_He;
    const R_Air = R_universal / gas1.mw;
    const R_He = R_universal / gas2.mw;
    const cp_Air = gas1.gamma / (gas1.gamma - 1) * R_Air;
    const cp_He = gas2.gamma / (gas2.gamma - 1) * R_He;
    const cv_Air = R_Air / (gas1.gamma - 1);
    const cv_He = R_He / (gas2.gamma - 1);
    const cp_mix = Y_Air * cp_Air + Y_He * cp_He;
    const cv_mix = Y_Air * cv_Air + Y_He * cv_He;
    const gamma_mix = cp_mix / cv_mix;
    return { mw: mw_mix, gamma: gamma_mix, R: R_universal / mw_mix };
}

function getGasProperties(gasType, heRatio) {
    if (gasType === 'mix') return calcMixtureProperties(heRatio);
    const gas = GAS_DATA[gasType];
    return { mw: gas.mw, gamma: gas.gamma, R: R_universal / gas.mw };
}

class ShockTube1D {
    constructor(config, ylims) {
        this.config = config;
        this.ylims = ylims;
        this.dx = config.L / config.nx;
        this.x = new Float64Array(config.nx);
        for (let i = 0; i < config.nx; i++) {
            this.x[i] = this.dx / 2 + i * this.dx;
        }
        this.Q = [
            new Float64Array(config.nx),
            new Float64Array(config.nx),
            new Float64Array(config.nx),
            new Float64Array(config.nx)
        ];
        this.driverProps = getGasProperties(config.driverGas, config.heRatio);
        this.drivenProps = getGasProperties(config.drivenGas);
        const gd = this.driverProps.gamma;
        const gv = this.drivenProps.gamma;
        this.driverProps.cv = this.driverProps.R / (gd - 1);
        this.drivenProps.cv = this.drivenProps.R / (gv - 1);
        this.t = 0;
        this.step = 0;
        this.initialize();
    }
    
    initialize() {
        const cfg = this.config;
        const dp = this.driverProps;
        const vp = this.drivenProps;
        for (let i = 0; i < cfg.nx; i++) {
            if (this.x[i] < cfg.x_diaphragm) {
                const rho = cfg.driverP / (dp.R * cfg.driverT);
                const e = cfg.driverP / ((dp.gamma - 1) * rho);
                this.Q[0][i] = rho;
                this.Q[1][i] = 0;
                this.Q[2][i] = rho * e;
                this.Q[3][i] = rho;
            } else {
                const rho = cfg.drivenP / (vp.R * cfg.drivenT);
                const e = cfg.drivenP / ((vp.gamma - 1) * rho);
                this.Q[0][i] = rho;
                this.Q[1][i] = 0;
                this.Q[2][i] = rho * e;
                this.Q[3][i] = 0;
            }
        }
    }
    
    getGammaR(Y_driver) {
        Y_driver = Math.max(0, Math.min(1, Y_driver));
        const Y_driven = 1 - Y_driver;
        const dp = this.driverProps;
        const vp = this.drivenProps;
        const cv_mix = Y_driver * dp.cv + Y_driven * vp.cv;
        const R_mix = Y_driver * dp.R + Y_driven * vp.R;
        const gamma_mix = (cv_mix + R_mix) / cv_mix;
        return { gamma: gamma_mix, R: R_mix };
    }
    
    consToPrim() {
        const nx = this.config.nx;
        const rho = new Float64Array(nx);
        const u = new Float64Array(nx);
        const p = new Float64Array(nx);
        const e = new Float64Array(nx);
        const gamma = new Float64Array(nx);
        const R = new Float64Array(nx);
        const Y = new Float64Array(nx);
        const T = new Float64Array(nx);
        const a = new Float64Array(nx);
        const M = new Float64Array(nx);
        
        for (let i = 0; i < nx; i++) {
            rho[i] = Math.max(this.Q[0][i], 1e-10);
            u[i] = this.Q[1][i] / rho[i];
            Y[i] = Math.max(0, Math.min(1, this.Q[3][i] / rho[i]));
            const props = this.getGammaR(Y[i]);
            gamma[i] = props.gamma;
            R[i] = props.R;
            const E = this.Q[2][i] / rho[i];
            e[i] = Math.max(E - 0.5 * u[i] * u[i], 1e-10);
            p[i] = Math.max((gamma[i] - 1) * rho[i] * e[i], 1e-10);
            T[i] = p[i] / (rho[i] * R[i]);
            a[i] = Math.sqrt(gamma[i] * p[i] / rho[i]);
            M[i] = u[i] / a[i];
        }
        return { rho, u, p, e, gamma, R, Y, T, a, M };
    }
    
    computeFlux() {
        const nx = this.config.nx;
        const prim = this.consToPrim();
        const { rho, u, p, gamma, Y } = prim;
        const H = new Float64Array(nx);
        for (let i = 0; i < nx; i++) {
            H[i] = (this.Q[2][i] + p[i]) / rho[i];
        }
        const a = new Float64Array(nx);
        for (let i = 0; i < nx; i++) {
            a[i] = Math.sqrt(gamma[i] * p[i] / rho[i]);
        }
        const F = [
            new Float64Array(nx + 1),
            new Float64Array(nx + 1),
            new Float64Array(nx + 1),
            new Float64Array(nx + 1)
        ];
        
        for (let i = 1; i < nx; i++) {
            const rL = rho[i-1], uL = u[i-1], pL = p[i-1], gL = gamma[i-1], YL = Y[i-1], HL = H[i-1], aL = a[i-1];
            const rR = rho[i], uR = u[i], pR = p[i], gR = gamma[i], YR = Y[i], HR = H[i], aR = a[i];
            const sqL = Math.sqrt(rL), sqR = Math.sqrt(rR);
            const u_roe = (sqL * uL + sqR * uR) / (sqL + sqR);
            const H_roe = (sqL * HL + sqR * HR) / (sqL + sqR);
            const g_roe = (sqL * gL + sqR * gR) / (sqL + sqR);
            const a_roe = Math.sqrt(Math.max((g_roe - 1) * (H_roe - 0.5 * u_roe * u_roe), 1e-10));
            const SL = Math.min(uL - aL, u_roe - a_roe);
            const SR = Math.max(uR + aR, u_roe + a_roe);
            let S_star;
            const denom = rL * (SL - uL) - rR * (SR - uR);
            if (Math.abs(denom) < 1e-10) {
                S_star = 0.5 * (uL + uR);
            } else {
                S_star = (pR - pL + rL * uL * (SL - uL) - rR * uR * (SR - uR)) / denom;
            }
            if (SL >= 0) {
                F[0][i] = rL * uL;
                F[1][i] = rL * uL * uL + pL;
                F[2][i] = (this.Q[2][i-1] + pL) * uL;
                F[3][i] = rL * YL * uL;
            } else if (SR <= 0) {
                F[0][i] = rR * uR;
                F[1][i] = rR * uR * uR + pR;
                F[2][i] = (this.Q[2][i] + pR) * uR;
                F[3][i] = rR * YR * uR;
            } else if (S_star >= 0) {
                const coeff = rL * (SL - uL) / (SL - S_star + 1e-10);
                F[0][i] = rL * uL + SL * (coeff - rL);
                F[1][i] = rL * uL * uL + pL + SL * (coeff * S_star - rL * uL);
                F[2][i] = (this.Q[2][i-1] + pL) * uL + SL * (coeff * (this.Q[2][i-1] / rL + (S_star - uL) * (S_star + pL / (rL * (SL - uL) + 1e-10))) - this.Q[2][i-1]);
                F[3][i] = rL * YL * uL + SL * (coeff * YL - rL * YL);
            } else {
                const coeff = rR * (SR - uR) / (SR - S_star + 1e-10);
                F[0][i] = rR * uR + SR * (coeff - rR);
                F[1][i] = rR * uR * uR + pR + SR * (coeff * S_star - rR * uR);
                F[2][i] = (this.Q[2][i] + pR) * uR + SR * (coeff * (this.Q[2][i] / rR + (S_star - uR) * (S_star + pR / (rR * (SR - uR) + 1e-10))) - this.Q[2][i]);
                F[3][i] = rR * YR * uR + SR * (coeff * YR - rR * YR);
            }
        }
        F[0][0] = 0; F[1][0] = p[0]; F[2][0] = 0; F[3][0] = 0;
        F[0][nx] = 0; F[1][nx] = p[nx - 1]; F[2][nx] = 0; F[3][nx] = 0;
        return F;
    }
    
    stepEuler(dt) {
        const F = this.computeFlux();
        const nx = this.config.nx;
        const dtdx = dt / this.dx;
        for (let k = 0; k < 4; k++) {
            for (let i = 0; i < nx; i++) {
                this.Q[k][i] -= dtdx * (F[k][i + 1] - F[k][i]);
            }
        }
        for (let i = 0; i < nx; i++) {
            this.Q[0][i] = Math.max(this.Q[0][i], 1e-10);
            this.Q[3][i] = Math.max(0, Math.min(this.Q[3][i], this.Q[0][i]));
        }
    }
    
    getDt() {
        const prim = this.consToPrim();
        let maxSpeed = 0;
        for (let i = 0; i < this.config.nx; i++) {
            const speed = Math.abs(prim.u[i]) + prim.a[i];
            if (speed > maxSpeed) maxSpeed = speed;
        }
        return this.config.CFL * this.dx / maxSpeed;
    }
    
    getFrame() {
        const prim = this.consToPrim();
        return {
            t: this.t,
            x: Array.from(this.x),
            rho: Array.from(prim.rho),
            u: Array.from(prim.u),
            p: Array.from(prim.p),
            T: Array.from(prim.T),
            M: Array.from(prim.M),
            e: Array.from(prim.e),
            a: Array.from(prim.a),
            Y: Array.from(prim.Y),
            gamma: Array.from(prim.gamma),
            ylims: this.ylims
        };
    }
    
    getWallData() {
        const prim = this.consToPrim();
        const i = this.config.nx - 1;
        return { t: this.t, p: prim.p[i], T: prim.T[i], rho: prim.rho[i] };
    }
    
    getHistoryData() {
        const prim = this.consToPrim();
        return {
            t: this.t,
            rho: Array.from(prim.rho),
            u: Array.from(prim.u),
            p: Array.from(prim.p),
            T: Array.from(prim.T)
        };
    }
}

self.onmessage = function(e) {
    const msg = e.data;
    if (msg.type === 'start') {
        runSimulation(msg.config, msg.ylims);
    }
};

function runSimulation(config, ylims) {
    try {
        const solver = new ShockTube1D(config, ylims);
        self.postMessage({
            type: 'frame',
            frame: solver.getFrame(),
            history: solver.getHistoryData(),
            wall: solver.getWallData()
        });
        const startTime = performance.now();
        let lastProgressTime = startTime;
        
        while (solver.t < config.end_time) {
            const dt = solver.getDt();
            const actualDt = Math.min(dt, config.end_time - solver.t);
            solver.stepEuler(actualDt);
            solver.t += actualDt;
            solver.step++;
            
            if (solver.step % config.writeInterval === 0) {
                self.postMessage({
                    type: 'frame',
                    frame: solver.getFrame(),
                    history: solver.getHistoryData(),
                    wall: solver.getWallData()
                });
            }
            
            const now = performance.now();
            if (now - lastProgressTime > 100) {
                const progress = (solver.t / config.end_time) * 100;
                const elapsed = (now - startTime) / 1000;
                const remaining = progress > 0 ? (elapsed / (progress / 100)) - elapsed : -1;
                const simTime = solver.t * 1000;
                self.postMessage({
                    type: 'progress',
                    progress: progress,
                    text: '시뮬레이션 중... ' + progress.toFixed(1) + '%',
                    simTime: simTime,
                    remaining: remaining
                });
                lastProgressTime = now;
            }
        }
        
        self.postMessage({
            type: 'frame',
            frame: solver.getFrame(),
            history: solver.getHistoryData(),
            wall: solver.getWallData()
        });
        self.postMessage({ type: 'complete' });
    } catch (error) {
        self.postMessage({ type: 'error', error: error.message });
    }
}
`;

// Blob URL로 Worker 생성
function createWorker() {
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    return new Worker(URL.createObjectURL(blob));
}

// 시뮬레이션 상태
let simWorker = null;
let simFrames = [];
let simHistory = {
    t: [],
    rho: [],
    u: [],
    p: [],
    T: []
};
let wallHistory = {
    t: [],
    p: [],
    T: [],
    rho: []
};
let currentFrame = 0;
let isPlaying = true;
let animationId = null;
let simConfig = null;
let analyticStates = null;

// 색상 팔레트
const COLORS = {
    density: '#3b82f6',    // 파란색
    velocity: '#ef4444',   // 빨간색
    pressure: '#22c55e',   // 초록색
    temperature: '#a855f7', // 보라색
    mach: '#06b6d4',       // 청록색
    energy: '#f97316',     // 주황색
    massFrac: '#8b5cf6',   // 보라색
    gamma: '#78716c'       // 갈색
};


// 시뮬레이션 실행
function runSimulation() {
    // 해석해가 먼저 계산되어야 함
    if (!analyticStates) {
        alert('먼저 "해석해 계산" 버튼을 눌러주세요.');
        return;
    }
    
    // 입력값 읽기
    const config = getSimConfig();
    simConfig = config;
    
    // UI 초기화
    document.getElementById('simulation-section').style.display = 'block';
    document.getElementById('sim-progress').style.display = 'block';
    document.getElementById('sim-results').style.display = 'none';
    updateProgress(0, '시뮬레이션 시작 중...', 0, -1);
    
    // 프레임 및 히스토리 초기화
    simFrames = [];
    simHistory = { t: [], rho: [], u: [], p: [], T: [] };
    wallHistory = { t: [], p: [], T: [], rho: [] };
    
    // Web Worker 생성 (인라인 Blob)
    if (simWorker) {
        simWorker.terminate();
    }
    
    simWorker = createWorker();
    
    simWorker.onmessage = function(e) {
        const msg = e.data;
        
        switch (msg.type) {
            case 'progress':
                updateProgress(msg.progress, msg.text, msg.simTime, msg.remaining);
                break;
                
            case 'frame':
                simFrames.push(msg.frame);
                // 히스토리 저장
                if (msg.history) {
                    simHistory.t.push(msg.history.t);
                    simHistory.rho.push(msg.history.rho);
                    simHistory.u.push(msg.history.u);
                    simHistory.p.push(msg.history.p);
                    simHistory.T.push(msg.history.T);
                }
                if (msg.wall) {
                    wallHistory.t.push(msg.wall.t);
                    wallHistory.p.push(msg.wall.p);
                    wallHistory.T.push(msg.wall.T);
                    wallHistory.rho.push(msg.wall.rho);
                }
                break;
                
            case 'complete':
                updateProgress(100, '시뮬레이션 완료!');
                setTimeout(() => {
                    document.getElementById('sim-progress').style.display = 'none';
                    document.getElementById('sim-results').style.display = 'block';
                    startAnimation();
                    drawXTDiagram();
                    drawWallHistory();
                }, 500);
                break;
                
            case 'error':
                alert('시뮬레이션 오류: ' + msg.error);
                document.getElementById('sim-progress').style.display = 'none';
                break;
        }
    };
    
    // ylim 설정 (State 5 기준)
    const s5 = analyticStates.state5;
    const ylims = {
        rho: [0, Math.ceil(s5.rho * 1.3)],
        u: [-300, Math.ceil(analyticStates.state2.u * 1.5)],
        p: [0, Math.ceil(s5.p / 1e5 * 1.2)],
        T: [100, Math.ceil(s5.t * 1.2)],
        M: [-0.5, 1.5],
        e: [100, Math.ceil(s5.t * 2)], // 대략적인 내부에너지
        Y: [-0.05, 1.05],
        gamma: [1.25, 1.75]
    };
    
    // Worker에 시뮬레이션 시작 메시지 전송
    simWorker.postMessage({
        type: 'start',
        config: config,
        ylims: ylims
    });
}


function getSimConfig() {
    const driverGas = document.getElementById('driver-gas').value;
    const heRatio = parseFloat(document.getElementById('he-ratio').value);
    const driverP = parseFloat(document.getElementById('driver-p').value) * 1e5;
    const driverT = parseFloat(document.getElementById('driver-t').value);
    
    const drivenGas = document.getElementById('driven-gas').value;
    const drivenP = parseFloat(document.getElementById('driven-p').value) * 1e5;
    const drivenT = parseFloat(document.getElementById('driven-t').value);
    
    const L = parseFloat(document.getElementById('tube-length').value);
    const x_diaphragm = parseFloat(document.getElementById('diaphragm').value);
    const end_time = parseFloat(document.getElementById('end-time').value) / 1000; // ms → s
    const nx = parseInt(document.getElementById('nx').value);
    
    return {
        driverGas, heRatio, driverP, driverT,
        drivenGas, drivenP, drivenT,
        L, x_diaphragm, end_time, nx,
        CFL: 0.8,
        writeInterval: 15
    };
}


function updateProgress(percent, text, simTime, remaining) {
    const bar = document.getElementById('progress-bar');
    const textEl = document.getElementById('progress-text');
    const timeEl = document.getElementById('progress-time');
    const remainingEl = document.getElementById('progress-remaining');
    
    bar.style.width = percent + '%';
    textEl.textContent = text;
    
    if (timeEl && simTime !== undefined) {
        timeEl.textContent = `t = ${simTime.toFixed(2)} ms`;
    }
    
    if (remainingEl && remaining !== undefined) {
        if (remaining < 0 || !isFinite(remaining)) {
            remainingEl.textContent = '남은 시간: 계산 중...';
        } else if (remaining < 1) {
            remainingEl.textContent = '남은 시간: 1초 미만';
        } else {
            remainingEl.textContent = `남은 시간: ${remaining.toFixed(0)}초`;
        }
    }
}


// GIF 애니메이션
function startAnimation() {
    if (simFrames.length === 0) return;
    
    currentFrame = 0;
    isPlaying = true;
    document.getElementById('gif-play-btn').textContent = '⏸️ 일시정지';
    
    // 타임라인 슬라이더 초기화
    const slider = document.getElementById('timeline-slider');
    if (slider) {
        slider.max = simFrames.length - 1;
        slider.value = 0;
    }
    
    animate();
}


function animate() {
    if (!isPlaying) return;
    
    drawFrame(currentFrame);
    updateTimelineUI(currentFrame);
    
    currentFrame = (currentFrame + 1) % simFrames.length;
    
    animationId = setTimeout(() => requestAnimationFrame(animate), 80);
}

function updateTimelineUI(frameIdx) {
    const frameInfo = document.getElementById('gif-frame-info');
    frameInfo.textContent = `Frame: ${frameIdx + 1} / ${simFrames.length}`;
    
    const slider = document.getElementById('timeline-slider');
    if (slider) {
        slider.value = frameIdx;
    }
    
    const timeLabel = document.getElementById('timeline-time');
    if (timeLabel && simFrames[frameIdx]) {
        timeLabel.textContent = (simFrames[frameIdx].t * 1000).toFixed(2);
    }
}

function onTimelineChange(value) {
    const frameIdx = parseInt(value);
    currentFrame = frameIdx;
    
    // 재생 중이면 일시정지
    if (isPlaying) {
        isPlaying = false;
        document.getElementById('gif-play-btn').textContent = '▶️ 재생';
        if (animationId) {
            clearTimeout(animationId);
        }
    }
    
    drawFrame(frameIdx);
    updateTimelineUI(frameIdx);
}


function toggleGifPlay() {
    isPlaying = !isPlaying;
    document.getElementById('gif-play-btn').textContent = isPlaying ? '⏸️ 일시정지' : '▶️ 재생';
    
    if (isPlaying) {
        animate();
    } else {
        if (animationId) {
            clearTimeout(animationId);
        }
    }
}


function resetGif() {
    currentFrame = 0;
    drawFrame(0);
    document.getElementById('gif-frame-info').textContent = `Frame: 1 / ${simFrames.length}`;
}


function drawFrame(frameIndex) {
    if (!simFrames[frameIndex]) return;
    
    const canvas = document.getElementById('sim-gif-canvas');
    const ctx = canvas.getContext('2d');
    const frame = simFrames[frameIndex];
    
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    
    // 배경
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 8개 플롯 (2x4)
    const padding = { top: 40, right: 20, bottom: 30, left: 60 };
    const cols = 4, rows = 2;
    const plotW = (width - 40) / cols;
    const plotH = (height - 60) / rows;
    
    // 음속 ylim 자동 계산
    const aData = frame.a || frame.T.map((T, i) => Math.sqrt(frame.gamma[i] * 287 * T)); // fallback
    const aYlim = [Math.min(...aData) * 0.9, Math.max(...aData) * 1.1];
    
    const plots = [
        { data: frame.rho, label: 'ρ [kg/m³]', title: 'Density', color: COLORS.density, ylim: frame.ylims?.rho },
        { data: frame.u, label: 'u [m/s]', title: 'Velocity', color: COLORS.velocity, ylim: frame.ylims?.u },
        { data: frame.p.map(v => v / 1e5), label: 'P [bar]', title: 'Pressure', color: COLORS.pressure, ylim: frame.ylims?.p },
        { data: frame.T, label: 'T [K]', title: 'Temperature', color: COLORS.temperature, ylim: frame.ylims?.T },
        { data: frame.M, label: 'M', title: 'Mach Number', color: COLORS.mach, ylim: frame.ylims?.M },
        { data: aData, label: 'a [m/s]', title: 'Sound Speed', color: COLORS.energy, ylim: aYlim },
        { data: frame.Y, label: 'Y_driver', title: 'Driver Mass Frac.', color: COLORS.massFrac, ylim: frame.ylims?.Y },
        { data: frame.gamma, label: 'γ', title: 'Specific Heat Ratio', color: COLORS.gamma, ylim: frame.ylims?.gamma }
    ];
    
    // 타이틀
    ctx.fillStyle = '#e6edf3';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`1D Shock Tunnel Simulation - t = ${(frame.t * 1000).toFixed(2)} ms`, width / 2, 20);
    
    plots.forEach((plot, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x0 = 20 + col * plotW;
        const y0 = 35 + row * plotH;
        
        drawPlot(ctx, plot, x0, y0, plotW - 10, plotH - 15, frame.x, simConfig.L);
    });
}


function drawPlot(ctx, plot, x0, y0, w, h, xData, L) {
    const pad = { top: 20, right: 10, bottom: 25, left: 45 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;
    
    // 배경
    ctx.fillStyle = '#161b22';
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = '#30363d';
    ctx.strokeRect(x0, y0, w, h);
    
    // 제목
    ctx.fillStyle = '#8b949e';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(plot.title, x0 + w/2, y0 + 14);
    
    // 데이터 범위
    let yMin, yMax;
    if (plot.ylim) {
        [yMin, yMax] = plot.ylim;
    } else {
        yMin = Math.min(...plot.data);
        yMax = Math.max(...plot.data);
        const margin = (yMax - yMin) * 0.1 || 1;
        yMin -= margin;
        yMax += margin;
    }
    
    // 플롯 영역
    const px0 = x0 + pad.left;
    const py0 = y0 + pad.top;
    
    // 그리드
    ctx.strokeStyle = '#21262d';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
        const gy = py0 + (i / 4) * plotH;
        ctx.beginPath();
        ctx.moveTo(px0, gy);
        ctx.lineTo(px0 + plotW, gy);
        ctx.stroke();
    }
    
    // 0선 (속도, 마하수)
    if (yMin < 0 && yMax > 0) {
        const zeroY = py0 + plotH * (yMax / (yMax - yMin));
        ctx.strokeStyle = '#4b5563';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(px0, zeroY);
        ctx.lineTo(px0 + plotW, zeroY);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    
    // 데이터 플롯
    ctx.strokeStyle = plot.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    
    for (let i = 0; i < plot.data.length; i++) {
        const px = px0 + (xData[i] / L) * plotW;
        const py = py0 + plotH * (1 - (plot.data[i] - yMin) / (yMax - yMin));
        
        if (i === 0) {
            ctx.moveTo(px, py);
        } else {
            ctx.lineTo(px, py);
        }
    }
    ctx.stroke();
    
    // Y축 레이블
    ctx.fillStyle = '#6b7280';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(yMax.toFixed(1), px0 - 3, py0 + 8);
    ctx.fillText(yMin.toFixed(1), px0 - 3, py0 + plotH);
    
    // X축 레이블
    ctx.textAlign = 'center';
    ctx.fillText('0', px0, py0 + plotH + 12);
    ctx.fillText(L.toFixed(1), px0 + plotW, py0 + plotH + 12);
    ctx.fillText('x [m]', px0 + plotW/2, py0 + plotH + 22);
}


// x-t 다이어그램 (밀도, 압력, 온도) - 세로 배치, 1.5배 확대
function drawXTDiagram() {
    const canvas = document.getElementById('xt-canvas');
    const ctx = canvas.getContext('2d');
    
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 900 * dpr;
    canvas.height = 1200 * dpr;
    ctx.scale(dpr, dpr);
    
    const width = 900, height = 1200;
    
    // 배경
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, width, height);
    
    if (simHistory.rho.length === 0) {
        ctx.fillStyle = '#8b949e';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('데이터 없음', width/2, height/2);
        return;
    }
    
    const nx = simHistory.rho[0].length;
    const nt = simHistory.rho.length;
    const tMax = simHistory.t[simHistory.t.length - 1] * 1000;
    
    // 세 개의 플롯 데이터 (세로 배치)
    const plots = [
        { 
            data: simHistory.rho, 
            title: 'Density ρ [kg/m³]', 
            colormap: viridisColor
        },
        { 
            data: simHistory.p.map(row => row.map(v => v / 1e5)), 
            title: 'Pressure P [bar]', 
            colormap: infernoColor
        },
        { 
            data: simHistory.T, 
            title: 'Temperature T [K]', 
            colormap: hotColor
        }
    ];
    
    const plotW = 720;
    const plotH = 340;
    const startX = 80;
    const gap = 60;
    
    plots.forEach((plot, idx) => {
        const startY = 30 + idx * (plotH + gap);
        
        // 데이터 범위
        let vMin = Infinity, vMax = -Infinity;
        plot.data.forEach(row => {
            row.forEach(v => {
                if (v < vMin) vMin = v;
                if (v > vMax) vMax = v;
            });
        });
        
        // 타이틀
        ctx.fillStyle = '#e6edf3';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(plot.title, startX + plotW/2, startY - 8);
        
        // 이미지 생성
        const imgData = ctx.createImageData(plotW, plotH);
        for (let py = 0; py < plotH; py++) {
            const ti = Math.floor((1 - py / plotH) * (nt - 1));
            for (let px = 0; px < plotW; px++) {
                const xi = Math.floor((px / plotW) * (nx - 1));
                const val = plot.data[ti][xi];
                const norm = (val - vMin) / (vMax - vMin + 1e-10);
                const [r, g, b] = plot.colormap(norm);
                const i = (py * plotW + px) * 4;
                imgData.data[i] = r;
                imgData.data[i+1] = g;
                imgData.data[i+2] = b;
                imgData.data[i+3] = 255;
            }
        }
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = plotW;
        tempCanvas.height = plotH;
        tempCanvas.getContext('2d').putImageData(imgData, 0, 0);
        ctx.drawImage(tempCanvas, startX, startY);
        
        // 테두리
        ctx.strokeStyle = '#30363d';
        ctx.strokeRect(startX, startY, plotW, plotH);
        
        // X축 레이블 (마지막 플롯만)
        if (idx === 2) {
            ctx.fillStyle = '#8b949e';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('0', startX, startY + plotH + 15);
            ctx.fillText(simConfig.L.toFixed(1), startX + plotW, startY + plotH + 15);
            ctx.fillText('x [m]', startX + plotW/2, startY + plotH + 30);
        }
        
        // Y축 레이블
        ctx.save();
        ctx.translate(18, startY + plotH/2);
        ctx.rotate(-Math.PI/2);
        ctx.fillStyle = '#8b949e';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('t [ms]', 0, 0);
        ctx.restore();
        
        ctx.fillStyle = '#6b7280';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('0', startX - 5, startY + plotH);
        ctx.fillText(tMax.toFixed(1), startX - 5, startY + 10);
        
        // 컬러바
        const cbX = startX + plotW + 8;
        const cbW = 15, cbH = plotH;
        for (let i = 0; i < cbH; i++) {
            const norm = 1 - i / cbH;
            const [r, g, b] = plot.colormap(norm);
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(cbX, startY + i, cbW, 1);
        }
        ctx.strokeStyle = '#30363d';
        ctx.strokeRect(cbX, startY, cbW, cbH);
        
        ctx.fillStyle = '#8b949e';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(vMax.toFixed(1), cbX + cbW + 4, startY + 10);
        ctx.fillText(vMin.toFixed(1), cbX + cbW + 4, startY + cbH);
    });
}

// Inferno 컬러맵 (압력용)
function infernoColor(t) {
    const colors = [
        [0, 0, 4],
        [40, 11, 84],
        [101, 21, 110],
        [159, 42, 99],
        [212, 72, 66],
        [245, 125, 21],
        [250, 193, 39],
        [252, 255, 164]
    ];
    
    t = Math.max(0, Math.min(1, t));
    const idx = t * (colors.length - 1);
    const i = Math.floor(idx);
    const f = idx - i;
    
    if (i >= colors.length - 1) return colors[colors.length - 1];
    
    return [
        Math.round(colors[i][0] + f * (colors[i+1][0] - colors[i][0])),
        Math.round(colors[i][1] + f * (colors[i+1][1] - colors[i][1])),
        Math.round(colors[i][2] + f * (colors[i+1][2] - colors[i][2]))
    ];
}

// Hot 컬러맵 (압력용)
function hotColor(t) {
    t = Math.max(0, Math.min(1, t));
    const r = Math.min(255, Math.round(t * 3 * 255));
    const g = Math.min(255, Math.max(0, Math.round((t - 0.33) * 3 * 255)));
    const b = Math.min(255, Math.max(0, Math.round((t - 0.67) * 3 * 255)));
    return [r, g, b];
}

// Plasma 컬러맵 (온도용)
function plasmaColor(t) {
    const colors = [
        [13, 8, 135],
        [75, 3, 161],
        [125, 3, 168],
        [168, 34, 150],
        [203, 70, 121],
        [229, 107, 93],
        [248, 148, 65],
        [253, 195, 40],
        [240, 249, 33]
    ];
    
    t = Math.max(0, Math.min(1, t));
    const idx = t * (colors.length - 1);
    const i = Math.floor(idx);
    const f = idx - i;
    
    if (i >= colors.length - 1) return colors[colors.length - 1];
    
    return [
        Math.round(colors[i][0] + f * (colors[i+1][0] - colors[i][0])),
        Math.round(colors[i][1] + f * (colors[i+1][1] - colors[i][1])),
        Math.round(colors[i][2] + f * (colors[i+1][2] - colors[i][2]))
    ];
}


// 시험시간 계산 (CV < 3% 구간)
function calculateTestTime(t, p) {
    if (t.length < 20) return null;
    
    const p0 = p[0];
    const threshold = 0.03; // 3%
    
    // 1. 반사 충격파 도착 시점 찾기 (압력이 초기의 1.5배 이상 되는 첫 지점)
    let shockArrivalIdx = 0;
    for (let i = 1; i < p.length; i++) {
        if (p[i] > p0 * 1.5) {
            shockArrivalIdx = i;
            break;
        }
    }
    
    // 2. 반사 충격파 이후 압력 피크(최대값) 찾기
    let peakIdx = shockArrivalIdx;
    let peakValue = p[shockArrivalIdx];
    for (let i = shockArrivalIdx; i < Math.min(shockArrivalIdx + Math.floor(t.length * 0.3), t.length); i++) {
        if (p[i] > peakValue) {
            peakValue = p[i];
            peakIdx = i;
        }
    }
    
    // 3. 피크 직후부터 시험시간 시작 (약간의 안정화 시간 후)
    const stabilizeOffset = Math.max(3, Math.floor((t.length - peakIdx) * 0.02));
    const testStartIdx = peakIdx + stabilizeOffset;
    
    if (testStartIdx >= t.length - 5) return null;
    
    // 4. 시작점부터 CV < 3%가 유지되는 끝점 찾기
    let testEndIdx = testStartIdx;
    
    for (let endIdx = testStartIdx + 5; endIdx < t.length; endIdx++) {
        const segment = p.slice(testStartIdx, endIdx + 1);
        const mean = segment.reduce((a, b) => a + b, 0) / segment.length;
        const variance = segment.reduce((a, b) => a + (b - mean) ** 2, 0) / segment.length;
        const std = Math.sqrt(variance);
        const cv = std / mean;
        
        if (cv < threshold) {
            testEndIdx = endIdx;
        } else {
            // CV가 threshold를 넘으면 중단
            break;
        }
    }
    
    // 최소 시험시간 확인
    const duration = t[testEndIdx] - t[testStartIdx];
    if (duration < 0.0001) return null; // 0.1ms 미만이면 무효
    
    const segment = p.slice(testStartIdx, testEndIdx + 1);
    const mean = segment.reduce((a, b) => a + b, 0) / segment.length;
    
    return {
        startTime: t[testStartIdx],
        endTime: t[testEndIdx],
        duration: duration,
        meanPressure: mean,
        startIdx: testStartIdx,
        endIdx: testEndIdx
    };
}

// 벽면 히스토리 (2배 크기)
function drawWallHistory() {
    const canvas = document.getElementById('wall-canvas');
    const ctx = canvas.getContext('2d');
    
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 1200 * dpr;
    canvas.height = 1000 * dpr;
    ctx.scale(dpr, dpr);
    
    const width = 1200, height = 1000;
    
    // 배경
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, width, height);
    
    if (wallHistory.t.length === 0) {
        ctx.fillStyle = '#8b949e';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('데이터 없음', width/2, height/2);
        return;
    }
    
    const t = wallHistory.t.map(v => v * 1000); // ms
    const tMax = Math.max(...t);
    const pBar = wallHistory.p.map(v => v / 1e5);
    
    // 시험시간 (수동 선택 또는 자동)
    let testTime = null;
    if (manualTestTime) {
        // 수동 선택된 시험시간 사용
        const segment = [];
        for (let i = 0; i < t.length; i++) {
            if (t[i] >= manualTestTime.startTime && t[i] <= manualTestTime.endTime) {
                segment.push(pBar[i]);
            }
        }
        if (segment.length > 0) {
            const mean = segment.reduce((a, b) => a + b, 0) / segment.length;
            const variance = segment.reduce((a, b) => a + (b - mean) ** 2, 0) / segment.length;
            const std = Math.sqrt(variance);
            const cv = (std / mean) * 100;
            testTime = {
                startTime: manualTestTime.startTime,
                endTime: manualTestTime.endTime,
                duration: manualTestTime.duration,
                meanPressure: mean,
                cv: cv
            };
        }
    }
    
    const plots = [
        { data: pBar, label: 'P [bar]', color: COLORS.pressure },
        { data: wallHistory.T, label: 'T [K]', color: COLORS.temperature },
        { data: wallHistory.rho, label: 'ρ [kg/m³]', color: COLORS.density }
    ];
    
    const plotH = (height - 200) / 3;
    
    plots.forEach((plot, i) => {
        const y0 = 30 + i * plotH;
        drawTimeSeriesPlot(ctx, t, plot.data, plot.label, plot.color, 60, y0, width - 80, plotH - 20, tMax, i === 0 ? testTime : null);
    });
    
    // X축 공통 레이블
    ctx.fillStyle = '#8b949e';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('t [ms]', width/2, height - 45);
    
    // 시험시간 정보 표시 (모달 스타일로 크게)
    ctx.fillStyle = '#161b22';
    ctx.fillRect(0, height - 150, width, 150);
    ctx.strokeStyle = '#30363d';
    ctx.strokeRect(10, height - 145, width - 20, 140);
    
    if (testTime) {
        const cvColor = testTime.cv < 3 ? '#3fb950' : (testTime.cv < 5 ? '#d29922' : '#f85149');
        const boxWidth = 270;
        const boxHeight = 80;
        const startX = 40;
        const boxY = height - 130;
        const gap = 20;
        
        // 시험시간 박스
        ctx.fillStyle = '#21262d';
        ctx.fillRect(startX, boxY, boxWidth, boxHeight);
        ctx.fillStyle = '#8b949e';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('시험시간', startX + boxWidth/2, boxY + 25);
        ctx.fillStyle = '#3fb950';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText(testTime.duration.toFixed(3) + ' ms', startX + boxWidth/2, boxY + 60);
        
        // 구간 박스
        const box2X = startX + boxWidth + gap;
        ctx.fillStyle = '#21262d';
        ctx.fillRect(box2X, boxY, boxWidth, boxHeight);
        ctx.fillStyle = '#8b949e';
        ctx.font = '14px sans-serif';
        ctx.fillText('구간', box2X + boxWidth/2, boxY + 25);
        ctx.fillStyle = '#e6edf3';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText(testTime.startTime.toFixed(2) + ' ~ ' + testTime.endTime.toFixed(2) + ' ms', box2X + boxWidth/2, boxY + 60);
        
        // 평균압력 박스
        const box3X = box2X + boxWidth + gap;
        ctx.fillStyle = '#21262d';
        ctx.fillRect(box3X, boxY, boxWidth, boxHeight);
        ctx.fillStyle = '#8b949e';
        ctx.font = '14px sans-serif';
        ctx.fillText('평균 압력', box3X + boxWidth/2, boxY + 25);
        ctx.fillStyle = '#e6edf3';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText(testTime.meanPressure.toFixed(2) + ' bar', box3X + boxWidth/2, boxY + 60);
        
        // CV 박스
        const box4X = box3X + boxWidth + gap;
        ctx.fillStyle = '#21262d';
        ctx.fillRect(box4X, boxY, boxWidth, boxHeight);
        ctx.fillStyle = '#8b949e';
        ctx.font = '14px sans-serif';
        ctx.fillText('CV (σ/μ)', box4X + boxWidth/2, boxY + 25);
        ctx.fillStyle = cvColor;
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText(testTime.cv.toFixed(2) + ' %', box4X + boxWidth/2, boxY + 60);
    } else {
        ctx.fillStyle = '#8b949e';
        ctx.font = '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('아래 "시험시간 선택하기" 버튼을 클릭하여 시험시간을 선택하세요', width / 2, height - 75);
    }
}


function drawTimeSeriesPlot(ctx, t, data, label, color, x0, y0, w, h, tMax, testTime = null) {
    const pad = { top: 5, right: 10, bottom: 20, left: 50 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;
    const px0 = x0 + pad.left;
    const py0 = y0 + pad.top;
    
    // 배경
    ctx.fillStyle = '#161b22';
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = '#30363d';
    ctx.strokeRect(x0, y0, w, h);
    
    // Y 범위
    const yMin = Math.min(...data);
    const yMax = Math.max(...data);
    const yRange = yMax - yMin || 1;
    const yPad = yRange * 0.1;
    
    // 그리드
    ctx.strokeStyle = '#21262d';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
        const gy = py0 + (i / 4) * plotH;
        ctx.beginPath();
        ctx.moveTo(px0, gy);
        ctx.lineTo(px0 + plotW, gy);
        ctx.stroke();
    }
    
    // 시험시간 구간 표시 (배경 하이라이트)
    if (testTime) {
        const ttStartX = px0 + (testTime.startTime / tMax) * plotW;
        const ttEndX = px0 + (testTime.endTime / tMax) * plotW;
        
        // 구간 배경
        ctx.fillStyle = 'rgba(63, 185, 80, 0.15)';
        ctx.fillRect(ttStartX, py0, ttEndX - ttStartX, plotH);
        
        // 시작/끝 수직선
        ctx.strokeStyle = '#3fb950';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 2]);
        
        ctx.beginPath();
        ctx.moveTo(ttStartX, py0);
        ctx.lineTo(ttStartX, py0 + plotH);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(ttEndX, py0);
        ctx.lineTo(ttEndX, py0 + plotH);
        ctx.stroke();
        
        ctx.setLineDash([]);
        
        // 시험시간 막대 (상단)
        const barY = py0 + 8;
        ctx.strokeStyle = '#3fb950';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ttStartX, barY);
        ctx.lineTo(ttEndX, barY);
        ctx.stroke();
        
        // 양쪽 끝 세로선
        ctx.beginPath();
        ctx.moveTo(ttStartX, barY - 4);
        ctx.lineTo(ttStartX, barY + 4);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(ttEndX, barY - 4);
        ctx.lineTo(ttEndX, barY + 4);
        ctx.stroke();
        
        // 시험시간 텍스트
        ctx.fillStyle = '#3fb950';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${testTime.duration.toFixed(2)} ms`, (ttStartX + ttEndX) / 2, barY - 6);
    }
    
    // 데이터 플롯
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    
    for (let i = 0; i < data.length; i++) {
        const px = px0 + (t[i] / tMax) * plotW;
        const py = py0 + plotH * (1 - (data[i] - (yMin - yPad)) / (yRange + 2 * yPad));
        
        if (i === 0) {
            ctx.moveTo(px, py);
        } else {
            ctx.lineTo(px, py);
        }
    }
    ctx.stroke();
    
    // Y축 레이블
    ctx.fillStyle = '#8b949e';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText((yMax + yPad).toFixed(1), px0 - 3, py0 + 8);
    ctx.fillText((yMin - yPad).toFixed(1), px0 - 3, py0 + plotH);
    
    // 레이블
    ctx.fillStyle = color;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, px0 + 5, py0 + 25);
}


// Viridis 컬러맵
function viridisColor(t) {
    const colors = [
        [68, 1, 84],
        [72, 40, 120],
        [62, 74, 137],
        [49, 104, 142],
        [38, 130, 142],
        [31, 158, 137],
        [53, 183, 121],
        [110, 206, 88],
        [181, 222, 43],
        [253, 231, 37]
    ];
    
    t = Math.max(0, Math.min(1, t));
    const idx = t * (colors.length - 1);
    const i = Math.floor(idx);
    const f = idx - i;
    
    if (i >= colors.length - 1) return colors[colors.length - 1];
    
    return [
        Math.round(colors[i][0] + f * (colors[i+1][0] - colors[i][0])),
        Math.round(colors[i][1] + f * (colors[i+1][1] - colors[i][1])),
        Math.round(colors[i][2] + f * (colors[i+1][2] - colors[i][2]))
    ];
}


// 해석해 저장용 (calculator.js에서 호출)
function setAnalyticStates(states) {
    analyticStates = states;
}


// ============================================
// 시험시간 선택 모달
// ============================================

let manualTestTime = null;
let modalStartTime = 0;
let modalEndTime = 0;
let isDraggingStart = false;
let isDraggingEnd = false;
let modalCanvas = null;
let modalCtx = null;

function openTestTimeSelector() {
    if (wallHistory.t.length === 0) {
        alert('먼저 시뮬레이션을 실행해주세요.');
        return;
    }
    
    const modal = document.getElementById('test-time-modal');
    modal.style.display = 'flex';
    
    modalCanvas = document.getElementById('test-time-canvas');
    modalCtx = modalCanvas.getContext('2d');
    
    const dpr = window.devicePixelRatio || 1;
    modalCanvas.width = 1000 * dpr;
    modalCanvas.height = 400 * dpr;
    modalCtx.scale(dpr, dpr);
    
    // 초기 시험시간 설정 (전체의 50%~80% 구간)
    const t = wallHistory.t.map(v => v * 1000);
    const tMax = Math.max(...t);
    modalStartTime = tMax * 0.4;
    modalEndTime = tMax * 0.8;
    
    // 이벤트 리스너 추가
    modalCanvas.addEventListener('mousedown', onModalMouseDown);
    modalCanvas.addEventListener('mousemove', onModalMouseMove);
    modalCanvas.addEventListener('mouseup', onModalMouseUp);
    modalCanvas.addEventListener('mouseleave', onModalMouseUp);
    
    drawModalChart();
    updateModalInfo();
}

function closeTestTimeSelector() {
    const modal = document.getElementById('test-time-modal');
    modal.style.display = 'none';
    
    if (modalCanvas) {
        modalCanvas.removeEventListener('mousedown', onModalMouseDown);
        modalCanvas.removeEventListener('mousemove', onModalMouseMove);
        modalCanvas.removeEventListener('mouseup', onModalMouseUp);
        modalCanvas.removeEventListener('mouseleave', onModalMouseUp);
    }
}

function applyTestTime() {
    manualTestTime = {
        startTime: modalStartTime,
        endTime: modalEndTime,
        duration: modalEndTime - modalStartTime
    };
    
    // 벽면 히스토리 다시 그리기
    drawWallHistory();
    closeTestTimeSelector();
}

function drawModalChart() {
    if (!modalCtx) return;
    
    const width = 1000, height = 400;
    const pad = { top: 40, right: 30, bottom: 50, left: 70 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    
    // 배경
    modalCtx.fillStyle = '#0d1117';
    modalCtx.fillRect(0, 0, width, height);
    
    const t = wallHistory.t.map(v => v * 1000);
    const p = wallHistory.p.map(v => v / 1e5);
    const tMax = Math.max(...t);
    const pMin = Math.min(...p) * 0.9;
    const pMax = Math.max(...p) * 1.1;
    const pRange = pMax - pMin;
    
    // 그리드
    modalCtx.strokeStyle = '#21262d';
    modalCtx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
        const gy = pad.top + (i / 5) * plotH;
        modalCtx.beginPath();
        modalCtx.moveTo(pad.left, gy);
        modalCtx.lineTo(pad.left + plotW, gy);
        modalCtx.stroke();
    }
    
    // 시험시간 구간 하이라이트
    const startX = pad.left + (modalStartTime / tMax) * plotW;
    const endX = pad.left + (modalEndTime / tMax) * plotW;
    
    modalCtx.fillStyle = 'rgba(63, 185, 80, 0.2)';
    modalCtx.fillRect(startX, pad.top, endX - startX, plotH);
    
    // 시작선 (드래그 가능)
    modalCtx.strokeStyle = '#3fb950';
    modalCtx.lineWidth = 3;
    modalCtx.beginPath();
    modalCtx.moveTo(startX, pad.top);
    modalCtx.lineTo(startX, pad.top + plotH);
    modalCtx.stroke();
    
    // 시작선 핸들
    modalCtx.fillStyle = '#3fb950';
    modalCtx.beginPath();
    modalCtx.arc(startX, pad.top + 20, 8, 0, Math.PI * 2);
    modalCtx.fill();
    modalCtx.fillStyle = '#fff';
    modalCtx.font = 'bold 10px sans-serif';
    modalCtx.textAlign = 'center';
    modalCtx.fillText('S', startX, pad.top + 24);
    
    // 끝선 (드래그 가능)
    modalCtx.strokeStyle = '#f85149';
    modalCtx.lineWidth = 3;
    modalCtx.beginPath();
    modalCtx.moveTo(endX, pad.top);
    modalCtx.lineTo(endX, pad.top + plotH);
    modalCtx.stroke();
    
    // 끝선 핸들
    modalCtx.fillStyle = '#f85149';
    modalCtx.beginPath();
    modalCtx.arc(endX, pad.top + 20, 8, 0, Math.PI * 2);
    modalCtx.fill();
    modalCtx.fillStyle = '#fff';
    modalCtx.fillText('E', endX, pad.top + 24);
    
    // 압력 데이터 플롯
    modalCtx.strokeStyle = '#22c55e';
    modalCtx.lineWidth = 2;
    modalCtx.beginPath();
    
    for (let i = 0; i < t.length; i++) {
        const px = pad.left + (t[i] / tMax) * plotW;
        const py = pad.top + plotH * (1 - (p[i] - pMin) / pRange);
        
        if (i === 0) {
            modalCtx.moveTo(px, py);
        } else {
            modalCtx.lineTo(px, py);
        }
    }
    modalCtx.stroke();
    
    // 타이틀
    modalCtx.fillStyle = '#e6edf3';
    modalCtx.font = 'bold 16px sans-serif';
    modalCtx.textAlign = 'center';
    modalCtx.fillText('벽면 압력 (x = L)', width / 2, 25);
    
    // Y축 레이블
    modalCtx.fillStyle = '#8b949e';
    modalCtx.font = '12px sans-serif';
    modalCtx.textAlign = 'right';
    modalCtx.fillText(pMax.toFixed(1) + ' bar', pad.left - 10, pad.top + 12);
    modalCtx.fillText(pMin.toFixed(1) + ' bar', pad.left - 10, pad.top + plotH);
    
    modalCtx.save();
    modalCtx.translate(20, pad.top + plotH / 2);
    modalCtx.rotate(-Math.PI / 2);
    modalCtx.textAlign = 'center';
    modalCtx.fillText('P [bar]', 0, 0);
    modalCtx.restore();
    
    // X축 레이블
    modalCtx.textAlign = 'center';
    modalCtx.fillText('0', pad.left, height - 25);
    modalCtx.fillText(tMax.toFixed(1), pad.left + plotW, height - 25);
    modalCtx.fillText('t [ms]', width / 2, height - 8);
    
    // 시간 표시
    modalCtx.font = '11px sans-serif';
    modalCtx.fillStyle = '#3fb950';
    modalCtx.fillText(modalStartTime.toFixed(2) + ' ms', startX, pad.top + plotH + 15);
    modalCtx.fillStyle = '#f85149';
    modalCtx.fillText(modalEndTime.toFixed(2) + ' ms', endX, pad.top + plotH + 15);
}

function updateModalInfo() {
    const t = wallHistory.t.map(v => v * 1000);
    const p = wallHistory.p.map(v => v / 1e5);
    
    // 선택 구간의 데이터 추출
    const segment = [];
    for (let i = 0; i < t.length; i++) {
        if (t[i] >= modalStartTime && t[i] <= modalEndTime) {
            segment.push(p[i]);
        }
    }
    
    if (segment.length === 0) return;
    
    const mean = segment.reduce((a, b) => a + b, 0) / segment.length;
    const variance = segment.reduce((a, b) => a + (b - mean) ** 2, 0) / segment.length;
    const std = Math.sqrt(variance);
    const cv = (std / mean) * 100;
    const duration = modalEndTime - modalStartTime;
    
    document.getElementById('modal-test-duration').textContent = duration.toFixed(3) + ' ms';
    document.getElementById('modal-test-range').textContent = 
        modalStartTime.toFixed(2) + ' ~ ' + modalEndTime.toFixed(2) + ' ms';
    document.getElementById('modal-mean-pressure').textContent = mean.toFixed(2) + ' bar';
    
    const cvEl = document.getElementById('modal-cv');
    cvEl.textContent = cv.toFixed(2) + ' %';
    cvEl.style.color = cv < 3 ? '#3fb950' : (cv < 5 ? '#d29922' : '#f85149');
}

function getModalMousePos(e) {
    const rect = modalCanvas.getBoundingClientRect();
    const scaleX = 1000 / rect.width;
    const scaleY = 400 / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

function onModalMouseDown(e) {
    const pos = getModalMousePos(e);
    const t = wallHistory.t.map(v => v * 1000);
    const tMax = Math.max(...t);
    
    const pad = { left: 70, right: 30 };
    const plotW = 1000 - pad.left - pad.right;
    
    const startX = pad.left + (modalStartTime / tMax) * plotW;
    const endX = pad.left + (modalEndTime / tMax) * plotW;
    
    // 시작선 클릭 감지 (±15px)
    if (Math.abs(pos.x - startX) < 15) {
        isDraggingStart = true;
        modalCanvas.style.cursor = 'ew-resize';
    }
    // 끝선 클릭 감지
    else if (Math.abs(pos.x - endX) < 15) {
        isDraggingEnd = true;
        modalCanvas.style.cursor = 'ew-resize';
    }
}

function onModalMouseMove(e) {
    const pos = getModalMousePos(e);
    const t = wallHistory.t.map(v => v * 1000);
    const tMax = Math.max(...t);
    
    const pad = { left: 70, right: 30 };
    const plotW = 1000 - pad.left - pad.right;
    
    if (isDraggingStart || isDraggingEnd) {
        // 시간으로 변환
        const newTime = Math.max(0, Math.min(tMax, ((pos.x - pad.left) / plotW) * tMax));
        
        if (isDraggingStart) {
            modalStartTime = Math.min(newTime, modalEndTime - 0.1);
        } else if (isDraggingEnd) {
            modalEndTime = Math.max(newTime, modalStartTime + 0.1);
        }
        
        drawModalChart();
        updateModalInfo();
    } else {
        // 커서 변경
        const startX = pad.left + (modalStartTime / tMax) * plotW;
        const endX = pad.left + (modalEndTime / tMax) * plotW;
        
        if (Math.abs(pos.x - startX) < 15 || Math.abs(pos.x - endX) < 15) {
            modalCanvas.style.cursor = 'ew-resize';
        } else {
            modalCanvas.style.cursor = 'crosshair';
        }
    }
}

function onModalMouseUp(e) {
    isDraggingStart = false;
    isDraggingEnd = false;
    modalCanvas.style.cursor = 'crosshair';
}

