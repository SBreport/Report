/* ══════════════════════════════════
   PREVIEW.JS — 미리보기 렌더링 & 내보내기
   ══════════════════════════════════ */

function renderPreview(data) {
  const box = document.getElementById('preview-rendered');
  const lf = data.longForms;
  const sf = data.shortForms;
  const totalDone = lf.length + sf.length;
  const contractLong = data.contractLong || lf.length;
  const contractShort = data.contractShort || sf.length;
  const totalContract = contractLong + contractShort;
  const pct = totalContract ? Math.round((totalDone / totalContract) * 100) : 0;
  const barWidth = Math.min(100, pct);
  const barColor = pct >= 100 ? '#16a34a' : '#2563eb';

  const gv = data.prevTotalViews !== null ? calcGrowth(data.totalViews, data.prevTotalViews) : null;
  const gs = data.prevSubscribers !== null ? calcGrowth(data.subscribers, data.prevSubscribers) : null;
  const gw = data.prevWatchHours !== null ? calcGrowth(data.watchHours, data.prevWatchHours) : null;

  // 롱폼/숏폼 합계
  const lfStats = calcTypeStats(lf);
  const sfStats = calcTypeStats(sf);

  // 롱폼 BEST 1
  const lfBest1 = lf.length ? [...lf].sort((a,b) => b.views - a.views)[0] : null;

  // 숏폼 TOP3
  const top3 = [...sf].sort((a,b) => b.views - a.views).slice(0,3);

  let h = '';
  h += `<h1>${escapeHTML(data.clientName) || '클라이언트'}</h1>`;
  h += `<p style="color:#9b9a97;">${data.reportMonth} · ${escapeHTML(data.producerName) || '제작업체'}</p><hr>`;

  // 전체 진행 일정 (달력)
  const allVideos = [...lf, ...sf];
  if (allVideos.length > 0 && data.year && data.month) {
    h += `<h2>📅 전체 진행 일정</h2>`;
    h += buildPreviewCalendarHTML(data.year, data.month, allVideos);
  }

  // 작업 완료
  h += `<h2>📋 작업 완료 내역</h2>`;
  h += `<p><strong>납품 완료율: ${totalDone} / ${totalContract} (${pct}%)</strong></p>`;
  h += `<div class="pv-progress"><div class="pv-progress-fill" style="width:${barWidth}%;background:${barColor}"></div></div>`;

  // 롱폼
  h += `<h3>🎬 롱폼 (${lf.length}${data.contractLong ? '/' + data.contractLong : ''}개)</h3>`;
  if (lf.length) {
    lf.forEach((v,i) => { h += renderPreviewVideoItem(v, i+1); });
    h += renderPreviewTypeSummary(lfStats);
  } else { h += `<p style="color:#9b9a97;">롱폼 영상 없음</p>`; }

  h += `<hr style="margin:20px 0;">`;

  // 숏폼
  h += `<h3>⚡ 숏폼 (${sf.length}${data.contractShort ? '/' + data.contractShort : ''}개)</h3>`;
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

  if (data.trafficSources && data.trafficSources.length) {
    h += `<h3>📡 유입 경로 요약</h3>`;
    h += `<blockquote>${summarizeTrafficSources(data.trafficSources)}</blockquote>`;
    normalizeTrafficSources(data.trafficSources).forEach(item => {
      const watchedHours = ((item.minutesWatched || 0) / 60).toFixed(1);
      h += `<div style="margin-bottom:8px;padding:10px 12px;border:1px solid #e9e9e7;border-radius:8px;background:#fff;">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
          <div>
            <div style="font-size:13px;font-weight:600;color:#37352f;">${item.name}</div>
            <div style="font-size:12px;color:#787774;">${item.description}</div>
          </div>
          <div style="font-size:12px;font-weight:700;color:#37352f;white-space:nowrap;">${item.share.toFixed(1)}%</div>
        </div>
        <div style="font-size:12px;color:#525048;margin-top:6px;">조회수 ${formatNumber(item.views)} · 시청시간 ${watchedHours}시간</div>
      </div>`;
    });
  }

  if (lfBest1) {
    h += `<h3>롱폼 성과 BEST 1</h3>`;
    h += `<p>🥇 <strong>${escapeHTML(lfBest1.title)}</strong> — ${formatNumber(lfBest1.views)}</p>`;
    const totalLfViews = lf.reduce((s,v) => s + v.views, 0);
    h += `<blockquote>롱폼 총 조회수: <strong>${formatNumber(totalLfViews)}</strong></blockquote>`;
  }

  if (top3.length) {
    h += `<h3>숏폼 성과 TOP 3</h3>`;
    const medals = ['🥇','🥈','🥉'];
    top3.forEach((v,i) => { h += `<p>${medals[i]} <strong>${escapeHTML(v.title)}</strong> — ${formatNumber(v.views)}</p>`; });
    const totalSfViews = sf.reduce((s,v) => s + v.views, 0);
    h += `<blockquote>숏폼 총 조회수: <strong>${formatNumber(totalSfViews)}</strong></blockquote>`;
  }
  h += `<hr>`;

  // 성과 분석 — 자동 TOP
  h += `<h2>💡 콘텐츠 성과 분석</h2>`;
  if (data.lfTopTitle) {
    h += `<div style="padding:12px 16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;margin-bottom:8px;">`;
    h += `<span style="font-size:12px;color:#2563eb;font-weight:600;">🎬 롱폼 TOP</span><br>`;
    h += `<strong>${escapeHTML(data.lfTopTitle)}</strong> — 조회수 ${formatNumber(data.lfTopViews)}</div>`;
  }
  if (data.sfTopTitle) {
    h += `<div style="padding:12px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;margin-bottom:8px;">`;
    h += `<span style="font-size:12px;color:#d97706;font-weight:600;">⚡ 숏폼 TOP</span><br>`;
    h += `<strong>${escapeHTML(data.sfTopTitle)}</strong> — 조회수 ${formatNumber(data.sfTopViews)}</div>`;
  }
  if (data.bestVideoReason) h += `<blockquote>${escapeHTML(data.bestVideoReason)}</blockquote>`;
  h += `<hr>`;

  // 전략
  h += `<h2>🚀 다음 달 콘텐츠 전략 제안</h2>`;
  data.strategies.forEach((s, i) => {
    if (typeof s === 'string') {
      // 하위 호환: 기존 단순 텍스트
      h += `<p>${i + 1}. <strong>${escapeHTML(s)}</strong></p>`;
    } else {
      // 새 형식: title + description
      h += `<div style="padding:8px 0;${i > 0 ? 'border-top:1px solid #f0f0ee;' : ''}">`;
      h += `<p><strong>${i + 1}. ${escapeHTML(s.title || '')}</strong></p>`;
      if (s.description) h += `<p style="color:#6b6b6b;font-size:13px;margin-top:2px;">${escapeHTML(s.description)}</p>`;
      h += `</div>`;
    }
  });
  if (data.nextMonthNote) h += `<blockquote>${escapeHTML(data.nextMonthNote)}</blockquote>`;
  h += `<hr>`;
  h += `<div class="pv-footer">${escapeHTML(data.producerName) || '제작업체'} · ${data.reportMonth} 월간 보고서</div>`;

  box.innerHTML = h;

  // 마크다운도 생성
  const md = generateMarkdown(data);
  document.getElementById('markdown-raw').textContent = md;
}

