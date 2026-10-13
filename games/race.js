'use strict';
// 4) 퀴즈 레이싱: 정답마다 전진, 오답은 충돌(2.5초 정지). 5연속 정답은 터보, 바나나로 앞선 사람을 견제.
const GOAL = 100;
const setScore = (p, s) => { s = Math.max(0, s); p.score = s; p.g.lap = Math.floor(s / GOAL); p.g.pos = s % GOAL; };

module.exports = {
  id: 'race', name: '퀴즈 레이싱', emoji: '🏎️',
  desc: '정답을 맞힐수록 쌩쌩! 연속 정답은 터보, 바나나로 앞차를 견제!',
  how: '문제를 맞히면 앞으로 달려요. 오답은 충돌해서 2.5초간 멈춰요. 5연속 정답이면 터보! 가끔 앞 차에 바나나를 던져요. 가장 많은 바퀴를 돈 사람이 우승.',
  join(room, p) { p.g = { pos: 0, lap: 0 }; },
  onAnswer(room, p, ok) {
    if (!ok) { p.lockUntil = Date.now() + 2500; return { lock: 2500, pos: p.g.pos, lap: p.g.lap }; }
    let step = 6 + Math.min(p.streak, 6);
    const turbo = p.streak > 0 && p.streak % 5 === 0;
    if (turbo) step += 8;
    const lap0 = p.g.lap;
    setScore(p, p.score + step);
    if (p.g.lap > lap0) room.push(`🏁 ${p.name} 님이 ${p.g.lap}바퀴를 완주했어요!`);
    let banana = null;
    if (Math.random() < 0.18) {
      const ahead = [...room.players.values()].filter((o) => o !== p && o.score > p.score).sort((a, b) => a.score - b.score)[0];
      if (ahead) {
        setScore(ahead, ahead.score - 8);
        banana = ahead.name;
        ahead.send({ t: 'g', op: 'banana', by: p.name, pos: ahead.g.pos, lap: ahead.g.lap });
        room.push(`🍌 ${p.name} → ${ahead.name} 바나나 투척!`);
      }
    }
    return { step, turbo, banana, pos: p.g.pos, lap: p.g.lap };
  },
  playerView(room, p) {
    const top = [...room.players.values()].sort((a, b) => b.score - a.score).slice(0, 5);
    if (!top.includes(p)) top.push(p);
    return { lanes: top.map((o) => ({ n: o.name, e: o.emoji, s: o.score, me: o === p })) };
  },
  pub: (p) => ({ lap: p.g.lap || 0, pos: p.g.pos || 0 }),
};
