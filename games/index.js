'use strict';
// 게임 레지스트리: 각 게임은 { id, name, emoji, desc, how, init, join, onAnswer, onMsg, tick, hostView, playerView, pub, summary } 를 구현한다.
const list = [require('./classic'), require('./jump'), require('./fishing'), require('./race'), require('./boss'), require('./heist')];
module.exports = Object.fromEntries(list.map((g) => [g.id, g]));
