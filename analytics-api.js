/* ══════════════════════════════════
   ANALYTICS-API.JS — YouTube Analytics API (OAuth 2.0)
   ══════════════════════════════════ */

// ─── OAuth 상태 ───
let oauthTokenClient = null;
let oauthAccessToken = localStorage.getItem('yt_report_oauth_token') || null;

// ─── OAuth 초기화 ───
function initOAuth(clientId) {
  oauthTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/youtube.readonly',
    callback: (response) => {
      if (response.access_token) {
        oauthAccessToken = response.access_token;
        localStorage.setItem('yt_report_oauth_token', response.access_token);
        setStatus('oauth-status', '✅ Google 계정이 연동되었습니다', 'success');
        if (typeof syncAnalyticsFetchArea === 'function') {
          syncAnalyticsFetchArea();
        }
        showToast('Google 계정 연동 완료!');
      }
    },
    error_callback: (error) => {
      setStatus('oauth-status', '❌ 연동 실패: ' + error.message, 'error');
    }
  });
}

function requestOAuthToken() {
  if (!oauthTokenClient) {
    const clientId = document.getElementById('oauth-client-id').value.trim();
    if (!clientId) {
      setStatus('oauth-status', '❌ OAuth Client ID를 입력해주세요', 'error');
      return;
    }
    localStorage.setItem('yt_report_oauth_client_id', clientId);
    initOAuth(clientId);
  }
  oauthTokenClient.requestAccessToken();
}

function revokeOAuthToken() {
  if (oauthAccessToken) {
    google.accounts.oauth2.revoke(oauthAccessToken);
  }
  oauthAccessToken = null;
  localStorage.removeItem('yt_report_oauth_token');
  localStorage.removeItem('yt_report_oauth_client_id');
  setStatus('oauth-status', '연동이 해제되었습니다', '');
  if (typeof syncAnalyticsFetchArea === 'function') {
    syncAnalyticsFetchArea();
  }
  showToast('Google 계정 연동 해제');
}

function isOAuthConnected() {
  return !!oauthAccessToken;
}

