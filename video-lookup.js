/* ══════════════════════════════════
   VIDEO-LOOKUP.JS — 단일/다중 영상 정보 조회
   ══════════════════════════════════ */

// ─── URL에서 videoId 추출 ───
function extractVideoId(url) {
  url = url.trim();
  const shortMatch = url.match(/youtu\.be\/([^?&\s]+)/);
  if (shortMatch) return shortMatch[1];
  const watchMatch = url.match(/[?&]v=([^&\s]+)/);
  if (watchMatch) return watchMatch[1];
  const shortsMatch = url.match(/\/shorts\/([^?&\s]+)/);
  if (shortsMatch) return shortsMatch[1];
  const embedMatch = url.match(/\/embed\/([^?&\s]+)/);
  if (embedMatch) return embedMatch[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
  return null;
}

// ─── 복사 유틸 ───
function vlCopyText(text, label) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(`${label} 복사됨`);
  }).catch(() => {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(`${label} 복사됨`);
  });
}

// ─── 메인 조회 함수 ───
async function lookupVideo() {
  const rawInput = document.getElementById('video-lookup-url').value;
  const apiKey = localStorage.getItem(STORAGE_KEYS.YT_API_KEY) || '';

  if (!apiKey) {
    setStatus('video-lookup-status', '❌ 설정 탭에서 YouTube API 키를 먼저 입력해주세요', 'error');
    return;
  }

  // 쉼표 구분으로 분리, 빈 항목 제거
  const urls = rawInput.split(',').map(s => s.trim()).filter(Boolean);
  if (urls.length === 0) {
    setStatus('video-lookup-status', '❌ 유튜브 링크를 입력해주세요', 'error');
    return;
  }

  const videoIds = urls.map(extractVideoId);
  const invalidIdx = videoIds.findIndex(id => !id);
  if (invalidIdx !== -1) {
    setStatus('video-lookup-status', `❌ ${invalidIdx + 1}번째 링크가 올바르지 않습니다`, 'error');
    return;
  }

  const btn = document.getElementById('video-lookup-btn');
  btn.disabled = true;
  btn.textContent = '불러오는 중...';
  const countLabel = videoIds.length > 1 ? `영상 ${videoIds.length}개` : '영상';
  setStatus('video-lookup-status', `⏳ ${countLabel} 정보를 가져오는 중...`, 'loading');
  document.getElementById('video-lookup-result').style.display = 'none';

  try {
    // 모든 영상 병렬 조회
    const results = await Promise.all(
      videoIds.map(id => Promise.all([
        fetchSingleVideoInfo(id, apiKey),
        fetchVideoComments(id, apiKey),
      ]))
    );

    setStatus('video-lookup-status', '', '');
    const resultEl = document.getElementById('video-lookup-result');

    if (results.length === 1) {
      resultEl.innerHTML = renderSingleVideoHTML(results[0][0], results[0][1]);
      attachSingleVideoHandlers(results[0][0]);
    } else {
      resultEl.innerHTML = renderVideoGridHTML(results);
      attachGridHandlers(results);
    }

    resultEl.style.display = 'block';
  } catch (e) {
    setStatus('video-lookup-status', `❌ 오류: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '불러오기';
  }
}

// ─── 영상 상세 정보 조회 ───
async function fetchSingleVideoInfo(videoId, apiKey) {
  const url = `${YT_API_BASE}/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err?.error?.message || 'YouTube API 오류');
  }
  const data = await res.json();
  if (!data.items || data.items.length === 0) {
    throw new Error('영상을 찾을 수 없습니다. 링크를 확인해주세요.');
  }
  const item = data.items[0];
  return {
    id: item.id,
    title: item.snippet.title,
    channelName: item.snippet.channelTitle,
    channelId: item.snippet.channelId,
    publishedAt: item.snippet.publishedAt,
    description: item.snippet.description || '',
    thumbnail: item.snippet.thumbnails.maxres?.url
      || item.snippet.thumbnails.high?.url
      || item.snippet.thumbnails.medium?.url
      || item.snippet.thumbnails.default?.url,
    views: Number(item.statistics.viewCount) || 0,
    likes: Number(item.statistics.likeCount) || 0,
    commentCount: Number(item.statistics.commentCount) || 0,
    duration: parseDuration(item.contentDetails.duration),
    durationSeconds: durationToSeconds(item.contentDetails.duration),
  };
}

