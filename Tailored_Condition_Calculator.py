"""
=============================================================================
                  충격파 튜브 테일러드 조건 계산기
                  Shock Tube Tailored Condition Calculator
=============================================================================

논문 참고: "Study of Test Time Extension in KAIST Shock Tunnel"
         Keunyeong Kim, Gisu Park (2020)

테일러드 조건:
- 반사 충격파가 접촉면과 만날 때 추가적인 파동(압축파/팽창파)이 생성되지 않는 조건
- State 3와 State 5의 음향 임피던스가 매칭될 때 달성됨
"""

import math
from typing import Dict, Tuple, Optional, List

#=============================================================================
#                         가스 물성치 정의
#=============================================================================

R_universal = 8314.51  # 일반 기체 상수 [J/kmol·K]

# 각 가스 물성치: (분자량 [kg/kmol], 비열비 γ)
GAS_DATA = {
    "air": {"mw": 28.9660, "gamma": 1.4020, "name": "Air"},
    "he":  {"mw": 4.0026,  "gamma": 1.6670, "name": "Helium"},
    "h2":  {"mw": 2.0160,  "gamma": 1.4050, "name": "Hydrogen"},
    "co2": {"mw": 44.0100, "gamma": 1.2970, "name": "CO₂"},
    "ar":  {"mw": 39.9480, "gamma": 1.6670, "name": "Argon"},
    "n2":  {"mw": 28.0134, "gamma": 1.4000, "name": "Nitrogen"},
}


def calc_mixture_properties(base_gas: str, mix_gas: str, X_mix: float) -> Dict:
    """
    이종 가스 혼합물 물성치 계산 (몰분율 기준)
    
    Parameters:
    -----------
    base_gas : str - 기본 가스 ("air", "he", 등)
    mix_gas : str - 혼합 가스
    X_mix : float - 혼합 가스의 몰분율 (0~1)
    
    Returns:
    --------
    dict : {"mw": 분자량, "gamma": 비열비, "name": 이름}
    """
    gas1 = GAS_DATA[base_gas]
    gas2 = GAS_DATA[mix_gas]
    
    X1 = 1 - X_mix  # 기본 가스 몰분율
    X2 = X_mix      # 혼합 가스 몰분율
    
    # 혼합 분자량 (몰분율 평균)
    mw_mix = X1 * gas1["mw"] + X2 * gas2["mw"]
    
    # 질량 분율
    Y1 = (X1 * gas1["mw"]) / mw_mix
    Y2 = 1 - Y1
    
    # 개별 기체상수
    R1 = R_universal / gas1["mw"]
    R2 = R_universal / gas2["mw"]
    
    # 개별 비열
    cp1 = gas1["gamma"] / (gas1["gamma"] - 1) * R1
    cp2 = gas2["gamma"] / (gas2["gamma"] - 1) * R2
    cv1 = R1 / (gas1["gamma"] - 1)
    cv2 = R2 / (gas2["gamma"] - 1)
    
    # 혼합 비열 (질량 평균)
    cp_mix = Y1 * cp1 + Y2 * cp2
    cv_mix = Y1 * cv1 + Y2 * cv2
    
    # 혼합 비열비
    gamma_mix = cp_mix / cv_mix
    
    return {
        "mw": mw_mix, 
        "gamma": gamma_mix, 
        "name": f"{gas1['name']}/{gas2['name']} ({X2*100:.1f}% {gas2['name']})"
    }


def get_gas_properties(gas_type: str, X_mix: float = 0.5, 
                       base_gas: str = "air", mix_gas: str = "he") -> Dict:
    """
    가스 물성치 반환
    
    Parameters:
    -----------
    gas_type : str - "air", "he", "h2", "co2", "ar", "n2", "mix"
    X_mix : float - 혼합 시 mix_gas의 몰분율 (0~1)
    base_gas, mix_gas : str - 혼합 시 기본/혼합 가스 종류
    """
    if gas_type == "mix":
        return calc_mixture_properties(base_gas, mix_gas, X_mix)
    elif gas_type in GAS_DATA:
        gas = GAS_DATA[gas_type]
        return {"mw": gas["mw"], "gamma": gas["gamma"], "name": gas["name"]}
    else:
        raise ValueError(f"Unknown gas type: {gas_type}")


#=============================================================================
#                    충격파 튜브 상태 계산 함수
#=============================================================================

