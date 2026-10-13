'use strict';
// 퀴즈 아레나 서버: 정적 파일 + WebSocket 룸 관리 + 공통 퀴즈 처리
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const GAMES = require('./games');
const DEFAULT_Q = require('./questions.json');

const PORT = +process.env.PORT || 3000;
const MAX_PLAYERS = 40;
const PUB = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};
const EMOJIS = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦆', '🦉',
  '🦄', '🐝', '🐞', '🦋', '🐢', '🐙', '🦀', '🐬', '🐳', '🦈', '🐊', '🦒', '🦘', '🐘', '🦔', '🐿️', '🦥', '🦦', '🦩', '🐲'];
const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#64748b'];

const rooms = new Map();
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const send = (ws, o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };

function lanIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.')) out.push(i.address);
  const rank = (ip) => (ip.startsWith('192.168.') ? 3 : ip.startsWith('10.') ? 2 : 1);
  return out.sort((a, b) => rank(b) - rank(a));
}

// ---------- 문제 ----------
function parseQuestions(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const parts = line.split(/[|\t]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 3) out.push({ q: parts[0], a: parts[1], w: parts.slice(2, 5) });
  }
  return out;
}
const questionsToText = (qs) => qs.map((q) => [q.q, q.a, ...q.w].join(' | ')).join('\n');

function makeQuestion(room, p) {
  if (!p.deck || !p.deck.length) p.deck = shuffle(room.questions.map((_, i) => i));
  const q = room.questions[p.deck.pop()];
  const choices = shuffle([q.a, ...q.w.slice(0, 3)]);
  return { text: q.q, choices, correct: choices.indexOf(q.a) };
}

// ---------- 룸 ----------
function newRoom() {
  let code;
  do code = String(1000 + Math.floor(Math.random() * 9000)); while (rooms.has(code));
  const room = {
    code, hostKey: crypto.randomBytes(8).toString('hex'), host: null, players: new Map(),
    questions: DEFAULT_Q.slice(), state: 'lobby', game: null, feed: [], g: {}, seed: 0,
    endsAt: 0, total: 0, lastHost: 0, lastP: 0, results: null, touched: Date.now(),
  };
  room.push = (text) => { room.feed.push({ t: Date.now(), text }); if (room.feed.length > 40) room.feed.shift(); };
  room.active = () => [...room.players.values()].filter((p) => p.connected);
  rooms.set(code, room);
  return room;
}

function newPlayer(room, name) {
  const used = new Set([...room.players.values()].map((p) => p.emoji));
  const emoji = shuffle(EMOJIS).find((e) => !used.has(e)) || EMOJIS[0];
  const p = {
    id: crypto.randomBytes(6).toString('hex'), name, emoji, color: COLORS[Math.floor(Math.random() * COLORS.length)],
    ws: null, connected: false, send(o) { send(this.ws, o); },
  };
  resetPlayer(p);
  return p;
}
function resetPlayer(p) {
  Object.assign(p, { score: 0, streak: 0, correct: 0, wrong: 0, q: null, lockUntil: 0, deck: null, g: {} });
}

