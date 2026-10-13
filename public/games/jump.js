// 점프 오르기 (학생 화면): 캔버스 플랫폼 점프. 금색 ? 발판에서 퀴즈 → 로켓.
Games.jump = (() => {
  const W = 360;            // 논리 너비
  const GRAV = 1500, BOUNCE = 760, ROCKET_V = 950, ROCKET_T = 2.2;
  let cx, root, canvas, g, raf, S, H, scale, dir = 0, keys = {}, sendT = 0, sentBest = -1, last = 0, alive = false;
  let hudH, hudB, hint, listeners = [];

  function rng(seed) {
    return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function genTo(upTo) {
    const G = S.gen;
    while (G.y < upTo) {
      G.i++;
      G.y += 70 + G.r() * 40 + Math.min(G.y / 250, 35);
      const w = Math.max(48, 74 - G.y / 700);
      const r = G.r();
      let t = 'n';
      if (G.i % 16 === 0) t = 'q';
      else if (G.y > 1500 && r < 0.16) t = 'm';
      else if (G.y > 800 && r < 0.28 && !G.lastB) t = 'b';
      G.lastB = t === 'b';
      S.plats.push({ x: G.r() * (W - w), y: G.y, w, t, dx: (G.r() < 0.5 ? -1 : 1) * (60 + G.r() * 40), used: false, dead: false });
    }
  }

  function reset() {
    S = { px: W / 2, py: 22, vx: 0, vy: BOUNCE, best: 0, rocket: 0, plats: [], camY: 0, paused: false, gen: null, faceR: true };
    S.gen = { y: 0, i: 0, r: rng(g.seed), lastB: false };
    S.plats.push({ x: W / 2 - 70, y: 0, w: 140, t: 'n', dx: 0, used: false, dead: false });
    genTo(3 * 800);
  }

  function resize() {
    const r = root.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
    scale = canvas.width / W; H = canvas.height / scale;
  }

  function land(p) {
    S.vy = BOUNCE; S.py = p.y;
    if (p.t === 'b') p.dead = true;
    else if (p.t === 'q' && !p.used) {
      p.used = true; S.paused = true; dir = 0;
      cx.ask((res) => {
        S.paused = false; last = performance.now();
        if (res.locked) return;
        if (res.correct) { S.rocket = ROCKET_T; cx.toast('🚀 로켓 발사!'); }
        else { p.dead = true; S.vy = -100; cx.toast('발판이 부서졌어요!'); }
      });
    }
  }

  function respawn() {
    const target = Math.max(0, S.best - 500);
    const p = S.plats.find((q) => q.y >= target && q.t === 'n' && !q.dead) || S.plats[0];
    S.px = p.x + p.w / 2; S.py = p.y + 2; S.vy = BOUNCE; S.vx = 0; S.rocket = 0;
    S.camY = Math.max(0, S.py - H * 0.35);
    cx.toast('😵 떨어졌어요! 다시 올라가요');
  }

  function update(dt) {
    const target = dir * 260;
    S.vx += (target - S.vx) * Math.min(1, dt * 12);
    S.px += S.vx * dt;
    if (S.px < -12) S.px = W + 12; else if (S.px > W + 12) S.px = -12;
    if (S.vx > 5) S.faceR = true; else if (S.vx < -5) S.faceR = false;

    if (S.rocket > 0) { S.rocket -= dt; S.vy = ROCKET_V; } else S.vy -= GRAV * dt;
    const prev = S.py;
    S.py += S.vy * dt;

    for (const p of S.plats) {
      if (p.t === 'm' && !p.dead) { p.x += p.dx * dt; if (p.x < 0 || p.x > W - p.w) { p.dx *= -1; p.x = clamp(p.x, 0, W - p.w); } }
    }
    if (S.vy < 0 && S.rocket <= 0) {
      for (const p of S.plats) {
        if (p.dead) continue;
        if (prev >= p.y && S.py <= p.y && S.px > p.x - 8 && S.px < p.x + p.w + 8) { land(p); break; }
      }
    }
    if (S.py > S.best) S.best = S.py;
    S.camY = Math.max(S.camY, S.py - H * 0.45);
    genTo(S.camY + H * 2.5);
    if (S.plats.length > 400) S.plats = S.plats.filter((p) => p.y > S.best - 2500);
    if (S.py < S.camY - 40) respawn();
  }

  function mix(a, b, t) { return Math.round(a + (b - a) * t); }
  function draw() {
    const c = canvas.getContext('2d');
    const t = clamp(S.best / 30000, 0, 1);
    const grd = c.createLinearGradient(0, 0, 0, canvas.height);
    grd.addColorStop(0, `rgb(${mix(80, 8, t)},${mix(150, 8, t)},${mix(235, 40, t)})`);
    grd.addColorStop(1, `rgb(${mix(190, 30, t)},${mix(225, 30, t)},${mix(255, 90, t)})`);
    c.fillStyle = grd; c.fillRect(0, 0, canvas.width, canvas.height);
    c.save(); c.scale(scale, scale);
    const sy = (y) => H - (y - S.camY);
    if (t > 0.25) { c.fillStyle = `rgba(255,255,255,${Math.min(1, (t - 0.25) * 2)})`; for (let i = 0; i < 40; i++) { c.fillRect((i * 97) % W, (i * 211 + S.camY * 0.05) % H, 2, 2); } }
    c.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i < 6; i++) { const y = ((i * 263 - S.camY * 0.3) % (H + 200) + (H + 200)) % (H + 200) - 80; c.beginPath(); c.ellipse((i * 151) % W, y, 38, 14, 0, 0, 7); c.fill(); }
    // 고도 표시선
    c.font = '11px sans-serif';
    for (let m = Math.ceil(S.camY / 2500) * 2500; m < S.camY + H; m += 2500) {
      if (m <= 0) continue;
      c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(0, sy(m), W, 1); c.fillText(`${m / 10}m`, 4, sy(m) - 3);
    }
    for (const p of S.plats) {
      if (p.dead || p.y < S.camY - 30 || p.y > S.camY + H + 30) continue;
      const y = sy(p.y);
      c.fillStyle = { n: '#4ade80', m: '#60a5fa', b: '#a16207', q: '#fbbf24' }[p.t];
      c.beginPath(); c.roundRect(p.x, y, p.w, 12, 6); c.fill();
      if (p.t === 'q') { c.fillStyle = '#7c2d12'; c.font = 'bold 14px sans-serif'; c.textAlign = 'center'; c.fillText(p.used ? '' : '?', p.x + p.w / 2, y + 11); c.textAlign = 'left'; }
      if (p.t === 'b') { c.strokeStyle = '#451a03'; c.beginPath(); c.moveTo(p.x + p.w * 0.4, y); c.lineTo(p.x + p.w * 0.5, y + 12); c.stroke(); }
    }
    const py = sy(S.py);
    if (S.rocket > 0) { c.fillStyle = '#f97316'; c.beginPath(); c.moveTo(S.px - 9, py + 4); c.lineTo(S.px + 9, py + 4); c.lineTo(S.px, py + 38 + Math.random() * 14); c.fill(); }
    c.font = '34px serif'; c.textAlign = 'center';
    c.save(); c.translate(S.px, py - 4); c.scale(S.faceR ? 1 : -1, 1); c.fillText(cx.me.emoji || '🙂', 0, 0); c.restore();
    c.textAlign = 'left';
    c.restore();
  }

  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.033, (now - last) / 1000); last = now;
    if (!S.paused && !document.hidden) update(dt);
    draw();
    const m = Math.floor(S.best / 10);
    hudH.textContent = `⛰ ${m}m`;
    if (now - sendT > 500) {
      sendT = now;
      if (m > sentBest) { sentBest = m; cx.send({ t: 'g', op: 'h', h: m }); }
    }
  }

  function on(t, ev, fn, opt) { t.addEventListener(ev, fn, opt); listeners.push([t, ev, fn, opt]); }

  return {
    mount(c, m) {
      cx = c; g = m; root = cx.root; alive = true; dir = 0; keys = {}; sentBest = -1; sendT = 0; listeners = [];
      root.innerHTML = `<div class="jp"><canvas></canvas>
        <div class="jp-hud"><span id="jp-h">⛰ 0m</span><span id="jp-b"></span></div>
        <div class="jp-hint" id="jp-hint">👈 왼쪽 / 오른쪽 👉 을 눌러 움직여요<br>🟨 금색 ? 발판에서 퀴즈를 맞히면 🚀 로켓!</div>
        <div class="jp-btns"><span>◀</span><span>▶</span></div></div>`;
      canvas = root.querySelector('canvas'); hudH = root.querySelector('#jp-h'); hudB = root.querySelector('#jp-b'); hint = root.querySelector('#jp-hint');
      resize(); reset();
      on(window, 'resize', resize);
      const area = root.querySelector('.jp');
      const setDir = (e) => { const r = area.getBoundingClientRect(); dir = (e.clientX - r.left) < r.width / 2 ? -1 : 1; };
      on(area, 'pointerdown', (e) => { e.preventDefault(); setDir(e); });
      on(area, 'pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') setDir(e); });
      on(window, 'pointerup', () => { dir = 0; });
      on(window, 'pointercancel', () => { dir = 0; });
      const kupd = () => { dir = (keys.ArrowRight || keys.d || keys.D ? 1 : 0) - (keys.ArrowLeft || keys.a || keys.A ? 1 : 0); };
      on(window, 'keydown', (e) => { keys[e.key] = true; kupd(); });
      on(window, 'keyup', (e) => { keys[e.key] = false; kupd(); });
      setTimeout(() => { if (hint) hint.style.opacity = 0; }, 5000);
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    tick(m) { if (hudB) hudB.textContent = `🥇 ${m.top[0] ? m.top[0].emoji + ' ' + m.top[0].score + 'm' : ''}`; },
    unmount() { alive = false; cancelAnimationFrame(raf); listeners.forEach(([t, ev, fn, opt]) => t.removeEventListener(ev, fn, opt)); listeners = []; },
  };
})();
