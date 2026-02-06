============================================
   Shock Tube Calculator (Web Version)
   충격파 튜브 상태 계산기
============================================

[사용 방법]
1. index.html 파일을 더블클릭하여 웹 브라우저에서 열기
2. Driver/Driven 조건 입력
3. "계산 실행" 버튼 클릭

[파일 구성]
- index.html   : 메인 HTML 파일
- style.css    : 스타일 파일
- calculator.js: 계산 로직 (JavaScript)
- README.txt   : 이 파일

[입력값]
Driver (고압부):
  - 가스: Air, Helium, Hydrogen, Air/He 혼합
  - 압력: bar 단위
  - 온도: K 단위
  - He 몰분율: Air/He 혼합 시 0~1

Driven (저압부):
  - 가스: Air, CO2
  - 압력: atm 단위
  - 온도: K 단위

[출력값]
State 1: Driven 섹션 초기 상태
State 2: 충격파 통과 직후
State 3: 접촉면 (팽창파 통과 후 Driver 가스)
State 4: Driver 섹션 초기 상태
State 5: 반사 충격파 후
Shock: 마하수, 충격파 속도

각 State별 출력:
  - P: 압력 [bar, atm]
  - T: 온도 [K]
  - ρ: 밀도 [kg/m³]
  - a: 음속 [m/s]
  - u: 유동 속도 [m/s]

[수렴 문제 해결]
수렴이 안 될 경우 "초기 마하수" 값을 조절하세요:
  - p4/p1 비율이 높으면: 더 큰 값 (4~6)
  - p4/p1 비율이 낮으면: 더 작은 값 (1.5~2)

[동작 환경]
- 최신 웹 브라우저 (Chrome, Firefox, Safari, Edge)
- 인터넷 연결 불필요 (오프라인 사용 가능)

============================================
  WiSTL Shock Tube Calculator
============================================