const ranked = (room) => [...room.players.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
const leftMs = (room) => Math.max(0, room.endsAt - Date.now());

function startMsg(room, p) {
  const G = GAMES[room.game];
  return { t: 'start', game: room.game, name: G.name, emoji: G.emoji, desc: G.desc, left: leftMs(room), total: room.total, seed: room.seed, init: G.initData ? G.initData(room, p) : null };
}

function startGame(room, id, minutes) {
  const G = GAMES[id];
  if (!G || room.state === 'playing') return;
  minutes = Math.min(30, Math.max(1, +minutes || 5));
  Object.assign(room, { game: id, state: 'playing', feed: [], g: {}, seed: (Math.random() * 1e9) | 0, total: minutes * 60000, results: null });
  room.endsAt = Date.now() + room.total;
  room.lastHost = room.lastP = 0;
  for (const p of room.players.values()) resetPlayer(p);
  if (G.init) G.init(room);
  for (const p of room.players.values()) { G.join(room, p); p.send(startMsg(room, p)); }
}

function endGame(room) {
  if (room.state !== 'playing') return;
  const G = GAMES[room.game];
  room.state = 'ended';
  const results = ranked(room).map((p, i) => ({
    rank: i + 1, id: p.id, name: p.name, emoji: p.emoji, score: p.score, correct: p.correct, wrong: p.wrong, x: G.pub ? G.pub(p) : null,
  }));
  room.results = { game: room.game, name: G.name, emoji: G.emoji, results, summary: G.summary ? G.summary(room) : null };
  const msg = { t: 'ended', ...room.results };
  send(room.host, msg);
  for (const p of room.players.values()) p.send(msg);
}

function toLobby(room) {
  room.state = 'lobby'; room.game = null; room.results = null;
  for (const p of room.players.values()) { resetPlayer(p); p.send({ t: 'lobbyreset' }); }
  notifyLobby(room);
}

const lobbyList = (room) => [...room.players.values()].map((p) => ({ id: p.id, name: p.name, emoji: p.emoji, on: p.connected }));
function notifyLobby(room) { send(room.host, { t: 'lobby', players: lobbyList(room) }); }

function sendHostState(room) {
  const G = GAMES[room.game];
  send(room.host, {
    t: 'state', game: room.game, name: G.name, emoji: G.emoji, left: leftMs(room), total: room.total,
    players: ranked(room).map((p) => ({ id: p.id, name: p.name, emoji: p.emoji, score: p.score, on: p.connected, x: G.pub ? G.pub(p) : null })),
    feed: room.feed.slice(-8), g: G.hostView ? G.hostView(room) : null,
  });
}
function sendPlayerTicks(room) {
  const G = GAMES[room.game];
  const list = ranked(room);
  const top = list.slice(0, 5).map((p) => ({ name: p.name, emoji: p.emoji, score: p.score }));
  list.forEach((p, i) => {
    if (p.connected) p.send({ t: 'tick', left: leftMs(room), rank: i + 1, n: list.length, score: p.score, top, view: G.playerView ? G.playerView(room, p) : null });
  });
}

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.state === 'playing') {
      if (now >= room.endsAt) { endGame(room); continue; }
      const G = GAMES[room.game];
      if (G.tick) G.tick(room, now);
      if (now - room.lastHost >= 500) { room.lastHost = now; sendHostState(room); }
      if (now - room.lastP >= 1000) { room.lastP = now; sendPlayerTicks(room); }
    }
    if (!room.host && now - room.touched > 3 * 3600 * 1000) rooms.delete(code);
  }
}, 250);

// ---------- WebSocket ----------
function cleanName(s) { return String(s || '').replace(/[<>\n\r]/g, '').trim().slice(0, 10); }

