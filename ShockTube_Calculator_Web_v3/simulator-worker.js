// ============================================
// Shock Tube Simulator Worker
// 1D Euler Solver with HLLC (Background)
// ============================================

const R_universal = 8314.51; // J/(kmol·K)

const GAS_DATA = {
    air:  { mw: 28.9660, gamma: 1.4020, name: 'Air' },
    he:   { mw: 4.0026,  gamma: 1.6670, name: 'Helium' },
    h2:   { mw: 2.0160,  gamma: 1.4050, name: 'Hydrogen' },
    co2:  { mw: 44.0100, gamma: 1.2970, name: 'CO₂' },
    ar:   { mw: 39.9480, gamma: 1.6670, name: 'Argon' },
    n2:   { mw: 28.0134, gamma: 1.4000, name: 'Nitrogen' }
};


// 혼합 가스 물성치
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
    
    return { 
        mw: mw_mix, 
        gamma: gamma_mix,
        R: R_universal / mw_mix
    };
}


function getGasProperties(gasType, heRatio = 0.5) {
    if (gasType === 'mix') {
        return calcMixtureProperties(heRatio);
    }
    const gas = GAS_DATA[gasType];
    return { 
        mw: gas.mw, 
        gamma: gas.gamma, 
        R: R_universal / gas.mw 
    };
}


// 1D Euler Solver 클래스
class ShockTube1D {
    constructor(config, ylims) {
        this.config = config;
        this.ylims = ylims;
        
        // 격자
        this.dx = config.L / config.nx;
        this.x = new Float64Array(config.nx);
        for (let i = 0; i < config.nx; i++) {
            this.x[i] = this.dx / 2 + i * this.dx;
        }
        
        // 보존 변수: [rho, rho*u, rho*E, rho*Y_driver]
        this.Q = [
            new Float64Array(config.nx),
            new Float64Array(config.nx),
            new Float64Array(config.nx),
            new Float64Array(config.nx)
        ];
        
        // 물성치
        this.driverProps = getGasProperties(config.driverGas, config.heRatio);
        this.drivenProps = getGasProperties(config.drivenGas);
        
        // cv 계산
        const gd = this.driverProps.gamma;
        const gv = this.drivenProps.gamma;
        this.driverProps.cv = this.driverProps.R / (gd - 1);
        this.drivenProps.cv = this.drivenProps.R / (gv - 1);
        
        // 시뮬레이션 상태
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
                // Driver
                const rho = cfg.driverP / (dp.R * cfg.driverT);
                const e = cfg.driverP / ((dp.gamma - 1) * rho);
                
                this.Q[0][i] = rho;
                this.Q[1][i] = 0;
                this.Q[2][i] = rho * e;
                this.Q[3][i] = rho; // Y_driver = 1
            } else {
                // Driven
                const rho = cfg.drivenP / (vp.R * cfg.drivenT);
                const e = cfg.drivenP / ((vp.gamma - 1) * rho);
                
                this.Q[0][i] = rho;
                this.Q[1][i] = 0;
                this.Q[2][i] = rho * e;
                this.Q[3][i] = 0; // Y_driver = 0
            }
        }
    }
    
    getGammaR(Y_driver) {
        // 질량분율 기반 gamma, R 계산
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
        // 보존 변수 → 원시 변수
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
        
        // 엔탈피
        const H = new Float64Array(nx);
        for (let i = 0; i < nx; i++) {
            H[i] = (this.Q[2][i] + p[i]) / rho[i];
        }
        
        // 음속
        const a = new Float64Array(nx);
        for (let i = 0; i < nx; i++) {
            a[i] = Math.sqrt(gamma[i] * p[i] / rho[i]);
        }
        
        // 플럭스 배열 [4][nx+1]
        const F = [
            new Float64Array(nx + 1),
            new Float64Array(nx + 1),
            new Float64Array(nx + 1),
            new Float64Array(nx + 1)
        ];
        
        // 내부 면
        for (let i = 1; i < nx; i++) {
            const rL = rho[i-1], uL = u[i-1], pL = p[i-1], gL = gamma[i-1], YL = Y[i-1], HL = H[i-1], aL = a[i-1];
            const rR = rho[i], uR = u[i], pR = p[i], gR = gamma[i], YR = Y[i], HR = H[i], aR = a[i];
            
            // Roe 평균
            const sqL = Math.sqrt(rL), sqR = Math.sqrt(rR);
            const u_roe = (sqL * uL + sqR * uR) / (sqL + sqR);
            const H_roe = (sqL * HL + sqR * HR) / (sqL + sqR);
            const g_roe = (sqL * gL + sqR * gR) / (sqL + sqR);
            const a_roe = Math.sqrt(Math.max((g_roe - 1) * (H_roe - 0.5 * u_roe * u_roe), 1e-10));
            
            // 파동 속도
            const SL = Math.min(uL - aL, u_roe - a_roe);
            const SR = Math.max(uR + aR, u_roe + a_roe);
            
            let S_star;
            const denom = rL * (SL - uL) - rR * (SR - uR);
            if (Math.abs(denom) < 1e-10) {
                S_star = 0.5 * (uL + uR);
            } else {
                S_star = (pR - pL + rL * uL * (SL - uL) - rR * uR * (SR - uR)) / denom;
            }
            
            // HLLC 플럭스
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
        
        // 왼쪽 경계 (반사)
        F[0][0] = 0;
        F[1][0] = p[0];
        F[2][0] = 0;
        F[3][0] = 0;
        
        // 오른쪽 경계 (반사)
        F[0][nx] = 0;
        F[1][nx] = p[nx - 1];
        F[2][nx] = 0;
        F[3][nx] = 0;
        
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
        
        // 물리적 제한
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
            Y: Array.from(prim.Y),
            gamma: Array.from(prim.gamma),
            ylims: this.ylims
        };
    }
    
    getWallData() {
        const prim = this.consToPrim();
        const i = this.config.nx - 1;
        return {
            t: this.t,
            p: prim.p[i],
            T: prim.T[i],
            rho: prim.rho[i]
        };
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


// 메시지 핸들러
self.onmessage = function(e) {
    const msg = e.data;
    
    if (msg.type === 'start') {
        runSimulation(msg.config, msg.ylims);
    }
};


function runSimulation(config, ylims) {
    try {
        const solver = new ShockTube1D(config, ylims);
        
        // 초기 프레임
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
            
            // 프레임 저장
            if (solver.step % config.writeInterval === 0) {
                self.postMessage({
                    type: 'frame',
                    frame: solver.getFrame(),
                    history: solver.getHistoryData(),
                    wall: solver.getWallData()
                });
            }
            
            // 진행률 업데이트 (100ms마다)
            const now = performance.now();
            if (now - lastProgressTime > 100) {
                const progress = (solver.t / config.end_time) * 100;
                const elapsed = (now - startTime) / 1000;
                const remaining = progress > 0 ? (elapsed / (progress / 100)) - elapsed : -1;
                const simTime = solver.t * 1000; // ms
                
                self.postMessage({
                    type: 'progress',
                    progress: progress,
                    text: `시뮬레이션 중... ${progress.toFixed(1)}%`,
                    simTime: simTime,
                    remaining: remaining
                });
                
                lastProgressTime = now;
            }
        }
        
        // 최종 프레임
        self.postMessage({
            type: 'frame',
            frame: solver.getFrame(),
            history: solver.getHistoryData(),
            wall: solver.getWallData()
        });
        
        // 완료
        self.postMessage({ type: 'complete' });
        
    } catch (error) {
        self.postMessage({
            type: 'error',
            error: error.message
        });
    }
}

