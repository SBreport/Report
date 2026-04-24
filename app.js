/* ══════════════════════════════════
   APP.JS — 탭 전환, 설정 저장, 유틸리티
   ══════════════════════════════════ */

// ─── STORAGE KEYS ───
const STORAGE_KEYS = {
  YT_API_KEY: 'yt_report_yt_api_key',
  REPORT_DATA: 'yt_report_data',       // 월별 보고서 데이터
  PREV_MONTH: 'yt_report_prev_month',  // 지난 달 성과
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

function getStoredValue(key) {
  return localStorage.getItem(key) || '';
}

// ─── 월별 데이터 저장/불러오기 ───
function saveMonthData(yearMonth, data) {
  // yearMonth: "2025-03" 형식
  const allData = JSON.parse(localStorage.getItem(STORAGE_KEYS.REPORT_DATA) || '{}');
  allData[yearMonth] = data;
  localStorage.setItem(STORAGE_KEYS.REPORT_DATA, JSON.stringify(allData));
}

function loadMonthData(yearMonth) {
  const allData = JSON.parse(localStorage.getItem(STORAGE_KEYS.REPORT_DATA) || '{}');
  return allData[yearMonth] || null;
}

function getPreviousMonth(yearMonth) {
  // "2025-03" → "2025-02"
  const [year, month] = yearMonth.split('-').map(Number);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
}