function onMessage(ws, m) {
  const t = m.t;
  if (t === 'create') {
    const room = newRoom();
    room.host = ws; ws.role = 'host'; ws.room = room;
    return send(ws, hostInit(room));
  }
  if (t === 'resume') {
    const room = rooms.get(String(m.code));
    if (!room || room.hostKey !== m.hostKey) return send(ws, { t: 'err', msg: '방이 만료되었어요', fatal: true });
    if (room.host && room.host !== ws) room.host.close();
    room.host = ws; ws.role = 'host'; ws.room = room; room.touched = Date.now();
    send(ws, hostInit(room));
    if (room.state === 'playing') sendHostState(room);
    if (room.state === 'ended' && room.results) send(ws, { t: 'ended', ...room.results });
    return;
  }
  if (t === 'join') {
    const room = rooms.get(String(m.code || '').trim());
    if (!room) return send(ws, { t: 'err', msg: '방 코드를 찾을 수 없어요', fatal: true });
    let p = m.id && room.players.get(m.id);
    if (!p) {
      if (room.players.size >= MAX_PLAYERS) return send(ws, { t: 'err', msg: '방이 가득 찼어요', fatal: true });
      let name = cleanName(m.name);
      if (!name) return send(ws, { t: 'err', msg: '이름을 입력하세요' });
      const names = new Set([...room.players.values()].map((x) => x.name));
      for (let n = 2, base = name; names.has(name); n++) name = base.slice(0, 8) + n;
      p = newPlayer(room, name);
      room.players.set(p.id, p);
      if (room.state === 'playing') GAMES[room.game].join(room, p);
    }
    if (p.ws && p.ws !== ws && p.ws.readyState === 1) { p.ws.role = null; p.ws.close(); }
    p.ws = ws; p.connected = true; ws.role = 'player'; ws.room = room; ws.pid = p.id; room.touched = Date.now();
    p.send({ t: 'joined', id: p.id, code: room.code, name: p.name, emoji: p.emoji, color: p.color, state: room.state });
    if (room.state === 'playing') p.send(startMsg(room, p));
    if (room.state === 'ended' && room.results) p.send({ t: 'ended', ...room.results });
    return notifyLobby(room);
  }

  const room = ws.room;
  if (!room) return;
  room.touched = Date.now();

  if (ws.role === 'host') {
    if (t === 'setQuestions') {
      const qs = parseQuestions(m.text);
      if (qs.length < 3) return send(ws, { t: 'err', msg: '문제는 최소 3개가 필요해요. (형식: 질문 | 정답 | 오답1 | 오답2 | 오답3)' });
      room.questions = qs;
      return send(ws, { t: 'questions', count: qs.length, text: questionsToText(qs) });
    }
    if (t === 'resetQuestions') {
      room.questions = DEFAULT_Q.slice();
      return send(ws, { t: 'questions', count: room.questions.length, text: questionsToText(room.questions) });
    }
    if (t === 'start') { if (room.state !== 'playing' && room.players.size) startGame(room, m.game, m.minutes); return; }
    if (t === 'end') return endGame(room);
    if (t === 'lobby') return toLobby(room);
    if (t === 'kick') {
      const p = room.players.get(m.id);
      if (p) { p.send({ t: 'kicked' }); if (p.ws) p.ws.role = null; room.players.delete(p.id); if (p.ws) p.ws.close(); notifyLobby(room); }
      return;
    }
    return;
  }

  if (ws.role === 'player') {
    const p = room.players.get(ws.pid);
    if (!p || room.state !== 'playing') return;
    const G = GAMES[room.game];
    if (t === 'q') {
      const now = Date.now();
      if (now < p.lockUntil) return p.send({ t: 'locked', ms: p.lockUntil - now });
      if (!p.q) p.q = makeQuestion(room, p);
      return p.send({ t: 'question', text: p.q.text, choices: p.q.choices });
    }
    if (t === 'a') {
      if (!p.q) return;
      const q = p.q; p.q = null;
      const correct = +m.choice === q.correct;
      if (correct) { p.correct++; p.streak++; } else { p.wrong++; p.streak = 0; }
      const data = G.onAnswer(room, p, correct) || {};
      return p.send({ t: 'result', correct, correctIdx: q.correct, streak: p.streak, score: p.score, data });
    }
    if (t === 'g' && G.onMsg) return G.onMsg(room, p, m);
  }
}

function hostInit(room) {
  return {
    t: 'created', code: room.code, hostKey: room.hostKey, state: room.state, max: MAX_PLAYERS,
    games: Object.values(GAMES).map((g) => ({ id: g.id, name: g.name, emoji: g.emoji, desc: g.desc, how: g.how })),
    count: room.questions.length, text: questionsToText(room.questions), players: lobbyList(room),
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/api/info') {
      res.writeHead(200, { 'Content-Type': MIME['.json'] });
      return res.end(JSON.stringify({ ips: lanIPs(), port: PORT }));
    }
    if (u.pathname === '/qr') {
      const svg = await QRCode.toString(u.searchParams.get('u') || '', { type: 'svg', margin: 1 });
      res.writeHead(200, { 'Content-Type': MIME['.svg'] });
      return res.end(svg);
    }
    const rel = u.pathname === '/' ? '/play.html' : u.pathname === '/host' ? '/host.html' : u.pathname;
    const file = path.join(PUB, path.normalize(decodeURIComponent(rel)));
    if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(buf);
    });
  } catch (e) { res.writeHead(500); res.end('error'); }
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
wss.on('connection', (ws) => {
  ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch { return; } if (m && typeof m === 'object') { try { onMessage(ws, m); } catch (e) { console.error(e); } } });
  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    if (ws.role === 'host' && room.host === ws) room.host = null;
    if (ws.role === 'player') {
      const p = room.players.get(ws.pid);
      if (p && p.ws === ws) { p.connected = false; notifyLobby(room); }
    }
  });
  ws.on('error', () => {});
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  🎮 퀴즈 아레나 서버 시작!\n');
  console.log(`  교사(호스트) 화면 : http://localhost:${PORT}/host`);
  for (const ip of lanIPs()) console.log(`  학생 접속 주소    : http://${ip}:${PORT}`);
  console.log('');
});
