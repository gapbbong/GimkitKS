// 낚시왕 (학생 화면): 퀴즈 → 캐스팅 → 입질 → 타이밍 바 미니게임
Games.fishing = (() => {
  let cx, root, st = 'idle', fish = null, raf = 0, timers = [], coll = {};
  let need = 0, got = 0, strikes = 0, zoneL = 0, zoneW = 0.3, speed = 1, pos = 0, t0 = 0;
  const $ = (s) => root && root.querySelector(s);
  const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
  const setMsg = (t) => { const e = $('#fs-msg'); if (e) e.textContent = t; };

  function ui(mode) {
    const box = $('#fs-ui');
    if (!box) return;
    if (mode === 'idle') {
      box.innerHTML = '<button id="fs-cast" class="bigbtn">🎣 낚싯줄 던지기 (퀴즈!)</button>';
      $('#fs-cast').onclick = cast;
    } else if (mode === 'wait') {
      box.innerHTML = '<div class="fs-hp">⏳ 입질을 기다리는 중…</div>';
    } else if (mode === 'bar') {
      box.innerHTML = '<div class="fs-bar"><div class="fs-zone" id="fs-zone"></div><div class="fs-cur" id="fs-cur"></div></div><div class="fs-hp" id="fs-hp"></div><button id="fs-reel" class="bigbtn">🎣 당기기!</button>';
      $('#fs-reel').onpointerdown = (e) => { e.preventDefault(); reel(); };
    } else box.innerHTML = '';
  }
  function renderColl() {
    const e = $('#fs-coll');
    if (!e) return;
    e.innerHTML = '';
    Object.entries(coll).forEach(([k, n]) => { const s = document.createElement('span'); s.textContent = `${k} ×${n}`; e.appendChild(s); });
  }

  function cast() {
    if (st !== 'idle') return;
    st = 'asking'; ui('none'); setMsg('문제를 풀어 낚싯줄을 던져요!');
    cx.ask((res) => {
      if (!root) return;
      if (res.locked) { st = 'idle'; ui('idle'); return; }
      if (!res.correct) { st = 'idle'; setMsg('❌ 줄이 끊어졌어요! 다시 도전!'); ui('idle'); return; }
      fish = res.data.fish;
      st = 'wait'; ui('wait'); setMsg('🎣 던졌다! 입질을 기다려요…');
      const b = $('#fs-b'); b.className = 'fs-bobber out';
      later(() => {
        if (st !== 'wait') return;
        b.className = 'fs-bobber bite'; setMsg('❗ 입질이다! 지금 당겨!');
        if (navigator.vibrate) navigator.vibrate(120);
        later(startBar, 700);
      }, 1300 + Math.random() * 1700);
    });
  }

  function newZone() { zoneL = 0.05 + Math.random() * (0.9 - zoneW); const z = $('#fs-zone'); if (z) { z.style.left = zoneL * 100 + '%'; z.style.width = zoneW * 100 + '%'; } }
  function hp() { const e = $('#fs-hp'); if (e) e.textContent = `줄 ${'❤️'.repeat(3 - strikes)}${'🖤'.repeat(strikes)}  ·  낚기 ${got}/${need}`; }
  function startBar() {
    if (st !== 'wait') return;
    st = 'bar'; ui('bar');
    need = fish.hits; got = 0; strikes = 0; zoneW = fish.zone; speed = fish.speed;
    newZone(); hp(); setMsg(`${fish.rn} 등급의 큰 놈이다! 초록 구간에서 당겨!`);
    t0 = performance.now();
    const loop = (t) => {
      if (st !== 'bar') return;
      pos = 0.5 + 0.5 * Math.sin(((t - t0) / 1000) * speed * 3.2 - Math.PI / 2);
      const c = $('#fs-cur'); if (c) c.style.left = pos * 100 + '%';
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }
  function reel() {
    if (st !== 'bar') return;
    if (pos >= zoneL && pos <= zoneL + zoneW) {
      got++;
      if (navigator.vibrate) navigator.vibrate(30);
      if (got >= need) return finish(true);
      speed *= 1.08; newZone();
    } else { strikes++; if (strikes >= 3) return finish(false); }
    hp();
  }
  function finish(ok) {
    cancelAnimationFrame(raf);
    st = 'result'; ui('none');
    cx.send({ t: 'g', op: 'reel', ok });
    const b = $('#fs-b'); if (b) b.className = 'fs-bobber';
    const card = document.createElement('div');
    card.className = 'fs-card';
    if (ok) {
      card.innerHTML = `<div class="fe">${fish.e}</div><b class="r${fish.r}">${cx.esc(fish.rn)} · ${cx.esc(fish.n)}</b><b>+${fish.v}</b>`;
      coll[fish.e] = (coll[fish.e] || 0) + 1; renderColl(); setMsg('🎉 낚았다!');
    } else { card.innerHTML = '<div class="fe">💨</div><b>물고기가 도망갔어요…</b>'; setMsg('아쉽다!'); }
    $('.fs-scene').appendChild(card);
    later(() => { card.remove(); st = 'idle'; ui('idle'); setMsg('다시 던져볼까요?'); }, 1700);
  }

  return {
    mount(c) {
      cx = c; root = cx.root; st = 'idle'; coll = {}; timers = [];
      root.innerHTML = `<div class="fs">
        <div class="fs-scene"><div class="fs-sun">☀️</div><div class="fs-wave"></div>
          <div class="fs-boat">🛶</div><div class="fs-me">${cx.esc(cx.me.emoji || '🙂')}</div>
          <div class="fs-bobber" id="fs-b">🔴</div><div class="fs-msg" id="fs-msg">문제를 풀어 낚싯줄을 던져요!</div></div>
        <div class="fs-ui" id="fs-ui"></div><div class="fs-coll" id="fs-coll"></div></div>`;
      ui('idle'); renderColl();
    },
    msg(m) { if (m.op === 'caught') cx.setScore(m.score); },
    unmount() { cancelAnimationFrame(raf); timers.forEach(clearTimeout); timers = []; root = null; st = 'dead'; },
  };
})();
