// ============================================
// 엑셀 Import/Export 핸들러
// SheetJS (xlsx) 라이브러리 사용
// ============================================

// 엑셀로 내보내기 (전체 DB)
async function exportToExcel() {
    try {
        // 모든 실험 데이터 가져오기
        const experiments = await loadAllExperiments();
        
        if (experiments.length === 0) {
            alert('내보낼 실험 데이터가 없습니다.');
            return;
        }
        
        // 실험 번호 순으로 정렬
        experiments.sort((a, b) => a.expNumber - b.expNumber);
        
        console.log(`📥 ${experiments.length}개 실험 데이터 내보내기 시작...`);
        
        // 새 워크북 생성
        const wb = XLSX.utils.book_new();
        
        // Sheet 1: 전체 실험 데이터 (원본 엑셀 형식)
        const allData = createAllExperimentsSheet(experiments);
        const ws1 = XLSX.utils.aoa_to_sheet(allData);
        XLSX.utils.book_append_sheet(wb, ws1, 'Sheet1');
        
        // 파일 다운로드 (날짜+시간)
        const now = new Date();
        const year = now.getFullYear().toString().slice(-2); // 26
        const month = String(now.getMonth() + 1).padStart(2, '0'); // 02
        const day = String(now.getDate()).padStart(2, '0'); // 06
        const hour = String(now.getHours()).padStart(2, '0'); // 16
        const minute = String(now.getMinutes()).padStart(2, '0'); // 17
        const timestamp = `${year}${month}${day}${hour}${minute}`; // 2602061617
        
        const filename = `SHyST_Exp_Check_List_${timestamp}.xlsx`;
        XLSX.writeFile(wb, filename);
        
        console.log(`✅ Excel exported: ${filename} (${experiments.length}개 실험)`);
        alert(`✅ ${experiments.length}개 실험 데이터를 엑셀로 내보냈습니다.\n파일명: ${filename}`);
        
    } catch (e) {
        console.error('Excel export error:', e);
        alert('엑셀 내보내기 실패: ' + e.message);
    }
}