def calc_shock_tube_states(M: float, p1: float, t1: float, p4: float, t4: float,
                           driven_props: Dict, driver_props: Dict) -> Dict:
    """
    충격파 튜브 전 상태 계산 (State 1, 2, 3, 4, 5)
    
    Parameters:
    -----------
    M : float - 입사 충격파 마하수
    p1, t1 : float - Driven 섹션 초기 압력[Pa], 온도[K]
    p4, t4 : float - Driver 섹션 초기 압력[Pa], 온도[K]
    driven_props : dict - Driven 가스 물성치 {"mw", "gamma"}
    driver_props : dict - Driver 가스 물성치 {"mw", "gamma"}
    
    Returns:
    --------
    dict : 각 State의 물성치 + 파동 정보
    """
    # Driven 가스 물성치
    g1 = driven_props["gamma"]
    mw1 = driven_props["mw"]
    R1 = R_universal / mw1
    
    # Driver 가스 물성치
    g4 = driver_props["gamma"]
    mw4 = driver_props["mw"]
    R4 = R_universal / mw4
    
    #---------------------------------------------------------------------------
    # State 1: Driven 섹션 초기 상태
    #---------------------------------------------------------------------------
    a1 = math.sqrt(g1 * R1 * t1)
    rho1 = p1 / (R1 * t1)
    u1 = 0
    
    # 충격파 속도
    W = M * a1
    
    #---------------------------------------------------------------------------
    # State 2: 입사 충격파 후 (Driven 가스)
    #---------------------------------------------------------------------------
    gp1 = g1 + 1  # γ + 1
    gm1 = g1 - 1  # γ - 1
    
    # 압력비 p2/p1 (Rankine-Hugoniot)
    p2_p1 = 1 + (2 * g1 / gp1) * (M**2 - 1)
    p2 = p2_p1 * p1
    
    # 온도비 T2/T1
    t2_t1 = p2_p1 * ((gp1/gm1 + p2_p1) / (1 + gp1/gm1 * p2_p1))
    t2 = t2_t1 * t1
    
    # 밀도비 ρ2/ρ1
    rho2_rho1 = (1 + (gp1/gm1) * p2_p1) / (gp1/gm1 + p2_p1)
    rho2 = rho2_rho1 * rho1
    
    # 음속, 유속
    a2 = math.sqrt(g1 * R1 * t2)
    u2 = (a1 / g1) * (p2_p1 - 1) * math.sqrt((2 * g1 / gp1) / (p2_p1 + gm1/gp1))
    
    #---------------------------------------------------------------------------
    # State 4: Driver 섹션 초기 상태
    #---------------------------------------------------------------------------
    a4 = math.sqrt(g4 * R4 * t4)
    rho4 = p4 / (R4 * t4)
    u4 = 0
    
    #---------------------------------------------------------------------------
    # State 3: 접촉면 (Driver 가스, p3=p2, u3=u2)
    # 등엔트로피 팽창파를 통과한 Driver 가스
    #---------------------------------------------------------------------------
    p3 = p2  # 접촉면에서 압력 연속
    u3 = u2  # 접촉면에서 속도 연속
    
    gm4 = g4 - 1
    p3_p4 = p3 / p4
    
    # 등엔트로피 관계
    t3 = t4 * (p3_p4) ** (gm4 / g4)
    rho3 = rho4 * (p3_p4) ** (1 / g4)
    a3 = math.sqrt(g4 * R4 * t3)
    
    #---------------------------------------------------------------------------
    # State 5: 반사 충격파 후 (Driven 가스)
    #---------------------------------------------------------------------------
    # 반사 충격파 강도
    p5_p2 = ((3*g1 - 1) * p2_p1 - gm1) / (gm1 * p2_p1 + gp1)
    p5 = p5_p2 * p2
    
    t5_t2 = p5_p2 * ((gp1/gm1 + p5_p2) / (1 + gp1/gm1 * p5_p2))
    t5 = t5_t2 * t2
    
    rho5_rho2 = (1 + (gp1/gm1) * p5_p2) / (gp1/gm1 + p5_p2)
    rho5 = rho5_rho2 * rho2
    
    a5 = math.sqrt(g1 * R1 * t5)
    u5 = 0  # 반사 후 정지 상태 (End wall)
    
    # 반사 충격파 마하수 (State 2 기준)
    M_R = math.sqrt(1 + (gp1 / (2*g1)) * (p5_p2 - 1))
    
    return {
        "state1": {"p": p1, "t": t1, "rho": rho1, "a": a1, "u": u1, "gas": "driven"},
        "state2": {"p": p2, "t": t2, "rho": rho2, "a": a2, "u": u2, "gas": "driven"},
        "state3": {"p": p3, "t": t3, "rho": rho3, "a": a3, "u": u3, "gas": "driver"},
        "state4": {"p": p4, "t": t4, "rho": rho4, "a": a4, "u": u4, "gas": "driver"},
        "state5": {"p": p5, "t": t5, "rho": rho5, "a": a5, "u": u5, "gas": "driven"},
        "shock": {"M_incident": M, "W_incident": W, "M_reflected": M_R},
        "ratios": {"p2_p1": p2_p1, "p5_p2": p5_p2, "p4_p1": p4/p1}
    }


