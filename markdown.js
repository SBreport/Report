/* ══════════════════════════════════
   MARKDOWN.JS — 노션용 마크다운 생성
   ══════════════════════════════════ */

function generateMarkdown(d) {
  const lf = d.longForms || [];
  const sf = d.shortForms || [];
  const total = lf.length + sf.length;
  const gv = d.prevTotalViews !== null ? calcGrowth(d.totalViews, d.prevTotalViews) : null;
  const gs = d.prevSubscribers !== null ? calcGrowth(d.subscribers, d.prevSubscribers) : null;
  const gw = d.prevWatchHours !== null ? calcGrowth(d.watchHours, d.prevWatchHours) : null;
  const lfS = calcTypeStats(lf);
  const sfS = calcTypeStats(sf);

  let m = '';
  m += `# ${d.clientName || '클라이언트'} — ${d.reportMonth} 월간 보고서\n\n`;
  m += `> **제작:** ${d.producerName || '제작업체'}　|　**보고 기간:** ${d.reportMonth}\n\n---\n\n`;

  // 전체 진행 일정
  const allVids = [...lf, ...sf];
  if (allVids.length > 0) {
    m += `## 📅 전체 진행 일정\n\n`;
    // 날짜별로 그룹화
    const byDate = {};
    allVids.forEach(v => {
      if (!v.date) return;
      if (!byDate[v.date]) byDate[v.date] = [];
      byDate[v.date].push(v);
    });
    const sortedDates = Object.keys(byDate).sort();
    sortedDates.forEach(date => {
      const vids = byDate[date];
      const dateLabel = date.replace(/^\d{4}-/, '').replace('-', '/');
      m += `- **${dateLabel}**:`;
      vids.forEach(v => {
        const typeLabel = v.type === 'long' ? '[L]' : '[S]';
        m += ` ${typeLabel} ${v.title} (${formatNumber(v.views)})`;
        if (vids.indexOf(v) < vids.length - 1) m += ' /';
      });
      m += `\n`;
    });
    m += `\n---\n\n`;
  }

  // 작업 완료
  m += `## 📋 작업 완료 내역\n\n`;
  m += `**납품 완료율: ${total} / ${total} (100%)**\n\n`;

  m += `### 🎬 롱폼 (${lf.length}개)\n\n`;
  if (lf.length) {
    m += `| # | 제목 | 업로드일 | 조회수 | 좋아요 | 댓글 | 길이 |\n`;
    m += `|---|------|---------|--------|--------|------|------|\n`;
    lf.forEach((v,i) => { m += `| ${i+1} | ${v.title} | ${v.date} | ${formatNumber(v.views)} | ${formatNumber(v.likes)} | ${formatNumber(v.comments)} | ${v.duration} |\n`; });
    m += `\n> **롱폼 합계** — 총 조회수: ${formatNumber(lfS.views)} / 총 좋아요: ${formatNumber(lfS.likes)} / 총 댓글: ${formatNumber(lfS.comments)} / 평균 조회수: ${formatNumber(lfS.avgViews)} / 평균 길이: ${lfS.avgDuration} / 총 시청시간: ${formatNumber(lfS.watchHours)}시간\n\n`;
  }

  m += `### ⚡ 숏폼 (${sf.length}개)\n\n`;
  if (sf.length) {
    m += `| # | 제목 | 날짜 | 조회수 |\n|---|------|------|--------|\n`;
    sf.forEach((v,i) => { m += `| ${i+1} | ${v.title} | ${v.date} | ${formatNumber(v.views)} |\n`; });
    m += `\n> **숏폼 합계** — 총 조회수: ${formatNumber(sfS.views)} / 총 좋아요: ${formatNumber(sfS.likes)} / 총 댓글: ${formatNumber(sfS.comments)} / 평균 조회수: ${formatNumber(sfS.avgViews)} / 평균 길이: ${sfS.avgDuration} / 총 시청시간: ${formatNumber(sfS.watchHours)}시간\n\n`;
  }
  m += `---\n\n`;

  // 성과
  m += `## 📊 채널 성과 요약\n\n`;
  m += `| 지표 | 이번 달 | 지난 달 | 변화 |\n|------|--------|--------|------|\n`;
  m += `| 총 조회수 | ${formatNumber(d.totalViews)} | ${d.prevTotalViews !== null ? formatNumber(d.prevTotalViews) : '-'} | ${gv ? gv.arrow + ' ' + gv.pct + '%' : '📌 첫 보고'} |\n`;
  m += `| 구독자 | ${formatNumber(d.subscribers)}명 | ${d.prevSubscribers !== null ? formatNumber(d.prevSubscribers) + '명' : '-'} | ${gs ? gs.arrow + ' ' + gs.pct + '%' : '📌 첫 보고'} |\n`;
  m += `| 시청 시간 | ${formatNumber(d.watchHours)}시간 | ${d.prevWatchHours !== null ? formatNumber(d.prevWatchHours) + '시간' : '-'} | ${gw ? gw.arrow + ' ' + gw.pct + '%' : '📌 첫 보고'} |\n\n`;

  const lfBest1 = lf.length ? [...lf].sort((a,b) => b.views - a.views)[0] : null;
  if (lfBest1) {
    m += `### 롱폼 성과 BEST 1\n\n`;
    m += `🥇 **${lfBest1.title}** — ${formatNumber(lfBest1.views)}\n\n`;
    m += `> 롱폼 총 조회수: **${formatNumber(lfS.views)}**\n\n`;
  }


  const top3 = [...sf].sort((a,b) => b.views - a.views).slice(0,3);
  if (top3.length) {
    m += `### 숏폼 성과 TOP 3\n\n`;
    const medals = ['🥇','🥈','🥉'];
    top3.forEach((v,i) => { m += `${medals[i]} **${v.title}** — ${formatNumber(v.views)}\n\n`; });
    m += `> 숏폼 총 조회수: **${formatNumber(sfS.views)}**\n\n`;
  }
  m += `---\n\n`;

  // 분석
  m += `## 💡 콘텐츠 성과 분석\n\n`;
  if (d.lfTopTitle) m += `🎬 **롱폼 TOP: ${d.lfTopTitle}** — 조회수 ${formatNumber(d.lfTopViews)}\n\n`;
  if (d.sfTopTitle) m += `⚡ **숏폼 TOP: ${d.sfTopTitle}** — 조회수 ${formatNumber(d.sfTopViews)}\n\n`;
  if (d.bestVideoReason) m += `> ${d.bestVideoReason}\n\n`;
  m += `---\n\n`;

  // 전략
  m += `## 🚀 다음 달 콘텐츠 전략 제안\n\n`;
  (d.strategies || []).forEach((s,i) => { m += `${i+1}. **${s}**\n`; });
  if (d.nextMonthNote) m += `\n> ${d.nextMonthNote}\n\n`;
  m += `---\n\n*${d.producerName || '제작업체'} · ${d.reportMonth} 월간 보고서*\n`;

  return m;
}