// ─── HTML 태그 제거 (댓글 textDisplay 처리용) ───
function stripCommentHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

// ─── 댓글 조회 ───
async function fetchVideoComments(videoId, apiKey) {
  try {
    const url = `${YT_API_BASE}/commentThreads?part=snippet&videoId=${videoId}&order=relevance&maxResults=5&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.items) return [];
    return data.items.map(item => {
      const c = item.snippet.topLevelComment.snippet;
      return {
        authorName: c.authorDisplayName,
        authorAvatar: c.authorProfileImageUrl,
        text: stripCommentHtml(c.textDisplay),
        likeCount: Number(c.likeCount) || 0,
        publishedAt: c.publishedAt,
      };
    });
  } catch {
    return [];
  }
}

// ═══════════════════════════════
// 단일 영상 렌더링
// ═══════════════════════════════

function renderSingleVideoHTML(v, comments) {
  const dateStr = new Date(v.publishedAt).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const descLines = v.description.split('\n').slice(0, 10);
  const shortDescHtml = descLines.map(l => escapeHTML(l)).join('<br>');
  const fullDescHtml = v.description.split('\n').map(l => escapeHTML(l)).join('<br>');
  const isLongDesc = v.description.split('\n').length > 10 || v.description.length > 500;

  const commentsHtml = comments.length > 0
    ? comments.slice(0, 5).map((c, i) => `
      <div class="vl-comment">
        <div class="vl-comment-header">
          <img class="vl-comment-avatar" src="${escapeHTML(c.authorAvatar)}" alt="" onerror="this.style.display='none'">
          <div class="vl-comment-meta">
            <span class="vl-comment-author">${escapeHTML(c.authorName)}</span>
            ${i === 0 ? '<span class="vl-pin-badge">📌 고정</span>' : ''}
            <span class="vl-comment-date">${new Date(c.publishedAt).toLocaleDateString('ko-KR')}</span>
          </div>
          ${c.likeCount > 0 ? `<span class="vl-comment-likes">👍 ${formatNumber(c.likeCount)}</span>` : ''}
        </div>
        <div class="vl-comment-text">${escapeHTML(c.text)}</div>
      </div>`).join('')
    : '<p style="color:#9b9a97;font-size:13px;">댓글을 불러올 수 없습니다</p>';

  return `
    <div class="section">
      <div class="vl-video-grid">
        <a href="https://www.youtube.com/watch?v=${v.id}" target="_blank" class="vl-thumb-link">
          <img class="vl-thumbnail" src="${escapeHTML(v.thumbnail)}" alt="${escapeHTML(v.title)}">
          <div class="vl-duration-badge">${escapeHTML(v.duration)}</div>
        </a>
        <div class="vl-info">
          <div class="vl-title-row">
            <a href="https://www.youtube.com/watch?v=${v.id}" target="_blank" class="vl-title" id="vl-single-title">${escapeHTML(v.title)}</a>
            <button class="vl-copy-icon" title="제목 복사" data-copy-target="title" data-video-id="${v.id}">📋</button>
          </div>
          <a href="https://www.youtube.com/channel/${v.channelId}" target="_blank" class="vl-channel">${escapeHTML(v.channelName)}</a>
          <div class="vl-date">${dateStr}</div>
          <div class="vl-stats">
            <div class="vl-stat"><div class="vl-stat-label">조회수</div><div class="vl-stat-value">${formatNumber(v.views)}</div></div>
            <div class="vl-stat"><div class="vl-stat-label">좋아요</div><div class="vl-stat-value">${formatNumber(v.likes)}</div></div>
            <div class="vl-stat"><div class="vl-stat-label">댓글</div><div class="vl-stat-value">${formatNumber(v.commentCount)}</div></div>
            <div class="vl-stat"><div class="vl-stat-label">영상 길이</div><div class="vl-stat-value">${escapeHTML(v.duration)}</div></div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div class="section-title">영상 설명</div>
        ${v.description ? `<button class="vl-copy-btn" data-copy-target="desc" data-video-id="${v.id}">📋 설명 복사</button>` : ''}
      </div>
      ${v.description
        ? `<div class="vl-description" id="vl-desc-text-${v.id}">${isLongDesc ? shortDescHtml : fullDescHtml}</div>
           ${isLongDesc ? `<button class="vl-expand-btn" id="vl-expand-btn-${v.id}" onclick="toggleVlDesc(this,'${v.id}')">▼ 전체 보기</button>` : ''}`
        : '<p style="color:#9b9a97;font-size:13px;">영상 설명이 없습니다.</p>'
      }
    </div>

    <div class="section">
      <div class="section-title" style="margin-bottom:12px;">상위 댓글 (고정 댓글 우선)</div>
      <div class="vl-comments">${commentsHtml}</div>
    </div>
  `;
}

function attachSingleVideoHandlers(v) {
  // 전체보기 버튼에 데이터 저장
  const expandBtn = document.getElementById(`vl-expand-btn-${v.id}`);
  if (expandBtn) {
    const fullDescHtml = v.description.split('\n').map(l => escapeHTML(l)).join('<br>');
    const shortDescHtml = v.description.split('\n').slice(0, 10).map(l => escapeHTML(l)).join('<br>');
    expandBtn._fullHtml = fullDescHtml;
    expandBtn._shortHtml = shortDescHtml;
  }

  // 제목 복사
  document.querySelectorAll('[data-copy-target="title"]').forEach(btn => {
    btn.addEventListener('click', () => vlCopyText(v.title, '제목'));
  });

  // 설명 복사
  document.querySelectorAll('[data-copy-target="desc"]').forEach(btn => {
    btn.addEventListener('click', () => vlCopyText(v.description, '설명'));
  });
}

// ─── 설명 전체보기 토글 ───
function toggleVlDesc(btn, videoId) {
  const desc = document.getElementById(`vl-desc-text-${videoId}`);
  if (btn.textContent.startsWith('▼')) {
    desc.innerHTML = btn._fullHtml;
    btn.textContent = '▲ 접기';
  } else {
    desc.innerHTML = btn._shortHtml;
    btn.textContent = '▼ 전체 보기';
  }
}

// ═══════════════════════════════
// 다중 영상 그리드 렌더링
// ═══════════════════════════════

function renderVideoGridHTML(results) {
  const cards = results.map(([v, comments]) => renderGridCardHTML(v, comments)).join('');
  return `<div class="vl-grid">${cards}</div>`;
}

function renderGridCardHTML(v, comments) {
  const dateStr = new Date(v.publishedAt).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'short', day: 'numeric',
  });

  // 설명: 300자 초과 시 접기 버튼 표시
  const DESC_LIMIT = 300;
  const isLongDesc = v.description.length > DESC_LIMIT;
  const descShort = isLongDesc ? escapeHTML(v.description.substring(0, DESC_LIMIT)) + '…' : escapeHTML(v.description);
  const descFull = escapeHTML(v.description);

  // 인기 댓글 최대 5개
  const commentHtml = comments.length > 0
    ? comments.map((c, i) => `
      <div class="vlc-comment">
        <div class="vlc-comment-meta">
          <img class="vlc-comment-avatar" src="${escapeHTML(c.authorAvatar)}" alt="" onerror="this.style.display='none'">
          <span class="vlc-comment-author">${escapeHTML(c.authorName)}</span>
          ${i === 0 ? '<span class="vl-pin-badge" style="font-size:10px;">📌</span>' : ''}
        </div>
        <div class="vlc-comment-text">${escapeHTML(c.text)}</div>
      </div>`).join('')
    : '<div style="font-size:11px;color:#9b9a97;">댓글 없음</div>';

  return `
    <div class="vl-card">
      <a href="https://www.youtube.com/watch?v=${v.id}" target="_blank" class="vlc-thumb-link">
        <img class="vlc-thumbnail" src="${escapeHTML(v.thumbnail)}" alt="${escapeHTML(v.title)}">
        <span class="vl-duration-badge">${escapeHTML(v.duration)}</span>
      </a>
      <div class="vlc-body">
        <div class="vlc-title-row">
          <a href="https://www.youtube.com/watch?v=${v.id}" target="_blank" class="vlc-title">${escapeHTML(v.title)}</a>
          <button class="vl-copy-icon" title="제목 복사" data-vid="${v.id}" data-copy="title">📋</button>
        </div>
        <div class="vlc-meta">
          <span class="vlc-channel">${escapeHTML(v.channelName)}</span>
          <span class="vlc-date">${dateStr}</span>
        </div>
        <div class="vlc-stats">
          <span class="vlc-stat">👁 ${formatNumber(v.views)}</span>
          <span class="vlc-stat">👍 ${formatNumber(v.likes)}</span>
          <span class="vlc-stat">⏱ ${escapeHTML(v.duration)}</span>
        </div>
        ${v.description ? `
        <div class="vlc-section-block desc-block">
          <div class="vlc-section-label">📄 영상 설명</div>
          <div class="vlc-desc-text" id="vlc-desc-${v.id}">${descShort}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:4px;">
            ${isLongDesc ? `<button class="vl-expand-btn" style="margin-top:0;font-size:10px;padding:3px 8px;" id="vlc-expand-${v.id}" onclick="toggleVlcDesc('${v.id}')">▼ 전체 보기</button>` : ''}
            <button class="vl-copy-btn vlc-copy-desc" data-vid="${v.id}" data-copy="desc">📋 설명 복사</button>
          </div>
        </div>` : ''}
        <div class="vlc-section-block comment-block">
          <div class="vlc-section-label">💬 인기 댓글</div>
          <div class="vlc-comment-wrap">${commentHtml}</div>
        </div>
      </div>
    </div>
  `;
}

function attachGridHandlers(results) {
  // videoId → data 맵
  const dataMap = {};
  results.forEach(([v]) => { dataMap[v.id] = v; });

  document.querySelectorAll('[data-copy]').forEach(btn => {
    const vid = btn.dataset.vid;
    const type = btn.dataset.copy;
    const v = dataMap[vid];
    if (!v) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (type === 'title') vlCopyText(v.title, '제목');
      else if (type === 'desc') vlCopyText(v.description, '설명');
    });
  });

  // 그리드 카드 설명 expand 버튼에 데이터 저장
  results.forEach(([v]) => {
    const expandBtn = document.getElementById(`vlc-expand-${v.id}`);
    if (!expandBtn) return;
    const DESC_LIMIT = 300;
    expandBtn._full = escapeHTML(v.description);
    expandBtn._short = escapeHTML(v.description.substring(0, DESC_LIMIT)) + '…';
  });
}

// ─── 그리드 카드 설명 접기/펼치기 ───
function toggleVlcDesc(videoId) {
  const desc = document.getElementById(`vlc-desc-${videoId}`);
  const btn = document.getElementById(`vlc-expand-${videoId}`);
  if (!desc || !btn) return;
  if (btn.textContent.startsWith('▼')) {
    desc.innerHTML = btn._full;
    btn.textContent = '▲ 접기';
  } else {
    desc.innerHTML = btn._short;
    btn.textContent = '▼ 전체 보기';
  }
}