#=============================================================================
#                    테일러드 조건 계산 함수
#=============================================================================

def calc_tailored_parameter(states: Dict) -> Dict:
    """
    테일러드 조건 판별 지표 계산
    
    테일러드 조건: 접촉면 양쪽의 음향 임피던스 매칭 (Z2 ≈ Z3)
    - Z2: State 2 (충격파 후, Driven gas)
    - Z3: State 3 (팽창파 후, Driver gas, 접촉면)
    
    반사 충격파가 접촉면과 만날 때, 접촉면 양쪽의 임피던스가
    같아야 추가적인 파동(반사파/투과파)이 발생하지 않음
    
    Parameters:
    -----------
    states : dict - calc_shock_tube_states() 출력
    
    Returns:
    --------
    dict : 테일러드 지표들
    """
    s2 = states["state2"]
    s3 = states["state3"]
    s5 = states["state5"]
    
    # 음향 임피던스 (ρa)
    Z2 = s2["rho"] * s2["a"]  # State 2 (충격파 후 - Driven gas)
    Z3 = s3["rho"] * s3["a"]  # State 3 (접촉면 - Driver gas)
    Z5 = s5["rho"] * s5["a"]  # State 5 (반사 충격파 후 - Driven gas)
    
    # 테일러드 파라미터 τ = Z3/Z2 - 1
    # τ = 0 → 완벽한 테일러드 (Z3 = Z2)
    # τ > 0 → Over-tailored (Z3 > Z2, Driver측 임피던스가 큼)
    # τ < 0 → Under-tailored (Z3 < Z2, Driven측 임피던스가 큼)
    tau = (Z3 / Z2) - 1
    
    # 임피던스 비율
    impedance_ratio = Z3 / Z2
    
    # 상태 판정
    if abs(tau) < 0.05:
        status = "✅ TAILORED (테일러드)"
        detail = "추가 파동 없음 - 최적 테스트 시간"
    elif abs(tau) < 0.15:
        status = "🟡 NEAR-TAILORED (거의 테일러드)"
        detail = "약한 파동 발생 - 양호"
    elif tau > 0:
        status = "⚠️ OVER-TAILORED (과테일러드)"
        detail = "Driver측 임피던스가 큼"
    else:
        status = "⚠️ UNDER-TAILORED (언더테일러드)"
        detail = "Driven측 임피던스가 큼"
    
    return {
        "tau": tau,                          # 테일러드 파라미터 (Z3/Z2 - 1)
        "impedance_ratio": impedance_ratio,  # Z3/Z2
        "Z2": Z2,                            # State 2 음향 임피던스
        "Z3": Z3,                            # State 3 음향 임피던스
        "Z5": Z5,                            # State 5 음향 임피던스 (참고용)
        "status": status,
        "detail": detail,
        "is_tailored": abs(tau) < 0.15       # 15% 이내면 테일러드로 간주
    }


