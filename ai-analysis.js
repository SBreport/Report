/* ══════════════════════════════════
   AI-ANALYSIS.JS — Claude API 기반 AI 분석
   Anthropic API를 사용하여 콘텐츠 성과 코멘트, 전략, 종합 의견 자동 생성
   ══════════════════════════════════ */

// ─── AI API 설정 저장/불러오기 ───
function saveAISettings() {
  const key = document.getElementById('claude-api-key')?.value?.trim();
  if (key) {
    localStorage.setItem('yt_report_claude_api_key', key);
  }
}

function loadAISettings() {
  const key = localStorage.getItem('yt_report_claude_api_key');
  if (key) {
    const input = document.getElementById('claude-api-key');
    if (input) input.value = key;
  }
}

// 기존 saveSettings/loadSettings에 AI 설정도 포함
document.addEventListener('DOMContentLoaded', () => {
  loadAISettings();

  // 기존 saveSettings를 확장
  const origSave = window.saveSettings;
  window.saveSettings = function () {
    saveAISettings();
    if (origSave) origSave();
  };
});

// ─── Claude API 호출 ───
async function callClaudeAPI(prompt, maxTokens = 1500) {
  const apiKey = document.getElementById('claude-api-key')?.value?.trim() ||
    localStorage.getItem('yt_report_claude_api_key');

  if (!apiKey) {
    showToast('⚠️ 설정 탭에서 Claude API 키를 먼저 입력해주세요.');
    return null;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    if (response.status === 401) {
      throw new Error('API 키가 올바르지 않습니다. 설정 탭에서 확인해주세요.');
    }
    throw new Error(err?.error?.message || `API 오류 (${response.status})`);
  }

  const result = await response.json();
  return result.content?.[0]?.text?.trim() || '';
}

// ─── 현재 보고서 데이터를 요약 텍스트로 변환 ───
function buildDataSummary() {
  const lf = currentVideos.filter(v => v.type === 'long');
  const sf = currentVideos.filter(v => v.type === 'short');
  const lfTop = lf.length ? lf.reduce((a, b) => a.views > b.views ? a : b) : null;
  const sfTop = sf.length ? sf.reduce((a, b) => a.views > b.views ? a : b) : null;

  const totalViews = document.getElementById('stat-views')?.value || '0';
  const subs = document.getElementById('stat-subs')?.value || '0';
  const watchHours = document.getElementById('stat-watch')?.value || '0';
  const year = document.getElementById('input-year')?.value || '';
  const month = document.getElementById('input-month')?.value || '';

  let summary = `[${year}년 ${parseInt(month)}월 채널 데이터]\n`;
  summary += `- 채널 총 조회수: ${Number(totalViews).toLocaleString()}\n`;
  summary += `- 구독자 수: ${Number(subs).toLocaleString()}\n`;
  summary += `- 총 시청시간: ${Number(watchHours).toLocaleString()}시간\n`;
  summary += `- 롱폼 영상: ${lf.length}개\n`;
  summary += `- 숏폼 영상: ${sf.length}개\n`;

  if (lf.length > 0) {
    const lfViews = lf.reduce((s, v) => s + (v.views || 0), 0);
    const lfAvg = Math.round(lfViews / lf.length);
    summary += `- 롱폼 총 조회수: ${lfViews.toLocaleString()} (평균 ${lfAvg.toLocaleString()})\n`;
  }
  if (sf.length > 0) {
    const sfViews = sf.reduce((s, v) => s + (v.views || 0), 0);
    const sfAvg = Math.round(sfViews / sf.length);
    summary += `- 숏폼 총 조회수: ${sfViews.toLocaleString()} (평균 ${sfAvg.toLocaleString()})\n`;
  }

  if (lfTop) {
    summary += `- 롱폼 TOP 영상: "${lfTop.title}" (조회수 ${(lfTop.views || 0).toLocaleString()}, 좋아요 ${(lfTop.likes || 0).toLocaleString()})\n`;
  }
  if (sfTop) {
    summary += `- 숏폼 TOP 영상: "${sfTop.title}" (조회수 ${(sfTop.views || 0).toLocaleString()}, 좋아요 ${(sfTop.likes || 0).toLocaleString()})\n`;
  }

  // 개별 영상 목록
  if (lf.length > 0) {
    summary += `\n[롱폼 영상 목록]\n`;
    lf.sort((a, b) => (b.views || 0) - (a.views || 0)).forEach((v, i) => {
      summary += `${i + 1}. "${v.title}" — 조회수 ${(v.views || 0).toLocaleString()}, 좋아요 ${(v.likes || 0).toLocaleString()}, 댓글 ${(v.comments || 0).toLocaleString()}\n`;
    });
  }
  if (sf.length > 0) {
    summary += `\n[숏폼 영상 목록]\n`;
    sf.sort((a, b) => (b.views || 0) - (a.views || 0)).forEach((v, i) => {
      summary += `${i + 1}. "${v.title}" — 조회수 ${(v.views || 0).toLocaleString()}, 좋아요 ${(v.likes || 0).toLocaleString()}, 댓글 ${(v.comments || 0).toLocaleString()}\n`;
    });
  }

  return summary;
}

