/* ══════════════════════════════════
   APP.JS — 탭 전환, 설정 저장, 유틸리티
   ══════════════════════════════════ */

// ─── STORAGE KEYS ───
const STORAGE_KEYS = {
  YT_API_KEY: 'yt_report_yt_api_key',
};

// ─── TAB SWITCHING ───
document.addEventListener('DOMContentLoaded', () => {
  // 탭 전환
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      switchTab(tabId);
    });
  });

  // 저장된 설정 불러오기
  loadSettings();
});

function switchTab(tabId) {
  // 탭 버튼 활성화
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');

  // 탭 콘텐츠 전환
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(`tab-${tabId}`).classList.add('active');

  // 데이터 입력 탭 진입 시 API 키 상태 재확인
  if (tabId === 'input') checkFetchMode();
  // 미리보기 탭 진입 시 자동 렌더링
  if (tabId === 'preview') {
    const data = collectReportData();
    renderPreview(data);
  }
}

function syncAnalyticsFetchArea() {
  const area = document.getElementById('analytics-fetch-area');
  if (!area) return;

  const hasVideos = typeof currentVideos !== 'undefined' && Array.isArray(currentVideos) && currentVideos.length > 0;
  const connected = typeof isOAuthConnected === 'function' && isOAuthConnected();
  area.style.display = hasVideos && connected ? 'block' : 'none';
}

// ─── SETTINGS ───
function loadSettings() {
  const ytKey = localStorage.getItem(STORAGE_KEYS.YT_API_KEY) || '';
  const oauthClientId = localStorage.getItem('yt_report_oauth_client_id') || '';
  document.getElementById('yt-api-key').value = ytKey;
  document.getElementById('oauth-client-id').value = oauthClientId;
  if (ytKey) setStatus('yt-status', '저장된 키가 있습니다', 'success');
  if (typeof oauthAccessToken !== 'undefined' && oauthAccessToken) {
    setStatus('oauth-status', '⚠️ 이전 연동 정보가 있습니다. 만료 시 다시 연동해주세요', '');
  }
  syncAnalyticsFetchArea();
}

function saveSettings() {
  const ytKey = document.getElementById('yt-api-key').value.trim();
  const oauthClientId = document.getElementById('oauth-client-id').value.trim();
  localStorage.setItem(STORAGE_KEYS.YT_API_KEY, ytKey);
  localStorage.setItem('yt_report_oauth_client_id', oauthClientId);
  showToast('설정이 저장되었습니다');
}

function clearSettings() {
  if (!confirm('API 키를 삭제할까요?')) return;
  localStorage.removeItem(STORAGE_KEYS.YT_API_KEY);
  localStorage.removeItem('yt_report_oauth_client_id');
  document.getElementById('yt-api-key').value = '';
  document.getElementById('oauth-client-id').value = '';
  setStatus('yt-status', '', '');
  setStatus('oauth-status', '', '');
  syncAnalyticsFetchArea();
  showToast('설정이 초기화되었습니다');
}

// ─── STATUS HELPER ───
function setStatus(elementId, message, type) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.className = 'api-status';
  if (type) el.classList.add(type);
}

// ─── TOAST ───
let toastTimeout;
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ─── UTILITY FUNCTIONS ───
function formatNumber(n) {
  n = Number(n) || 0;
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '억';
  if (n >= 10000) return (n / 10000).toFixed(1) + '만';
  if (n >= 1000) return n.toLocaleString();
  return n.toString();
}

function calcGrowth(current, previous) {
  if (!previous) return { pct: 0, arrow: '-', isPositive: true };
  const pct = ((current - previous) / previous * 100).toFixed(1);
  return {
    pct: Math.abs(pct),
    arrow: pct > 0 ? '▲' : pct < 0 ? '▼' : '-',
    isPositive: pct >= 0,
  };
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeURL(url) {
  if (!url) return '';
  const s = String(url).trim();
  if (s.startsWith('https://') || s.startsWith('http://')) return s;
  return '';
}

function getStoredValue(key) {
  return localStorage.getItem(key) || '';
}

// ─── ANALYTICS MERGE HELPER ───
// 수동 입력(manualAnalytics) > API(analytics) 우선순위로 병합
function getEffectiveAnalytics(video) {
  const api = video.analytics || {};
  const man = video.manualAnalytics || {};
  const hasApi = video.analytics && Object.keys(api).length > 0;
  const hasManual = video.manualAnalytics && Object.values(man).some(v => v != null);

  if (!hasApi && !hasManual) return null;

  const result = {
    views: api.views || video.views || 0,
    impressions: man.impressions != null ? man.impressions : (api.impressions || null),
    ctr: man.ctr != null ? man.ctr : (api.ctr || null),
    averageViewDuration: man.averageViewDuration != null ? man.averageViewDuration : (api.averageViewDuration || 0),
    averageViewPercentage: man.averageViewPercentage != null ? man.averageViewPercentage : (api.averageViewPercentage || null),
    estimatedMinutesWatched: api.estimatedMinutesWatched || 0,
    subscribersGained: man.subscribersGained != null ? man.subscribersGained : (api.subscribersGained || 0),
    shares: man.shares != null ? man.shares : (api.shares || null),
    retention30s: man.retention30s != null ? man.retention30s : (api.retention30s != null ? api.retention30s : null),
  };

  // API 시청시간이 없으면 수동 데이터로 추정
  if (!result.estimatedMinutesWatched && result.averageViewDuration && result.views) {
    result.estimatedMinutesWatched = Math.round(result.views * result.averageViewDuration / 60);
  }

  return result;
}

// ─── IMAGE COMPRESSION ───
function compressImage(dataUrl, maxWidth, quality, callback) {
  const img = new Image();
  img.onload = function() {
    let w = img.width, h = img.height;
    if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    callback(canvas.toDataURL('image/jpeg', quality));
  };
  img.src = dataUrl;
}

