// 퀴즈 레이싱 (학생 화면): 정답 → 전진, 오답 → 충돌 정지. 자동으로 다음 문제가 이어진다.
Games.race = (() => {
  let cx, root, dead = false, asking = false, lanes = [], mine = 0, timers = [];
  const $ = (s) => root && root.querySelector(s);
  const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); };

  function drawLanes() {
    const box = $('#rc-track');
    if (!box) return;
    const view = lanes.map((l) => (l.me ? { ...l, s: mine } : l)).sort((a, b) => b.s - a.s);
    box.innerHTML = view.map((l) => `<div class="rc-lane${l.me ? ' me' : ''}"><span class="rc-name">${cx.esc(l.n)}</span>
      <div class="rc-road"><span class="rc-car" style="left:calc(${(l.s % 100) * 0.9}% )">${l.e}</span></div><span class="rc-lap">🏁${Math.floor(l.s / 100)}</span></div>`).join('');
  }
  const status = (a, b) => { if (!root) return; $('#rc-status').textContent = a; $('#rc-sub').textContent = b || ''; };

  function next() {
    if (dead || asking) return;
    asking = true;
    cx.ask((res) => {
      asking = false;
      if (dead) return;
      if (res.locked) { status('💥 충돌 복구 중…', `${(res.locked / 1000).toFixed(1)}초 후 출발`); return later(next, res.locked + 80); }
      const d = res.data;
      if (res.correct) {
        mine = d.lap * 100 + d.pos;
        status(d.turbo ? '🔥 터보 부스트!!' : `🚗 +${d.step} 전진!`, `${res.streak}연속 정답${d.banana ? ' · 🍌 ' + d.banana + ' 님에게 바나나 투척!' : ''}`);
        drawLanes();
        later(next, 250);
      } else {
        status('💥 충돌!', '2.5초 동안 멈춰요…');
        later(next, d.lock || 2500);
      }
    });
  }

  return {
    mount(c) {
      cx = c; root = cx.root; dead = false; asking = false; lanes = []; mine = 0; timers = [];
      root.innerHTML = `<div class="rc"><div class="rc-track" id="rc-track"></div><div class="rc-status" id="rc-status">출발 준비!</div><div class="rc-sub" id="rc-sub">정답을 맞혀 달려요</div></div>`;
      lanes = [{ n: cx.me.name, e: cx.me.emoji || '🚗', s: 0, me: true }];
      drawLanes(); later(next, 400);
    },
    tick(m) {
      if (!m.view) return;
      lanes = m.view.lanes;
      const me = lanes.find((l) => l.me);
      if (me && me.s > mine) mine = me.s;
      drawLanes();
    },
    msg(m) {
      if (m.op === 'banana') { mine = m.lap * 100 + m.pos; cx.toast(`🍌 ${m.by} 님이 바나나를 던졌어요! -8`); drawLanes(); }
    },
    unmount() { dead = true; timers.forEach(clearTimeout); timers = []; root = null; },
  };
})();