// 전체 실험 데이터 시트 생성 (원본 엑셀 형식)
function createAllExperimentsSheet(experiments) {
    const data = [];
    
    // 헤더 행 (컬럼명)
    const headers = [
        '#', 'name', 'date', 'test model', 'Objective', 'Mach #',
        'air pressure(hpa)', 'air temperature(C)', 'air humidity(%)', 'driver gas', 'booster pressure(bar)',
        'first diaphragm', 'second diaphragm', 'Driven gas', 'aimed driven pressure(barg)', 
        'driven temperature(C)', 'vacuum gauge(Torr)', 'DAQ sampling rate',
        'Schlieren method', 'Schlieren target',
        'camera', 'FPS', 'W', 'H', 'lens focal length', 'Expose time(us)',
        'p1_avg[bar]', 'T1_avg[Celcius]', 'p4_avg[bar]', 'p4_std[bar]', 'T4_avg[Celcius]',
        'p5_avg[bar]', 'p5_std[bar]', 'test_time[ms]', 'shock_speed[m/s]', 
        'output_delay_time[ms]', 'output_ready_time[ms]'
    ];
    
    // Stage 헤더 추가
    const stages = ['Stage 1', 'Stage 2', 'Stage 5', 'Stage 5s', 'Stage 6', 'Stage 7'];
    const stageProps = ['p (Pa)', 'T (K)', 'rho (kg/m**3)', 'u (J/kg)', 'h (J/kg)', 'R (J/(kg.K))', 
                        'gam', 'Cp (J/(kg.K))', 'a (m/s)', 's (J/(kg.K))', 'V (m/s)', 'M'];
    
    stages.forEach(stage => {
        stageProps.forEach(prop => {
            headers.push(`${stage} ${prop}`);
        });
    });
    
    headers.push('Re7', 'h_tot7');
    
    data.push(headers);
    
    // 각 실험 데이터 행 추가
    experiments.forEach(exp => {
        const row = [
            exp.expNumber,
            exp.before.expInfo.name,
            exp.before.expInfo.date,
            exp.before.expInfo.testModel,
            exp.before.expInfo.objective,
            exp.before.expInfo.targetMach,
            exp.before.shystSetting.airPressure,
            exp.before.shystSetting.airTemp,
            exp.before.shystSetting.airHumidity,
            exp.before.shystSetting.driverGas,
            exp.before.shystSetting.boosterPressure,
            exp.before.shystSetting.firstDiaphragm,
            exp.before.shystSetting.secondDiaphragm,
            exp.before.shystSetting.drivenGas,
            exp.before.shystSetting.drivenPressure,
            exp.before.shystSetting.drivenTemp,
            exp.before.shystSetting.vacuumGauge,
            exp.before.shystSetting.daqSampling,
            exp.before.visualizationSetting.method,
            exp.before.visualizationSetting.target,
            exp.before.cameraSetting.model,
            exp.before.cameraSetting.fps,
            exp.before.cameraSetting.width,
            exp.before.cameraSetting.height,
            exp.before.cameraSetting.lensFocal,
            exp.before.cameraSetting.exposeTime,
            exp.after.labviewLog.p1_avg,
            exp.after.labviewLog.t1_avg,
            exp.after.labviewLog.p4_avg,
            exp.after.labviewLog.p4_std,
            exp.after.labviewLog.t4_avg,
            exp.after.labviewLog.p5_avg,
            exp.after.labviewLog.p5_std,
            exp.after.labviewLog.testTime,
            exp.after.labviewLog.shockSpeed,
            exp.after.labviewLog.outputDelayTime,
            exp.after.labviewLog.outputReadyTime
        ];
        
        // Stage 데이터 추가
        const stageKeys = ['stage1', 'stage2', 'stage5', 'stage5s', 'stage6', 'stage7'];
        stageKeys.forEach(stageKey => {
            const stage = exp.calculation.stages[stageKey];
            if (stage) {
                row.push(
                    stage.p, stage.t, stage.rho, stage.u, stage.h, stage.R,
                    stage.gamma, stage.cp, stage.a, stage.s, stage.V, stage.M
                );
            } else {
                // 빈 값 12개
                for (let i = 0; i < 12; i++) row.push('');
            }
        });
        
        // Re7, h_tot7
        const stage7 = exp.calculation.stages.stage7;
        // Re_unit은 이미 /m 단위 (×10⁶으로 나눈 값)
        row.push(stage7 && stage7.Re_unit ? stage7.Re_unit * 1e6 : '');
        // h_total은 MJ/kg 단위이므로 J/kg로 변환
        row.push(stage7 && stage7.h_total ? stage7.h_total * 1e6 : '');
        
        data.push(row);
    });
    
    return data;
}

// Before Experiment 시트 생성
function createBeforeSheet() {
    const before = currentExperiment.before;
    
    return [
        ['SHyST 실험 체크리스트 - Before Experiment'],
        [],
        ['실험 정보 (Exp Info)'],
        ['실험 번호', currentExperiment.expNumber],
        ['실험자 이름', before.expInfo.name],
        ['날짜', before.expInfo.date],
        ['테스트 모델', before.expInfo.testModel],
        ['실험 목적', before.expInfo.objective],
        ['목표 마하수', before.expInfo.targetMach],
        [],
        ['SHyST 설정'],
        ['대기압 [hPa]', before.shystSetting.airPressure],
        ['대기 온도 [°C]', before.shystSetting.airTemp],
        ['대기 습도 [%]', before.shystSetting.airHumidity],
        ['드라이버 가스', before.shystSetting.driverGas],
        ['부스터 압력 [bar]', before.shystSetting.boosterPressure],
        ['1차 격막', before.shystSetting.firstDiaphragm],
        ['2차 격막', before.shystSetting.secondDiaphragm],
        ['드리븐 가스', before.shystSetting.drivenGas],
        ['드리븐 압력 [barg]', before.shystSetting.drivenPressure],
        ['드리븐 온도 [°C]', before.shystSetting.drivenTemp],
        ['진공 게이지 [Torr]', before.shystSetting.vacuumGauge],
        ['DAQ 샘플링 레이트 [Hz]', before.shystSetting.daqSampling],
        [],
        ['시각화 설정 (Visualization Setting)'],
        ['방법', before.visualizationSetting.method],
        ['타겟', before.visualizationSetting.target],
        [],
        ['카메라 설정'],
        ['카메라 모델', before.cameraSetting.model],
        ['FPS', before.cameraSetting.fps],
        ['해상도 W', before.cameraSetting.width],
        ['해상도 H', before.cameraSetting.height],
        ['렌즈 초점거리', before.cameraSetting.lensFocal],
        ['노출 시간 [μs]', before.cameraSetting.exposeTime]
    ];
}

