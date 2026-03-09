/* ══════════════════════════════════
   YOUTUBE-API.JS — YouTube Data API 연동
   ══════════════════════════════════ */

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';

// ─── API 키 테스트 ───
async function testYouTubeAPI() {
  const key = document.getElementById('yt-api-key').value.trim();

  if (!key) {
    setStatus('yt-status', '❌ API 키를 입력해주세요', 'error');
    return;
  }

  setStatus('yt-status', '⏳ 테스트 중...', 'loading');

  try {
    // 간단한 검색 요청으로 키 유효성 확인
    const res = await fetch(
      `${YT_API_BASE}/search?part=snippet&q=test&maxResults=1&key=${key}`
    );

    if (res.ok) {
      setStatus('yt-status', '✅ API 키가 유효합니다', 'success');
    } else {
      const err = await res.json();
      const msg = err?.error?.message || '알 수 없는 오류';
      setStatus('yt-status', `❌ 오류: ${msg}`, 'error');
    }
  } catch (e) {
    setStatus('yt-status', '❌ 네트워크 오류: 인터넷 연결을 확인해주세요', 'error');
  }
}

// ─── 채널 ID 추출 ───
async function resolveChannelId(channelInput, apiKey) {
  let identifier = channelInput.trim();

  // @핸들 형식: youtube.com/@handle 또는 @handle
  const handleMatch = identifier.match(/@([^\s/]+)/);
  if (handleMatch) {
    // forHandle API로 정확한 채널 조회 (검색이 아닌 직접 조회)
    const handle = handleMatch[1];
    const res = await fetch(
      `${YT_API_BASE}/channels?part=id&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`
    );
    const data = await res.json();
    if (data.items && data.items.length > 0) {
      return data.items[0].id;
    }
    // forHandle 실패 시 검색 폴백
    const searchRes = await fetch(
      `${YT_API_BASE}/search?part=snippet&q=${encodeURIComponent(handle)}&type=channel&maxResults=1&key=${apiKey}`
    );
    const searchData = await searchRes.json();
    if (searchData.items && searchData.items.length > 0) {
      return searchData.items[0].snippet.channelId;
    }
    return null;
  }

  // channel/UCxxxx 형식
  const channelMatch = identifier.match(/channel\/(UC[\w-]+)/);
  if (channelMatch) return channelMatch[1];

  // 그냥 UCxxxx 형식
  if (identifier.startsWith('UC')) return identifier;

  // 기타: 검색으로 찾기
  const res = await fetch(
    `${YT_API_BASE}/search?part=snippet&q=${encodeURIComponent(identifier)}&type=channel&maxResults=1&key=${apiKey}`
  );
  const data = await res.json();
  if (data.items && data.items.length > 0) {
    return data.items[0].snippet.channelId;
  }
  return null;
}

// ─── 채널 통계 가져오기 (구독자 수 등) ───
async function fetchChannelStats(channelId, apiKey) {
  const res = await fetch(
    `${YT_API_BASE}/channels?part=statistics&id=${channelId}&key=${apiKey}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.items || data.items.length === 0) return null;
  const stats = data.items[0].statistics;
  return {
    subscriberCount: Number(stats.subscriberCount) || 0,
    viewCount: Number(stats.viewCount) || 0,
    videoCount: Number(stats.videoCount) || 0,
  };
}

// ─── 기간 내 영상 불러오기 ───
async function fetchChannelVideos(channelInput, startDate, endDate, apiKey) {
  // 채널 ID 확인
  const channelId = await resolveChannelId(channelInput, apiKey);
  if (!channelId) {
    throw new Error('채널을 찾을 수 없습니다. URL을 확인해주세요.');
  }

  // ISO 8601 형식으로 변환
  const publishedAfter = new Date(startDate + 'T00:00:00Z').toISOString();
  const publishedBefore = new Date(endDate + 'T23:59:59Z').toISOString();

  // 검색 API로 영상 목록 가져오기
  let allVideoIds = [];
  let pageToken = '';

  do {
    const searchUrl = `${YT_API_BASE}/search?part=snippet&channelId=${channelId}&type=video&order=date&publishedAfter=${publishedAfter}&publishedBefore=${publishedBefore}&maxResults=50&key=${apiKey}${pageToken ? '&pageToken=' + pageToken : ''}`;

    const res = await fetch(searchUrl);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err?.error?.message || 'YouTube API 오류');
    }

    const data = await res.json();
    const ids = data.items.map(item => item.id.videoId);
    allVideoIds = allVideoIds.concat(ids);
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  if (allVideoIds.length === 0) {
    return { videos: [], channelId };
  }

  // 영상 상세 정보 가져오기 (50개씩 배치)
  let allVideos = [];
  for (let i = 0; i < allVideoIds.length; i += 50) {
    const batch = allVideoIds.slice(i, i + 50).join(',');
    const detailUrl = `${YT_API_BASE}/videos?part=snippet,statistics,contentDetails&id=${batch}&key=${apiKey}`;

    const res = await fetch(detailUrl);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err?.error?.message || 'YouTube API 오류');
    }

    const data = await res.json();
    const videos = data.items.map(item => parseVideoData(item));
    allVideos = allVideos.concat(videos);
  }

  // 업로드일 기준 정렬 (최신순)
  allVideos.sort((a, b) => new Date(a.date) - new Date(b.date));

  return { videos: allVideos, channelId };
}

// ─── 영상 데이터 파싱 ───
function parseVideoData(item) {
  const duration = parseDuration(item.contentDetails.duration);
  const durationSeconds = durationToSeconds(item.contentDetails.duration);

  return {
    id: item.id,
    title: item.snippet.title,
    date: item.snippet.publishedAt.split('T')[0],
    thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
    views: Number(item.statistics.viewCount) || 0,
    likes: Number(item.statistics.likeCount) || 0,
    comments: Number(item.statistics.commentCount) || 0,
    duration: duration,
    durationSeconds: durationSeconds,
    type: durationSeconds <= 180 ? 'short' : 'long',
    url: `https://www.youtube.com/watch?v=${item.id}`,
  };
}

// ─── ISO 8601 Duration 파싱 ───
function parseDuration(iso) {
  // PT1H2M3S → 1:02:03, PT12M34S → 12:34, PT45S → 0:45
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '0:00';

  const h = parseInt(match[1] || 0);
  const m = parseInt(match[2] || 0);
  const s = parseInt(match[3] || 0);

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function durationToSeconds(iso) {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1] || 0) * 3600) +
         (parseInt(match[2] || 0) * 60) +
         (parseInt(match[3] || 0));
}

// ─── 평균 길이 계산 ───
function averageDuration(videos) {
  if (videos.length === 0) return '0:00';
  const totalSec = videos.reduce((sum, v) => sum + v.durationSeconds, 0);
  const avgSec = Math.round(totalSec / videos.length);
  const m = Math.floor(avgSec / 60);
  const s = avgSec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}:${String(rm).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}