def calc_tailored_driver_composition(M: float, p1: float, t1: float, t4: float,
                                      driven_props: Dict, 
                                      base_gas: str = "air", 
                                      mix_gas: str = "he") -> Dict:
    """
    주어진 조건에서 테일러드가 되는 드라이버 가스 조성 찾기
    
    원리: 테일러드 조건에서 접촉면 양쪽의 음향 임피던스가 매칭됨
         이를 만족하는 드라이버 가스의 γ, MW 조합을 찾음
    
    Parameters:
    -----------
    M : float - 목표 입사 충격파 마하수
    p1, t1 : float - Driven 섹션 초기 조건
    t4 : float - Driver 섹션 온도
    driven_props : dict - Driven 가스 물성치
    base_gas, mix_gas : str - 혼합 시 사용할 가스 종류
    
    Returns:
    --------
    dict : 테일러드 조성 정보
    """
    g1 = driven_props["gamma"]
    mw1 = driven_props["mw"]
    R1 = R_universal / mw1
    
    # State 2 계산 (입사 충격파 후)
    gp1 = g1 + 1
    gm1 = g1 - 1
    p2_p1 = 1 + (2 * g1 / gp1) * (M**2 - 1)
    
    t2_t1 = p2_p1 * ((gp1/gm1 + p2_p1) / (1 + gp1/gm1 * p2_p1))
    t2 = t2_t1 * t1
    
    rho2_rho1 = (1 + (gp1/gm1) * p2_p1) / (gp1/gm1 + p2_p1)
    rho1 = p1 / (R1 * t1)
    rho2 = rho2_rho1 * rho1
    
    a2 = math.sqrt(g1 * R1 * t2)
    
    # 목표 음향 임피던스 (State 2) - 테일러드 조건: Z3 = Z2
    Z2_target = rho2 * a2
    
    # 혼합비에 따른 테일러드 파라미터 계산
    results = []
    best_X = None
    best_tau = float('inf')
    
    for i in range(101):  # 0% ~ 100%
        X_mix = i / 100.0
        driver_props = calc_mixture_properties(base_gas, mix_gas, X_mix)
        g4 = driver_props["gamma"]
        mw4 = driver_props["mw"]
        R4 = R_universal / mw4
        
        # p4 계산
        a1 = math.sqrt(g1 * R1 * t1)
        a4 = math.sqrt(g4 * R4 * t4)
        
        gm4 = g4 - 1
        term = 1 - (gm4 * (a1/a4) * (p2_p1 - 1)) / math.sqrt(2*g1 * (2*g1 + gp1*(p2_p1 - 1)))
        
        if term <= 0:
            continue  # 물리적으로 불가능한 조건
        
        p4_p1 = p2_p1 * (term ** (-2*g4/gm4))
        p4 = p4_p1 * p1
        
        # State 3 계산
        p3 = p2_p1 * p1
        p3_p4 = p3 / p4
        
        if p3_p4 > 1:
            continue  # 팽창파 조건 불만족
        
        rho4 = p4 / (R4 * t4)
        t3 = t4 * (p3_p4) ** (gm4 / g4)
        rho3 = rho4 * (p3_p4) ** (1 / g4)
        a3 = math.sqrt(g4 * R4 * t3)
        
        Z3 = rho3 * a3
        tau = (Z3 / Z2_target) - 1  # 테일러드 조건: Z3/Z2 = 1
        
        results.append({
            "X_mix": X_mix,
            "tau": tau,
            "p4_bar": p4 / 1e5,
            "gamma": g4,
            "mw": mw4
        })
        
        if abs(tau) < abs(best_tau):
            best_tau = tau
            best_X = X_mix
    
    # 최적 조성
    if best_X is not None:
        best_props = calc_mixture_properties(base_gas, mix_gas, best_X)
        optimal = {
            "X_mix": best_X,
            "composition": f"{base_gas.upper()}/{mix_gas.upper()} = {(1-best_X)*100:.1f}/{best_X*100:.1f}",
            "gamma": best_props["gamma"],
            "mw": best_props["mw"],
            "tau": best_tau,
            "is_tailored": abs(best_tau) < 0.05
        }
    else:
        optimal = None
    
    return {
        "optimal": optimal,
        "scan_results": results,
        "Z2_target": Z2_target,
        "base_gas": base_gas,
        "mix_gas": mix_gas
    }


