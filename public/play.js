// 학생 클라이언트: 접속/HUD/퀴즈 시트 공통 처리. 게임별 화면은 Games[id] 모듈이 담당한다.
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const Games = window.Games;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let ws, me = null, cur = null, curId = null, curSeed = null, endAt = 0, retry = 0;
  let pendingAsk = null, answered = false, chosen = -1, introTimer = 0;
  try { me = JSON.parse(localStorage.getItem('qa_me') || 'null'); } catch (e) { me = null; }
  const params = new URLSearchParams(location.search);
  if (params.get('code')) { $('#code').value = params.get('code'); if (me && me.code !== params.get('code')) me = null; }
  if (me && me.name) $('#name').value = me.name;

  const save = () => { try { localStorage.setItem('qa_me', JSON.stringify(me)); } catch (e) { /* 무시 */ } };
  const show = (id) => document.querySelectorAll('.screen').forEach((e) => { e.hidden = e.id !== id; });
  const send = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
  const toast = (t) => {
    const d = document.createElement('div'); d.textContent = t; $('#toast').appendChild(d);
    setTimeout(() => d.remove(), 2600);
  };
  const setScore = (v) => { $('#hud-score').textContent = Math.round(v).toLocaleString(); };

  // ---------- 퀴즈 시트 ----------
  function ask(cb) { pendingAsk = cb; send({ t: 'q' }); }
  function showQuestion(m) {
    if (!pendingAsk) return;
    $('#q-text').textContent = m.text;
    const box = $('#q-choices');
    box.innerHTML = '';
    answered = false; chosen = -1;
    m.choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'ch c' + i;
      b.innerHTML = '<span class="shape">' + '▲◆●■'[i] + '</span><span></span>';
      b.lastChild.textContent = c;
      b.onclick = () => { if (answered) return; answered = true; chosen = i; b.style.outline = '4px solid #fff'; send({ t: 'a', choice: i }); };
      box.appendChild(b);
    });
    $('#sheet').classList.add('show');
  }
  function onResult(m) {
    [...$('#q-choices').children].forEach((b, i) => {
      b.style.outline = '';
      if (i === m.correctIdx) b.classList.add('right'); else if (i === chosen) b.classList.add('wrong'); else b.classList.add('dim');
    });
    setScore(m.score);
    if (navigator.vibrate) navigator.vibrate(m.correct ? 40 : [80, 40, 80]);
    const cb = pendingAsk; pendingAsk = null;
    setTimeout(() => { $('#sheet').classList.remove('show'); if (cb) cb(m); }, m.correct ? 650 : 1150);
  }

  const ctx = {
    send, ask, toast, esc, setScore,
    get me() { return me; },
    get root() { return $('#stage'); },
  };

  // ---------- 게임 시작/종료 ----------
  function stopGame() {
    clearTimeout(introTimer);
    if (cur && cur.unmount) { try { cur.unmount(); } catch (e) { console.error(e); } }
    cur = null; curId = null; curSeed = null; pendingAsk = null;
    $('#sheet').classList.remove('show');
    $('#intro').hidden = true;
    $('#stage').innerHTML = '';
  }
  function startGame(m) {
    if (curId === m.game && curSeed === m.seed) { endAt = Date.now() + m.left; return; } // 재접속
    stopGame();
    curId = m.game; curSeed = m.seed;
    endAt = Date.now() + m.left;
    show('s-game');
    $('#hud-me').textContent = (me && me.emoji ? me.emoji + ' ' : '') + (me ? me.name : '');
    setScore(0);
    $('#hud-rank').textContent = '🏆 -';
    $('#intro-e').textContent = m.emoji; $('#intro-n').textContent = m.name; $('#intro-d').textContent = m.desc;
    $('#intro').hidden = false;
    const go = () => {
      clearTimeout(introTimer);
      if (curSeed !== m.seed) return;
      $('#intro').hidden = true;
      cur = Games[m.game];
      if (cur) cur.mount(ctx, m);
    };
    $('#intro-go').onclick = go;
    introTimer = setTimeout(go, 9000);
  }
  function showEnd(m) {
    stopGame();
    show('s-end');
    $('#end-title').textContent = `${m.emoji} ${m.name} 종료!`;
    const mine = m.results.find((r) => me && r.id === me.id);
    $('#end-me').textContent = mine ? `내 순위 ${mine.rank}위 · ${mine.score.toLocaleString()}점` : '';
    const pod = $('#end-podium');
    pod.innerHTML = '';
    [1, 0, 2].forEach((i) => {
      const r = m.results[i];
      if (!r) return;
      const d = document.createElement('div');
      d.className = 'pd'; d.style.height = [150, 120, 100][i] + 'px';
      d.innerHTML = `<div class="em">${r.emoji}</div><div>${esc(r.name)}</div><div>${r.score.toLocaleString()}</div>`;
      pod.appendChild(d);
    });
    const rows = $('#end-rows');
    rows.innerHTML = '';
    m.results.slice(0, 8).forEach((r) => {
      const d = document.createElement('div');
      d.className = 'row' + (me && r.id === me.id ? ' me' : '');
      d.innerHTML = `<span>${r.rank}. ${r.emoji} ${esc(r.name)}</span><span>${r.score.toLocaleString()}</span>`;
      rows.appendChild(d);
    });
  }

  // ---------- 서버 메시지 ----------
  function handle(m) {
    switch (m.t) {
      case 'joined':
        me = { ...(me || {}), id: m.id, code: m.code, name: m.name, emoji: m.emoji, color: m.color };
        save();
        $('#me-emoji').textContent = m.emoji; $('#me-name').textContent = m.name;
        if (m.state === 'lobby') show('s-lobby');
        break;
      case 'start': startGame(m); break;
      case 'tick':
        endAt = Date.now() + m.left;
        $('#hud-rank').textContent = `🏆 ${m.rank}/${m.n}`;
        setScore(m.score);
        if (cur && cur.tick) cur.tick(m);
        break;
      case 'question': showQuestion(m); break;
      case 'result': onResult(m); break;
      case 'locked': if (pendingAsk) { const cb = pendingAsk; pendingAsk = null; cb({ locked: m.ms }); } break;
      case 'g': if (cur && cur.msg) cur.msg(m); break;
      case 'ended': showEnd(m); break;
      case 'lobbyreset': stopGame(); show('s-lobby'); break;
      case 'kicked': stopGame(); me = null; try { localStorage.removeItem('qa_me'); } catch (e) { /* 무시 */ } show('s-join'); $('#join-err').textContent = '방에서 나가졌어요'; break;
      case 'err':
        $('#join-err').textContent = m.msg;
        toast(m.msg);
        if (m.fatal) { me = null; try { localStorage.removeItem('qa_me'); } catch (e) { /* 무시 */ } stopGame(); show('s-join'); }
        break;
    }
  }

  setInterval(() => {
    if (!endAt || $('#s-game').hidden) return;
    const s = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    $('#hud-time').textContent = `⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }, 250);

  function connect() {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => { retry = 0; if (me && me.code && me.id) send({ t: 'join', code: me.code, name: me.name, id: me.id }); };
    ws.onmessage = (e) => { try { handle(JSON.parse(e.data)); } catch (err) { console.error(err); } };
    ws.onclose = () => setTimeout(connect, Math.min(5000, 1000 + retry++ * 500));
  }

  $('#btn-join').onclick = () => {
    const code = $('#code').value.trim(), name = $('#name').value.trim();
    if (code.length !== 4) return ($('#join-err').textContent = '방 코드 4자리를 입력하세요');
    if (!name) return ($('#join-err').textContent = '이름을 입력하세요');
    $('#join-err').textContent = '';
    me = { code, name, id: null };
    send({ t: 'join', code, name });
  };
  $('#name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-join').click(); });

  connect();
})();
