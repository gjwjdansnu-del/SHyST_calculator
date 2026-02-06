# 🔌 포트 매핑 가이드

## ⚠️ 중요: 포트 번호는 연속적이지 않을 수 있습니다!

### 예시 1: 연속적인 경우
```
실험 데이터: 전압_0, 전압_1, 전압_2, 전압_3, 전압_4
DAQ Connection: 0, 1, 2, 3, 4
→ 5개 채널, 포트 0~4
```

### 예시 2: 불연속적인 경우 ⚠️
```
실험 데이터: 전압_0, 전압_1, 전압_2, 전압_4, 전압_5, 전압_6, 전압_7
DAQ Connection: 0, 1, 2, 4, 5, 6, 7
→ 7개 채널, 포트 3이 빠짐!
```

### 예시 3: 실제 케이스
```
실험 데이터: 전압_0 ~ 전압_15 (16개)
DAQ Connection: 0~7 (사용), 8~11 (X), 12~19 (사용)
→ 포트 8, 9, 10, 11은 type='X'로 사용 안 함
```

---

## 📋 데이터 구조 상세

### 실험 측정 데이터 엑셀

#### Sheet 1 (설정)
```
     A          B
1    ...        ...
5    채널 수     7        ← 실제 사용하는 채널 개수
```

#### Sheet 2 (데이터)
```
전압_0    전압_1    전압_2    전압_4    전압_5    전압_6    전압_7
0.00061   0.00086   0.00006   0.00037   0.00065   0.00026   0.00051
0.00030   0.00023  -0.00025   0.00037   0.00065   0.00026   0.00051
...
```

**핵심:**
- 헤더: `전압_X` (X = 포트 번호)
- 포트 번호는 **건너뛸 수 있음** (예: 3이 없음)
- 채널 수 = 컬럼 개수 (예: 7개)

---

### DAQ Connection 엑셀

```
#   type  PN            SN     cal         a         b         etc      filter
0   P     PCB 132B38    10952  a(V-c)      0.533     0.000     model    BP
1   P     PCB 132B38    10953  a(V-c)      0.406     0.000     model    BP
2   P     PCB 132B38    10954  a(V-c)      0.507     0.000     model    BP
3   X     NaN           NaN    NaN         NaN       NaN       NaN      NaN     ← 사용 안 함!
4   P     PCB 132B38    10956  a(V-c)      0.501     0.000     model    BP
5   P     PCB 132B38    10639  a(V-c)      0.405     0.000     model    BP
6   P     PCB 132B38    10640  a(V-c)      0.389     0.000     model    BP
7   P     PCB 132B38    10641  a(V-c)      0.404     0.000     model    BP
```

**핵심:**
- `#` 컬럼 = 포트 번호 (실험 데이터의 "전압_X"와 매칭)
- `type = 'X'` = 사용 안 함 (건너뜀)
- `etc` 컬럼 = 센서 위치/용도 (driver, driven7, driven8 등)

---

## 🔄 매칭 프로세스

### Step 1: 실험 데이터 파싱
```javascript
// 헤더에서 포트 번호 추출
"전압_0" → 포트 0
"전압_1" → 포트 1
"전압_2" → 포트 2
"전압_4" → 포트 4  ← 3이 없음!
"전압_5" → 포트 5
...

// 결과
channels = {
  ch0: [데이터],
  ch1: [데이터],
  ch2: [데이터],
  ch4: [데이터],  ← ch3 없음!
  ch5: [데이터],
  ...
}
```

### Step 2: DAQ Connection 파싱
```javascript
// # 컬럼 읽기
[
  {channel: 0, type: 'P', description: 'model', ...},
  {channel: 1, type: 'P', description: 'model', ...},
  {channel: 2, type: 'P', description: 'model', ...},
  {channel: 3, type: 'X', ...},  ← type='X' 사용 안 함
  {channel: 4, type: 'P', description: 'model', ...},
  ...
]
```

