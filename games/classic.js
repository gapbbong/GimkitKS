'use strict';
// 1) 머니 퀴즈: 정답으로 돈을 벌고 업그레이드를 사서 더 많이 번다.
const UP = {
  value: { name: '💎 정답 상금', desc: '정답당 +50원', base: 150, max: 8 },
  streak: { name: '🔥 연속 보너스', desc: '연속 정답 보너스 강화', base: 250, max: 6 },
  shield: { name: '🛡️ 오답 방어', desc: '오답 시 잃는 돈 감소', base: 200, max: 5 },
};
const cost = (k, lvl) => Math.round(UP[k].base * Math.pow(1.7, lvl) / 10) * 10;
const shop = (p) => Object.entries(UP).map(([k, u]) => ({ k, name: u.name, desc: u.desc, lvl: p.g.up[k], max: u.max, cost: p.g.up[k] >= u.max ? null : cost(k, p.g.up[k]) }));

module.exports = {
  id: 'classic', name: '머니 퀴즈', emoji: '💰',
  desc: '정답으로 돈을 모으고 업그레이드로 더 빨리 부자가 되세요!',
  how: '문제를 맞히면 돈을 벌어요. 상점에서 업그레이드를 사서 돈 버는 속도를 올리세요. 가장 부자가 된 사람이 우승!',
  join(room, p) { p.g = { up: { value: 0, streak: 0, shield: 0 }, best: 0 }; },
  initData: (room, p) => ({ shop: shop(p) }),
  onAnswer(room, p, ok) {
    const u = p.g.up;
    if (ok) {
      const base = 100 + 50 * u.value;
      const mult = 1 + Math.min(p.streak - 1, 10) * 0.05 * (1 + u.streak);
      const earn = Math.round(base * mult);
      p.score += earn;
      if (p.streak > p.g.best) p.g.best = p.streak;
      if (earn >= 600) room.push(`💸 ${p.name} 님이 한 번에 ${earn}원을 벌었어요!`);
      return { earn, shop: shop(p) };
    }
    const loss = Math.min(p.score, Math.round(p.score * 0.06 * (1 - 0.2 * u.shield)));
    p.score -= loss;
    return { loss, shop: shop(p) };
  },
  onMsg(room, p, m) {
    if (m.op !== 'buy' || !UP[m.k]) return;
    const lvl = p.g.up[m.k];
    if (lvl >= UP[m.k].max) return;
    const c = cost(m.k, lvl);
    if (p.score < c) return;
    p.score -= c;
    p.g.up[m.k]++;
    p.send({ t: 'g', op: 'shop', score: p.score, shop: shop(p) });
  },
  pub: (p) => ({ up: p.g.up ? p.g.up.value + p.g.up.streak + p.g.up.shield : 0, best: p.g.best }),
};
