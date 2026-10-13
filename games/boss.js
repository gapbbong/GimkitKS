'use strict';
// 5) 보스 레이드(협동): 모두의 정답이 공격이 되어 보스를 쓰러뜨린다. 보스도 반격한다.
const BOSSES = [['슬라임', '🟢'], ['고블린', '👺'], ['미라', '🧟'], ['유령', '👻'], ['악마', '😈'], ['외계인', '👽'], ['로봇', '🤖'], ['드래곤', '🐲'], ['마왕', '👹']];
const KO_MS = 7000;

function spawn(room) {
  const g = room.g;
  const n = Math.max(2, room.active().length);
  const b = BOSSES[(g.level - 1) % BOSSES.length];
  g.maxHp = Math.round(n * (110 + 35 * g.level));
  g.hp = g.maxHp;
  g.name = (g.level > BOSSES.length ? '강화 ' : '') + b[0];
  g.emoji = b[1];
  g.atkEvery = Math.max(2800, 5200 - g.level * 300);
  g.nextAtk = Date.now() + g.atkEvery;
}
function damage(room, p, now) {
  const h = p.g.hearts = Math.max(0, p.g.hearts - 1);
  if (h === 0) {
    p.g.ko = now + KO_MS; p.lockUntil = p.g.ko;
    p.send({ t: 'g', op: 'ko', ms: KO_MS });
  }
  return h;
}
const pickN = (arr, n) => arr.slice().sort(() => Math.random() - 0.5).slice(0, n);

module.exports = {
  id: 'boss', name: '보스 레이드', emoji: '🐲',
  desc: '모두 함께 보스를 쓰러뜨려요! 정답 = 공격, 오답 = 내 하트가 깎여요.',
  how: '정답을 맞히면 보스를 공격해요(연속 정답일수록 강해요). 오답이거나 보스에게 맞으면 하트가 줄고, 0이 되면 7초간 기절! 모두 힘을 합쳐 보스를 쓰러뜨리면 더 강한 보스가 나와요. 가장 많은 데미지를 넣은 사람이 MVP.',
  init(room) { room.g = { level: 1, kills: 0, atkN: 0, aoe: false }; spawn(room); },
  join(room, p) { p.g = { hearts: 3, ko: 0, dmg: 0 }; },
  onAnswer(room, p, ok) {
    const now = Date.now();
    if (p.g.ko > now) return { ko: true, hearts: 0 };
    if (!ok) return { hearts: damage(room, p, now), ko: p.g.ko > now };
    const g = room.g;
    let dmg = 10 + Math.min(p.streak, 10) * 2;
    const crit = Math.random() < 0.15;
    if (crit) dmg *= 2;
    g.hp -= dmg; p.g.dmg += dmg; p.score += dmg;
    let kill = false;
    if (g.hp <= 0) {
      kill = true; g.kills++;
      p.score += 100; p.g.dmg += 100;
      room.push(`🎉 ${p.name} 님이 ${g.name}에게 마지막 일격! 보스 격파!`);
      g.level++;
      for (const o of room.players.values()) { o.g.hearts = 3; o.g.ko = 0; o.lockUntil = 0; o.send({ t: 'g', op: 'revive', hearts: 3 }); }
      spawn(room);
    }
    return { dmg, crit, kill, hearts: p.g.hearts };
  },
  tick(room, now) {
    const g = room.g;
    for (const p of room.players.values()) {
      if (p.g.ko && now >= p.g.ko) { p.g.ko = 0; p.g.hearts = 3; p.send({ t: 'g', op: 'revive', hearts: 3 }); }
    }
    if (now < g.nextAtk) return;
    g.atkN++;
    g.nextAtk = now + g.atkEvery;
    g.aoe = g.atkN % 5 === 0;
    const alive = room.active().filter((p) => !p.g.ko);
    if (!alive.length) return;
    const targets = g.aoe ? pickN(alive, Math.ceil(alive.length * 0.6)) : pickN(alive, Math.max(1, Math.ceil(alive.length * 0.3)));
    for (const p of targets) {
      const h = damage(room, p, now);
      p.send({ t: 'g', op: 'hit', hearts: h, ko: p.g.ko > now });
    }
    room.push(`💥 ${g.name}의 ${g.aoe ? '광역 공격' : '공격'}! ${targets.length}명이 피해를 입었어요`);
  },
  hostView(room) { const g = room.g; return { name: g.name, emoji: g.emoji, hp: Math.max(0, g.hp), maxHp: g.maxHp, level: g.level, kills: g.kills, atk: g.atkN, aoe: g.aoe }; },
  playerView(room, p) {
    const g = room.g;
    return { boss: { name: g.name, emoji: g.emoji, hp: Math.max(0, g.hp), maxHp: g.maxHp, level: g.level }, hearts: p.g.hearts, ko: Math.max(0, p.g.ko - Date.now()) };
  },
  pub: (p) => ({ hearts: p.g.hearts ?? 3, ko: !!(p.g.ko && p.g.ko > Date.now()), dmg: p.g.dmg || 0 }),
  summary: (room) => ({ kills: room.g.kills, level: room.g.level }),
};
