# 📊 데이터 구조 및 매칭 방식

## 1. 실험 측정 데이터 엑셀 구조

### Sheet 1 (설정 정보)
```
     A          B
1    ...        ...
5    채널 수     16      ← B5 셀에 채널 수
```

### Sheet 2 (측정 데이터)
```
전압_0    전압_1    전압_2    ...    전압_15
0.000609  0.000857  0.000062  ...    1.429148
0.000297  0.000232 -0.000250  ...    1.430710
...
```

**중요:**
- 헤더 형식: `전압_X` (X는 포트 번호)
- 포트 번호는 0부터 시작
- 데이터는 전압(V) 단위

---

## 2. DAQ Connection 엑셀 구조

```
#   type  PN            SN     cal         a         b         etc          filter
0   P     PCB 132B38    10952  a(V-c)      0.533669  0.000000  model front  BP
1   P     PCB 132B38    10953  a(V-c)      0.405755  0.000000  model        BP
...
15  P     sensys...     X6B840 p_a+aV+b    74.970   -75.163    driver       MA
```

**컬럼 설명:**
- `#`: **포트 번호** (실험 데이터의 "전압_X"와 매칭)
- `type`: 센서 타입 (P=압력, T=온도, X=사용안함)
- `PN`: Part Number
- `SN`: Serial Number
- `cal`: 보정 방식
- `a`, `b`: 보정 계수
- `etc`: **센서 위치/용도** (driver, driven7, driven8, model front 등)
- `filter`: 필터 타입 (MA, LP, BP)

---

## 3. 데이터 매칭 방식

### 매칭 프로세스

```
실험 데이터 "전압_15" 
         ↓
    포트 번호 15 추출
         ↓
DAQ Connection의 # = 15 찾기
         ↓
해당 행의 설정 적용:
  - cal: p_a+aV+b
  - a: 74.970
  - b: -75.163
  - etc: driver
  - filter: MA
         ↓
변환: p_a + 74.970 × V + (-75.163)
         ↓
필터: Moving Average (1000샘플)
```

### 예시

**실험 데이터:**
```javascript
{
  channels: {
    ch0: [0.000609, 0.000297, ...],  // 전압_0
    ch1: [0.000857, 0.000232, ...],  // 전압_1
    ...
    ch15: [4.704884, 4.702072, ...]  // 전압_15 (driver)
  }
}
```

**DAQ Connection:**
```javascript
[
  {channel: 0, description: 'model front', cal: 'a(V-c)', ...},
  {channel: 1, description: 'model', cal: 'a(V-c)', ...},
  ...
  {channel: 15, description: 'driver', cal: 'p_a+aV+b', ...}
]
```

**매칭:**
```javascript
// 1. Driver 찾기
const driverConfig = daqConnection.find(c => c.description === 'driver');
// → {channel: 15, ...}

// 2. 실험 데이터에서 해당 채널 가져오기
const driverData = expData.channels[`ch${driverConfig.channel}`];
// → expData.channels['ch15']

// 3. 변환 및 필터 적용
const converted = driverData.map(v => 
    p_a + driverConfig.coeffA * v + driverConfig.coeffB
);
const filtered = movingAverage(converted, 1000);
```

---

## 4. 보정 방식 (cal 컬럼)

### a(V-c)
```
물리량 = a × (V - 2.5)
```
- 일반 압력 센서
- 2.5V가 기준점

### p_t+a(V-c)+b
```
물리량 = p_t + a × (V - 2.5) + b
```
- 진공압 보정 압력 센서
- p_t: 진공 게이지 값 [bar]

### p_a+aV+b
```
물리량 = p_a + a × V + b
```
- 대기압 보정 압력 센서
- p_a: 대기압 [bar]

### E
```
물리량 = voltToKelvinE(V) - 273.15
```
- E-type 열전대
- 결과: [°C]

### aV+b
```
물리량 = a × V + b
```
- K-type 열전대
- 결과: [°C]

---

## 5. 필터 타입

### MA (Moving Average)
- 이동평균 필터
- 윈도우 크기: 1000샘플
- 용도: 저주파 노이즈 제거

### LP (Low Pass)
- 저역통과 필터
- 차단 주파수: 10kHz
- 용도: 고주파 노이즈 제거

### BP (Band Pass)
- 대역통과 필터
- 통과 대역: 200kHz - 350kHz
- 용도: 특정 주파수 대역만 추출

---

## 6. 주요 채널 설명

### driver
- Driver 섹션 압력 센서
- 압력 강하 감지에 사용
- 기준 시점 결정

### driven7
- Driven 섹션 압력 센서 #1
- p4 (충격파 후 압력) 계산

### driven8
- Driven 섹션 압력 센서 #2
- p5 (반사 충격파 압력) 계산
- 시험시간 계산에 사용

### drivenT
- Driven 섹션 온도 센서
- T1, T4 계산

### model front
- 모델 전면 압력 센서
- 모델 도달 시간 감지

---

## 7. 데이터 흐름 요약

```
[실험 데이터 엑셀]
  Sheet 1, B5 → 채널 수 (예: 16)
  Sheet 2 → 전압_0 ~ 전압_15 (16개 컬럼)
         ↓
[포트 번호 추출]
  "전압_15" → 포트 15
         ↓
[DAQ Connection 매칭]
  포트 15 → # = 15 행 찾기
         ↓
[설정 적용]
  - description: driver
  - cal: p_a+aV+b
  - a: 74.970
  - b: -75.163
  - filter: MA
         ↓
[변환 및 필터]
  1. p_a + 74.970 × V - 75.163
  2. Moving Average (1000샘플)
         ↓
[압력 강하 감지]
  3가지 방법으로 감지
         ↓
[기준 시점 확정]
```

---

## 8. 디버깅 체크리스트

### ✅ 실험 데이터 파일
- [ ] Sheet 1의 B5에 채널 수가 있는가?
- [ ] Sheet 2에 헤더가 "전압_0", "전압_1" 형식인가?
- [ ] 데이터가 숫자로 되어 있는가?
- [ ] 빈 행이 없는가?

### ✅ DAQ Connection 파일
- [ ] '#' 컬럼에 포트 번호가 있는가?
- [ ] 'etc' 컬럼에 'driver'가 있는가?
- [ ] 'cal', 'a', 'b' 값이 올바른가?
- [ ] 'filter' 컬럼이 있는가?

### ✅ 매칭 확인
- [ ] Driver 포트 번호가 실험 데이터에 존재하는가?
- [ ] 예: DAQ의 # = 15이면, 실험 데이터에 "전압_15" 컬럼이 있어야 함

---

## 9. 콘솔 로그 확인 방법

브라우저에서 F12를 누르고 Console 탭에서:

```
1. "실험 데이터 파싱 시작" → 채널 수 확인
2. "추출된 포트 번호" → [0, 1, 2, ..., 15] 확인
3. "DAQ Connection 파싱 시작" → 각 포트 정보 확인
4. "✅ Driver 채널 발견" → Driver 포트 번호 확인
5. "✅ Driver 데이터 로드 성공" → 데이터 통계 확인
6. "Driver 데이터 분석 시작" → 압력 강하 감지 과정 확인
```

모든 단계가 정상적으로 출력되는지 확인하세요!
