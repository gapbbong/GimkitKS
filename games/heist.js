'use strict';
// 6) 보물 대작전: 정답이면 상자 3개 중 하나를 고른다. 코인, 잭팟, 도둑질, 바꿔치기, 방어막, 폭탄!
const START = 500;
const POOL = [
  { k: 'coin', w: 34, amts: [100, 150, 200, 300] },
  { k: 'jackpot', w: 6 },
  { k: 'steal', w: 20 },
  { k: 'swap', w: 5 },
  { k: 'shield', w: 11 },
  { k: 'bomb', w: 14 },
];
const spin = () => {
  let x = Math.random() * POOL.reduce((a, b) => a + b.w, 0);
  for (const o of POOL) { x -= o.w; if (x <= 0) return o; }
  return POOL[0];
};
const others = (room, p) => [...room.players.values()].filter((o) => o !== p);

module.exports = {
  id: 'heist', name: '보물 대작전', emoji: '🏴‍☠️',
  desc: '정답을 맞히고 상자를 열어요! 잭팟도, 도둑질도, 폭탄도 있어요!',
  how: '문제를 맞히면 상자 3개가 나와요. 하나를 골라 열면 코인·잭팟은 +, 도둑질은 1등을 노려 15%를 훔치고, 바꿔치기는 점수를 맞바꿔요. 폭탄은 조심! 방어막은 한 번 도둑질을 막아줘요. 시간이 끝났을 때 가장 부자인 사람이 우승.',
  join(room, p) { p.g = { shield: false, chests: null, stolen: 0, steals: 0 }; p.score = START; },
  onAnswer(room, p, ok) {
    if (!ok) { p.g.chests = null; return {}; }
    p.g.chests = [spin(), spin(), spin()];
    return { chests: 3 };
  },
  onMsg(room, p, m) {
    if (m.op !== 'open' || !p.g.chests) return;
    const i = +m.i;
    if (!(i >= 0 && i < 3)) return;
    const kinds = p.g.chests.map((c) => c.k);
    const c = p.g.chests[i];
    p.g.chests = null;
    let text = '', amount = 0;
    switch (c.k) {
      case 'coin': amount = c.amts[Math.floor(Math.random() * c.amts.length)]; p.score += amount; text = `코인 +${amount}`; break;
      case 'jackpot': amount = 1000; p.score += amount; text = '잭팟! +1000'; room.push(`🎰 ${p.name} 님이 잭팟을 터뜨렸어요! (+1000)`); break;
      case 'shield': p.g.shield = true; text = '방어막 획득! 다음 도둑질을 막아요'; break;
      case 'bomb': amount = Math.min(p.score, 150); p.score -= amount; text = `폭탄! -${amount}`; break;
      case 'steal': {
        const list = others(room, p);
        if (!list.length) { text = '훔칠 상대가 없어요'; break; }
        const top = list.sort((a, b) => b.score - a.score)[0];
        const v = Math.random() < 0.7 ? top : list[Math.floor(Math.random() * list.length)];
        if (v.g.shield) {
          v.g.shield = false;
          text = `${v.name} 님의 방어막에 막혔어요!`;
          v.send({ t: 'g', op: 'blocked', by: p.name });
          room.push(`🛡️ ${v.name} 님이 ${p.name} 님의 도둑질을 막았어요!`);
        } else {
          amount = Math.floor(v.score * 0.15);
          v.score -= amount; p.score += amount; v.g.stolen += amount; p.g.steals++;
          text = `${v.name} 님에게서 ${amount} 훔쳤어요!`;
          v.send({ t: 'g', op: 'stolen', by: p.name, amount, score: v.score });
          room.push(`🦹 ${p.name} 님이 ${v.name} 님의 ${amount}을(를) 훔쳤어요!`);
        }
        break;
      }
      case 'swap': {
        const list = others(room, p);
        if (!list.length) { text = '바꿀 상대가 없어요'; break; }
        const top = list.sort((a, b) => b.score - a.score)[0];
        const v = Math.random() < 0.5 ? top : list[Math.floor(Math.random() * list.length)];
        [p.score, v.score] = [v.score, p.score];
        text = `${v.name} 님과 점수를 바꿨어요!`;
        v.send({ t: 'g', op: 'swapped', by: p.name, score: v.score });
        room.push(`🔄 ${p.name} ↔ ${v.name} 점수 바꿔치기!`);
        break;
      }
    }
    p.send({ t: 'g', op: 'opened', i, kinds, kind: c.k, text, score: p.score, shield: p.g.shield });
  },
  pub: (p) => ({ shield: !!p.g.shield, steals: p.g.steals || 0 }),
};
