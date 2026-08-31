/* ══════════════════════════════════
   VIDEO-LOOKUP.JS — 단일/다중 영상 정보 조회
   ══════════════════════════════════ */

let videoLookupMode = 'video';
let videoLookupRequestId = 0;
const channelLookupState = {
  channel: null,
  videos: [],
  filter: 'all',
};

function setVideoLookupMode(mode) {
  if (!['video', 'channel'].includes(mode)) return;
  videoLookupMode = mode;
  videoLookupRequestId += 1;

  const isChannel = mode === 'channel';
  const input = document.getElementById('video-lookup-url');
  const result = document.getElementById('video-lookup-result');
  const lookupBtn = document.getElementById('video-lookup-btn');
  const videoBtn = document.getElementById('vl-mode-video');
  const channelBtn = document.getElementById('vl-mode-channel');

  videoBtn.classList.toggle('active', !isChannel);
  videoBtn.setAttribute('aria-selected', String(!isChannel));
  channelBtn.classList.toggle('active', isChannel);
  channelBtn.setAttribute('aria-selected', String(isChannel));
  document.getElementById('vl-channel-options').style.display = isChannel ? 'flex' : 'none';
  document.getElementById('video-lookup-section-title').textContent = isChannel
    ? '유튜브 채널 링크'
    : '유튜브 영상 링크';
  document.getElementById('video-lookup-section-desc').textContent = isChannel
    ? '@핸들, channel/UC…, user/… 형식의 채널 주소를 지원합니다.'
    : 'youtube.com/watch?v=, youtu.be/, Shorts 링크 모두 지원합니다.';
  input.placeholder = isChannel
    ? '예: https://www.youtube.com/@채널핸들'
    : '링크 1개 또는 여러 개 (쉼표로 구분): https://youtu.be/xxx, https://youtu.be/yyy';
  input.value = '';
  setStatus('video-lookup-status', '', '');
  result.style.display = 'none';
  result.innerHTML = '';
  lookupBtn.disabled = false;
  lookupBtn.textContent = '불러오기';
  input.focus();
}

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
  if (videoLookupMode === 'channel') {
    await lookupChannelVideos();
    return;
  }

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

  const requestId = ++videoLookupRequestId;
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
    if (requestId !== videoLookupRequestId) return;

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
    if (requestId !== videoLookupRequestId) return;
    setStatus('video-lookup-status', `❌ 오류: ${e.message}`, 'error');
  } finally {
    if (requestId === videoLookupRequestId) {
      btn.disabled = false;
      btn.textContent = '불러오기';
    }
  }
}

// ═══════════════════════════════
// 채널 영상 목록 조회
// ═══════════════════════════════

async function lookupChannelVideos() {
  const rawInput = document.getElementById('video-lookup-url').value.trim();
  const apiKey = localStorage.getItem(STORAGE_KEYS.YT_API_KEY) || '';
  const maxVideos = Number(document.getElementById('vl-channel-limit').value) || 50;

  if (!apiKey) {
    setStatus('video-lookup-status', '❌ 설정 탭에서 YouTube API 키를 먼저 입력해주세요', 'error');
    return;
  }
  if (!rawInput) {
    setStatus('video-lookup-status', '❌ 유튜브 채널 링크를 입력해주세요', 'error');
    return;
  }
  if (rawInput.includes(',')) {
    setStatus('video-lookup-status', '❌ 채널은 한 번에 하나씩 조회해주세요', 'error');
    return;
  }

  const requestId = ++videoLookupRequestId;
  const btn = document.getElementById('video-lookup-btn');
  const resultEl = document.getElementById('video-lookup-result');
  btn.disabled = true;
  btn.textContent = '불러오는 중...';
  resultEl.style.display = 'none';
  setStatus('video-lookup-status', '⏳ 채널과 업로드 영상 정보를 가져오는 중...', 'loading');

  try {
    const { channel, videos } = await fetchChannelVideoCatalog(rawInput, maxVideos, apiKey);
    if (requestId !== videoLookupRequestId) return;

    channelLookupState.channel = channel;
    channelLookupState.videos = videos;
    channelLookupState.filter = 'all';
    renderChannelLookupResult();
    resultEl.style.display = 'block';

    if (videos.length === 0) {
      setStatus('video-lookup-status', '조회 가능한 공개 영상이 없습니다.', '');
      return;
    }

    setStatus('video-lookup-status', `⏳ 영상 ${videos.length}개의 고정/상위 댓글을 확인하는 중...`, 'loading');
    await loadChannelTopComments(videos, apiKey, requestId);
    if (requestId === videoLookupRequestId) {
      setStatus('video-lookup-status', `✅ 영상 ${videos.length}개를 불러왔습니다.`, 'success');
    }
  } catch (e) {
    if (requestId !== videoLookupRequestId) return;
    setStatus('video-lookup-status', `❌ 오류: ${e.message}`, 'error');
  } finally {
    if (requestId === videoLookupRequestId) {
      btn.disabled = false;
      btn.textContent = '불러오기';
    }
  }
}

