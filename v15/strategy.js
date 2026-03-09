/* ══════════════════════════════════
   STRATEGY.JS — 다음 달 콘텐츠 전략
   ══════════════════════════════════ */

let strategies = [];
let strategyCounter = 0;

// ─── 초기 전략 3개 ───
document.addEventListener('DOMContentLoaded', () => {
  addStrategy(); addStrategy(); addStrategy();
});

function addStrategy(title = '', description = '') {
  strategyCounter++;
  const id = `st-${strategyCounter}`;
  strategies.push({ id, title, description });

  const list = document.getElementById('strategy-list');
  const card = document.createElement('div');
  card.className = 'strategy-card';
  card.id = id;
  card.innerHTML = `
    <div class="strategy-card-header">
      <span class="strategy-num">${strategies.filter(s => s).length}</span>
      <button class="btn-remove-card" onclick="removeStrategy('${id}')">✕</button>
    </div>
    <div class="strategy-card-body">
      <input class="strategy-title" placeholder="전략 제목" value="${escapeHTML(title)}"
        onchange="updateStrategy('${id}', 'title', this.value)">
      <textarea class="strategy-desc" placeholder="구체적 실행 방안" rows="2"
        onchange="updateStrategy('${id}', 'description', this.value)">${escapeHTML(description)}</textarea>
    </div>
  `;
  list.appendChild(card);
}

function updateStrategy(id, field, val) {
  const s = strategies.find(s => s && s.id === id);
  if (s) s[field] = val;
}

function removeStrategy(id) {
  strategies = strategies.filter(s => s && s.id !== id);
  const el = document.getElementById(id);
  if (el) el.remove();
  document.querySelectorAll('#strategy-list .strategy-num').forEach((el, i) => {
    el.textContent = i + 1;
  });
}

// ─── 성과 기반 자동 전략 제안 (AI 없이) ───
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
    suggestions.push({
      title: `롱폼 TOP 주제 확대`,
      description: `최고 성과 영상 "${lfTop.title}" 주제의 시리즈 또는 후속 콘텐츠를 제작합니다.`
    });
  }

  // 숏폼 분석
  if (sfTop) {
    suggestions.push({
      title: `숏폼 인기 포맷 확대`,
      description: `최고 성과 영상 "${sfTop.title}" 유사 포맷으로 숏폼을 확대 제작합니다.`
    });
  }

  // 롱폼 vs 숏폼 비교
  if (lf.length && sf.length) {
    if (sfStats.avgViews > lfStats.avgViews) {
      suggestions.push({
        title: '숏폼 비중 확대 검토',
        description: '숏폼 평균 조회수가 롱폼보다 높으므로 숏폼 비중을 늘리는 것을 검토합니다.'
      });
    } else {
      suggestions.push({
        title: '롱폼 품질 강화',
        description: '롱폼 평균 조회수가 높으므로 롱폼 품질 강화에 집중합니다.'
      });
    }
  }

  // 댓글 참여율
  const totalViews = [...lf, ...sf].reduce((s, v) => s + v.views, 0);
  const totalComments = [...lf, ...sf].reduce((s, v) => s + v.comments, 0);
  if (totalViews > 0 && totalComments / totalViews > 0.01) {
    suggestions.push({
      title: '시청자 참여형 콘텐츠',
      description: '댓글 참여율이 높으므로 Q&A, 투표 등 시청자 참여형 콘텐츠를 기획합니다.'
    });
  }

  // 기본 제안
  if (suggestions.length < 3) {
    suggestions.push({
      title: '트렌드 키워드 테스트',
      description: '신규 주제 또는 트렌드 키워드 기반 콘텐츠를 테스트합니다.'
    });
  }

  // 전략 추가
  suggestions.forEach(s => {
    addStrategy(s.title, s.description);
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