def find_tailored_p4(M: float, p1: float, t1: float, t4: float,
                     driven_props: Dict, driver_props: Dict,
                     tol: float = 0.01, max_iter: int = 100) -> Tuple[float, Dict]:
    """
    주어진 드라이버 가스로 테일러드에 가장 가까운 p4 찾기
    
    Parameters:
    -----------
    M : float - 목표 마하수
    p1, t1 : float - Driven 초기 조건
    t4 : float - Driver 온도
    driven_props, driver_props : dict - 가스 물성치
    
    Returns:
    --------
    (p4_optimal, tailored_info)
    """
    g1 = driven_props["gamma"]
    mw1 = driven_props["mw"]
    R1 = R_universal / mw1
    
    g4 = driver_props["gamma"]
    mw4 = driver_props["mw"]
    R4 = R_universal / mw4
    
    # 기본 p4 계산
    a1 = math.sqrt(g1 * R1 * t1)
    a4 = math.sqrt(g4 * R4 * t4)
    
    gp1 = g1 + 1
    gm1 = g1 - 1
    gm4 = g4 - 1
    
    p2_p1 = 1 + (2 * g1 / gp1) * (M**2 - 1)
    
    term = 1 - (gm4 * (a1/a4) * (p2_p1 - 1)) / math.sqrt(2*g1 * (2*g1 + gp1*(p2_p1 - 1)))
    p4_p1_base = p2_p1 * (term ** (-2*g4/gm4))
    p4_base = p4_p1_base * p1
    
    # p4 범위에서 테일러드 파라미터 스캔
    p4_min = p4_base * 0.5
    p4_max = p4_base * 2.0
    p4_range = [p4_min + (p4_max - p4_min) * i / 199 for i in range(200)]
    
    best_p4 = p4_base
    best_tau = float('inf')
    
    for p4_test in p4_range:
        states = calc_shock_tube_states(M, p1, t1, p4_test, t4, driven_props, driver_props)
        tailored = calc_tailored_parameter(states)
        
        if abs(tailored["tau"]) < abs(best_tau):
            best_tau = tailored["tau"]
            best_p4 = p4_test
    
    # 최종 상태 계산
    final_states = calc_shock_tube_states(M, p1, t1, best_p4, t4, driven_props, driver_props)
    final_tailored = calc_tailored_parameter(final_states)
    
    return best_p4, {
        "p4_optimal": best_p4,
        "p4_base": p4_base,
        "tailored": final_tailored,
        "states": final_states
    }


#=============================================================================
#                       결과 출력 함수
#=============================================================================

def print_states(states: Dict, driven_name: str = "Driven", driver_name: str = "Driver"):
    """상태 계산 결과 출력"""
    print("\n" + "=" * 70)
    print("                     충격파 튜브 상태 계산 결과")
    print("=" * 70)
    
    state_names = {
        "state1": f"State 1 (Driven 초기 - {driven_name})",
        "state2": f"State 2 (충격파 후 - {driven_name})",
        "state3": f"State 3 (접촉면 - {driver_name})",
        "state4": f"State 4 (Driver 초기 - {driver_name})",
        "state5": f"State 5 (반사충격파 후 - {driven_name})"
    }
    
    print(f"\n{'State':<30} {'P [bar]':>12} {'T [K]':>10} {'ρ [kg/m³]':>12} {'a [m/s]':>10} {'u [m/s]':>10}")
    print("-" * 86)
    
    for key in ["state1", "state2", "state3", "state4", "state5"]:
        s = states[key]
        name = state_names[key]
        print(f"{name:<30} {s['p']/1e5:>12.3f} {s['t']:>10.1f} {s['rho']:>12.4f} {s['a']:>10.2f} {s['u']:>10.2f}")
    
    print("\n" + "-" * 50)
    shock = states["shock"]
    print(f"입사 충격파: M = {shock['M_incident']:.4f}, W = {shock['W_incident']:.2f} m/s")
    print(f"반사 충격파: M_R = {shock['M_reflected']:.4f}")


def print_tailored_analysis(tailored: Dict):
    """테일러드 분석 결과 출력"""
    print("\n" + "=" * 70)
    print("                     테일러드 조건 분석")
    print("=" * 70)
    print("\n  [테일러드 조건: 접촉면 양쪽 임피던스 매칭 Z₂ ≈ Z₃]")
    
    print(f"\n  음향 임피던스:")
    print(f"    Z₂ (State 2, Driven):  {tailored['Z2']:.2f} kg/(m²·s)")
    print(f"    Z₃ (State 3, Driver):  {tailored['Z3']:.2f} kg/(m²·s)")
    print(f"    비율 Z₃/Z₂:            {tailored['impedance_ratio']:.4f}")
    
    print(f"\n  테일러드 파라미터 (τ):")
    print(f"    τ = (Z₃/Z₂) - 1 = {tailored['tau']:.4f} ({tailored['tau']*100:.2f}%)")
    print(f"    (0%에 가까울수록 테일러드)")
    
    print(f"\n  판정: {tailored['status']}")
    print(f"         {tailored['detail']}")


