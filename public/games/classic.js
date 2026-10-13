// 머니 퀴즈 (학생 화면)
Games.classic = (() => {
  let cx, root, shop = [], score = 0, busy = false, streak = 0;

  function renderShop() {
    const box = root && root.querySelector('#cl-items');
    if (!box) return;
    box.innerHTML = '';
    shop.forEach((it) => {
      const d = document.createElement('div');
      d.className = 'cl-item';
      const maxed = it.cost == null;
      d.innerHTML = `<div><b>${cx.esc(it.name)}</b> <small>Lv ${it.lvl}/${it.max} · ${cx.esc(it.desc)}</small></div>`;
      const b = document.createElement('button');
      b.textContent = maxed ? 'MAX' : `💰 ${it.cost.toLocaleString()}`;
      b.disabled = maxed || score < it.cost;
      b.onclick = () => cx.send({ t: 'g', op: 'buy', k: it.k });
      d.appendChild(b);
      box.appendChild(d);
    });
  }
  function setMoney(v) { score = v; const e = root && root.querySelector('#cl-score'); if (e) e.textContent = v.toLocaleString(); renderShop(); }
  function fx(text, cls) { const e = root && root.querySelector('#cl-fx'); if (e) { e.textContent = text; e.className = 'cl-fx ' + (cls || ''); } }

  function next() {
    if (busy) return;
    busy = true;
    root.querySelector('#cl-ask').disabled = true;
    cx.ask((res) => {
      busy = false;
      const btn = root && root.querySelector('#cl-ask');
      if (!btn) return;
      btn.disabled = false;
      if (res.locked) return;
      streak = res.streak;
      shop = res.data.shop || shop;
      setMoney(res.score);
      if (res.correct) fx(`✅ 정답! +${res.data.earn.toLocaleString()}원`, 'good');
      else fx(res.data.loss ? `❌ 오답… -${res.data.loss.toLocaleString()}원` : '❌ 오답!', 'bad');
      root.querySelector('#cl-streak').textContent = streak >= 2 ? `🔥 ${streak}연속 정답!` : '';
      btn.textContent = '다음 문제 ▶';
    });
  }

  return {
    mount(c, m) {
      cx = c; root = cx.root; shop = (m.init && m.init.shop) || []; score = 0; busy = false; streak = 0;
      root.innerHTML = `<div class="cl">
        <div class="cl-money">💰 <span id="cl-score">0</span></div>
        <div id="cl-streak" class="cl-streak"></div>
        <div id="cl-fx" class="cl-fx"></div>
        <button id="cl-ask" class="bigbtn">문제 풀기 ▶</button>
        <div class="cl-shop"><h3>🛒 업그레이드 상점</h3><div id="cl-items"></div></div>
      </div>`;
      root.querySelector('#cl-ask').onclick = next;
      renderShop();
    },
    msg(m) { if (m.op === 'shop') { shop = m.shop; setMoney(m.score); } },
    tick(m) { if (!busy && m.score !== score) setMoney(m.score); },
    unmount() { root = null; },
  };
})();