// ─── 호출 A: 영상별 기본 분석 (안전한 메트릭만) ───
async function fetchVideoAnalytics(videoIds, startDate, endDate) {
  const ids = videoIds.join(',');
  const url = `https://youtubeanalytics.googleapis.com/v2/reports?` +
    `ids=channel==${currentChannelId}` +
    `&startDate=${startDate}` +
    `&endDate=${endDate}` +
    `&dimensions=video` +
    `&metrics=views,averageViewDuration,estimatedMinutesWatched,subscribersGained,averageViewPercentage,shares` +
    `&filters=video==${ids}` +
    `&sort=-views`;

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${oauthAccessToken}` }
  });

  if (res.status === 401) {
    oauthAccessToken = null;
    localStorage.removeItem('yt_report_oauth_token');
    if (typeof syncAnalyticsFetchArea === 'function') {
      syncAnalyticsFetchArea();
    }
    setStatus('analytics-status',
      '⚠️ 인증이 만료되었습니다.',
      'error'
    );
    const statusEl = document.getElementById('analytics-status');
    if (statusEl) {
      const reAuthBtn = document.createElement('button');
      reAuthBtn.className = 'btn-secondary';
      reAuthBtn.style.cssText = 'margin-left:8px;padding:4px 12px;font-size:12px;';
      reAuthBtn.textContent = '🔗 다시 연동';
      reAuthBtn.onclick = () => requestOAuthToken();
      statusEl.appendChild(reAuthBtn);
    }
    throw new Error('인증이 만료되었습니다. "다시 연동" 버튼을 클릭해주세요.');
  }

  if (res.status === 403) {
    throw new Error('이 채널의 분석 데이터에 접근 권한이 없습니다. 해당 채널의 소유자/관리자 계정으로 Google 연동을 해주세요.');
  }

  if (!res.ok) {
    let message = 'Analytics API 오류';
    try {
      const errorData = await res.json();
      message = errorData?.error?.message || message;
    } catch (_) {}
    throw new Error(message);
  }

  const data = await res.json();
  const result = {};
  if (data.rows) {
    data.rows.forEach(row => {
      result[row[0]] = {
        views: row[1],
        averageViewDuration: row[2],
        estimatedMinutesWatched: row[3],
        subscribersGained: row[4],
        averageViewPercentage: row[5] || 0,
        shares: row[6] || 0
      };
    });
  }
  return result;
}

// ─── 호출 D: 영상별 노출수/CTR (2단계 시도) ───
async function fetchVideoImpressions(videoIds, startDate, endDate) {
  // 방법 1: 배치 호출 (dimensions=video) — 빠르지만 미지원될 수 있음
  try {
    const ids = videoIds.join(',');
    const url = `https://youtubeanalytics.googleapis.com/v2/reports?` +
      `ids=channel==${currentChannelId}` +
      `&startDate=${startDate}` +
      `&endDate=${endDate}` +
      `&dimensions=video` +
      `&metrics=impressions,impressionClickThroughRate` +
      `&filters=video==${ids}` +
      `&sort=-impressions`;

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${oauthAccessToken}` }
    });

    if (res.ok) {
      const data = await res.json();
      if (data.rows && data.rows.length > 0) {
        const result = {};
        data.rows.forEach(row => {
          result[row[0]] = { impressions: row[1] || 0, ctr: row[2] || 0 };
        });
        return result;
      }
    }
  } catch (_) {}

  // 방법 2: 개별 영상별 호출 (dimensions 없이 filter만) — 호환성 높음
  const result = {};
  for (const videoId of videoIds) {
    try {
      const url = `https://youtubeanalytics.googleapis.com/v2/reports?` +
        `ids=channel==${currentChannelId}` +
        `&startDate=${startDate}` +
        `&endDate=${endDate}` +
        `&metrics=impressions,impressionClickThroughRate` +
        `&filters=video==${videoId}`;

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${oauthAccessToken}` }
      });

      if (res.ok) {
        const data = await res.json();
        if (data.rows && data.rows.length > 0) {
          result[videoId] = {
            impressions: data.rows[0][0] || 0,
            ctr: data.rows[0][1] || 0
          };
        }
      }
    } catch (_) {}
  }
  return result;
}

// ─── 호출 B: 영상별 시청지속률 (1건씩) ───
async function fetchRetentionData(videoId, startDate, endDate) {
  const url = `https://youtubeanalytics.googleapis.com/v2/reports?` +
    `ids=channel==${currentChannelId}` +
    `&startDate=${startDate}` +
    `&endDate=${endDate}` +
    `&dimensions=elapsedVideoTimeRatio` +
    `&metrics=audienceWatchRatio,relativeRetentionPerformance` +
    `&filters=video==${videoId};audienceType==ORGANIC`;

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${oauthAccessToken}` }
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.rows || [];
}

// 30초 지점 시청지속률 추출
function getRetentionAt30s(retentionData, durationSeconds) {
  if (!retentionData || !retentionData.length || !durationSeconds) return null;
  const targetRatio = 30 / durationSeconds;
  let closest = retentionData[0];
  let minDiff = Math.abs(retentionData[0][0] - targetRatio);
  for (const row of retentionData) {
    const diff = Math.abs(row[0] - targetRatio);
    if (diff < minDiff) {
      minDiff = diff;
      closest = row;
    }
  }
  return Math.round(closest[1] * 100);
}

// ─── 호출 C: 채널 트래픽 소스 ───
async function fetchTrafficSources(startDate, endDate) {
  const url = `https://youtubeanalytics.googleapis.com/v2/reports?` +
    `ids=channel==${currentChannelId}` +
    `&startDate=${startDate}` +
    `&endDate=${endDate}` +
    `&dimensions=insightTrafficSourceType` +
    `&metrics=views,estimatedMinutesWatched` +
    `&sort=-views`;

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${oauthAccessToken}` }
  });

  if (!res.ok) return [];
  const data = await res.json();
  return data.rows || [];
}

// 트래픽 소스 이름 한글화
function translateTrafficSource(source) {
  const map = {
    'SEARCH': 'YouTube 검색',
    'SUGGESTED': '추천 영상',
    'BROWSE': '탐색(홈/구독)',
    'EXT_URL': '외부 사이트',
    'PLAYLIST': '재생목록',
    'NOTIFICATION': '알림',
    'SUBSCRIBER': '구독 피드',
    'END_SCREEN': '최종 화면',
    'ANNOTATION': '카드/주석',
    'CAMPAIGN_CARD': '캠페인 카드',
    'NO_LINK_OTHER': '기타',
    'SHORTS': '쇼츠 피드',
  };
  return map[source] || source;
}

function describeTrafficSource(source) {
  const map = {
    'SEARCH': '검색 의도가 있는 신규 유입',
    'SUGGESTED': '기존 시청 흐름에서 이어진 추천 유입',
    'BROWSE': '홈/구독 피드에서 노출된 유입',
    'EXT_URL': '커뮤니티, 메신저, 웹사이트 등 외부 유입',
    'PLAYLIST': '재생목록 소비 기반 유입',
    'NOTIFICATION': '알림 반응 기반 유입',
    'SUBSCRIBER': '기존 구독자 기반 유입',
    'END_SCREEN': '기존 영상 종료 후 연결 유입',
    'ANNOTATION': '영상 내 카드/주석 클릭 유입',
    'CAMPAIGN_CARD': '캠페인 카드 유입',
    'NO_LINK_OTHER': '기타 분류 유입',
    'SHORTS': '쇼츠 피드 확산 유입',
  };
  return map[source] || '세부 분류가 제공되지 않은 유입';
}

function normalizeTrafficSources(trafficData) {
  if (!trafficData || !trafficData.length) return [];
  const totalViews = trafficData.reduce((sum, row) => sum + row[1], 0);

  return trafficData.slice(0, 6).map(row => ({
    code: row[0],
    name: translateTrafficSource(row[0]),
    description: describeTrafficSource(row[0]),
    views: row[1],
    minutesWatched: row[2],
    share: totalViews ? ((row[1] / totalViews) * 100) : 0,
  }));
}

function summarizeTrafficSources(trafficData) {
  const items = normalizeTrafficSources(trafficData);
  if (!items.length) return '';

  const top = items[0];
  const second = items[1];
  if (top.share >= 50) {
    return `주요 유입은 ${top.name}(${top.share.toFixed(1)}%)에 집중되어 있으며, ${top.description.toLowerCase()} 성격이 강합니다.`;
  }
  if (second) {
    return `유입은 ${top.name}(${top.share.toFixed(1)}%)와 ${second.name}(${second.share.toFixed(1)}%) 중심으로 분산되어 있습니다.`;
  }
  return `주요 유입 경로는 ${top.name}이며 비중은 ${top.share.toFixed(1)}%입니다.`;
}

// ─── 트래픽 소스 바 차트 렌더링 (데이터 입력 탭) ───
function renderTrafficSources(trafficData) {
  const container = document.getElementById('traffic-sources-display');
  if (!container || !trafficData || !trafficData.length) {
    if (container) container.style.display = 'none';
    return;
  }

  const items = normalizeTrafficSources(trafficData);
  let h = `<div style="font-size:13px;font-weight:600;color:#37352f;margin-bottom:6px;">📡 유입 경로 요약</div>`;
  h += `<div style="padding:10px 12px;background:#fafaf8;border:1px solid #e8e8e4;border-radius:8px;font-size:13px;color:#525048;line-height:1.6;margin-bottom:12px;">${summarizeTrafficSources(trafficData)}</div>`;

  items.forEach(item => {
    const barWidth = Math.round(item.share);
    const watchedHours = ((item.minutesWatched || 0) / 60).toFixed(1);
    h += `<div style="margin-bottom:10px;padding:10px 12px;border:1px solid #ecebe7;border-radius:8px;background:#fff;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:4px;">
        <div>
          <div style="font-size:13px;font-weight:600;color:#37352f;">${item.name}</div>
          <div style="font-size:12px;color:#787774;">${item.description}</div>
        </div>
        <div style="font-size:12px;font-weight:700;color:#37352f;white-space:nowrap;">${item.share.toFixed(1)}%</div>
      </div>
      <div style="background:#f0f0ee;border-radius:4px;height:8px;overflow:hidden;margin-bottom:6px;">
        <div style="background:#2563eb;height:100%;width:${barWidth}%;border-radius:4px;transition:width 0.3s;"></div>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:#525048;">
        <span>조회수 ${formatNumber(item.views)}</span>
        <span>시청시간 ${watchedHours}시간</span>
      </div>
    </div>`;
  });

  container.innerHTML = h;
  container.style.display = 'block';
}

// ─── 통합 호출: "상세 분석 불러오기" ───
async function fetchAllAnalytics() {
  if (!isOAuthConnected()) {
    showToast('Google 계정을 먼저 연동해주세요');
    return;
  }
  if (!currentChannelId) {
    showToast('채널 정보가 없습니다. 먼저 영상을 불러와주세요.');
    return;
  }

  const channelId = currentChannelId;
  const startDate = document.getElementById('input-date-start').value;
  const endDate = document.getElementById('input-date-end').value;
  const videoIds = currentVideos.map(v => v.id).filter(id => !id.startsWith('manual-'));

  if (!videoIds.length) {
    showToast('분석할 영상이 없습니다');
    return;
  }

  const btn = document.querySelector('#analytics-fetch-area button');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ 분석 데이터 불러오는 중...';
  }
  setStatus('analytics-status', '⏳ 분석 데이터를 불러오는 중...', 'loading');

  try {
    // 호출 A: 영상별 기본 분석
    const analytics = await fetchVideoAnalytics(videoIds, startDate, endDate);

    // 각 영상에 분석 데이터 병합
    currentVideos.forEach(v => {
      if (analytics[v.id]) {
        v.analytics = analytics[v.id];
      }
    });

    // 호출 D: 노출수/CTR (별도 호출 — API 미지원 시 자동 스킵)
    const impressionData = await fetchVideoImpressions(videoIds, startDate, endDate);
    const hasImpressions = Object.keys(impressionData).length > 0;
    if (hasImpressions) {
      currentVideos.forEach(v => {
        if (impressionData[v.id] && v.analytics) {
          v.analytics.impressions = impressionData[v.id].impressions;
          v.analytics.ctr = impressionData[v.id].ctr;
        }
      });
    }

    // 호출 B: TOP 영상 시청지속률 (롱폼 TOP 3 + 숏폼 TOP 3)
    const lf = currentVideos.filter(v => v.type === 'long' && v.analytics);
    const sf = currentVideos.filter(v => v.type === 'short' && v.analytics);
    const topVideos = [
      ...lf.sort((a,b) => b.analytics.views - a.analytics.views).slice(0, 3),
      ...sf.sort((a,b) => b.analytics.views - a.analytics.views).slice(0, 3)
    ];

    for (const v of topVideos) {
      const retention = await fetchRetentionData(v.id, startDate, endDate);
      if (retention) {
        v.analytics.retention30s = getRetentionAt30s(retention, v.durationSeconds);
        v.analytics.retentionData = retention;
      }
    }

    // 호출 C: 트래픽 소스
    const trafficData = await fetchTrafficSources(startDate, endDate);

    // 트래픽 소스를 전역에 저장 (보고서에서 사용)
    window.channelTrafficSources = trafficData;

    // UI 업데이트
    renderAllVideos();
    renderTrafficSources(trafficData);
    if (hasImpressions) {
      setStatus('analytics-status', '✅ 분석 데이터를 불러왔습니다 (노출수/CTR 포함)', 'success');
    } else {
      setStatus('analytics-status', '✅ 분석 데이터를 불러왔습니다 (노출수/CTR은 API 미지원)', 'success');
    }
    showToast('상세 분석 데이터 로딩 완료!');

  } catch (e) {
    setStatus('analytics-status', `❌ ${e.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '📊 상세 분석 불러오기';
    }
  }
}
