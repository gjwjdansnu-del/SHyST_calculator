# 🚀 SHyST 실험 로거 사용 가이드

## 📌 Python 코드와의 차이점

### Python 코드 (`post_SHyST_ver1.ipynb`)
- ✅ **폴더 선택**: 실험 데이터 폴더를 선택하면 자동으로 파일 읽기
- ✅ **자동 파일 검색**: 
  - 실험 데이터: `{실험명}.xlsx`
  - DAQ Connection: `DAQ connection.xlsx` (같은 폴더)
  - 체크리스트: 고정 경로의 `SHyST Exp Check List ver1.xlsx`
- ✅ **실험 번호 자동 추출**: 파일명에서 파싱 (예: `260123 exp#154...` → 154)
- ✅ **체크리스트 자동 검색**: 실험 번호로 진공압, 드리븐 압력 등 자동 로드

### JavaScript 웹 앱 (현재 버전)
- ⚠️ **개별 파일 선택**: 각 파일을 수동으로 업로드
- ⚠️ **체크리스트 미사용**: 실험 전 데이터를 수동 입력
- ✅ **브라우저 기반**: 설치 없이 어디서나 사용 가능
- ✅ **데이터베이스**: IndexedDB로 실험 데이터 저장 및 관리

---

## 🔧 엑셀 파일 업로드 문제 해결

### 문제 증상
- 실험 데이터 파일 또는 DAQ Connection 파일을 선택해도 아무 반응이 없음
- 콘솔에 오류 메시지가 표시됨

### 해결 방법

#### 1️⃣ **파일 형식 확인**
실험 데이터 파일은 다음 구조를 가져야 합니다:
- **Sheet 1**: 메타데이터
  - `B5` 셀: 채널 수 (숫자)
- **Sheet 2**: 실제 데이터
  - 헤더: `전압_0`, `전압_1`, `전압_2`, ...
  - 데이터: 각 채널의 전압 값

DAQ Connection 파일 구조:
- **Sheet 1**: 센서 설정
  - 컬럼: `#`, `type`, `PN`, `SN`, `cal`, `a`, `b`, `etc`, `filter`
  - `#`: 포트 번호 (0, 1, 2, ...)
  - `etc`: 센서 설명 (예: `driver`, `driven7`, `driven8`, `drivenT`)

#### 2️⃣ **브라우저 콘솔 확인**
1. F12 키를 눌러 개발자 도구 열기
2. Console 탭 확인
3. 오류 메시지 확인:
   ```
   ❌ XLSX 라이브러리가 로드되지 않았습니다
   → 페이지 새로고침 (Ctrl+F5 또는 Cmd+Shift+R)
   
   ❌ handleExpDataUpload 함수를 찾을 수 없습니다
   → 스크립트 로드 순서 문제, 페이지 새로고침
   
   ❌ Driver 채널을 찾을 수 없습니다
   → DAQ Connection 파일의 'etc' 컬럼에 'driver'가 있는지 확인
   ```

#### 3️⃣ **파일 업로드 순서**
1. **실험 전 데이터 입력 및 저장** (Before 탭)
   - 실험 번호, 날짜, 실험자 등
   - 대기압, 진공 게이지, 드리븐 압력 등
   - **중요**: 반드시 "💾 저장" 버튼 클릭!

2. **데이터 후처리 탭으로 이동** (Processing 탭)

3. **실험 측정 데이터 업로드**
   - 파일 선택 → 상태 확인: `✅ {파일명} (N채널, M샘플)`

4. **DAQ Connection 업로드**
   - 파일 선택 → 상태 확인: `✅ {파일명} (N개 센서)`

5. **1단계 처리 실행**
   - "▶️ 1단계 처리 (필터링까지)" 버튼 클릭
   - 진행 상황 확인

6. **그래프 확인 및 시험시간 조정**
   - 슬라이더로 시작/끝점 조정

7. **2단계 처리 실행**
   - "▶️ 2단계 처리 (최종 측정값 계산)" 버튼 클릭

8. **결과 저장**
   - "💾 후처리 데이터 저장 및 DB에 추가" 버튼 클릭

---

## 🐛 디버깅 가이드

### 파일 업로드가 안 될 때

#### 체크리스트
- [ ] 페이지를 새로고침했는가? (Ctrl+F5 / Cmd+Shift+R)
- [ ] 브라우저 콘솔에 오류가 있는가?
- [ ] XLSX 라이브러리가 로드되었는가? (콘솔에서 `typeof XLSX` 입력 → `"object"` 출력되어야 함)
- [ ] 파일 형식이 `.xlsx` 또는 `.xls`인가?
- [ ] 실험 전 데이터를 저장했는가?