// After Experiment 시트 생성
function createAfterSheet() {
    const after = currentExperiment.after;
    
    return [
        ['SHyST 실험 체크리스트 - After Experiment'],
        [],
        ['LabVIEW Log'],
        ['p1 평균 [bar]', after.labviewLog.p1_avg],
        ['T1 평균 [°C]', after.labviewLog.t1_avg],
        ['p4 평균 [bar]', after.labviewLog.p4_avg],
        ['p4 표준편차 [bar]', after.labviewLog.p4_std],
        ['T4 평균 [°C]', after.labviewLog.t4_avg],
        ['p5 평균 [bar]', after.labviewLog.p5_avg],
        ['p5 표준편차 [bar]', after.labviewLog.p5_std],
        ['시험시간 [ms]', after.labviewLog.testTime],
        ['충격파 속도 [m/s]', after.labviewLog.shockSpeed]
    ];
}

// ESTCN 시트 생성
function createESTCNSheet() {
    const stages = currentExperiment.calculation.stages;
    
    const data = [
        ['SHyST 실험 - 계산된 유동 조건 (ESTCN)'],
        [],
        ['Property', 'Stage 1', 'Stage 2', 'Stage 5', 'Stage 7'],
    ];
    
    const properties = [
        { key: 'p', label: 'p [Pa]', unit: 1 },
        { key: 'p', label: 'p [bar]', unit: 1e-5 },
        { key: 't', label: 'T [K]', unit: 1 },
        { key: 'rho', label: 'ρ [kg/m³]', unit: 1 },
        { key: 'u', label: 'u [m/s]', unit: 1 },
        { key: 'a', label: 'a [m/s]', unit: 1 },
        { key: 'gamma', label: 'γ', unit: 1 },
        { key: 'cp', label: 'Cp [J/kg·K]', unit: 1 }
    ];
    
    properties.forEach(prop => {
        const row = [prop.label];
        
        ['stage1', 'stage2', 'stage5', 'stage7'].forEach(stageKey => {
            const stage = stages[stageKey];
            if (stage && stage[prop.key] !== undefined) {
                row.push((stage[prop.key] * prop.unit).toFixed(prop.key === 'gamma' || prop.key === 'cp' ? 4 : 2));
            } else {
                row.push('-');
            }
        });
        
        data.push(row);
    });
    
    // Stage 7 추가 정보
    if (stages.stage7) {
        data.push([]);
        data.push(['Stage 7 추가 정보']);
        data.push(['마하수 M', stages.stage7.M ? stages.stage7.M.toFixed(2) : '-']);
        data.push(['레이놀즈수 Re/m [×10⁶]', stages.stage7.Re_unit ? (stages.stage7.Re_unit * 1e6).toFixed(2) : '-']);
        data.push(['토탈 엔탈피 h_tot [MJ/kg]', stages.stage7.h_total ? stages.stage7.h_total.toFixed(3) : '-']);
    }
    
    return data;
}

