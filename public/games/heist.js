// 보물 대작전 (학생 화면): 정답 → 상자 3개 중 선택
Games.heist = (() => {
  let cx, root, score = 500, busy = false, picking = false;
  const $ = (s) => root && root.querySelector(s);
  const ICON = { coin: ['🪙', '코인'], jackpot: ['🎰', '잭팟'], steal: ['🦹', '도둑질'], swap: ['🔄', '바꿔치기'], shield: ['🛡️', '방어막'], bomb: ['💣', '폭탄'] };

  function money(v) { score = v; const e = $('#ht-score'); if (e) e.textContent = v.toLocaleString(); }
  function msg(t) { const e = $('#ht-msg'); if (e) e.textContent = t; }

  function askNext() {
    if (busy) return;
    busy = true;
    const btn = $('#ht-ask'); btn.disabled = true;
    $('#ht-chests').innerHTML = '';
    cx.ask((res) => {
      busy = false;
      if (!root) return;
      btn.disabled = false;
      if (res.locked) return;
      if (!res.correct) { msg('❌ 오답! 상자를 얻지 못했어요'); btn.textContent = '다음 문제 ▶'; return; }
      msg('✅ 정답! 상자를 하나 골라요');
      btn.style.display = 'none';
      picking = true;
      const box = $('#ht-chests');
      for (let i = 0; i < 3; i++) {
        const b = document.createElement('button');
        b.className = 'chest'; b.textContent = '🎁';
        b.onclick = () => { if (!picking) return; picking = false; box.querySelectorAll('.chest').forEach((x) => (x.disabled = true)); b.classList.add('chosen'); cx.send({ t: 'g', op: 'open', i }); };
        box.appendChild(b);
      }
    });
  }

  return {
    mount(c) {
      cx = c; root = cx.root; score = 500; busy = false; picking = false;
      root.innerHTML = `<div class="ht"><div class="ht-money">🪙 <span id="ht-score">500</span> <span id="ht-sh"></span></div>
        <div class="ht-msg" id="ht-msg">문제를 맞히면 보물 상자를 열 수 있어요!</div>
        <div class="ht-chests" id="ht-chests"></div>
        <button id="ht-ask" class="bigbtn">문제 풀기 ▶</button></div>`;
      $('#ht-ask').onclick = askNext;
    },
    tick(m) { if (!busy && !picking) money(m.score); },
    msg(m) {
      if (m.op === 'opened') {
        [...$('#ht-chests').children].forEach((b, i) => { const k = ICON[m.kinds[i]]; b.disabled = false; b.classList.add('open'); b.innerHTML = `${k[0]}<small>${k[1]}</small>`; });
        money(m.score); msg(m.text);
        $('#ht-sh').textContent = m.shield ? '🛡️' : '';
        const a = $('#ht-ask'); a.style.display = ''; a.textContent = '다음 문제 ▶'; a.disabled = false;
      }
      if (m.op === 'stolen') { money(m.score); cx.toast(`🦹 ${m.by} 님이 ${m.amount}을(를) 훔쳐갔어요!`); }
      if (m.op === 'blocked') { const s = $('#ht-sh'); if (s) s.textContent = ''; cx.toast(`🛡️ ${m.by} 님의 도둑질을 막았어요!`); }
      if (m.op === 'swapped') { money(m.score); cx.toast(`🔄 ${m.by} 님과 점수가 바뀌었어요!`); }
    },
    unmount() { root = null; },
  };
})();
