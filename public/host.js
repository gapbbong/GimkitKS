// 교사(호스트) 화면: 방 생성, 게임 선택, 실시간 대형 스크린, 결과
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Math.round(n).toLocaleString();

  let ws, room = null, games = [], selected = null, port = location.port || 80, endAt = 0, stageGame = null, retry = 0, playerCount = 0;
  const saved = () => { try { return JSON.parse(sessionStorage.getItem('qa_host') || 'null'); } catch (e) { return null; } };
  const send = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
  const view = (id) => ['h-lobby', 'h-game', 'h-end'].forEach((x) => {
    const el = $('#' + x); el.hidden = x !== id; el.style.display = x === id && x === 'h-game' ? 'flex' : '';
  });
  const msg = (t) => { $('#h-msg').textContent = t || ''; if (t) setTimeout(() => { if ($('#h-msg').textContent === t) $('#h-msg').textContent = ''; }, 4000); };

  // 키 기반 DOM 동기화 (전환 애니메이션 유지)
  function sync(box, items, key, make, update) {
    const have = new Map([...box.children].map((el) => [el.dataset.k, el]));
    items.forEach((it, i) => {
      const k = String(key(it));
      let el = have.get(k);
      if (!el) { el = make(it); el.dataset.k = k; box.appendChild(el); } else have.delete(k);
      update(el, it, i);
    });
    have.forEach((el) => el.remove());
  }

  // ---------- 접속 주소 / QR ----------
  function joinUrl() { return `http://${$('#h-ips').value || location.hostname}:${port}/?code=${room.code}`; }
  function renderUrl() {
    if (!room) return;
    const u = joinUrl();
    $('#h-url').textContent = u.replace('/?code=' + room.code, '');
    $('#h-qr').src = '/qr?u=' + encodeURIComponent(u);
  }
  async function loadIps() {
    let ips = [];
    try { const r = await (await fetch('/api/info')).json(); ips = r.ips; port = r.port; } catch (e) { /* 무시 */ }
    const sel = $('#h-ips');
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    const list = [...new Set([...(local ? [] : [location.hostname]), ...ips])];
    sel.innerHTML = (list.length ? list : [location.hostname]).map((ip) => `<option>${esc(ip)}</option>`).join('');
    sel.hidden = list.length < 2;
    sel.onchange = renderUrl;
    renderUrl();
  }

  // ---------- 로비 ----------
  function updateStart() { $('#h-start').disabled = !playerCount || !selected; }
  function renderPlayers(list) {
    playerCount = list.length;
    $('#h-count').textContent = list.length;
    const box = $('#h-players');
    box.innerHTML = '';
    list.forEach((p) => {
      const d = document.createElement('div');
      d.className = 'chip' + (p.on ? '' : ' off');
      d.innerHTML = `<span>${p.emoji}</span><span>${esc(p.name)}</span><button class="x" title="내보내기">✕</button>`;
      d.querySelector('.x').onclick = () => send({ t: 'kick', id: p.id });
      box.appendChild(d);
    });
    updateStart();
  }
  function renderGames() {
    const box = $('#h-games');
    box.innerHTML = '';
    games.forEach((g) => {
      const d = document.createElement('div');
      d.className = 'gcard' + (g.id === selected ? ' sel' : '');
      d.innerHTML = `<div class="ge">${g.emoji}</div><b>${esc(g.name)}</b><small>${esc(g.desc)}</small>`;
      d.onclick = () => { selected = g.id; renderGames(); updateStart(); };
      box.appendChild(d);
    });
    const g = games.find((x) => x.id === selected);
    $('#h-how').textContent = g ? '📖 ' + g.how : '위에서 게임을 골라 주세요.';
  }

  // ---------- 게임 무대 ----------
  const rankOf = (arr, id) => arr.findIndex((p) => p.id === id);
  const stages = {
    jump: {
      build(el) { el.innerHTML = '<div class="alt"><div class="ground"></div></div>'; },
      update(el, s) {
        const alt = el.querySelector('.alt');
        const max = Math.max(100, (s.players[0] ? s.players[0].score : 0) * 1.15);
        const byName = s.players.slice().sort((a, b) => a.name.localeCompare(b.name));
        sync(alt, byName.map((p) => p), (p) => 'p' + p.id,
          (p) => { const d = document.createElement('div'); d.className = 'pl'; d.innerHTML = `<span class="em">${p.emoji}</span><span class="tag"></span>`; return d; },
          (d, p, i) => {
            d.style.left = ((i + 0.5) / byName.length * 100) + '%';
            d.style.bottom = `calc(5% + ${(p.score / max) * 78}%)`;
            d.style.zIndex = String(1000 - rankOf(s.players, p.id));
            d.querySelector('.tag').textContent = `${p.name} ${p.score}m${p.x && p.x.rockets ? ' 🚀' + p.x.rockets : ''}`;
          });
      },
    },
    race: {
      build(el) { el.innerHTML = '<div class="lanes"></div>'; },
      update(el, s) {
        sync(el.querySelector('.lanes'), s.players, (p) => p.id,
          () => { const d = document.createElement('div'); d.className = 'lane'; d.innerHTML = '<span class="nm"></span><div class="road"><span class="car"></span></div><span class="lp"></span>'; return d; },
          (d, p) => {
            d.querySelector('.nm').textContent = p.name;
            const car = d.querySelector('.car');
            car.textContent = p.emoji; car.style.left = (3 + ((p.score % 100) / 100) * 94) + '%';
            d.querySelector('.lp').textContent = '🏁' + Math.floor(p.score / 100);
          });
      },
    },
    boss: {
      atk: -1,
      build(el) { el.innerHTML = '<div class="bossview"><div class="bn" id="b-name"></div><div class="hpbar"><i id="b-hp"></i></div><div class="be" id="b-emoji"></div><div class="big" id="b-info"></div><div class="bchips" id="b-chips"></div></div>'; stages.boss.atk = -1; },
      update(el, s) {
        const b = s.g;
        if (!b) return;
        el.querySelector('#b-name').textContent = `Lv.${b.level} ${b.name}  (${fmt(b.hp)} / ${fmt(b.maxHp)})`;
        el.querySelector('#b-hp').style.width = (b.hp / b.maxHp * 100) + '%';
        const em = el.querySelector('#b-emoji'); em.textContent = b.emoji;
        if (b.atk !== stages.boss.atk) { stages.boss.atk = b.atk; em.classList.remove('hit'); void em.offsetWidth; em.classList.add('hit'); }
        el.querySelector('#b-info').textContent = `🏆 처치한 보스 ${b.kills}마리`;
        sync(el.querySelector('#b-chips'), s.players, (p) => p.id, () => { const d = document.createElement('div'); d.className = 'chip'; return d; },
          (d, p) => { const x = p.x || {}; d.textContent = `${p.emoji} ${p.name} ${x.ko ? '😵' : '❤️'.repeat(x.hearts == null ? 3 : x.hearts)}`; d.style.opacity = p.on ? 1 : 0.4; });
      },
    },
    fishing: {
      build(el) { el.innerHTML = '<div class="pond"></div>'; },
      update(el, s) {
        sync(el.querySelector('.pond'), s.players, (p) => p.id,
          () => { const d = document.createElement('div'); d.className = 'chip'; return d; },
          (d, p, i) => { const x = p.x || {}; d.innerHTML = `${p.emoji} ${esc(p.name)} <small>🐟${x.caught || 0} ${x.best || ''} ${fmt(p.score)}</small>`; d.style.animationDelay = (i % 7) * -0.4 + 's'; d.style.opacity = p.on ? 1 : 0.4; });
      },
    },
    podium: {
      build(el) { el.innerHTML = '<div class="podstage"><div class="podium"></div></div>'; },
      update(el, s) {
        const top = s.players.slice(0, 3);
        const mx = Math.max(1, top[0] ? top[0].score : 1);
        sync(el.querySelector('.podium'), top, (p) => p.id,
          () => { const d = document.createElement('div'); d.className = 'pd'; d.innerHTML = '<div class="em"></div><div class="nm"></div><div class="sc"></div>'; return d; },
          (d, p, i) => {
            d.querySelector('.em').textContent = p.emoji; d.querySelector('.nm').textContent = p.name; d.querySelector('.sc').textContent = fmt(p.score);
            d.style.height = (110 + (Math.max(0, p.score) / mx) * 230) + 'px';
            d.style.order = String([1, 0, 2][i]);
          });
      },
    },
  };
  stages.classic = stages.heist = stages.podium;

  function renderState(s) {
    view('h-game');
    endAt = Date.now() + s.left;
    $('#g-title').textContent = `${s.emoji} ${s.name}`;
    const st = stages[s.game] || stages.podium;
    const stage = $('#g-stage');
    if (stageGame !== s.game) { stageGame = s.game; st.build(stage); }
    st.update(stage, s);
    $('#g-lb').classList.toggle('compact', s.players.length > 14);
    $('#g-lbtitle').textContent = `🏆 실시간 순위 (${s.players.length}명)`;
    sync($('#g-lb'), s.players, (p) => p.id,
      () => { const d = document.createElement('div'); d.className = 'it'; d.innerHTML = '<span class="no"></span><span class="nm"></span><span class="sc"></span>'; return d; },
      (d, p, i) => { d.querySelector('.no').textContent = i + 1; d.querySelector('.nm').textContent = `${p.emoji} ${p.name}`; d.querySelector('.sc').textContent = fmt(p.score); d.style.order = i; d.style.opacity = p.on ? 1 : 0.5; });
    $('#g-feed').innerHTML = s.feed.slice().reverse().map((f) => `<div>${esc(f.text)}</div>`).join('');
  }

  function renderEnd(m) {
    view('h-end'); stageGame = null;
    $('#e-title').textContent = `${m.emoji} ${m.name} 결과`;
    $('#e-summary').textContent = m.summary && m.summary.kills != null ? `🎉 함께 쓰러뜨린 보스: ${m.summary.kills}마리` : '';
    const pod = $('#e-podium');
    pod.innerHTML = '';
    [1, 0, 2].forEach((i) => {
      const r = m.results[i];
      if (!r) return;
      const d = document.createElement('div');
      d.className = 'pd'; d.style.height = [230, 180, 140][i] + 'px';
      d.innerHTML = `<div class="em">${r.emoji}</div><div>${esc(r.name)}</div><div class="sc">${fmt(r.score)}</div><div>${['🥇', '🥈', '🥉'][i]}</div>`;
      pod.appendChild(d);
    });
    const extra = (r) => {
      const x = r.x || {};
      switch (m.game) {
        case 'fishing': return `🐟 ${x.caught || 0}마리 ${x.best || ''}`;
        case 'jump': return `🚀 로켓 ${x.rockets || 0}회`;
        case 'race': return `🏁 ${x.lap || 0}바퀴`;
        case 'heist': return `🦹 도둑질 ${x.steals || 0}회`;
        case 'boss': return `⚔️ 데미지 ${fmt(x.dmg || 0)}`;
        case 'classic': return `🔥 최고 ${x.best || 0}연속`;
      }
      return '';
    };
    $('#e-table').innerHTML = '<tr><th>순위</th><th>이름</th><th>점수</th><th>정답/오답</th><th>기록</th></tr>' +
      m.results.map((r) => `<tr><td>${r.rank}</td><td>${r.emoji} ${esc(r.name)}</td><td>${fmt(r.score)}</td><td>${r.correct} / ${r.wrong}</td><td>${extra(r)}</td></tr>`).join('');
  }

  // ---------- 메시지 ----------
  function handle(m) {
    switch (m.t) {
      case 'created':
        room = m; games = m.games; selected = selected || (games[0] && games[0].id);
        try { sessionStorage.setItem('qa_host', JSON.stringify({ code: m.code, hostKey: m.hostKey })); } catch (e) { /* 무시 */ }
        $('#h-code').textContent = m.code; $('#h-max').textContent = m.max;
        $('#h-qtext').value = m.text; $('#h-qcount').textContent = m.count;
        renderGames(); renderPlayers(m.players); loadIps();
        if (m.state === 'lobby') view('h-lobby');
        break;
      case 'lobby': renderPlayers(m.players); break;
      case 'questions': $('#h-qtext').value = m.text; $('#h-qcount').textContent = m.count; msg(`✅ 문제 ${m.count}개 저장됨`); break;
      case 'state': renderState(m); break;
      case 'ended': renderEnd(m); break;
      case 'err':
        msg(m.msg);
        if (m.fatal) { try { sessionStorage.removeItem('qa_host'); } catch (e) { /* 무시 */ } room = null; send({ t: 'create' }); }
        break;
    }
  }

  setInterval(() => {
    if ($('#h-game').hidden) return;
    const s = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    const t = $('#g-timer');
    t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    t.classList.toggle('low', s <= 10);
  }, 250);

  function connect() {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => { retry = 0; const s = saved(); send(s ? { t: 'resume', code: s.code, hostKey: s.hostKey } : { t: 'create' }); };
    ws.onmessage = (e) => { try { handle(JSON.parse(e.data)); } catch (err) { console.error(err); } };
    ws.onclose = () => setTimeout(connect, Math.min(5000, 1000 + retry++ * 500));
  }

  $('#h-start').onclick = () => { if (selected) send({ t: 'start', game: selected, minutes: +$('#h-min').value }); };
  $('#g-end').onclick = () => { if (confirm('게임을 지금 끝낼까요?')) send({ t: 'end' }); };
  $('#e-again').onclick = () => { send({ t: 'lobby' }); view('h-lobby'); };
  $('#h-qsave').onclick = () => send({ t: 'setQuestions', text: $('#h-qtext').value });
  $('#h-qreset').onclick = () => send({ t: 'resetQuestions' });
  $('#h-qload').onclick = () => $('#h-qfile').click();
  $('#h-qsample').onclick = () => {
    const sample = [
      '# 퀴즈 아레나 문제 파일 샘플',
      '# 한 줄에 한 문제를 쓰고 세로선 기호로 칸을 나눕니다: 질문, 정답, 오답1, 오답2, 오답3 순서',
      '# 오답은 1~3개까지 쓸 수 있고 샵 기호로 시작하는 줄은 무시됩니다',
      '# 아래 예시를 지우고 내 문제를 쓴 뒤 로비의 파일 불러오기로 올리세요',
      '대한민국의 수도는? | 서울 | 부산 | 대전 | 인천',
      '물의 화학식은? | H2O | CO2 | O2 | NaCl',
      '12 x 12 = ? | 144 | 122 | 124 | 154',
      "'Apple'의 뜻은? | 사과 | 배 | 포도",
      '훈민정음을 창제한 왕은? | 세종대왕 | 태조 | 정조 | 영조',
    ].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + sample], { type: 'text/plain;charset=utf-8' }));
    a.download = '퀴즈아레나_샘플문제.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#h-qfile').onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      // CSV(쉼표)로 저장된 파일도 허용: | 나 탭이 없는 줄은 쉼표를 구분자로 본다
      const text = String(r.result).replace(/^﻿/, '').split(/\r?\n/).filter((l) => !l.trim().startsWith('#'))
        .map((l) => (/[|\t]/.test(l) ? l : l.split(',').join(' | '))).join('\n');
      $('#h-qtext').value = text;
      send({ t: 'setQuestions', text });
    };
    r.readAsText(f, 'utf-8');
    e.target.value = '';
  };
  window.addEventListener('beforeunload', (e) => { if (!$('#h-game').hidden) { e.preventDefault(); e.returnValue = ''; } });

  connect();
})();