// 엑셀에서 불러오기 (DB 대체)
async function importFromExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        // 1단계: 기존 DB 백업
        const experiments = await loadAllExperiments();
        
        if (experiments.length > 0) {
            const confirmed = confirm(
                `⚠️ 엑셀 불러오기는 기존 DB를 완전히 대체합니다!\n\n` +
                `현재 DB: ${experiments.length}개 실험\n\n` +
                `계속하기 전에 기존 DB를 백업하시겠습니까?\n` +
                `(확인 = 백업 후 진행, 취소 = 중단)`
            );
            
            if (!confirmed) {
                event.target.value = '';
                return;
            }
            
            // 자동 백업
            console.log('📥 기존 DB 백업 중...');
            await exportToExcel(); // 기존 DB를 엑셀로 다운로드
            
            // 백업 완료 후 잠시 대기
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const proceed = confirm(
                `✅ 기존 DB가 백업되었습니다.\n\n` +
                `이제 새 엑셀 파일로 DB를 대체하시겠습니까?\n` +
                `(기존 ${experiments.length}개 실험이 삭제됩니다)`
            );
            
            if (!proceed) {
                event.target.value = '';
                return;
            }
        }
        
        // 2단계: 엑셀 파일 읽기
        console.log('📂 엑셀 파일 읽는 중...');
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data, { type: 'array' });
        
        // Sheet1 읽기 (전체 실험 데이터)
        const sheetName = wb.SheetNames[0]; // 첫 번째 시트
        const ws = wb.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 });
        
        if (jsonData.length < 2) {
            throw new Error('엑셀 파일이 비어있거나 형식이 잘못되었습니다.');
        }
        
        // 3단계: 기존 DB 삭제
        console.log('🗑️  기존 DB 삭제 중...');
        for (const exp of experiments) {
            await deleteExperiment(exp.id);
        }
        
        // 4단계: 새 데이터 파싱 및 저장
        console.log('💾 새 데이터 저장 중...');
        const newExperiments = parseExcelToExperiments(jsonData);
        
        let imported = 0;
        for (const exp of newExperiments) {
            try {
                await saveExperiment(exp);
                imported++;
                console.log(`✅ 실험 #${exp.expNumber} 저장 완료`);
            } catch (e) {
                console.error(`❌ 실험 #${exp.expNumber} 저장 실패:`, e);
            }
        }
        
        console.log(`\n🎉 엑셀 불러오기 완료!`);
        console.log(`   - 삭제: ${experiments.length}개`);
        console.log(`   - 새로 저장: ${imported}개`);
        
        alert(
            `✅ 엑셀 불러오기 완료!\n\n` +
            `- 기존 실험: ${experiments.length}개 삭제\n` +
            `- 새 실험: ${imported}개 저장\n\n` +
            `페이지를 새로고침합니다.`
        );
        
        // 페이지 새로고침
        location.reload();
        
    } catch (e) {
        console.error('Excel import error:', e);
        alert(`❌ 엑셀 불러오기 실패:\n${e.message}`);
    }
    
    // 파일 입력 초기화
    event.target.value = '';
}

