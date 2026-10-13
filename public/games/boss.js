// 보스 레이드 (학생 화면): 협동 전투
Games.boss = (() => {
  let cx, root, dead = false, asking = false, ko = false, hearts = 3, timers = [], koTimer = 0;
  const $ = (s) => root && root.querySelector(s);
  const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); };

  const heartsText = (h) => '❤️'.repeat(Math.max(0, h)) + '🖤'.repeat(Math.max(0, 3 - h));
  function setHearts(h) { hearts = h; const e = $('#bs-hearts'); if (e) e.textContent = heartsText(h); }
  function fx(t) { const e = $('#bs-fx'); if (e) e.textContent = t; }
  function hitAnim() { const e = $('#bs-emoji'); if (!e) return; e.classList.add('hit'); setTimeout(() => e.classList.remove('hit'), 200); }
  function shake() { if (!root) return; root.classList.add('shake'); setTimeout(() => root && root.classList.remove('shake'), 400); }
  function setBoss(b) {
    if (!b || !root) return;
    $('#bs-emoji').textContent = b.emoji;
    $('#bs-name').textContent = `Lv.${b.level} ${b.name}  ${b.hp.toLocaleString()} / ${b.maxHp.toLocaleString()}`;
    $('#bs-hp').style.width = Math.max(0, (b.hp / b.maxHp) * 100) + '%';
  }
  function showKo(ms) {
    ko = true;
    const o = document.createElement('div');
    o.className = 'bs-ko'; o.id = 'bs-ko';
    o.innerHTML = '<div style="font-size:70px">😵</div><div>기절했어요!</div><div id="bs-kot"></div>';
    root.appendChild(o);
    const end = Date.now() + ms;
    clearInterval(koTimer);
    koTimer = setInterval(() => { const e = $('#bs-kot'); if (e) e.textContent = Math.max(0, Math.ceil((end - Date.now()) / 1000)) + '초 후 부활'; }, 200);
  }
  function revive(h) {
    ko = false; clearInterval(koTimer);
    const o = $('#bs-ko'); if (o) o.remove();
    setHearts(h); fx('💪 부활! 다시 공격!');
    next();
  }

  function next() {
    if (dead || asking || ko) return;
    asking = true;
    cx.ask((res) => {
      asking = false;
      if (dead) return;
      if (res.locked) return later(next, res.locked + 100);
      const d = res.data;
      if (d.ko && res.correct) return; // 기절 중 도착한 답: 무시 (revive 메시지에서 재개)
      if (res.correct) {
        hitAnim();
        fx(d.kill ? '🎉 보스 격파!!' : `${d.crit ? '💥 크리티컬! ' : '⚔️ '}-${d.dmg}`);
      } else { setHearts(d.hearts); fx('❌ 오답! 하트가 깎였어요'); shake(); }
      if (d.ko && !res.correct) return; // 'ko' 메시지로 처리
      later(next, 300);
    });
  }

  return {
    mount(c) {
      cx = c; root = cx.root; dead = false; asking = false; ko = false; hearts = 3; timers = [];
      root.innerHTML = `<div class="bs">
        <div class="bs-name" id="bs-name">보스 등장…</div>
        <div class="bs-hpbar"><div class="bs-hp" id="bs-hp" style="width:100%"></div></div>
        <div class="bs-emoji" id="bs-emoji">👾</div>
        <div class="bs-fx" id="bs-fx">정답을 맞혀 보스를 공격하세요!</div>
        <div class="bs-hearts" id="bs-hearts">${heartsText(3)}</div></div>`;
      later(next, 400);
    },
    tick(m) {
      if (!m.view) return;
      setBoss(m.view.boss);
      if (!ko && m.view.hearts !== hearts) setHearts(m.view.hearts);
    },
    msg(m) {
      if (m.op === 'hit') { setHearts(m.hearts); fx('💥 보스의 공격을 받았어요!'); shake(); if (navigator.vibrate) navigator.vibrate(200); }
      if (m.op === 'ko') showKo(m.ms);
      if (m.op === 'revive') { if (ko) revive(m.hearts); else { setHearts(m.hearts); if (!asking) next(); } }
    },
    unmount() { dead = true; clearInterval(koTimer); timers.forEach(clearTimeout); timers = []; root = null; },
  };
})();