#=============================================================================
#                         메인 실행 예시
#=============================================================================

if __name__ == "__main__":
    print("=" * 70)
    print("       충격파 튜브 테일러드 조건 계산기")
    print("=" * 70)
    
    #-------------------------------------------------------------------------
    # 예시 1: 현재 조건의 테일러드 판별
    #-------------------------------------------------------------------------
    print("\n" + "▶" * 35)
    print("예시 1: 현재 조건 테일러드 분석")
    print("▶" * 35)
    
    # 입력 조건
    DRIVER_GAS = "h2"
    DRIVER_P_BAR = 110
    DRIVER_T = 300
    
    DRIVEN_GAS = "air"
    DRIVEN_P_ATM = 1
    DRIVEN_T = 300
    
    # 물성치 가져오기
    driver_props = get_gas_properties(DRIVER_GAS)
    driven_props = get_gas_properties(DRIVEN_GAS)
    
    # 단위 변환
    p4 = DRIVER_P_BAR * 1e5
    p1 = DRIVEN_P_ATM * 101325
    
    # 마하수 찾기 (간단한 반복)
    M = 4.58  # 이전 계산에서 구한 값
    
    print(f"\n입력 조건:")
    print(f"  Driver: {DRIVER_P_BAR} bar, {DRIVER_T} K, {driver_props['name']}")
    print(f"  Driven: {DRIVEN_P_ATM} atm, {DRIVEN_T} K, {driven_props['name']}")
    print(f"  충격파 마하수: M = {M}")
    
    # 상태 계산
    states = calc_shock_tube_states(M, p1, DRIVEN_T, p4, DRIVER_T, driven_props, driver_props)
    print_states(states, driven_props['name'], driver_props['name'])
    
    # 테일러드 분석
    tailored = calc_tailored_parameter(states)
    print_tailored_analysis(tailored)
    
    #-------------------------------------------------------------------------
    # 예시 2: 테일러드가 되는 드라이버 가스 조성 찾기
    #-------------------------------------------------------------------------
    print("\n\n" + "▶" * 35)
    print("예시 2: 테일러드 드라이버 가스 조성 탐색")
    print("▶" * 35)
    
    M_target = 4.5
    print(f"\n목표 마하수 M = {M_target}에서 테일러드가 되는 Air/He 조성 탐색...")
    
    composition = calc_tailored_driver_composition(
        M=M_target, p1=p1, t1=DRIVEN_T, t4=DRIVER_T,
        driven_props=driven_props,
        base_gas="air", mix_gas="he"
    )
    
    if composition["optimal"]:
        opt = composition["optimal"]
        print(f"\n  ✓ 최적 조성: {opt['composition']}")
        print(f"    - 혼합 γ = {opt['gamma']:.4f}")
        print(f"    - 혼합 MW = {opt['mw']:.4f} kg/kmol")
        print(f"    - τ = {opt['tau']:.4f} ({opt['tau']*100:.2f}%)")
        print(f"    - 테일러드: {'예' if opt['is_tailored'] else '아니오'}")
    else:
        print("  ✗ 해당 조합으로는 테일러드 조건을 달성할 수 없습니다.")
    
    #-------------------------------------------------------------------------
    # 예시 3: 순수 가스로 테일러드 판별
    #-------------------------------------------------------------------------
    print("\n\n" + "▶" * 35)
    print("예시 3: 다양한 드라이버 가스 비교")
    print("▶" * 35)
    
    print(f"\n{'Driver Gas':<15} {'τ':>10} {'상태':<25}")
    print("-" * 55)
    
    for gas in ["air", "he", "h2", "ar"]:
        try:
            drv_props = get_gas_properties(gas)
            # 해당 가스로 M=4.5 달성에 필요한 p4 계산 후 테일러드 분석
            states_test = calc_shock_tube_states(M_target, p1, DRIVEN_T, p4, DRIVER_T, 
                                                  driven_props, drv_props)
            tailored_test = calc_tailored_parameter(states_test)
            print(f"{drv_props['name']:<15} {tailored_test['tau']:>10.4f} {tailored_test['status']:<25}")
        except Exception as e:
            print(f"{gas:<15} 계산 불가: {e}")
    
    print("\n" + "=" * 70)
    print("계산 완료!")
    print("=" * 70)

