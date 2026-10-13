'use strict';
// 2) 점프 오르기: 클라이언트가 플랫폼 점프를 시뮬레이션하고, 서버는 높이를 검증/집계한다.
// 금색 '?' 발판에서 퀴즈를 맞히면 로켓 부스트(+약 200m).
module.exports = {
  id: 'jump', name: '점프 오르기', emoji: '🦘',
  desc: '발판을 밟고 하늘 끝까지! 금색 ? 발판의 퀴즈를 맞히면 로켓 발사 🚀',
  how: '좌우를 눌러 움직이며 계속 점프해 올라가요. 금색 ? 발판에서 퀴즈를 맞히면 로켓으로 200m를 한 번에! 가장 높이 오른 사람이 우승.',
  join(room, p) { p.g = { allow: 400, lastT: Date.now(), mile: 0, rockets: 0 }; },
  onAnswer(room, p, ok) {
    if (ok) { p.g.allow = Math.min(p.g.allow + 450, p.score + 1200); p.g.rockets++; }
    return { boost: ok };
  },
  onMsg(room, p, m) {
    if (m.op !== 'h') return;
    const now = Date.now();
    const dt = Math.min(3, (now - p.g.lastT) / 1000);
    p.g.lastT = now;
    p.g.allow = Math.min(p.g.allow + dt * 70, p.score + 1200);
    const h = Math.min(Math.floor(+m.h || 0), Math.floor(p.g.allow));
    if (h > p.score) {
      p.score = h;
      const mile = Math.floor(h / 250);
      if (mile > p.g.mile) { p.g.mile = mile; room.push(`🏔️ ${p.name} 님이 ${mile * 250}m 돌파!`); }
    }
  },
  pub: (p) => ({ rockets: p.g.rockets || 0 }),
};