// 엑셀 데이터를 실험 객체 배열로 변환
function parseExcelToExperiments(jsonData) {
    const experiments = [];
    
    // 첫 행은 헤더
    const headers = jsonData[0];
    
    // 2행부터 데이터
    for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        
        // 빈 행 건너뛰기
        if (!row[0]) continue;
        
        const exp = {
            id: null,
            expNumber: row[0],
            status: 'completed',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            
            before: {
                expInfo: {
                    name: row[1] || '',
                    date: row[2] || '',
                    testModel: row[3] || '',
                    objective: row[4] || '',
                    targetMach: parseFloat(row[5]) || null
                },
                shystSetting: {
                    airPressure: parseFloat(row[6]) || null,
                    airTemp: parseFloat(row[7]) || null,
                    airHumidity: parseFloat(row[8]) || null,
                    driverGas: row[9] || '',
                    boosterPressure: parseFloat(row[10]) || null,
                    firstDiaphragm: row[11] || '',
                    secondDiaphragm: row[12] || '',
                    drivenGas: row[13] || 'air',
                    drivenPressure: parseFloat(row[14]) || null,
                    drivenTemp: parseFloat(row[15]) || null,
                    vacuumGauge: parseFloat(row[16]) || null,
                    daqSampling: parseFloat(row[17]) || 1000000
                },
                visualizationSetting: {
                    method: row[18] || 'Z-type Schlieren',
                    target: row[19] || ''
                },
                cameraSetting: {
                    model: row[20] || '',
                    fps: parseFloat(row[21]) || null,
                    width: parseInt(row[22]) || null,
                    height: parseInt(row[23]) || null,
                    lensFocal: row[24] || '',
                    exposeTime: parseFloat(row[25]) || null
                }
            },
            
            after: {
                labviewLog: {
                    p1_avg: parseFloat(row[26]) || null,
                    t1_avg: parseFloat(row[27]) || null,
                    p4_avg: parseFloat(row[28]) || null,
                    p4_std: parseFloat(row[29]) || null,
                    t4_avg: parseFloat(row[30]) || null,
                    p5_avg: parseFloat(row[31]) || null,
                    p5_std: parseFloat(row[32]) || null,
                    testTime: parseFloat(row[33]) || null,
                    shockSpeed: parseFloat(row[34]) || null,
                    outputDelayTime: parseFloat(row[35]) || null,
                    outputReadyTime: parseFloat(row[36]) || null
                },
                rawDataFiles: [],
                sensorCalibrations: [],
                selectedTestTime: {
                    start: null,
                    end: null,
                    duration: parseFloat(row[33]) || null
                }
            },
            
            calculation: {
                method: 'estcn',
                stages: {}
            }
        };
        
        // Stage 데이터 파싱 (37번 컬럼부터)
        let colIndex = 37;
        const stageKeys = ['stage1', 'stage2', 'stage5', 'stage5s', 'stage6', 'stage7'];
        
        stageKeys.forEach(stageKey => {
            const stage = {
                p: parseFloat(row[colIndex]) || null,
                t: parseFloat(row[colIndex + 1]) || null,
                rho: parseFloat(row[colIndex + 2]) || null,
                u: parseFloat(row[colIndex + 3]) || null,
                h: parseFloat(row[colIndex + 4]) || null,
                R: parseFloat(row[colIndex + 5]) || null,
                gamma: parseFloat(row[colIndex + 6]) || null,
                cp: parseFloat(row[colIndex + 7]) || null,
                a: parseFloat(row[colIndex + 8]) || null,
                s: parseFloat(row[colIndex + 9]) || null,
                V: parseFloat(row[colIndex + 10]) || null,
                M: parseFloat(row[colIndex + 11]) || null
            };
            
            // Stage 7에 Re7, h_tot7 추가
            if (stageKey === 'stage7') {
                const Re7_per_m = parseFloat(row[colIndex + 12]) || null;
                const h_tot7_J = parseFloat(row[colIndex + 13]) || null;
                
                // Re_unit: /m 단위를 ×10⁶으로 나눈 값으로 저장
                if (Re7_per_m) stage.Re_unit = Re7_per_m / 1e6;
                // h_total: J/kg를 MJ/kg로 변환하여 저장
                if (h_tot7_J) stage.h_total = h_tot7_J / 1e6;
            }
            
            exp.calculation.stages[stageKey] = stage.p ? stage : null;
            colIndex += 12;
        });
        
        experiments.push(exp);
    }
    
    return experiments;
}