// ─── AI 콘텐츠 성과 코멘트 생성 ───
async function generateAIComment() {
  if (currentVideos.length === 0) {
    showToast('⚠️ 영상 데이터를 먼저 불러와주세요.');
    return;
  }

  const btn = document.getElementById('btn-ai-comment');
  const origText = btn.textContent;
  btn.textContent = '⏳ 분석 중...';
  btn.disabled = true;

  try {
    const dataSummary = buildDataSummary();
    const prompt = `당신은 유튜브 채널 운영 전문 분석가입니다.
아래 유튜브 채널의 이번 달 데이터를 분석하여 '콘텐츠 성과 분석 코멘트'를 작성해주세요.

${dataSummary}

작성 규칙:
- 2~3문장으로 간결하게 작성
- 이번 달 핵심 성과가 무엇인지 분석
- 어떤 콘텐츠(주제/형태)가 잘 되었는지 구체적으로 언급
- 보고서에 바로 넣을 수 있는 전문적인 톤으로 작성 (존댓말 사용)
- 불필요한 인사말이나 서론 없이 바로 분석 내용만 작성`;

    const result = await callClaudeAPI(prompt, 500);
    if (result) {
      document.getElementById('input-best-reason').value = result;
      showToast('✅ AI 성과 코멘트가 생성되었습니다.');
    }
  } catch (e) {
    showToast(`❌ ${e.message}`);
  } finally {
    btn.textContent = origText;
    btn.disabled = false;
  }
}