#### 콘솔 디버그 명령어
```javascript
// XLSX 라이브러리 확인
typeof XLSX  // "object"가 출력되어야 함

// 업로드된 데이터 확인
uploadedExpData  // 실험 데이터 객체
uploadedDAQConnection  // DAQ Connection 배열

// 현재 실험 데이터 확인
currentExperiment  // 현재 작업 중인 실험 객체

// 함수 존재 확인
typeof handleExpDataUpload  // "function"이어야 함
typeof handleDAQConnectionUpload  // "function"이어야 함
```

### Driver 압력 강하를 찾을 수 없을 때

#### 원인
1. DAQ Connection에 'driver' 채널이 없음
2. 임계값 계수가 너무 높음 (기본값: 3)
3. 데이터가 너무 노이즈가 많음

#### 해결 방법
1. **DAQ Connection 확인**
   - `etc` 컬럼에 `driver`가 있는 행이 있는지 확인
   - 대소문자 구분 없음 (`Driver`, `DRIVER` 모두 인식)

2. **임계값 계수 조정**
   - Processing 탭의 "Driver 감지 임계값 계수" 값 조정
   - 기본값: 3 → 낮추면 더 민감하게 감지 (예: 2, 1.5)
   - 높이면 큰 변화만 감지 (예: 4, 5)

3. **데이터 확인**
   - 콘솔에서 driver 데이터 확인:
     ```javascript
     const driverCh = uploadedExpData.channels['ch{포트번호}'];
     console.log('Min:', Math.min(...driverCh));
     console.log('Max:', Math.max(...driverCh));
     ```

---

## 📥 데이터 내보내기/불러오기

### 엑셀로 내보내기
1. 상단 "📥 엑셀 내보내기" 버튼 클릭
2. `SHyST_Exp_Check_List_{날짜시간}.xlsx` 파일 다운로드
3. Python 코드의 체크리스트와 동일한 형식

### 엑셀에서 불러오기
1. 상단 "📤 엑셀 불러오기" 버튼 클릭
2. 기존 DB 백업 확인 (자동 백업)
3. 새 엑셀 파일 선택
4. 기존 DB 삭제 및 새 데이터 로드

⚠️ **주의**: 엑셀 불러오기는 기존 DB를 완전히 대체합니다!

---

## 🔄 Python 코드와 동일하게 동작하는지 확인

### 검증 항목

#### 1. Driver 압력 강하 감지
- ✅ 10000개 이동평균 필터
- ✅ 초반 10000개 데이터로 기울기 계산
- ✅ 임계값: `계수 × max(abs(max_gradient), abs(min_gradient))`
- ✅ 전체 데이터에서 감소 시작점 탐색

#### 2. 데이터 슬라이싱
- ✅ -1ms ~ 30ms 구간 추출

#### 3. 전압 → 물리량 변환
- ✅ `a(V-c)`: `a * (V - V0)`
- ✅ `p_t+a(V-c)+b`: `p_t + a * (V - V0) + b`
- ✅ `p_a+aV+b`: `p_a + a*V + b`
- ✅ `E`: E-type 열전대 변환
- ✅ `aV+b`: K-type 열전대 변환
- ✅ V0: 초반 2500개 평균

#### 4. 필터 적용
- ✅ `medtherm thermocouple`: Moving Average (300샘플)
- ✅ `PCB 113B22`: Low Pass Filter (500kHz)
- ✅ `PCB 132B38`: Band Pass Filter (11kHz - 1MHz)

#### 5. Driven 압력 상승 감지
- ✅ driven7, driven8 채널 자동 검색
- ✅ 압력 상승 임계값 계산

#### 6. 시험시간 계산
- ✅ RMS 기반 시작/끝점 자동 선정
- ✅ 수동 조정 가능 (슬라이더)

#### 7. 측정값 계산
- ✅ p1, T1, p4, p4_std, T4, p5, p5_std
- ✅ test_time
- ⚠️ shock_speed (센서 간 거리 정보 필요)

---

## 💡 팁

### 빠른 작업 흐름
1. 이전 실험 데이터가 자동으로 로드됨 (실험 번호와 날짜만 변경하면 됨)
2. 변경된 값만 수정하고 저장
3. Processing 탭에서 파일 업로드 → 처리 → 저장
4. Calculation 탭에서 계산 → 저장
5. Summary 탭에서 보고서 생성

### 키보드 단축키
- `F12`: 개발자 도구 (콘솔)
- `Ctrl+F5` / `Cmd+Shift+R`: 강제 새로고침
- `Ctrl+Shift+I` / `Cmd+Option+I`: 개발자 도구

---

## 📞 문제 해결

문제가 계속되면:
1. 브라우저 콘솔 스크린샷
2. 사용한 파일 (실험 데이터, DAQ Connection)
3. 오류 메시지 전체 복사

위 정보를 함께 제공해주세요!