// Before 시트 파싱
function parseBeforeSheet(data) {
    if (!currentExperiment) {
        currentExperiment = createExperimentData();
    }
    
    // 간단한 키-값 매핑 (실제로는 더 정교한 파싱 필요)
    const mapping = {
        '실험 번호': (val) => currentExperiment.expNumber = val,
        '실험자 이름': (val) => currentExperiment.before.expInfo.name = val,
        '날짜': (val) => currentExperiment.before.expInfo.date = val,
        '테스트 모델': (val) => currentExperiment.before.expInfo.testModel = val,
        '실험 목적': (val) => currentExperiment.before.expInfo.objective = val,
        '목표 마하수': (val) => currentExperiment.before.expInfo.targetMach = parseFloat(val),
        '대기압 [hPa]': (val) => currentExperiment.before.shystSetting.airPressure = parseFloat(val),
        '대기 온도 [°C]': (val) => currentExperiment.before.shystSetting.airTemp = parseFloat(val),
        '대기 습도 [%]': (val) => currentExperiment.before.shystSetting.airHumidity = parseFloat(val),
        '드라이버 가스': (val) => currentExperiment.before.shystSetting.driverGas = val,
        '부스터 압력 [bar]': (val) => currentExperiment.before.shystSetting.boosterPressure = parseFloat(val),
        '1차 격막': (val) => currentExperiment.before.shystSetting.firstDiaphragm = val,
        '2차 격막': (val) => currentExperiment.before.shystSetting.secondDiaphragm = val,
        '드리븐 가스': (val) => currentExperiment.before.shystSetting.drivenGas = val,
        '드리븐 압력 [barg]': (val) => currentExperiment.before.shystSetting.drivenPressure = parseFloat(val),
        '드리븐 온도 [°C]': (val) => currentExperiment.before.shystSetting.drivenTemp = parseFloat(val),
        '진공 게이지 [Torr]': (val) => currentExperiment.before.shystSetting.vacuumGauge = parseFloat(val),
        'DAQ 샘플링 레이트 [Hz]': (val) => currentExperiment.before.shystSetting.daqSampling = parseFloat(val),
        '방법': (val) => currentExperiment.before.visualizationSetting.method = val,
        '타겟': (val) => currentExperiment.before.visualizationSetting.target = val,
        '카메라 모델': (val) => currentExperiment.before.cameraSetting.model = val,
        'FPS': (val) => currentExperiment.before.cameraSetting.fps = parseFloat(val),
        '해상도 W': (val) => currentExperiment.before.cameraSetting.width = parseInt(val),
        '해상도 H': (val) => currentExperiment.before.cameraSetting.height = parseInt(val),
        '렌즈 초점거리': (val) => currentExperiment.before.cameraSetting.lensFocal = val,
        '노출 시간 [μs]': (val) => currentExperiment.before.cameraSetting.exposeTime = parseFloat(val)
    };
    
    data.forEach(row => {
        if (row.length >= 2) {
            const key = row[0];
            const value = row[1];
            
            if (mapping[key] && value !== undefined && value !== '') {
                mapping[key](value);
            }
        }
    });
}

// After 시트 파싱
function parseAfterSheet(data) {
    if (!currentExperiment) {
        currentExperiment = createExperimentData();
    }
    
    const mapping = {
        'p1 평균 [bar]': (val) => currentExperiment.after.labviewLog.p1_avg = parseFloat(val),
        'T1 평균 [°C]': (val) => currentExperiment.after.labviewLog.t1_avg = parseFloat(val),
        'p4 평균 [bar]': (val) => currentExperiment.after.labviewLog.p4_avg = parseFloat(val),
        'p4 표준편차 [bar]': (val) => currentExperiment.after.labviewLog.p4_std = parseFloat(val),
        'T4 평균 [°C]': (val) => currentExperiment.after.labviewLog.t4_avg = parseFloat(val),
        'p5 평균 [bar]': (val) => currentExperiment.after.labviewLog.p5_avg = parseFloat(val),
        'p5 표준편차 [bar]': (val) => currentExperiment.after.labviewLog.p5_std = parseFloat(val),
        '시험시간 [ms]': (val) => currentExperiment.after.labviewLog.testTime = parseFloat(val),
        '충격파 속도 [m/s]': (val) => currentExperiment.after.labviewLog.shockSpeed = parseFloat(val)
    };
    
    data.forEach(row => {
        if (row.length >= 2) {
            const key = row[0];
            const value = row[1];
            
            if (mapping[key] && value !== undefined && value !== '') {
                mapping[key](value);
            }
        }
    });
}
