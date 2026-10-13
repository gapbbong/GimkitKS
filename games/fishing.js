'use strict';
// 3) 낚시왕: 정답이면 낚싯줄을 던지고, 서버가 물고기를 정한다. 클라이언트의 타이밍 미니게임에 성공하면 점수.
const RARITY = ['일반', '희귀', '영웅', '전설'];
const FISH = [
  { n: '낡은 장화', e: '🥾', v: 3, w: 9, r: 0, zone: 0.42, hits: 1, speed: 1.0 },
  { n: '멸치', e: '🐟', v: 10, w: 30, r: 0, zone: 0.38, hits: 1, speed: 1.1 },
  { n: '열대어', e: '🐠', v: 22, w: 22, r: 0, zone: 0.34, hits: 1, speed: 1.2 },
  { n: '복어', e: '🐡', v: 45, w: 14, r: 1, zone: 0.30, hits: 2, speed: 1.3 },
  { n: '문어', e: '🐙', v: 80, w: 9, r: 1, zone: 0.27, hits: 2, speed: 1.4 },
  { n: '상어', e: '🦈', v: 160, w: 6, r: 2, zone: 0.22, hits: 2, speed: 1.6 },
  { n: '고래', e: '🐋', v: 320, w: 3, r: 2, zone: 0.20, hits: 3, speed: 1.7 },
  { n: '보물상자', e: '💰', v: 500, w: 1.2, r: 3, zone: 0.24, hits: 1, speed: 1.2 },
  { n: '전설의 용왕', e: '🐉', v: 1000, w: 0.8, r: 3, zone: 0.15, hits: 3, speed: 2.0 },
];

function roll(streak) {
  const luck = 1 + 0.12 * Math.min(streak, 10);
  const ws = FISH.map((f) => f.w * (f.r >= 1 ? luck : 1));
  let x = Math.random() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < FISH.length; i++) { x -= ws[i]; if (x <= 0) return FISH[i]; }
  return FISH[1];
}

module.exports = {
  id: 'fishing', name: '낚시왕', emoji: '🎣',
  desc: '퀴즈를 맞혀 낚싯줄을 던지고, 타이밍을 맞춰 큰 물고기를 낚아요!',
  how: '문제를 맞히면 낚싯줄을 던질 수 있어요. 입질이 오면 초록 구간에서 "당기기!"를 눌러 낚아 올리세요. 연속 정답이면 큰 물고기가 잘 나와요! 가장 비싼 물고기를 많이 잡은 사람이 우승.',
  join(room, p) { p.g = { pending: null, caught: 0, best: null }; },
  onAnswer(room, p, ok) {
    if (!ok) { p.g.pending = null; return {}; }
    const fish = roll(p.streak);
    p.g.pending = { fish, t: Date.now() };
    return { fish: { ...fish, rn: RARITY[fish.r] } };
  },
  onMsg(room, p, m) {
    if (m.op !== 'reel') return;
    const pend = p.g.pending;
    p.g.pending = null;
    if (!pend || Date.now() - pend.t < 1600) return;
    if (!m.ok) return p.send({ t: 'g', op: 'escaped', score: p.score });
    const f = pend.fish;
    p.score += f.v;
    p.g.caught++;
    if (!p.g.best || f.v > p.g.best.v) p.g.best = { e: f.e, v: f.v };
    if (f.r >= 2) room.push(`${f.e} ${p.name} 님이 ${RARITY[f.r]} ${f.n}을(를) 낚았어요! (+${f.v})`);
    p.send({ t: 'g', op: 'caught', fish: { ...f, rn: RARITY[f.r] }, score: p.score });
  },
  pub: (p) => ({ caught: p.g.caught || 0, best: p.g.best ? p.g.best.e : null }),
};
