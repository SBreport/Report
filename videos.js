/* ══════════════════════════════════
   VIDEOS.JS — 콘텐츠 불러오기 & 관리
   ══════════════════════════════════ */

// 현재 영상 데이터
let currentVideos = [];
let currentChannelId = null;  // 현재 불러온 채널의 ID (Analytics API 권한 검증용)
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

  if (typeof syncAnalyticsFetchArea === 'function') {
    syncAnalyticsFetchArea();
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
    const result = await fetchChannelVideos(channelUrl, startDate, endDate, apiKey);
    const videos = result.videos;
    const channelId = result.channelId;

    if (videos.length === 0) {
      setStatus('fetch-status', '⚠️ 해당 기간에 업로드된 영상이 없습니다', 'error');
    } else {
      currentVideos = videos;
      currentChannelId = channelId;
      calendarDisplayYear = null;
      calendarDisplayMonth = null;
      renderAllVideos();
      autoFillChannelStats(videos);
      if (typeof syncAnalyticsFetchArea === 'function') {
        syncAnalyticsFetchArea();
      }
      setStatus('fetch-status', `✅ ${videos.length}개 영상을 불러왔습니다`, 'success');

      // 전략 자동 갱신
      if (typeof generateAutoStrategy === 'function') {
        generateAutoStrategy();
      }

      // 채널 구독자 수 자동 가져오기
      if (channelId) {
        try {
          const chStats = await fetchChannelStats(channelId, apiKey);
          if (chStats) {
            document.getElementById('stat-subs').value = chStats.subscriberCount;
            updateGrowthDisplay();
          }
        } catch (e) { /* 구독자 조회 실패 시 무시 */ }
      }
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
  if (typeof syncAnalyticsFetchArea === 'function') {
    syncAnalyticsFetchArea();
  }
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

// ─── 상세 분석 데이터 입력 패널 (공통) ───
function createAnalyticsInputHTML(video) {
  const ma = video.manualAnalytics || {};
  const api = video.analytics || {};
  const hasImage = !!video.analyticsImage;

  // Pre-fill: manual > api > empty
  const imp = ma.impressions != null ? ma.impressions : (api.impressions || '');
  const ctrRaw = ma.ctr != null ? ma.ctr : (api.ctr || null);
  const ctrDisp = ctrRaw != null ? (ctrRaw * 100).toFixed(1) : '';
  const uniqueV = ma.uniqueViewers != null ? ma.uniqueViewers : '';
  const watchH = ma.watchTimeHours != null ? ma.watchTimeHours : (api.estimatedMinutesWatched ? (api.estimatedMinutesWatched / 60).toFixed(1) : '');
  const subGain = ma.subscribersGained != null ? ma.subscribersGained : (api.subscribersGained != null ? api.subscribersGained : '');
  const ret30 = ma.retention30s != null ? ma.retention30s : (api.retention30s != null ? api.retention30s : '');

  let h = '';
  h += '<div class="video-analytics-panel always-visible">';
  h += '<div class="analytics-section-label">상세 데이터</div>';
  h += '<div class="analytics-input-grid">';
  h += analyticsField('노출수', 'impressions', video.id, imp, '13,375');
  h += analyticsField('노출 클릭률 (%)', 'ctr', video.id, ctrDisp, '10.2');
  h += analyticsField('순시청자수', 'uniqueViewers', video.id, uniqueV, '1,200');
  h += analyticsField('시청 시간 (시간)', 'watchTimeHours', video.id, watchH, '45.4');
  h += analyticsField('구독자 증가', 'subscribersGained', video.id, subGain, '50');
  h += analyticsField('30초 유지율 (%)', 'retention30s', video.id, ret30, '72');
  h += '</div>';

  // 이미지 드롭존
  h += '<div class="image-drop-zone' + (hasImage ? ' has-image' : '') + '" ';
  h += 'id="img-zone-' + video.id + '" ';
  h += 'ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ';
  h += 'ondrop="handleImageDrop(event,\'' + video.id + '\')" ';
  h += 'onclick="document.getElementById(\'img-input-' + video.id + '\').click()" ';
  h += 'tabindex="0">';

  if (hasImage) {
    h += '<img src="' + video.analyticsImage + '" alt="분석 스크린샷">';
    h += '<button class="image-remove-btn" onclick="event.stopPropagation();removeAnalyticsImage(\'' + video.id + '\')" title="이미지 삭제">✕</button>';
  } else {
    h += '🖼️ 이미지를 드래그하거나 클릭하여 업로드<br><span style="font-size:11px;color:#c4c3bf;">영역 클릭 후 Ctrl+V로 붙여넣기 가능</span>';
  }

  h += '<input type="file" id="img-input-' + video.id + '" accept="image/*" style="display:none" onchange="handleImageFileSelect(event,\'' + video.id + '\')">';
  h += '</div>';
  h += '</div>';

  return h;
}

function analyticsField(label, field, videoId, value, placeholder) {
  const v = value !== '' && value != null ? value : '';
  return '<div class="analytics-input-item">' +
    '<label>' + label + '</label>' +
    '<input type="text" value="' + v + '" placeholder="' + placeholder + '" ' +
    'onchange="updateVideoAnalytics(\'' + videoId + '\',\'' + field + '\',this.value)">' +
    '</div>';
}

function toggleAnalyticsPanel(btn) {
  btn.classList.toggle('open');
  btn.nextElementSibling.classList.toggle('open');
}

function createAutoCardHTML(video) {
  const typeClass = video.type === 'long' ? 'long' : 'short';
  const typeLabel = video.type === 'long' ? '롱폼' : '숏폼';

  return `
    <div class="video-card-body">
      ${video.thumbnail
        ? `<img class="video-thumb" src="${sanitizeURL(video.thumbnail)}" alt="${escapeHTML(video.title)}">`
        : `<div class="video-thumb-placeholder">🎬</div>`
      }
      <div class="video-info">
        <div class="video-title"><a href="${sanitizeURL(video.url)}" target="_blank" style="color:inherit;text-decoration:none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHTML(video.title)}</a></div>
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
    ${createAnalyticsInputHTML(video)}
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
        <input placeholder="영상 제목" value="${escapeHTML(video.title)}" onchange="updateManualField('${video.id}','title',this.value)">
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
        <input placeholder="https://..." value="${escapeHTML(video.thumbnail || '')}" onchange="updateManualField('${video.id}','thumbnail',sanitizeURL(this.value))">
      </div>
    </div>
    ${createAnalyticsInputHTML(video)}
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

// ─── 수동 분석 데이터 업데이트 ───
function updateVideoAnalytics(videoId, field, value) {
  const video = currentVideos.find(v => v.id === videoId);
  if (!video) return;
  if (!video.manualAnalytics) video.manualAnalytics = {};

  switch (field) {
    case 'impressions':
    case 'subscribersGained':
    case 'uniqueViewers':
      video.manualAnalytics[field] = value ? Number(String(value).replace(/,/g, '')) : null;
      break;
    case 'ctr':
      video.manualAnalytics.ctr = value ? parseFloat(value) / 100 : null;
      break;
    case 'watchTimeHours':
      video.manualAnalytics.watchTimeHours = value ? parseFloat(value) : null;
      break;
    case 'retention30s':
      video.manualAnalytics.retention30s = value ? parseFloat(value) : null;
      break;
  }
}

// ─── 이미지 드래그 & 드롭 / 붙여넣기 ───
function handleDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function handleImageDrop(e, videoId) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const files = e.dataTransfer.files;
  if (files.length > 0 && files[0].type.startsWith('image/')) {
    processImageFile(files[0], videoId);
  }
}

function handleImageFileSelect(e, videoId) {
  const file = e.target.files[0];
  if (file && file.type.startsWith('image/')) {
    processImageFile(file, videoId);
  }
}

function processImageFile(file, videoId) {
  const reader = new FileReader();
  reader.onload = function(e) {
    compressImage(e.target.result, 1000, 0.82, function(compressed) {
      const video = currentVideos.find(v => v.id === videoId);
      if (!video) return;
      video.analyticsImage = compressed;
      updateImageZoneUI(videoId, compressed);
      showToast('이미지가 추가되었습니다');
    });
  };
  reader.readAsDataURL(file);
}

function updateImageZoneUI(videoId, dataUrl) {
  const zone = document.getElementById('img-zone-' + videoId);
  if (!zone) return;
  zone.classList.add('has-image');
  zone.innerHTML = '<img src="' + dataUrl + '" alt="분석 스크린샷">' +
    '<button class="image-remove-btn" onclick="event.stopPropagation();removeAnalyticsImage(\'' + videoId + '\')" title="이미지 삭제">✕</button>' +
    '<input type="file" id="img-input-' + videoId + '" accept="image/*" style="display:none" onchange="handleImageFileSelect(event,\'' + videoId + '\')">';
}

function removeAnalyticsImage(videoId) {
  const video = currentVideos.find(v => v.id === videoId);
  if (!video) return;
  video.analyticsImage = null;

  const zone = document.getElementById('img-zone-' + videoId);
  if (!zone) return;
  zone.classList.remove('has-image');
  zone.innerHTML = '🖼️ 이미지를 드래그하거나 클릭하여 업로드<br><span style="font-size:11px;color:#c4c3bf;">영역 클릭 후 Ctrl+V로 붙여넣기 가능</span>' +
    '<input type="file" id="img-input-' + videoId + '" accept="image/*" style="display:none" onchange="handleImageFileSelect(event,\'' + videoId + '\')">';
  showToast('이미지가 삭제되었습니다');
}

// ─── 전역 이미지 붙여넣기 (Ctrl+V) ───
document.addEventListener('paste', function(e) {
  // 텍스트 입력 중이면 무시
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

  const items = (e.clipboardData || window.clipboardData).items;
  let imageItem = null;
  for (const item of items) {
    if (item.type.startsWith('image/')) { imageItem = item; break; }
  }
  if (!imageItem) return;

  // 가장 가까운 비디오 카드 찾기
  const card = e.target.closest('[data-video-id]');
  if (!card) return;

  e.preventDefault();
  const videoId = card.dataset.videoId;
  processImageFile(imageItem.getAsFile(), videoId);

  // 분석 패널 자동 열기
  const toggle = card.querySelector('.video-analytics-toggle');
  const panel = card.querySelector('.video-analytics-panel');
  if (toggle && panel && !panel.classList.contains('open')) {
    toggle.classList.add('open');
    panel.classList.add('open');
  }
});

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

// ─── 채널 성과 자동 합산 ───
function autoFillChannelStats(videos) {
  if (!videos) videos = currentVideos;
  const totalViews = videos.reduce((s, v) => s + (Number(v.views) || 0), 0);
  const totalDurSec = videos.reduce((s, v) => s + (v.durationSeconds || 0), 0);
  const avgDurSec = videos.length ? totalDurSec / videos.length : 0;
  const estimatedWatchHours = Math.round((totalViews * avgDurSec) / 3600);

  document.getElementById('stat-views').value = totalViews;
  document.getElementById('stat-watch').value = estimatedWatchHours;
  updateGrowthDisplay();
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

  // 채널 성과 지표 자동 합산 (조회수, 시청시간)
  autoFillChannelStats();
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
    h += `<strong>${escapeHTML(lfTop.title)}</strong> — 조회수 ${formatNumber(lfTop.views)}</div>`;
  }
  if (sfTop) {
    h += `<div style="padding:10px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;">`;
    h += `<span style="font-size:12px;color:#d97706;font-weight:600;">⚡ 숏폼 TOP</span><br>`;
    h += `<strong>${escapeHTML(sfTop.title)}</strong> — 조회수 ${formatNumber(sfTop.views)}</div>`;
  }
  if (!h) h = '<p style="color:#9b9a97;font-size:13px;">영상을 불러오면 자동으로 표시됩니다</p>';
  box.innerHTML = h;
}

// 영상 렌더링 후 TOP + 달력도 갱신
const _origRenderAll = renderAllVideos;
renderAllVideos = function() {
  _origRenderAll();
  updateTopVideosDisplay();
  renderInputCalendar();
};

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
    year: parseInt(document.getElementById('input-year').value),
    month: parseInt(document.getElementById('input-month').value),
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
    trafficSources: window.channelTrafficSources || [],
    hasAnalytics: currentVideos.some(v => v.analytics),
    strategies: strategies.filter(s => s && (s.title || s.description)).map(s => ({
      title: s.title || '',
      description: s.description || ''
    })),
    nextMonthNote: document.getElementById('input-next-note').value.trim(),
    contractLong: Number(document.getElementById('input-contract-long').value) || 0,
    contractShort: Number(document.getElementById('input-contract-short').value) || 0,
  };
}

// ─── 보고서 생성 ───
function saveAndGenerate() {
  const data = collectReportData();
  renderPreview(data);
  switchTab('preview');
}

// ─── 타입별 통계 계산 ───
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

// ═══════════════════════════════════
//  달력 뷰 (전체 진행 일정)
// ═══════════════════════════════════

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

// 현재 달력에 표시 중인 연/월
let calendarDisplayYear = null;
let calendarDisplayMonth = null;

// ─── 영상 날짜 범위에서 포함된 월 목록 구하기 ───
function getVideoMonths(videos) {
  const months = new Set();
  videos.forEach(v => {
    if (!v.date) return;
    const ym = v.date.substring(0, 7); // "2026-02"
    months.add(ym);
  });
  return [...months].sort();
}

// ─── 데이터입력 탭용 달력 ───
function renderInputCalendar() {
  const container = document.getElementById('calendar-container');
  if (!container) return;

  if (currentVideos.length === 0) {
    container.style.display = 'none';
    return;
  }

  // 초기값: 영상이 있는 첫 번째 월, 또는 선택된 월
  if (!calendarDisplayYear || !calendarDisplayMonth) {
    const months = getVideoMonths(currentVideos);
    if (months.length > 0) {
      const [y, m] = months[0].split('-').map(Number);
      calendarDisplayYear = y;
      calendarDisplayMonth = m;
    } else {
      calendarDisplayYear = parseInt(document.getElementById('input-year').value);
      calendarDisplayMonth = parseInt(document.getElementById('input-month').value);
    }
  }

  const videoMonths = getVideoMonths(currentVideos);
  const hasPrev = videoMonths.some(ym => {
    const [y, m] = ym.split('-').map(Number);
    return y < calendarDisplayYear || (y === calendarDisplayYear && m < calendarDisplayMonth);
  });
  const hasNext = videoMonths.some(ym => {
    const [y, m] = ym.split('-').map(Number);
    return y > calendarDisplayYear || (y === calendarDisplayYear && m > calendarDisplayMonth);
  });

  container.style.display = 'block';
  let navHTML = `<div class="calendar-nav">`;
  navHTML += `<button class="calendar-nav-btn" onclick="navigateCalendar(-1)" ${!hasPrev ? 'disabled' : ''}>&#9664;</button>`;
  navHTML += `<span class="calendar-nav-title">${calendarDisplayYear}년 ${calendarDisplayMonth}월</span>`;
  navHTML += `<button class="calendar-nav-btn" onclick="navigateCalendar(1)" ${!hasNext ? 'disabled' : ''}>&#9654;</button>`;
  navHTML += `</div>`;

  container.innerHTML = `<div class="calendar-title">📅 전체 진행 일정</div>` +
    navHTML +
    buildCalendarHTML(calendarDisplayYear, calendarDisplayMonth, currentVideos, 'input');
}

function navigateCalendar(dir) {
  let y = calendarDisplayYear;
  let m = calendarDisplayMonth + dir;
  if (m < 1) { m = 12; y--; }
  if (m > 12) { m = 1; y++; }
  calendarDisplayYear = y;
  calendarDisplayMonth = m;
  renderInputCalendar();
}

// ─── 공통 달력 HTML 빌더 ───
function buildCalendarHTML(year, month, videos, mode) {
  // mode: 'input' (데이터입력 탭) or 'preview' (보고서 미리보기)
  const isPreview = mode === 'preview';
  const gridClass = isPreview ? 'pv-calendar-grid' : 'calendar-grid';
  const headerClass = isPreview ? 'pv-calendar-header' : 'calendar-day-header';
  const cellClass = isPreview ? 'pv-calendar-cell' : 'calendar-cell';
  const dateClass = isPreview ? 'pv-calendar-date' : 'calendar-date';
  const badgeClass = isPreview ? 'pv-calendar-badge' : 'calendar-video-badge';

  // 날짜별 영상 매핑
  const videosByDate = {};
  videos.forEach(v => {
    if (!v.date) return;
    if (!videosByDate[v.date]) videosByDate[v.date] = [];
    videosByDate[v.date].push(v);
  });

  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=일요일
  const lastDate = new Date(year, month, 0).getDate();

  let h = `<div class="${gridClass}">`;

  // 요일 헤더
  DAY_NAMES.forEach((d, i) => {
    let dayClass = '';
    if (i === 0) dayClass = ' sun';
    if (i === 6) dayClass = ' sat';
    h += `<div class="${headerClass}${dayClass}">${d}</div>`;
  });

  // 빈 셀 (1일 전)
  for (let i = 0; i < firstDay; i++) {
    h += `<div class="${cellClass} empty"></div>`;
  }

  // 날짜 셀
  for (let d = 1; d <= lastDate; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayVideos = videosByDate[dateStr] || [];
    const dayOfWeek = (firstDay + d - 1) % 7;
    const hasVideo = dayVideos.length > 0;

    let dayTypeClass = '';
    if (dayOfWeek === 0) dayTypeClass = ' sun';
    if (dayOfWeek === 6) dayTypeClass = ' sat';

    h += `<div class="${cellClass}${hasVideo ? ' has-video' : ''}${dayTypeClass}">`;
    h += `<div class="${dateClass}">${d}</div>`;

    dayVideos.forEach(v => {
      const typeLabel = v.type === 'long' ? 'L' : 'S';
      const typeClass = v.type === 'long' ? 'long' : 'short';
      const title = escapeHTML(v.title.length > 6 ? v.title.substring(0, 6) + '…' : v.title);
      const fullTitle = escapeHTML(v.title);

      if (isPreview) {
        h += `<div class="${badgeClass} ${typeClass}" title="${fullTitle} — ${formatNumber(v.views)}"><span class="cal-type-tag">${typeLabel}</span> ${title}</div>`;
      } else {
        h += `<div class="${badgeClass} ${typeClass}" title="${fullTitle}">`;
        h += `<span class="cal-type-tag">${typeLabel}</span> ${title}`;
        h += `<span class="calendar-video-views">${formatNumber(v.views)}</span>`;
        h += `</div>`;
      }
    });

    h += `</div>`;
  }

  // 마지막 주 나머지 빈 셀
  const totalCells = firstDay + lastDate;
  const remainder = totalCells % 7;
  if (remainder > 0) {
    for (let i = 0; i < 7 - remainder; i++) {
      h += `<div class="${cellClass} empty"></div>`;
    }
  }

  h += `</div>`;
  return h;
}