### Step 3: 매칭
```javascript
// 포트 번호로 매칭
DAQ 포트 0 → 실험 데이터 ch0 ✅
DAQ 포트 1 → 실험 데이터 ch1 ✅
DAQ 포트 2 → 실험 데이터 ch2 ✅
DAQ 포트 3 → type='X' 스킵 ⏭️
DAQ 포트 4 → 실험 데이터 ch4 ✅
...
```

### Step 4: 변환 및 필터
```javascript
// 매칭된 채널만 처리
for (config of daqConnection) {
  if (config.type === 'X') continue;
  
  const channelName = `ch${config.channel}`;
  if (!expData.channels[channelName]) continue;
  
  // 변환
  const converted = expData.channels[channelName].map(v =>
    convertSingleValue(v, config, p_t, p_a)
  );
  
  // 필터
  const filtered = applyFilter(converted, config.filter, fps);
}
```

---

## 🔍 검증 로그 확인

콘솔에서 다음 로그를 확인하세요:

```
=== 데이터 매칭 검증 ===
실험 데이터 포트: [0, 1, 2, 4, 5, 6, 7]
DAQ Connection 포트 (사용 중): [0, 1, 2, 4, 5, 6, 7, 15]
매칭 결과: {
  matched: [0, 1, 2, 4, 5, 6, 7],
  expOnly: [],
  daqOnly: [15]
}
⚠️ DAQ Connection에만 있는 포트: 15
→ 실험 데이터에 해당 포트가 없습니다.
✅ 매칭 완료: 7개 포트
```

---

## ✅ 체크리스트

### 실험 데이터 파일
- [ ] Sheet 1, B5에 채널 수가 있는가?
- [ ] Sheet 2, 1행에 "전압_X" 형식 헤더가 있는가?
- [ ] 포트 번호가 정확한가?
- [ ] 데이터가 숫자인가?

### DAQ Connection 파일
- [ ] '#' 컬럼에 포트 번호가 있는가?
- [ ] 'type' 컬럼에서 'X'는 사용 안 함
- [ ] 'etc' 컬럼에 'driver' 있는가?
- [ ] 포트 번호가 실험 데이터와 일치하는가?

### 매칭 확인
- [ ] 실험 데이터의 포트 번호 = DAQ Connection의 # 컬럼
- [ ] 예: "전압_15" ↔ DAQ의 # = 15
- [ ] 불일치하는 포트는 경고 로그 확인

---

## 💡 핵심 포인트

1. **포트 번호는 연속적이지 않아도 됨**
   - 0, 1, 2, 4, 5, 6, 7 (3 빠짐) ✅
   - 개수보다 **번호 매칭**이 중요!

2. **type='X'는 자동으로 스킵**
   - 변환 안 함
   - 필터 안 함

3. **매칭 검증 자동 실행**
   - 불일치 시 경고 로그
   - 처리는 계속 진행

4. **Driver 채널은 반드시 필요**
   - DAQ Connection의 'etc' = 'driver'
   - 실험 데이터에 해당 포트 존재
   - 둘 다 만족해야 함

---

## 🐛 문제 해결

### 문제: "Driver 포트 X의 데이터가 실험 데이터에 없음"

**원인:**
- DAQ Connection: # = 15, etc = 'driver'
- 실험 데이터: "전압_15" 컬럼이 없음

**해결:**
1. 실험 데이터 파일 열기
2. Sheet 2에서 "전압_15" 컬럼 확인
3. 없으면 DAQ Connection 파일의 driver 포트 번호 확인
4. 포트 번호 불일치 → 파일 재확인

### 문제: "매칭 완료: 0개 포트"

**원인:**
- 포트 번호가 전혀 매칭되지 않음
- 헤더 형식이 다름 (예: "CH_0" 대신 "전압_0")

**해결:**
1. 콘솔에서 "추출된 포트 번호" 확인
2. "DAQ Connection 포트" 확인
3. 두 배열이 겹치는 번호가 있는지 확인

---

이제 포트 번호 불일치 문제가 완전히 해결되었습니다! 🎉
