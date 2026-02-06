// ============================================
// 엑셀에서 변환된 JSON 데이터를 IndexedDB로 가져오기
// ============================================

async function importExperimentsFromJSON() {
    try {
        console.log('📥 실험 데이터 가져오기 시작...');
        
        // JSON 파일 로드
        const response = await fetch('experiments_data.json');
        if (!response.ok) {
            throw new Error('JSON 파일을 찾을 수 없습니다.');
        }
        
        const experiments = await response.json();
        console.log(`📦 ${experiments.length}개 실험 데이터 로드 완료`);
        
        // 데이터베이스 초기화 대기
        if (!db) {
            await initDatabase();
        }
        
        // 기존 데이터 확인
        const existingExperiments = await loadAllExperiments();
        const existingNumbers = new Set(existingExperiments.map(e => e.expNumber));
        
        let imported = 0;
        let skipped = 0;
        
        // 각 실험 데이터 저장
        for (const exp of experiments) {
            // 이미 존재하는 실험 번호는 건너뛰기
            if (existingNumbers.has(exp.expNumber)) {
                console.log(`⏭️  실험 #${exp.expNumber} 이미 존재 - 건너뜀`);
                skipped++;
                continue;
            }
            
            try {
                await saveExperiment(exp);
                console.log(`✅ 실험 #${exp.expNumber} 저장 완료`);
                imported++;
            } catch (e) {
                console.error(`❌ 실험 #${exp.expNumber} 저장 실패:`, e);
            }
        }
        
        console.log(`\n🎉 가져오기 완료!`);
        console.log(`   - 새로 저장: ${imported}개`);
        console.log(`   - 건너뜀: ${skipped}개`);
        console.log(`   - 총 실험: ${(await loadAllExperiments()).length}개`);
        
        return { imported, skipped, total: imported + skipped };
        
    } catch (e) {
        console.error('❌ 데이터 가져오기 실패:', e);
        throw e;
    }
}

// 데이터 가져오기 UI 함수
async function showImportDialog() {
    const confirmed = confirm(
        '엑셀에서 변환된 실험 데이터(1~161번)를 데이터베이스에 가져오시겠습니까?\n\n' +
        '이미 존재하는 실험은 건너뛰고, 새로운 실험만 추가됩니다.'
    );
    
    if (!confirmed) return;
    
    try {
        const result = await importExperimentsFromJSON();
        
        alert(
            `✅ 데이터 가져오기 완료!\n\n` +
            `- 새로 저장: ${result.imported}개\n` +
            `- 건너뜀: ${result.skipped}개\n` +
            `- 총 실험: ${result.total}개`
        );
        
        // 실험 목록 새로고침
        if (typeof refreshExperimentList === 'function') {
            await refreshExperimentList();
        }
        
    } catch (e) {
        alert(`❌ 데이터 가져오기 실패:\n${e.message}`);
    }
}