function renderPreviewVideoItem(v, idx) {
  let analyticsHTML = '';

  if (v.analytics) {
    const a = v.analytics;
    const avgMin = Math.floor(a.averageViewDuration / 60);
    const avgSec = a.averageViewDuration % 60;
    const watchedHours = ((a.estimatedMinutesWatched || 0) / 60).toFixed(1);
    analyticsHTML += `<div class="pv-video-analytics">`;
    analyticsHTML += `📊 기간 조회수 ${formatNumber(a.views)} | ⏱ 평균시청 ${avgMin}:${String(avgSec).padStart(2, '0')} | 🕒 ${watchedHours}시간 | 📈 +${formatNumber(a.subscribersGained)}`;
    if (a.retention30s != null) analyticsHTML += ` | 🎯 30초 ${a.retention30s}%`;
    analyticsHTML += `</div>`;
  }

  return `<div class="pv-video-item">
    <div class="pv-video-rank">${idx}</div>
    ${v.thumbnail ? `<img class="pv-video-thumb" src="${v.thumbnail}" alt="">` : '<div class="pv-video-thumb" style="background:#f0f0ee;display:flex;align-items:center;justify-content:center;font-size:11px;color:#9b9a97;">No img</div>'}
    <div class="pv-video-info">
      <div class="pv-video-title"><a href="${v.url || '#'}" target="_blank" style="color:inherit;text-decoration:none;">${escapeHTML(v.title)}</a></div>
      <div class="pv-video-meta">
        <span>📅 ${v.date}</span><span>👁️ ${formatNumber(v.views)}</span>
        <span>❤️ ${formatNumber(v.likes)}</span><span>💬 ${formatNumber(v.comments)}</span>
        <span>⏱ ${v.duration}</span>
      </div>
      ${analyticsHTML}
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

// ─── 미리보기 보고서용 달력 HTML (모든 해당 월 표시) ───
function buildPreviewCalendarHTML(yearIgnored, monthIgnored, videos) {
  const months = getVideoMonths(videos);
  if (months.length === 0) return '';

  // 시작월~끝월까지 모든 월의 달력 생성
  const startYM = months[0].split('-').map(Number);
  const endYM = months[months.length - 1].split('-').map(Number);

  let h = '';
  let y = startYM[0], m = startYM[1];
  while (y < endYM[0] || (y === endYM[0] && m <= endYM[1])) {
    h += `<div style="font-size:13px;font-weight:600;color:#525048;margin:12px 0 6px;">${y}년 ${m}월</div>`;
    h += buildCalendarHTML(y, m, videos, 'preview');
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return h;
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
  .pv-video-analytics { font-size: 11px; color: #6b6b6b; margin-top: 4px; }

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

  /* 달력 */
  .pv-calendar-grid {
    display: grid; grid-template-columns: repeat(7, 1fr);
    border: 1px solid #e9e9e7; border-radius: 8px; overflow: hidden;
    margin: 12px 0 16px; font-size: 12px;
  }
  .pv-calendar-header {
    padding: 6px 4px; text-align: center; font-size: 11px;
    font-weight: 600; color: #9b9a97; background: #f7f6f3;
    border-bottom: 1px solid #e9e9e7;
  }
  .pv-calendar-header.sun { color: #e03e3e; }
  .pv-calendar-header.sat { color: #2563eb; }
  .pv-calendar-cell {
    min-height: 60px; padding: 3px;
    border-right: 1px solid #f0f0ee; border-bottom: 1px solid #f0f0ee;
    background: #fff;
  }
  .pv-calendar-cell:nth-child(7n) { border-right: none; }
  .pv-calendar-cell.empty { background: #fafaf8; }
  .pv-calendar-cell.has-video { background: #f8fdf5; }
  .pv-calendar-date {
    font-size: 11px; font-weight: 600; color: #787774;
    margin-bottom: 2px; padding: 1px 3px;
  }
  .pv-calendar-cell.sun .pv-calendar-date { color: #e03e3e; }
  .pv-calendar-cell.sat .pv-calendar-date { color: #2563eb; }
  .pv-calendar-badge {
    display: flex; align-items: center; gap: 2px;
    padding: 1px 4px; border-radius: 3px;
    font-size: 9px; font-weight: 600; margin-bottom: 2px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .pv-calendar-badge.long { background: #eff6ff; color: #2563eb; }
  .pv-calendar-badge.short { background: #fffbeb; color: #d97706; }
  .cal-type-tag { font-size: 9px; font-weight: 800; flex-shrink: 0; }

  /* 프린트 최적화 */
  @media print {
    body { padding: 20px; }
    .pv-video-item { break-inside: avoid; }
    .pv-calendar-grid { break-inside: avoid; }
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