async function fetchVideoTopComment(videoId, apiKey) {
  try {
    const url = `${YT_API_BASE}/commentThreads?part=snippet&videoId=${videoId}&order=relevance&maxResults=1&textFormat=plainText&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const snippet = data.items?.[0]?.snippet?.topLevelComment?.snippet;
    if (!snippet) return null;
    return {
      authorName: snippet.authorDisplayName || '',
      text: snippet.textOriginal || stripCommentHtml(snippet.textDisplay || ''),
      likeCount: Number(snippet.likeCount) || 0,
    };
  } catch {
    return null;
  }
}

async function loadChannelTopComments(videos, apiKey, requestId) {
  let nextIndex = 0;
  let completed = 0;
  const workerCount = Math.min(5, videos.length);

  async function worker() {
    while (nextIndex < videos.length && requestId === videoLookupRequestId) {
      const index = nextIndex++;
      const video = videos[index];
      video.topComment = await fetchVideoTopComment(video.id, apiKey);
      completed += 1;
      updateChannelTopCommentCell(video);

      if (completed % 5 === 0 || completed === videos.length) {
        setStatus(
          'video-lookup-status',
          `⏳ 고정/상위 댓글 확인 중... ${completed}/${videos.length}`,
          'loading'
        );
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

function setChannelVideoFilter(filter) {
  if (!['all', 'long', 'short'].includes(filter)) return;
  channelLookupState.filter = filter;
  renderChannelLookupResult();
}

function renderChannelLookupResult() {
  const resultEl = document.getElementById('video-lookup-result');
  const { channel, videos, filter } = channelLookupState;
  if (!channel) return;

  const longCount = videos.filter(video => video.type === 'long').length;
  const shortCount = videos.length - longCount;
  const visibleVideos = filter === 'all'
    ? videos
    : videos.filter(video => video.type === filter);
  const channelUrl = `https://www.youtube.com/channel/${channel.id}`;

  resultEl.innerHTML = `
    <div class="section vl-channel-summary">
      <img class="vl-channel-avatar" src="${escapeHTML(channel.thumbnail)}" alt="">
      <div class="vl-channel-summary-main">
        <a class="vl-channel-summary-title" href="${channelUrl}" target="_blank">${escapeHTML(channel.title)}</a>
        <div class="vl-channel-summary-meta">
          <span>구독자 ${formatNumber(channel.subscriberCount)}</span>
          <span>채널 영상 ${formatNumber(channel.videoCount)}개</span>
          <span>이번 조회 ${formatNumber(videos.length)}개</span>
        </div>
      </div>
      <div class="vl-channel-filter" role="group" aria-label="영상 유형 필터">
        ${renderChannelFilterButton('all', `전체 ${videos.length}`, filter)}
        ${renderChannelFilterButton('long', `롱폼 ${longCount}`, filter)}
        ${renderChannelFilterButton('short', `숏폼 추정 ${shortCount}`, filter)}
      </div>
    </div>
    <div class="vl-channel-table-note">
      숏폼은 길이와 업로드일을 기준으로 추정합니다. YouTube API가 댓글의 고정 여부를 제공하지 않아 관련도 1순위 댓글을 표시합니다.
    </div>
    <div class="vl-channel-table-wrap">
      <table class="vl-channel-table">
        <thead>
          <tr>
            <th>영상 썸네일</th>
            <th>제목</th>
            <th>업로드일</th>
            <th>조회수</th>
            <th>좋아요</th>
            <th>설명문</th>
            <th>고정/상위 댓글</th>
          </tr>
        </thead>
        <tbody>
          ${visibleVideos.length > 0
            ? visibleVideos.map(renderChannelVideoRow).join('')
            : '<tr><td colspan="7" class="vl-channel-empty">해당 유형의 영상이 없습니다.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function renderChannelFilterButton(value, label, activeFilter) {
  const active = value === activeFilter;
  return `<button type="button" class="vl-filter-btn${active ? ' active' : ''}" aria-pressed="${active}" onclick="setChannelVideoFilter('${value}')">${label}</button>`;
}

function renderChannelVideoRow(video) {
  const date = new Date(video.publishedAt).toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const typeLabel = video.type === 'short' ? '숏폼 추정' : '롱폼';
  const videoUrl = `https://www.youtube.com/watch?v=${video.id}`;

  return `
    <tr>
      <td class="vl-table-thumbnail-cell">
        <a class="vl-table-thumbnail-link" href="${videoUrl}" target="_blank">
          <img class="vl-table-thumbnail" src="${escapeHTML(video.thumbnail)}" alt="${escapeHTML(video.title)}">
          <span class="vl-duration-badge">${escapeHTML(video.duration)}</span>
        </a>
      </td>
      <td class="vl-table-title-cell">
        <span class="vl-type-badge ${video.type}">${typeLabel}</span>
        <a href="${videoUrl}" target="_blank">${escapeHTML(video.title)}</a>
      </td>
      <td class="vl-table-date">${date}</td>
      <td class="vl-table-number">${formatNumber(video.views)}</td>
      <td class="vl-table-number">${formatNumber(video.likes)}</td>
      <td><div class="vl-table-copy">${video.description ? escapeHTML(video.description) : '<span class="vl-table-muted">설명 없음</span>'}</div></td>
      <td id="vl-channel-comment-${video.id}">${renderChannelTopComment(video.topComment)}</td>
    </tr>
  `;
}

function renderChannelTopComment(comment) {
  if (comment === undefined) {
    return '<span class="vl-table-muted">댓글 확인 중...</span>';
  }
  if (!comment) {
    return '<span class="vl-table-muted">댓글 없음 또는 비활성</span>';
  }
  return `
    <div class="vl-table-comment-author">${escapeHTML(comment.authorName)}${comment.likeCount ? ` · 좋아요 ${formatNumber(comment.likeCount)}` : ''}</div>
    <div class="vl-table-copy">${escapeHTML(comment.text)}</div>
  `;
}

function updateChannelTopCommentCell(video) {
  const cell = document.getElementById(`vl-channel-comment-${video.id}`);
  if (cell) cell.innerHTML = renderChannelTopComment(video.topComment);
}

document.getElementById('video-lookup-url')?.addEventListener('keydown', event => {
  if (event.key === 'Enter') lookupVideo();
});

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