// ─── AI 전략 + 종합 의견 생성 ───
async function generateAIStrategy() {
  const claudeKey = localStorage.getItem('yt_report_claude_api_key') ||
    document.getElementById('claude-api-key')?.value?.trim();

  if (!claudeKey) {
    // Claude API 키 없으면 기존 단순 로직으로 폴백
    generateAutoStrategy();
    return;
  }

  if (currentVideos.length === 0) {
    showToast('⚠️ 영상 데이터를 먼저 불러와주세요.');
    return;
  }

  // 데이터 수집
  const data = collectReportData();
  const lf = currentVideos.filter(v => v.type === 'long');
  const sf = currentVideos.filter(v => v.type === 'short');
  const lfTop = lf.length ? lf.reduce((a, b) => a.views > b.views ? a : b) : null;
  const sfTop = sf.length ? sf.reduce((a, b) => a.views > b.views ? a : b) : null;
  const lfStats = calcTypeStats(lf);
  const sfStats = calcTypeStats(sf);

  // 증감 정보
  let growthInfo = '전월 데이터 없음 (첫 보고)';
  if (data.prevTotalViews !== null) {
    const g = calcGrowth(data.totalViews, data.prevTotalViews);
    growthInfo = `${g.arrow} ${g.pct}%`;
  }

  // 분석 데이터 요약 (있을 때만)
  let analyticsInfo = '';
  if (lfTop?.analytics) {
    const a = lfTop.analytics;
    analyticsInfo += `\n- 롱폼 TOP 평균시청: ${Math.floor(a.averageViewDuration / 60)}분${a.averageViewDuration % 60}초`;
    if (a.retention30s) analyticsInfo += `\n- 롱폼 TOP 30초 유지율: ${a.retention30s}%`;
  }

  // 트래픽 소스 요약
  let trafficInfo = '';
  if (window.channelTrafficSources?.length) {
    const total = window.channelTrafficSources.reduce((s, r) => s + r[1], 0);
    trafficInfo = '\n\n## 트래픽 소스\n';
    window.channelTrafficSources.slice(0, 5).forEach(row => {
      const name = typeof translateTrafficSource === 'function' ? translateTrafficSource(row[0]) : row[0];
      const pct = ((row[1] / total) * 100).toFixed(1);
      trafficInfo += `- ${name}: ${pct}%\n`;
    });
  }

  // 프롬프트 구성
  const prompt = `당신은 유튜브 채널 성장 전문 컨설턴트입니다.
아래 이번 달 채널 데이터를 분석하고, 다음 달 콘텐츠 전략을 3~4가지 구체적으로 제안해주세요.
각 전략은 데이터 근거를 포함하고, 실행 가능한 수준으로 구체적이어야 합니다.

## 채널 정보
- 채널명: ${data.clientName || '미입력'}
- 보고 기간: ${data.reportMonth}
- 총 조회수: ${formatNumber(data.totalViews)} (전월 대비: ${growthInfo})
- 구독자: ${formatNumber(data.subscribers)}

## 롱폼 성과 (${lf.length}개)
- 총 조회수: ${formatNumber(lfStats.views)}, 평균 조회수: ${formatNumber(lfStats.avgViews)}
- TOP: "${lfTop?.title || '없음'}" (조회수 ${formatNumber(lfTop?.views || 0)})

## 숏폼 성과 (${sf.length}개)
- 총 조회수: ${formatNumber(sfStats.views)}, 평균 조회수: ${formatNumber(sfStats.avgViews)}
- TOP: "${sfTop?.title || '없음'}" (조회수 ${formatNumber(sfTop?.views || 0)})
${analyticsInfo}${trafficInfo}
---
반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만:
{
  "strategies": [
    { "title": "전략 제목 (15자 이내)", "description": "구체적 실행 방안 2~3문장. 데이터 근거 포함." }
  ],
  "comment": "콘텐츠 성과 분석 코멘트 2~3문장. 이번 달 핵심 성과와 잘된 콘텐츠 분석.",
  "summary": "종합 의견 3~4문장. 이번 달 성과 해석 + 다음 달 방향성 제시."
}`;

  // 로딩 상태
  const btn = document.getElementById('btn-ai-strategy');
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '🔄 AI가 분석 중...';

  try {
    const text = await callClaudeAPI(prompt, 1500);
    if (!text) return;

    // JSON 파싱 (```json ... ``` 감싸기 대응)
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    // 기존 전략 초기화
    strategies = [];
    document.getElementById('strategy-list').innerHTML = '';
    strategyCounter = 0;

    // AI 전략 채우기
    if (parsed.strategies && Array.isArray(parsed.strategies)) {
      parsed.strategies.forEach(s => {
        addStrategy(s.title || '', s.description || '');
      });
    }

    // 성과 코멘트
    if (parsed.comment) {
      document.getElementById('input-best-reason').value = parsed.comment;
    }

    // 종합 의견
    if (parsed.summary) {
      document.getElementById('input-next-note').value = parsed.summary;
    }

    showToast('✅ AI 전략 제안이 생성되었습니다!');

  } catch (e) {
    console.error('AI 전략 생성 실패:', e);
    showToast(`❌ AI 제안 실패: ${e.message}. 기본 제안으로 대체합니다.`);
    // 폴백: 기존 단순 로직
    generateAutoStrategy();
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

// ─── AI API 테스트 ───
async function testAIAPI() {
  const btn = document.getElementById('ai-test-btn');
  const status = document.getElementById('ai-status');
  const origText = btn.textContent;
  btn.textContent = '테스트 중...';
  btn.disabled = true;

  try {
    const result = await callClaudeAPI('테스트입니다. "연결 성공"이라고만 답해주세요.', 50);
    if (result) {
      status.textContent = '✅ Claude API 연결 성공';
      status.style.color = '#16a34a';
      saveAISettings();
    }
  } catch (e) {
    status.textContent = `❌ ${e.message}`;
    status.style.color = '#dc2626';
  } finally {
    btn.textContent = origText;
    btn.disabled = false;
  }
}
