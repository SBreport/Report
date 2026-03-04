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

// ─── SETTINGS ───
function loadSettings() {
  const ytKey = localStorage.getItem(STORAGE_KEYS.YT_API_KEY) || '';
  document.getElementById('yt-api-key').value = ytKey;
  if (ytKey) setStatus('yt-status', '저장된 키가 있습니다', 'success');
}

function saveSettings() {
  const ytKey = document.getElementById('yt-api-key').value.trim();
  localStorage.setItem(STORAGE_KEYS.YT_API_KEY, ytKey);
  showToast('설정이 저장되었습니다');
}

function clearSettings() {
  if (!confirm('API 키를 삭제할까요?')) return;
  localStorage.removeItem(STORAGE_KEYS.YT_API_KEY);
  document.getElementById('yt-api-key').value = '';
  setStatus('yt-status', '', '');
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

// ═══════════════════════════════════
//  2단계: 콘텐츠 불러오기 & 관리
// ═══════════════════════════════════

// 현재 영상 데이터
let currentVideos = [];
let manualIdCounter = 0;

// ─── 초기화: 연도 셀렉트, 날짜 기본값 ───
document.addEventListener('DOMContentLoaded', () => {
  initInputTab();
});

function initInputTab() {
  // 연도 셀렉트 채우기
  const yearSelect = document.getElementById('input-year');
  const currentYear = new Date().getFullYear();
  for (let y = currentYear + 1; y >= currentYear - 3; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y + '년';
    if (y === currentYear) opt.selected = true;
    yearSelect.appendChild(opt);
  }

  // 현재 월 선택
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  document.getElementById('input-month').value = currentMonth;

  // 날짜 기본값: 해당 월 1일 ~ 말일
  updateDateRange();
  document.getElementById('input-year').addEventListener('change', updateDateRange);
  document.getElementById('input-month').addEventListener('change', updateDateRange);

  // API 키 유무에 따라 모드 전환
  checkFetchMode();
}

function updateDateRange() {
  const year = document.getElementById('input-year').value;
  const month = document.getElementById('input-month').value;
  const lastDay = new Date(year, parseInt(month), 0).getDate();

  document.getElementById('input-date-start').value = `${year}-${month}-01`;
  document.getElementById('input-date-end').value = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
}

function checkFetchMode() {
  const ytKey = localStorage.getItem(STORAGE_KEYS.YT_API_KEY);
  if (ytKey) {
    document.getElementById('fetch-mode-api').style.display = 'block';
    document.getElementById('fetch-mode-manual').style.display = 'none';
  } else {
    document.getElementById('fetch-mode-api').style.display = 'none';
    document.getElementById('fetch-mode-manual').style.display = 'block';
    // 수동 모드에서도 결과 영역 보이게
    showVideosResult();
  }
}

// ─── 영상 불러오기 핸들러 ───
async function handleFetchVideos() {
  const apiKey = localStorage.getItem(STORAGE_KEYS.YT_API_KEY);
  const channelUrl = document.getElementById('input-channel-url').value.trim();
  const startDate = document.getElementById('input-date-start').value;
  const endDate = document.getElementById('input-date-end').value;

  if (!apiKey) {
    setStatus('fetch-status', '❌ YouTube API 키를 먼저 설정해주세요', 'error');
    return;
  }
  if (!channelUrl) {
    setStatus('fetch-status', '❌ 채널 URL을 입력해주세요', 'error');
    return;
  }
  if (!startDate || !endDate) {
    setStatus('fetch-status', '❌ 기간을 선택해주세요', 'error');
    return;
  }

  const btn = document.getElementById('fetch-videos-btn');
  btn.disabled = true;
  btn.textContent = '⏳ 불러오는 중...';
  setStatus('fetch-status', '⏳ 채널에서 영상을 불러오고 있습니다...', 'loading');

  try {
    const videos = await fetchChannelVideos(channelUrl, startDate, endDate, apiKey);

    if (videos.length === 0) {
      setStatus('fetch-status', '⚠️ 해당 기간에 업로드된 영상이 없습니다', 'error');
    } else {
      currentVideos = videos;
      renderAllVideos();
      setStatus('fetch-status', `✅ ${videos.length}개 영상을 불러왔습니다`, 'success');
    }
  } catch (e) {
    setStatus('fetch-status', `❌ ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '📥 영상 불러오기';
  }
}

// ─── 영상 렌더링 ───
function showVideosResult() {
  document.getElementById('videos-result').style.display = 'block';
}

function renderAllVideos() {
  showVideosResult();

  const longForms = currentVideos.filter(v => v.type === 'long');
  const shortForms = currentVideos.filter(v => v.type === 'short');

  // 요약 텍스트
  document.getElementById('videos-summary-text').textContent =
    `총 ${currentVideos.length}개 영상 — 롱폼 ${longForms.length}개 / 숏폼 ${shortForms.length}개 (180초 기준 자동 분류)`;

  // 카운트 배지
  document.getElementById('longform-count').textContent = longForms.length;
  document.getElementById('shortform-count').textContent = shortForms.length;

  // 롱폼 렌더링
  renderVideoList('longform-list', longForms);
  // 숏폼 렌더링
  renderVideoList('shortform-list', shortForms);

  // 성과 요약 업데이트
  updateSummaries();
}

function renderVideoList(containerId, videos) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  videos.forEach(video => {
    container.appendChild(createVideoCard(video));
  });
}

function createVideoCard(video) {
  const card = document.createElement('div');
  card.className = video.isManual ? 'video-card-manual' : 'video-card';
  card.dataset.videoId = video.id;

  if (video.isManual) {
    card.innerHTML = createManualCardHTML(video);
  } else {
    card.innerHTML = createAutoCardHTML(video);
  }

  return card;
}

function createAutoCardHTML(video) {
  const typeClass = video.type === 'long' ? 'long' : 'short';
  const typeLabel = video.type === 'long' ? '롱폼' : '숏폼';

  return `
    <div class="video-card-body">
      ${video.thumbnail
        ? `<img class="video-thumb" src="${video.thumbnail}" alt="${video.title}">`
        : `<div class="video-thumb-placeholder">🎬</div>`
      }
      <div class="video-info">
        <div class="video-title"><a href="${video.url}" target="_blank" style="color:inherit;text-decoration:none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${video.title}</a></div>
        <div class="video-meta">
          <span>📅 ${video.date}</span>
          <span>👁️ ${formatNumber(video.views)}</span>
          <span>❤️ ${formatNumber(video.likes)}</span>
          <span>💬 ${formatNumber(video.comments)}</span>
          <span>⏱ ${video.duration}</span>
        </div>
      </div>
      <div class="video-actions">
        <button class="btn-type-toggle ${typeClass}" onclick="toggleVideoType('${video.id}')" title="클릭하여 분류 변경">${typeLabel}</button>
        <button class="btn-remove-card" onclick="removeVideo('${video.id}')" title="삭제">✕</button>
      </div>
    </div>
  `;
}

function createManualCardHTML(video) {
  const typeClass = video.type === 'long' ? 'long' : 'short';
  const typeLabel = video.type === 'long' ? '롱폼' : '숏폼';

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <button class="btn-type-toggle ${typeClass}" onclick="toggleVideoType('${video.id}')">${typeLabel}</button>
      <button class="btn-remove-card" onclick="removeVideo('${video.id}')">✕</button>
    </div>
    <div class="form-row">
      <div class="form-group wide">
        <label>제목</label>
        <input placeholder="영상 제목" value="${video.title}" onchange="updateManualField('${video.id}','title',this.value)">
      </div>
      <div class="form-group narrow">
        <label>업로드일</label>
        <input type="date" value="${video.date}" onchange="updateManualField('${video.id}','date',this.value)">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>조회수</label>
        <input type="number" placeholder="0" value="${video.views || ''}" onchange="updateManualField('${video.id}','views',this.value)">
      </div>
      <div class="form-group">
        <label>좋아요</label>
        <input type="number" placeholder="0" value="${video.likes || ''}" onchange="updateManualField('${video.id}','likes',this.value)">
      </div>
      <div class="form-group">
        <label>댓글</label>
        <input type="number" placeholder="0" value="${video.comments || ''}" onchange="updateManualField('${video.id}','comments',this.value)">
      </div>
      <div class="form-group narrow">
        <label>길이 (초)</label>
        <input type="number" placeholder="60" value="${video.durationSeconds || ''}" onchange="updateManualDuration('${video.id}',this.value)">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group wide">
        <label>썸네일 URL (선택)</label>
        <input placeholder="https://..." value="${video.thumbnail || ''}" onchange="updateManualField('${video.id}','thumbnail',this.value)">
      </div>
    </div>
  `;
}

// ─── 수동 추가 ───
function addManualVideo(type) {
  manualIdCounter++;
  const id = `manual-${manualIdCounter}`;

  const video = {
    id,
    title: '',
    date: '',
    thumbnail: '',
    views: 0,
    likes: 0,
    comments: 0,
    duration: type === 'long' ? '10:00' : '0:30',
    durationSeconds: type === 'long' ? 600 : 30,
    type,
    url: '',
    isManual: true,
  };

  currentVideos.push(video);
  renderAllVideos();
  showToast(`${type === 'long' ? '롱폼' : '숏폼'} 수동 입력 카드가 추가되었습니다`);
}

// ─── 수동 필드 업데이트 ───
function updateManualField(videoId, field, value) {
  const video = currentVideos.find(v => v.id === videoId);
  if (!video) return;

  if (['views', 'likes', 'comments'].includes(field)) {
    video[field] = Number(value) || 0;
  } else {
    video[field] = value;
  }
  updateSummaries();
}

function updateManualDuration(videoId, seconds) {
  const video = currentVideos.find(v => v.id === videoId);
  if (!video) return;

  const sec = Number(seconds) || 0;
  video.durationSeconds = sec;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  video.duration = `${m}:${String(s).padStart(2, '0')}`;

  updateSummaries();
}

// ─── 분류 토글 ───
function toggleVideoType(videoId) {
  const video = currentVideos.find(v => v.id === videoId);
  if (!video) return;

  video.type = video.type === 'long' ? 'short' : 'long';
  renderAllVideos();
  showToast(`"${video.title || '영상'}" → ${video.type === 'long' ? '롱폼' : '숏폼'}으로 변경`);
}

// ─── 영상 삭제 ───
function removeVideo(videoId) {
  const idx = currentVideos.findIndex(v => v.id === videoId);
  if (idx === -1) return;

  const title = currentVideos[idx].title || '영상';
  currentVideos.splice(idx, 1);
  renderAllVideos();
  showToast(`"${title}" 삭제됨`);
}

// ─── 성과 요약 업데이트 ───
function updateSummaries() {
  const longForms = currentVideos.filter(v => v.type === 'long');
  const shortForms = currentVideos.filter(v => v.type === 'short');

  updateTypeSummary('lf', longForms);
  updateTypeSummary('sf', shortForms);

  // 카운트 배지 업데이트
  document.getElementById('longform-count').textContent = longForms.length;
  document.getElementById('shortform-count').textContent = shortForms.length;
}

function updateTypeSummary(prefix, videos) {
  const totalViews = videos.reduce((s, v) => s + (Number(v.views) || 0), 0);
  const totalLikes = videos.reduce((s, v) => s + (Number(v.likes) || 0), 0);
  const totalComments = videos.reduce((s, v) => s + (Number(v.comments) || 0), 0);
  const avgViews = videos.length ? Math.round(totalViews / videos.length) : 0;
  const avgDur = videos.length ? averageDuration(videos) : '0:00';

  // 총 시청시간 추정 (조회수 × 평균길이)
  const totalDurSec = videos.reduce((s, v) => s + (v.durationSeconds || 0), 0);
  const avgDurSec = videos.length ? totalDurSec / videos.length : 0;
  const estimatedWatchHours = Math.round((totalViews * avgDurSec) / 3600);

  document.getElementById(`${prefix}-total-views`).textContent = formatNumber(totalViews);
  document.getElementById(`${prefix}-total-likes`).textContent = formatNumber(totalLikes);
  document.getElementById(`${prefix}-total-comments`).textContent = formatNumber(totalComments);
  document.getElementById(`${prefix}-avg-views`).textContent = formatNumber(avgViews);
  document.getElementById(`${prefix}-avg-duration`).textContent = avgDur;
  document.getElementById(`${prefix}-total-watch`).textContent = formatNumber(estimatedWatchHours) + '시간';
}

// ═══════════════════════════════════
//  3단계: 성과 지표, 분석, 전략, 저장
// ═══════════════════════════════════

let strategies = [];
let strategyCounter = 0;

// ─── 초기 전략 3개 ───
document.addEventListener('DOMContentLoaded', () => {
  addStrategy(); addStrategy(); addStrategy();
  loadPrevMonthData();
});

function addStrategy() {
  strategyCounter++;
  const id = `st-${strategyCounter}`;
  strategies.push({ id, text: '' });

  const list = document.getElementById('strategy-list');
  const row = document.createElement('div');
  row.className = 'strategy-row';
  row.id = id;
  row.innerHTML = `
    <div class="strategy-num">${strategies.filter(s=>s).length}</div>
    <input placeholder="전략 주제를 입력하세요" onchange="updateStrategy('${id}',this.value)">
    <button class="btn-remove-card" onclick="removeStrategy('${id}')">✕</button>
  `;
  list.appendChild(row);
}

function updateStrategy(id, val) {
  const s = strategies.find(s => s && s.id === id);
  if (s) s.text = val;
}

function removeStrategy(id) {
  strategies = strategies.filter(s => s && s.id !== id);
  const el = document.getElementById(id);
  if (el) el.remove();
  document.querySelectorAll('#strategy-list .strategy-num').forEach((el, i) => {
    el.textContent = i + 1;
  });
}

// ─── 성과 기반 자동 전략 제안 ───
function generateAutoStrategy() {
  const lf = currentVideos.filter(v => v.type === 'long');
  const sf = currentVideos.filter(v => v.type === 'short');
  const lfTop = lf.length ? lf.reduce((a, b) => a.views > b.views ? a : b) : null;
  const sfTop = sf.length ? sf.reduce((a, b) => a.views > b.views ? a : b) : null;
  const lfStats = calcTypeStats(lf);
  const sfStats = calcTypeStats(sf);

  // 기존 전략 초기화
  strategies = [];
  document.getElementById('strategy-list').innerHTML = '';
  strategyCounter = 0;

  const suggestions = [];

  // 롱폼 분석
  if (lfTop) {
    suggestions.push(`롱폼 최고 성과 "${lfTop.title}" 주제의 시리즈/후속 콘텐츠 제작`);
  }

  // 숏폼 분석
  if (sfTop) {
    suggestions.push(`숏폼 최고 성과 "${sfTop.title}" 유사 포맷 확대 제작`);
  }

  // 롱폼 vs 숏폼 비교
  if (lf.length && sf.length) {
    if (sfStats.avgViews > lfStats.avgViews) {
      suggestions.push('숏폼 평균 조회수가 높으므로 숏폼 비중 확대 검토');
    } else {
      suggestions.push('롱폼 평균 조회수가 높으므로 롱폼 품질 강화에 집중');
    }
  }

  // 댓글 참여율
  const totalViews = [...lf, ...sf].reduce((s, v) => s + v.views, 0);
  const totalComments = [...lf, ...sf].reduce((s, v) => s + v.comments, 0);
  if (totalViews > 0 && totalComments / totalViews > 0.01) {
    suggestions.push('댓글 참여율이 높으므로 시청자 참여형 콘텐츠 (Q&A, 투표 등) 기획');
  }

  // 기본 제안
  if (suggestions.length < 3) {
    suggestions.push('신규 주제 또는 트렌드 키워드 기반 콘텐츠 테스트');
  }

  // 전략 추가
  suggestions.forEach(s => {
    strategyCounter++;
    const id = `st-${strategyCounter}`;
    strategies.push({ id, text: s });

    const list = document.getElementById('strategy-list');
    const row = document.createElement('div');
    row.className = 'strategy-row';
    row.id = id;
    row.innerHTML = `
      <div class="strategy-num">${strategies.length}</div>
      <input value="${s}" onchange="updateStrategy('${id}',this.value)">
      <button class="btn-remove-card" onclick="removeStrategy('${id}')">✕</button>
    `;
    list.appendChild(row);
  });

  // 종합 의견 자동 제안
  let autoNote = '';
  if (lfTop && sfTop) {
    autoNote = `이번 달 롱폼 "${lfTop.title}"과 숏폼 "${sfTop.title}"이 높은 성과를 보였습니다. 해당 주제와 포맷을 중심으로 다음 달 콘텐츠를 기획할 것을 제안합니다.`;
  } else if (lfTop) {
    autoNote = `이번 달 롱폼 "${lfTop.title}"이 가장 높은 성과를 기록했습니다. 유사 주제의 콘텐츠 확대를 제안합니다.`;
  } else if (sfTop) {
    autoNote = `이번 달 숏폼 "${sfTop.title}"이 가장 높은 성과를 기록했습니다. 숏폼 중심 전략 강화를 제안합니다.`;
  }
  document.getElementById('input-next-note').value = autoNote;

  showToast('성과 기반 전략이 자동 생성되었습니다. 자유롭게 수정하세요!');
}

// ─── 증감률 표시 ───
function updateGrowthDisplay() {
  updateGrowthCell('stat-views', 'stat-views-prev', 'growth-views');
  updateGrowthCell('stat-subs', 'stat-subs-prev', 'growth-subs');
  updateGrowthCell('stat-watch', 'stat-watch-prev', 'growth-watch');
}

function updateGrowthCell(currId, prevId, cellId) {
  const curr = Number(document.getElementById(currId).value) || 0;
  const prevVal = document.getElementById(prevId).value.trim();
  const cell = document.getElementById(cellId);

  // 지난 달 비어있으면 = 첫 보고
  if (!prevVal) {
    cell.textContent = '📌 첫 보고';
    cell.className = 'growth-cell';
    cell.style.color = '#9b9a97';
    return;
  }

  const prev = Number(prevVal) || 0;
  if (!prev) { cell.textContent = '-'; cell.className = 'growth-cell'; cell.style.color = ''; return; }
  const g = calcGrowth(curr, prev);
  cell.textContent = `${g.arrow} ${g.pct}%`;
  cell.className = 'growth-cell ' + (g.isPositive ? 'up' : 'down');
  cell.style.color = '';
}

// ─── TOP 영상 자동 표시 ───
function updateTopVideosDisplay() {
  const lf = currentVideos.filter(v => v.type === 'long');
  const sf = currentVideos.filter(v => v.type === 'short');
  const lfTop = lf.length ? lf.reduce((a, b) => a.views > b.views ? a : b) : null;
  const sfTop = sf.length ? sf.reduce((a, b) => a.views > b.views ? a : b) : null;

  const box = document.getElementById('top-videos-display');
  let h = '';
  if (lfTop) {
    h += `<div style="padding:10px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;margin-bottom:8px;">`;
    h += `<span style="font-size:12px;color:#2563eb;font-weight:600;">🎬 롱폼 TOP</span><br>`;
    h += `<strong>${lfTop.title}</strong> — 조회수 ${formatNumber(lfTop.views)}</div>`;
  }
  if (sfTop) {
    h += `<div style="padding:10px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;">`;
    h += `<span style="font-size:12px;color:#d97706;font-weight:600;">⚡ 숏폼 TOP</span><br>`;
    h += `<strong>${sfTop.title}</strong> — 조회수 ${formatNumber(sfTop.views)}</div>`;
  }
  if (!h) h = '<p style="color:#9b9a97;font-size:13px;">영상을 불러오면 자동으로 표시됩니다</p>';
  box.innerHTML = h;
}

// 영상 렌더링 후 TOP도 갱신
const _origRenderAll = renderAllVideos;
renderAllVideos = function() {
  _origRenderAll();
  updateTopVideosDisplay();
};

// ─── 이전 달 데이터 자동 불러오기 ───
function loadPrevMonthData() {
  const year = document.getElementById('input-year')?.value;
  const month = document.getElementById('input-month')?.value;
  if (!year || !month) return;

  const prevYM = getPreviousMonth(`${year}-${month}`);
  const prevData = loadMonthData(prevYM);

  if (prevData) {
    document.getElementById('stat-views-prev').value = prevData.totalViews || '';
    document.getElementById('stat-subs-prev').value = prevData.subscribers || '';
    document.getElementById('stat-watch-prev').value = prevData.watchHours || '';
    document.getElementById('prev-month-notice').style.display = 'block';
    document.getElementById('prev-month-notice').textContent = `💡 ${prevYM} 데이터가 자동으로 불러와졌습니다.`;
    updateGrowthDisplay();
  }
}

// 연/월 변경시 이전 달도 갱신
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('input-year')?.addEventListener('change', loadPrevMonthData);
  document.getElementById('input-month')?.addEventListener('change', loadPrevMonthData);
});

// ─── 이번 달 데이터 저장 ───
function saveCurrentMonth() {
  const year = document.getElementById('input-year').value;
  const month = document.getElementById('input-month').value;
  const yearMonth = `${year}-${month}`;

  const data = collectReportData();
  saveMonthData(yearMonth, data);
  showToast(`${year}년 ${parseInt(month)}월 데이터가 저장되었습니다`);
}

// ─── 보고서 데이터 수집 ───
function collectReportData() {
  const longForms = currentVideos.filter(v => v.type === 'long');
  const shortForms = currentVideos.filter(v => v.type === 'short');
  const lfTop = longForms.length ? longForms.reduce((a, b) => a.views > b.views ? a : b) : null;
  const sfTop = shortForms.length ? shortForms.reduce((a, b) => a.views > b.views ? a : b) : null;
  const prevViewsVal = document.getElementById('stat-views-prev').value.trim();
  const prevSubsVal = document.getElementById('stat-subs-prev').value.trim();
  const prevWatchVal = document.getElementById('stat-watch-prev').value.trim();

  return {
    clientName: document.getElementById('input-client').value.trim(),
    reportMonth: `${document.getElementById('input-year').value}년 ${parseInt(document.getElementById('input-month').value)}월`,
    producerName: document.getElementById('input-producer').value.trim(),
    longForms,
    shortForms,
    lfTopTitle: lfTop?.title || '',
    lfTopViews: lfTop?.views || 0,
    sfTopTitle: sfTop?.title || '',
    sfTopViews: sfTop?.views || 0,
    totalViews: Number(document.getElementById('stat-views').value) || 0,
    prevTotalViews: prevViewsVal ? Number(prevViewsVal) : null,
    subscribers: Number(document.getElementById('stat-subs').value) || 0,
    prevSubscribers: prevSubsVal ? Number(prevSubsVal) : null,
    watchHours: Number(document.getElementById('stat-watch').value) || 0,
    prevWatchHours: prevWatchVal ? Number(prevWatchVal) : null,
    isFirstReport: !prevViewsVal && !prevSubsVal && !prevWatchVal,
    bestVideoReason: document.getElementById('input-best-reason').value.trim(),
    strategies: strategies.filter(s => s && s.text).map(s => s.text),
    nextMonthNote: document.getElementById('input-next-note').value.trim(),
  };
}

// ─── 저장 + 보고서 생성 ───
function saveAndGenerate() {
  saveCurrentMonth();
  const data = collectReportData();
  renderPreview(data);
  switchTab('preview');
}

// ═══════════════════════════════════
//  4단계: 미리보기 렌더링
// ═══════════════════════════════════

function renderPreview(data) {
  const box = document.getElementById('preview-rendered');
  const lf = data.longForms;
  const sf = data.shortForms;
  const totalDone = lf.length + sf.length;
  const totalContract = totalDone; // 실제 납품 수 = 계약 수
  const pct = totalContract ? Math.round((totalDone / totalContract) * 100) : 0;
  const barColor = pct === 100 ? '#16a34a' : '#2563eb';

  const gv = data.prevTotalViews !== null ? calcGrowth(data.totalViews, data.prevTotalViews) : null;
  const gs = data.prevSubscribers !== null ? calcGrowth(data.subscribers, data.prevSubscribers) : null;
  const gw = data.prevWatchHours !== null ? calcGrowth(data.watchHours, data.prevWatchHours) : null;

  // 롱폼/숏폼 합계
  const lfStats = calcTypeStats(lf);
  const sfStats = calcTypeStats(sf);

  // 숏폼 TOP3
  const top3 = [...sf].sort((a,b) => b.views - a.views).slice(0,3);

  let h = '';
  h += `<h1>${data.clientName || '클라이언트'}</h1>`;
  h += `<p style="color:#9b9a97;">${data.reportMonth} · ${data.producerName || '제작업체'}</p><hr>`;

  // 작업 완료
  h += `<h2>📋 작업 완료 내역</h2>`;
  h += `<p><strong>납품 완료율: ${totalDone} / ${totalDone} (${pct}%)</strong></p>`;
  h += `<div class="pv-progress"><div class="pv-progress-fill" style="width:${pct}%;background:${barColor}"></div></div>`;

  // 롱폼
  h += `<h3>🎬 롱폼 (${lf.length}개)</h3>`;
  if (lf.length) {
    lf.forEach((v,i) => { h += renderPreviewVideoItem(v, i+1); });
    h += renderPreviewTypeSummary(lfStats);
  } else { h += `<p style="color:#9b9a97;">롱폼 영상 없음</p>`; }

  h += `<hr style="margin:20px 0;">`;

  // 숏폼
  h += `<h3>⚡ 숏폼 (${sf.length}개)</h3>`;
  if (sf.length) {
    sf.forEach((v,i) => { h += renderPreviewVideoItem(v, i+1); });
    h += renderPreviewTypeSummary(sfStats);
  } else { h += `<p style="color:#9b9a97;">숏폼 영상 없음</p>`; }

  h += `<hr>`;

  // 채널 성과
  h += `<h2>📊 채널 성과 요약</h2>`;
  h += `<div class="pv-stat-grid">`;
  [{l:'총 조회수',v:data.totalViews,g:gv,u:''},{l:'구독자',v:data.subscribers,g:gs,u:'명'},{l:'시청 시간',v:data.watchHours,g:gw,u:'시간'}].forEach(s => {
    const growthHtml = s.g
      ? `<div class="pv-stat-growth ${s.g.isPositive ? 'up' : 'down'}">${s.g.arrow} ${s.g.pct}% 전월 대비</div>`
      : `<div class="pv-stat-growth" style="color:#9b9a97;">📌 첫 보고</div>`;
    h += `<div class="pv-stat-card"><div class="pv-stat-label">${s.l}</div><div class="pv-stat-value">${formatNumber(s.v)}${s.u ? ' <span style="font-size:13px;color:#9b9a97;font-weight:400">'+s.u+'</span>' : ''}</div>${growthHtml}</div>`;
  });
  h += `</div>`;

  if (top3.length) {
    h += `<h3>숏폼 성과 TOP 3</h3>`;
    const medals = ['🥇','🥈','🥉'];
    top3.forEach((v,i) => { h += `<p>${medals[i]} <strong>${v.title}</strong> — ${formatNumber(v.views)}</p>`; });
    const totalSfViews = sf.reduce((s,v) => s + v.views, 0);
    h += `<blockquote>숏폼 총 조회수: <strong>${formatNumber(totalSfViews)}</strong></blockquote>`;
  }
  h += `<hr>`;

  // 성과 분석 — 자동 TOP
  h += `<h2>💡 콘텐츠 성과 분석</h2>`;
  if (data.lfTopTitle) {
    h += `<div style="padding:12px 16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;margin-bottom:8px;">`;
    h += `<span style="font-size:12px;color:#2563eb;font-weight:600;">🎬 롱폼 TOP</span><br>`;
    h += `<strong>${data.lfTopTitle}</strong> — 조회수 ${formatNumber(data.lfTopViews)}</div>`;
  }
  if (data.sfTopTitle) {
    h += `<div style="padding:12px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;margin-bottom:8px;">`;
    h += `<span style="font-size:12px;color:#d97706;font-weight:600;">⚡ 숏폼 TOP</span><br>`;
    h += `<strong>${data.sfTopTitle}</strong> — 조회수 ${formatNumber(data.sfTopViews)}</div>`;
  }
  if (data.bestVideoReason) h += `<blockquote>${data.bestVideoReason}</blockquote>`;
  h += `<hr>`;

  // 전략
  h += `<h2>🚀 다음 달 콘텐츠 전략 제안</h2>`;
  data.strategies.forEach((s,i) => { h += `<p>${i+1}. <strong>${s}</strong></p>`; });
  if (data.nextMonthNote) h += `<blockquote>${data.nextMonthNote}</blockquote>`;
  h += `<hr>`;
  h += `<div class="pv-footer">${data.producerName || '제작업체'} · ${data.reportMonth} 월간 보고서</div>`;

  box.innerHTML = h;

  // 마크다운도 생성
  const md = generateMarkdown(data);
  document.getElementById('markdown-raw').textContent = md;
}

function renderPreviewVideoItem(v, idx) {
  return `<div class="pv-video-item">
    <div class="pv-video-rank">${idx}</div>
    ${v.thumbnail ? `<img class="pv-video-thumb" src="${v.thumbnail}" alt="">` : '<div class="pv-video-thumb" style="background:#f0f0ee;display:flex;align-items:center;justify-content:center;font-size:11px;color:#9b9a97;">No img</div>'}
    <div class="pv-video-info">
      <div class="pv-video-title"><a href="${v.url || '#'}" target="_blank" style="color:inherit;text-decoration:none;">${v.title}</a></div>
      <div class="pv-video-meta">
        <span>📅 ${v.date}</span><span>👁️ ${formatNumber(v.views)}</span>
        <span>❤️ ${formatNumber(v.likes)}</span><span>💬 ${formatNumber(v.comments)}</span>
        <span>⏱ ${v.duration}</span>
      </div>
    </div>
  </div>`;
}

function renderPreviewTypeSummary(stats) {
  return `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px;background:#fafaf8;border-radius:8px;margin:12px 0;font-size:13px;">
    <div><span style="color:#9b9a97;">총 조회수</span><br><strong>${formatNumber(stats.views)}</strong></div>
    <div><span style="color:#9b9a97;">총 좋아요</span><br><strong>${formatNumber(stats.likes)}</strong></div>
    <div><span style="color:#9b9a97;">총 댓글</span><br><strong>${formatNumber(stats.comments)}</strong></div>
    <div><span style="color:#9b9a97;">평균 조회수</span><br><strong>${formatNumber(stats.avgViews)}</strong></div>
    <div><span style="color:#9b9a97;">평균 길이</span><br><strong>${stats.avgDuration}</strong></div>
    <div><span style="color:#9b9a97;">총 시청시간</span><br><strong>${formatNumber(stats.watchHours)}시간</strong></div>
  </div>`;
}

function calcTypeStats(videos) {
  const views = videos.reduce((s,v) => s + (Number(v.views)||0), 0);
  const likes = videos.reduce((s,v) => s + (Number(v.likes)||0), 0);
  const comments = videos.reduce((s,v) => s + (Number(v.comments)||0), 0);
  const avgViews = videos.length ? Math.round(views / videos.length) : 0;
  const avgDur = videos.length ? averageDuration(videos) : '0:00';
  const totalDurSec = videos.reduce((s,v) => s + (v.durationSeconds||0), 0);
  const avgDurSec = videos.length ? totalDurSec / videos.length : 0;
  const watchHours = Math.round((views * avgDurSec) / 3600);
  return { views, likes, comments, avgViews, avgDuration: avgDur, watchHours };
}

// ─── 마크다운 뷰 토글 ───
function toggleMarkdownView() {
  const el = document.getElementById('markdown-raw');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function copyMarkdownToClipboard() {
  const box = document.getElementById('preview-rendered');
  if (!box || !box.innerHTML || box.innerHTML.includes('보고서를 생성해주세요')) {
    showToast('먼저 보고서를 생성해주세요');
    return;
  }

  const htmlContent = box.innerHTML;
  const plainText = box.innerText;

  try {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const textBlob = new Blob([plainText], { type: 'text/plain' });
    const item = new ClipboardItem({
      'text/html': blob,
      'text/plain': textBlob,
    });
    navigator.clipboard.write([item]).then(() => {
      showToast('보고서가 복사되었습니다! 노션에 Ctrl+V로 붙여넣으세요');
    });
  } catch (e) {
    const md = document.getElementById('markdown-raw').textContent;
    navigator.clipboard.writeText(md).then(() => {
      showToast('마크다운으로 복사되었습니다 (이미지는 포함되지 않음)');
    });
  }
}

// ─── HTML 파일 다운로드 ───
function downloadReportHTML() {
  const box = document.getElementById('preview-rendered');
  if (!box || !box.innerHTML || box.innerHTML.includes('보고서를 생성해주세요')) {
    showToast('먼저 보고서를 생성해주세요');
    return;
  }

  const data = collectReportData();
  const reportContent = box.innerHTML;

  const fullHTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${data.clientName || '유튜브'} ${data.reportMonth} 월간 보고서</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
    background: #ffffff; color: #37352f; line-height: 1.7; padding: 40px 20px;
  }
  .report-container { max-width: 820px; margin: 0 auto; }
  h1 { font-size: 28px; font-weight: 700; margin-bottom: 4px; }
  h2 { font-size: 20px; font-weight: 700; margin: 32px 0 16px; padding-bottom: 8px; border-bottom: 1px solid #e9e9e7; }
  h3 { font-size: 16px; font-weight: 600; margin: 20px 0 12px; }
  hr { border: none; border-top: 1px solid #e9e9e7; margin: 24px 0; }
  p { margin-bottom: 8px; }
  blockquote { border-left: 3px solid #e9e9e7; padding: 8px 16px; margin: 12px 0; color: #6b6b6b; background: #f7f6f3; border-radius: 0 4px 4px 0; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 14px; }
  th { background: #f7f6f3; font-weight: 600; text-align: left; padding: 10px 12px; border-bottom: 2px solid #e9e9e7; }
  td { padding: 10px 12px; border-bottom: 1px solid #e9e9e7; }
  a { color: #2563eb; text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* 영상 카드 */
  .pv-video-item {
    display: flex; align-items: center; gap: 14px;
    padding: 12px; margin-bottom: 8px;
    border: 1px solid #e9e9e7; border-radius: 8px; background: #fff;
  }
  .pv-video-rank {
    width: 28px; height: 28px; border-radius: 50%; background: #f0f0ee;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700; color: #6b6b6b; flex-shrink: 0;
  }
  .pv-video-thumb {
    width: 120px; height: 68px; object-fit: cover; border-radius: 6px; flex-shrink: 0;
  }
  .pv-video-info { flex: 1; min-width: 0; }
  .pv-video-title { font-weight: 600; font-size: 14px; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pv-video-meta { font-size: 12px; color: #9b9a97; display: flex; gap: 10px; flex-wrap: wrap; }

  /* 성과 카드 */
  .pv-stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 16px 0; }
  .pv-stat-card { background: #f7f6f3; border-radius: 8px; padding: 16px; text-align: center; }
  .pv-stat-label { font-size: 12px; color: #9b9a97; margin-bottom: 4px; }
  .pv-stat-value { font-size: 22px; font-weight: 700; }
  .pv-stat-growth { font-size: 12px; margin-top: 4px; }
  .pv-stat-growth.up { color: #2e7d32; }
  .pv-stat-growth.down { color: #c62828; }

  /* 요약 그리드 */
  .pv-summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 12px 0; }
  .pv-summary-item { background: #f7f6f3; border-radius: 6px; padding: 10px; text-align: center; }
  .pv-summary-label { font-size: 11px; color: #9b9a97; }
  .pv-summary-value { font-size: 16px; font-weight: 700; }

  /* 전략 */
  .strategy-item { padding: 8px 12px; margin-bottom: 6px; background: #f7f6f3; border-radius: 6px; font-size: 14px; }
  .strategy-item strong { color: #2563eb; }

  /* 프린트 최적화 */
  @media print {
    body { padding: 20px; }
    .pv-video-item { break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="report-container">
${reportContent}
</div>
</body>
</html>`;

  const blob = new Blob([fullHTML], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.clientName || '유튜브'}_${data.reportMonth.replace(/\s/g,'')}_보고서.html`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('보고서 HTML이 다운로드되었습니다!');
}

// ─── 노션 발행 (제거됨 — 복사 방식으로 변경) ───
// publishToNotion 함수 삭제
