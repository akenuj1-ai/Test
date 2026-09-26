/**
 * Controlador da interface do Freaky Zoo.
 *
 * A interface e um TOCADOR DE BOOKS: recebe a lista de eventos de uma rodada
 * — do motor local (modo demonstracao) ou do RGS da Stake Engine — e anima um
 * por um. Nenhuma regra de jogo mora aqui e nenhum premio e recalculado: se um
 * numero aparece na tela, ele veio do book. Consequencia: a mesma interface
 * roda a demonstracao e o jogo publicado, e trocar animacao nao move o RTP.
 */

import {
  GRID, SYMBOLS, PAYTABLE, MODES, BET_LEVELS, DEFAULT_BET, MAX_WIN_X100, TARGET_RTP,
  FEATURE_TRIGGERS, RETRIGGER_SCATTERS, RETRIGGER_SPINS, BUY_SPINS, GORILLA_MULT_VALUES,
  CAMEL_TONGUE_CHANCE, FRENZY_WILD_MULT,
} from '../config.js';
import { createSession, moneyOf, formatMoney } from '../session.js';
import { applyEvent, stopPlan, winTier } from './board-model.js';
import { SKINS, skinOf } from './skins.js';
import { rgsParamsFromUrl, createRgsClient, eventsOfRound, RgsError } from './rgs.js';

const { REELS, ROWS } = GRID;

/* ------------------------------------------------------------------ */
/* fontes de rodada: demonstracao local ou RGS da Stake                */
/* ------------------------------------------------------------------ */

/**
 * @typedef {object} Played
 * @property {Record<string, any>[]} events
 * @property {number} payoutX100
 * @property {number} cost
 * @property {number} balanceAfterDebit
 * @property {() => Promise<number>} finish  credita o ganho e devolve o saldo final
 */

/**
 * @typedef {object} Source
 * @property {'local'|'rgs'} kind
 * @property {string} currency
 * @property {number[]} betLevels
 * @property {number} defaultBet
 * @property {number} balance
 * @property {(mode: string, bet: number) => Promise<Played>} play
 * @property {any} [session]
 * @property {any} [pendingRound]
 * @property {() => Promise<void>} [closePending]
 */

/**
 * Demonstracao local. `?demoSeed=xyz` na URL fixa a semente do servidor e
 * torna a sequencia de rodadas reproduzivel (util para QA e capturas).
 * @returns {Source}
 */
function localSource() {
  const demoSeed = new URL(location.href).searchParams.get('demoSeed');
  const session = createSession(demoSeed ? { serverSeed: demoSeed } : {});
  return {
    kind: 'local',
    currency: 'BRL',
    betLevels: [...BET_LEVELS],
    defaultBet: DEFAULT_BET,
    session,
    get balance() { return session.balance; },
    async play(mode, bet) {
      session.setBet(bet);
      const out = session.play({ mode: /** @type {any} */ (mode) });
      return {
        events: /** @type {Record<string, any>[]} */ (out.result.events),
        payoutX100: out.result.payoutX100,
        cost: out.cost,
        balanceAfterDebit: out.balanceBefore - out.cost,
        finish: async () => out.balanceAfter,
      };
    },
  };
}

/**
 * @param {import('./rgs.js').RgsParams} params
 * @returns {Promise<Source>}
 */
async function rgsSource(params) {
  const client = createRgsClient(params);
  const auth = await client.authenticate();
  let balance = Number(auth.balance?.amount ?? 0);
  const cfg = auth.config ?? {};
  /** @type {number[]} */
  const levels = (Array.isArray(cfg.betLevels) && cfg.betLevels.length ? cfg.betLevels : BET_LEVELS)
    .map(Number).filter((/** @type {number} */ b) => b > 0 && b % 100 === 0);
  return {
    kind: 'rgs',
    currency: auth.balance?.currency ?? 'USD',
    betLevels: levels,
    defaultBet: levels.includes(Number(cfg.defaultBetLevel)) ? Number(cfg.defaultBetLevel) : levels[0],
    pendingRound: auth.round?.active ? auth.round : null,
    async closePending() {
      const end = await client.endRound();
      balance = Number(end.balance?.amount ?? balance);
    },
    get balance() { return balance; },
    async play(mode, bet) {
      const res = await client.play(bet, mode);
      balance = Number(res.balance?.amount ?? balance);
      const round = res.round;
      const events = eventsOfRound(round);
      const payoutX100 = Number(round.payoutMultiplier ?? events.at(-1)?.amount ?? 0);
      return {
        events,
        payoutX100,
        cost: moneyOf(bet, MODES[/** @type {keyof typeof MODES} */ (mode)].costX100),
        balanceAfterDebit: balance,
        finish: async () => {
          if (round.active ?? payoutX100 > 0) {
            const end = await client.endRound();
            balance = Number(end.balance?.amount ?? balance);
          }
          return balance;
        },
      };
    },
  };
}

/* ------------------------------------------------------------------ */
/* estado                                                              */
/* ------------------------------------------------------------------ */

/** @type {Source} */
let source = localSource();

const ui = {
  busy: false,
  turbo: false,
  /** @type {'base'|'hunt'|'lingua'} */
  featureMode: 'base',
  autoRemaining: 0,
  autoSizes: [10, 25, 50, 100, 0],
  autoSizeIndex: 0,
  bet: DEFAULT_BET,
  /** saldo mostrado durante a animacao (o debito aparece ja, o credito so no fim) */
  /** @type {number|null} */
  shownBalance: null,
  /** @type {import('./board-model.js').Board} */
  board: demoBoard(),
  /** @type {'festa'|'rave'|null} */
  feature: null,
};

const stats = {
  rounds: 0, wagered: 0, won: 0, biggest: 0, biggestX: 0,
  festa: 0, rave: 0, tongues: 0, spits: 0, frenzies: 0, maxWins: 0,
};

const semMovimento = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const BASE_TIMING = {
  spinBase: 520, spinStagger: 150, anticipation: 1150, msPerCell: 40,
  winEach: 950, winAll: 750, banner: 1700, bannerShort: 1050,
  camel: 650, spitFly: 420, tongue: 560, drop: 380, pop: 240, pause: 260,
};

/** Duracoes em ms, encurtadas no turbo. */
function T() {
  const k = semMovimento ? 0.25 : ui.turbo ? 0.4 : 1;
  /** @type {typeof BASE_TIMING} */
  const out = /** @type {any} */ ({});
  for (const [key, v] of Object.entries(BASE_TIMING)) /** @type {any} */ (out)[key] = Math.round(v * k);
  return out;
}

const wait = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

const el = {
  board: $('board'),
  boardWrap: $('board-wrap'),
  fx: $('fx'),
  banner: $('banner'),
  bannerKicker: $('banner-kicker'),
  bannerTitle: $('banner-title'),
  bannerSub: $('banner-sub'),
  winline: $('winline'),
  balance: $('balance'),
  balanceLabel: $('balance-label'),
  betValue: $('bet-value'),
  betDown: /** @type {HTMLButtonElement} */ ($('bet-down')),
  betUp: /** @type {HTMLButtonElement} */ ($('bet-up')),
  spin: /** @type {HTMLButtonElement} */ ($('btn-spin')),
  spinLabel: $('spin-label'),
  spinCost: $('spin-cost'),
  hunt: /** @type {HTMLButtonElement} */ ($('btn-hunt')),
  lingua: /** @type {HTMLButtonElement} */ ($('btn-lingua')),
  buy: /** @type {HTMLButtonElement} */ ($('btn-buy')),
  turbo: /** @type {HTMLButtonElement} */ ($('btn-turbo')),
  auto: /** @type {HTMLButtonElement} */ ($('btn-auto')),
  autoCount: $('auto-count'),
  featureBar: $('feature-bar'),
  fsName: $('fs-name'),
  fsCount: $('fs-count'),
  fsWin: $('fs-win'),
  rtpBadge: $('rtp-badge'),
  fairBtn: /** @type {HTMLButtonElement} */ ($('btn-fair')),
};

const money = (/** @type {number} */ micro) => formatMoney(micro, source.currency, 'pt-BR');
const moneyX = (/** @type {number} */ x100) => money(moneyOf(ui.bet, x100));
const fmtX = (/** @type {number} */ x) => `${x.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}×`;

/* ------------------------------------------------------------------ */
/* tabuleiro                                                           */
/* ------------------------------------------------------------------ */

/** Grade de abertura: todo o elenco a vista. */
function demoBoard() {
  const cols = [
    ['H1', 'L1', 'H2', 'L4'], ['L2', 'W', 'H3', 'L3'], ['S', 'H1', 'L1', 'H2'],
    ['H3', 'L3', 'C', 'L2'], ['L4', 'H2', 'W', 'H1'], ['L1', 'S', 'H3', 'L3'],
  ];
  return cols.map((c) => c.map((name) => ({ name })));
}

/** @type {{ el: HTMLElement, strip: HTMLElement, tiles: HTMLElement[] }[]} */
const reels = [];

function buildBoard() {
  el.board.replaceChildren();
  reels.length = 0;
  for (let r = 0; r < REELS; r++) {
    const reel = document.createElement('div');
    reel.className = 'reel';
    const strip = document.createElement('div');
    strip.className = 'reel-strip';
    reel.appendChild(strip);
    el.board.appendChild(reel);
    reels.push({ el: reel, strip, tiles: [] });
  }
  ui.board.forEach((col, r) => renderReel(r, col));
}

/**
 * Cria a peca de uma celula.
 * @param {import('./board-model.js').Cell} cell
 */
function makeTile(cell) {
  const skin = skinOf(cell.name);
  const tile = document.createElement('div');
  // rolo grudento e lingua que ficou: mesma cara de lingua, com selo "GRUDOU"
  const tongue = Boolean(cell.tongue || cell.sticky);
  const classes = ['tile', `tile--${cell.name}`];
  if (skin.look === 'card') classes.push('tile--card');
  if (tongue) classes.push('tile--tongue');
  if (cell.sticky) classes.push('tile--sticky');
  if (cell.frenzy) classes.push('tile--frenzy');
  tile.className = classes.join(' ');
  tile.style.setProperty('--glow', skin.color);
  tile.setAttribute('role', 'gridcell');
  const label = tongue ? 'Língua do camelo (wild)' : skin.name;
  tile.setAttribute('aria-label', cell.multiplier ? `${label} ×${cell.multiplier}` : label);

  if (skin.art && !tongue) {
    const img = document.createElement('img');
    img.className = 'tile-art';
    img.src = skin.art;
    img.alt = '';
    img.draggable = false;
    tile.appendChild(img);
  } else {
    const glyph = document.createElement('span');
    glyph.className = 'tile-glyph';
    glyph.textContent = tongue ? '👅' : skin.glyph;
    tile.appendChild(glyph);
    if (skin.accessory && !tongue) {
      const acc = document.createElement('span');
      acc.className = 'tile-acc';
      acc.textContent = skin.accessory;
      tile.appendChild(acc);
    }
  }
  if (cell.multiplier && cell.multiplier > 1) {
    const badge = document.createElement('span');
    badge.className = 'mult-badge';
    badge.textContent = `×${cell.multiplier}`;
    tile.appendChild(badge);
  }
  return tile;
}

/**
 * Pinta um rolo parado.
 * @param {number} r
 * @param {import('./board-model.js').Cell[]} col
 */
function renderReel(r, col) {
  const tiles = col.map(makeTile);
  const reel = reels[r];
  reel.strip.style.transition = 'none';
  reel.strip.style.transform = '';
  reel.strip.classList.remove('reel-strip--spinning');
  reel.strip.replaceChildren(...tiles);
  reel.tiles = tiles;
}

/**
 * Troca uma celula no lugar, com animacao opcional.
 * @param {number} r @param {number} row
 * @param {import('./board-model.js').Cell} cell
 * @param {string} [anim] classe de animacao
 */
function repaint(r, row, cell, anim) {
  const tile = makeTile(cell);
  if (anim) tile.classList.add(anim);
  reels[r].tiles[row].replaceWith(tile);
  reels[r].tiles[row] = tile;
  return tile;
}

/** Codigos usados para encher a fita durante o giro (so aparencia). */
const FILLER = ['L4', 'L4', 'L3', 'L3', 'L2', 'L2', 'L1', 'L1', 'H3', 'H2', 'H1', 'W', 'C', 'S'];
const filler = () => ({ name: FILLER[Math.floor(Math.random() * FILLER.length)] });

/** Distancia vertical entre duas pecas, em px. */
function pitch() {
  const tile = reels[0].tiles[0];
  const gap = parseFloat(getComputedStyle(reels[0].strip).rowGap || '0') || 0;
  return (tile?.getBoundingClientRect().height ?? 60) + gap;
}

/**
 * Gira e para os rolos na grade do `reveal`, da esquerda para a direita, com
 * antecipacao quando o proximo rolo pode completar o gatilho.
 * @param {import('./board-model.js').Board} board
 */
async function spinTo(board) {
  const t = T();
  const plan = stopPlan(board);
  const p = pitch();
  let extra = 0;
  const jobs = board.map((col, r) => {
    if (plan[r].anticipation) extra += t.anticipation;
    const duration = t.spinBase + r * t.spinStagger + extra;
    const reel = reels[r];
    const count = Math.max(6, Math.ceil(duration / Math.max(12, t.msPerCell)));
    const finalTiles = col.map(makeTile);
    const fillerTiles = Array.from({ length: count }, () => makeTile(filler()));
    reel.strip.replaceChildren(...finalTiles, ...fillerTiles, ...reel.tiles);
    reel.strip.style.transition = 'none';
    reel.strip.style.transform = `translateY(${-(finalTiles.length + fillerTiles.length) * p}px)`;
    reel.strip.classList.add('reel-strip--spinning');
    void reel.strip.offsetHeight; // reinicia a transicao
    reel.strip.style.transition = `transform ${duration}ms cubic-bezier(.12,.7,.25,1.03)`;
    reel.strip.style.transform = 'translateY(0)';

    const previousStop = r === 0 ? 0 : t.spinBase + (r - 1) * t.spinStagger + extra - (plan[r].anticipation ? t.anticipation : 0);
    if (plan[r].anticipation) setTimeout(() => reel.el.classList.add('reel--anticipate'), previousStop);

    return wait(duration).then(() => {
      reel.el.classList.remove('reel--anticipate');
      renderReel(r, col);
      for (const tile of reel.tiles) tile.classList.add('tile--land');
    });
  });
  await Promise.all(jobs);
}

/* ------------------------------------------------------------------ */
/* efeitos                                                             */
/* ------------------------------------------------------------------ */

/** Centro de uma celula em coordenadas da camada de efeitos. */
function centerOf(/** @type {number} */ r, /** @type {number} */ row) {
  const box = el.fx.getBoundingClientRect();
  const cell = reels[r].tiles[row].getBoundingClientRect();
  return { x: cell.left - box.left + cell.width / 2, y: cell.top - box.top + cell.height / 2, w: cell.width, h: cell.height };
}

/**
 * Texto flutuante sobre a grade.
 * @param {string} text @param {{x:number,y:number}} at
 */
function floatText(text, at) {
  const t = T();
  const node = document.createElement('div');
  node.className = 'float-text';
  node.textContent = text;
  node.style.left = `${at.x}px`;
  node.style.top = `${at.y}px`;
  el.fx.appendChild(node);
  node.animate(
    [{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 }, { transform: 'translate(-50%,-90%) scale(1.1)', opacity: 1, offset: 0.3 }, { transform: 'translate(-50%,-160%) scale(1)', opacity: 0 }],
    { duration: Math.max(300, t.banner), easing: 'ease-out' },
  ).finished.then(() => node.remove(), () => node.remove());
}

/**
 * Faixa central.
 * @param {{ kicker?: string, title: string, sub?: string, cls?: string, ms?: number }} b
 */
async function banner({ kicker = '', title, sub = '', cls = '', ms }) {
  el.bannerKicker.textContent = kicker;
  el.bannerTitle.textContent = title;
  el.bannerSub.textContent = sub;
  el.banner.className = `banner ${cls}`.trim();
  el.banner.hidden = false;
  await wait(ms ?? T().banner);
  el.banner.hidden = true;
}

/**
 * Conta de 0 ate o valor na faixa (ganhos grandes).
 * @param {string} title @param {number} x100 @param {string} [cls]
 */
async function bigWin(title, x100, cls = '') {
  const t = T();
  el.bannerKicker.textContent = fmtX(x100 / 100);
  el.bannerTitle.textContent = title;
  el.banner.className = `banner ${cls}`.trim();
  el.banner.hidden = false;
  const total = moneyOf(ui.bet, x100);
  const steps = semMovimento ? 1 : 24;
  for (let i = 1; i <= steps; i++) {
    el.bannerSub.textContent = money(Math.round((total * i) / steps));
    await wait(t.banner / steps);
  }
  await wait(t.bannerShort);
  el.banner.hidden = true;
}

function shake() {
  el.boardWrap.classList.remove('board-wrap--shake');
  void el.boardWrap.offsetWidth;
  el.boardWrap.classList.add('board-wrap--shake');
}

function clearWinState() {
  el.board.classList.remove('board--dim');
  for (const reel of reels) for (const tile of reel.tiles) tile.classList.remove('tile--win');
}

/**
 * @param {string} text
 * @param {'win'|'bad'|''} [kind]
 */
function setWinline(text, kind = '') {
  el.winline.textContent = text;
  el.winline.className = `winline${kind ? ` winline--${kind}` : ''}`;
}

/* ---- camelo ---- */

/**
 * @param {Record<string, any>} ev
 * @param {import('./board-model.js').Board} after
 */
async function showCamel(ev, after) {
  const t = T();
  for (const c of ev.camels) {
    const tile = reels[c.reel].tiles[c.row];
    tile.classList.add('tile--camel-act');
    floatText(c.action === 'tongue' ? '👅 LÍNGUA!' : '💦 CUSPE!', centerOf(c.reel, c.row));
  }
  await wait(t.camel);

  const spitters = ev.camels.filter((/** @type {any} */ c) => c.action === 'spit');
  if (ev.spit?.length) {
    setWinline('💦 O camelo cuspiu: todo símbolo alto virou carta!', 'bad');
    const from = centerOf(spitters[0].reel, spitters[0].row);
    await Promise.all(ev.spit.map((/** @type {any} */ s, /** @type {number} */ k) => new Promise((resolve) => {
      const to = centerOf(s.reel, s.row);
      const blob = document.createElement('div');
      blob.className = 'spit';
      el.fx.appendChild(blob);
      const anim = blob.animate(
        [
          { transform: `translate(${from.x}px, ${from.y}px) scale(.3)` },
          { transform: `translate(${(from.x + to.x) / 2}px, ${Math.min(from.y, to.y) - from.h * 0.8}px) scale(1)`, offset: 0.5 },
          { transform: `translate(${to.x}px, ${to.y}px) scale(.8)` },
        ],
        { duration: t.spitFly, delay: k * 35, easing: 'ease-in', fill: 'forwards' },
      );
      const done = () => {
        blob.remove();
        repaint(s.reel, s.row, after[s.reel][s.row], 'tile--flip');
        resolve(null);
      };
      anim.finished.then(done, done);
    })));
    await wait(t.pause);
  } else if (spitters.length) {
    // cuspiu, mas nao havia simbolo alto para acertar
    for (const c of spitters) repaint(c.reel, c.row, after[c.reel][c.row], 'tile--flip');
  }

  for (const tg of ev.tongues ?? []) {
    setWinline(tg.sticky ? '👅 Língua grudenta! Esse rolo fica wild até o fim.' : '👅 O camelo mostrou a língua: rolo inteiro wild!', 'win');
    const camel = ev.camels.find((/** @type {any} */ c) => c.reel === tg.reel);
    const top = centerOf(tg.reel, 0);
    const bottom = centerOf(tg.reel, ROWS - 1);
    const node = document.createElement('div');
    node.className = 'tongue';
    const width = top.w * 0.62;
    node.style.left = `${top.x - width / 2}px`;
    node.style.width = `${width}px`;
    node.style.top = `${top.y - top.h / 2}px`;
    node.style.height = `${bottom.y - top.y + top.h}px`;
    const origin = camel ? ((camel.row + 0.5) / ROWS) * 100 : 50;
    node.style.transformOrigin = `50% ${origin}%`;
    el.fx.appendChild(node);
    const grow = node.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1.06)', offset: 0.7 }, { transform: 'scaleY(1)' }], { duration: t.tongue, easing: 'ease-out', fill: 'forwards' });
    await grow.finished.catch(() => {});
    for (const row of tg.rows) repaint(tg.reel, row, after[tg.reel][row], 'tile--land');
    if (tg.sticky) reels[tg.reel].el.classList.add('reel--sticky');
    node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: t.pop, fill: 'forwards' }).finished.then(() => node.remove(), () => node.remove());
  }
  await wait(t.pause);
}

/* ---- ganhos ---- */

/**
 * @param {Record<string, any>} ev
 */
async function showWins(ev) {
  const t = T();
  const wins = [...ev.wins].sort((a, b) => b.win - a.win);
  el.board.classList.add('board--dim');
  /** @param {{reel:number,row:number}[]} positions */
  const light = (positions) => {
    for (const reel of reels) for (const tile of reel.tiles) tile.classList.remove('tile--win');
    for (const p of positions) reels[p.reel].tiles[p.row].classList.add('tile--win');
  };
  // cada ganho sozinho (no maximo 4, para nao arrastar), depois todos juntos
  for (const w of wins.slice(0, 4)) {
    light(w.positions);
    const skin = SKINS[w.symbol];
    const ways = w.ways === w.plainWays ? `${w.ways} ways` : `${w.plainWays} ways · multi ×${fmtMult(w.ways / w.plainWays)}`;
    const who = skin.look === 'card' ? skin.name : `${skin.glyph} ${skin.name}`;
    setWinline(`${who} ×${w.kind} · ${ways} → ${moneyX(w.win)}`, 'win');
    await wait(wins.length > 1 ? t.winEach : t.winEach + t.winAll);
  }
  if (wins.length > 1) {
    light(wins.flatMap((w) => w.positions));
    setWinline(`${wins.length} ganhos → ${moneyX(ev.totalWin)}`, 'win');
    await wait(t.winAll);
  }
}

/** @param {number} m */
const fmtMult = (m) => (Number.isInteger(m) ? String(m) : m.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));

/* ------------------------------------------------------------------ */
/* tocador de books                                                    */
/* ------------------------------------------------------------------ */

/** @param {'festa'|'rave'} feature */
const featureName = (feature) => (feature === 'rave' ? 'Rave Sigma' : 'Festa Freaky');

/**
 * Anima os eventos de uma rodada, em ordem.
 * @param {Record<string, any>[]} events
 */
async function playEvents(events) {
  const t = T();
  let board = ui.board;
  let featureWin = 0;
  let baseWin = 0;
  let capped = false;

  for (const ev of events) {
    switch (ev.type) {
      case 'reveal': {
        clearWinState();
        if (ev.gameType === 'basegame') setWinline('Girando...');
        board = applyEvent(board, ev);
        await spinTo(board);
        // rolos grudentos continuam marcados ate o fim do bonus
        if (ui.feature !== 'rave') for (const reel of reels) reel.el.classList.remove('reel--sticky');
        break;
      }
      case 'stickyWilds': {
        board = applyEvent(board, ev);
        for (const r of ev.reels) {
          board[r].forEach((cell, row) => { if (cell.sticky) repaint(r, row, cell, 'tile--drop'); });
          reels[r].el.classList.add('reel--sticky');
        }
        await wait(t.drop);
        break;
      }
      case 'gorillaMultipliers': {
        board = applyEvent(board, ev);
        for (const w of ev.wilds) {
          const tile = repaint(w.reel, w.row, board[w.reel][w.row]);
          tile.querySelector('.mult-badge')?.classList.add('mult-badge--pop');
        }
        await wait(t.pop + t.pause);
        break;
      }
      case 'freakyFrenzy': {
        stats.frenzies += 1;
        shake();
        await banner({ kicker: 'o gorila surtou', title: 'SURTO FREAKY!', sub: `${ev.wilds.length} wilds ×${FRENZY_WILD_MULT}`, ms: t.bannerShort });
        board = applyEvent(board, ev);
        for (const [k, w] of ev.wilds.entries()) {
          setTimeout(() => repaint(w.reel, w.row, board[w.reel][w.row], 'tile--drop'), k * 90);
        }
        await wait(t.drop + ev.wilds.length * 90);
        break;
      }
      case 'camel': {
        for (const c of ev.camels) stats[c.action === 'tongue' ? 'tongues' : 'spits'] += 1;
        board = applyEvent(board, ev);
        await showCamel(ev, board);
        break;
      }
      case 'winInfo':
        await showWins(ev);
        break;
      case 'setWin': {
        if (ui.feature) {
          setWinline(`Ganho do giro: ${moneyX(ev.amount)}`, 'win');
        } else {
          baseWin = ev.amount;
          const tier = winTier(ev.amount / 100);
          if (tier) await bigWin(tier.label, ev.amount, `banner--${tier.key}`);
          setWinline(`Ganho: ${moneyX(ev.amount)} (${fmtX(ev.amount / 100)})`, 'win');
        }
        break;
      }
      case 'setTotalWin':
        if (ui.feature) {
          featureWin = ev.amount - baseWin;
          el.fsWin.textContent = moneyX(featureWin);
        }
        break;
      case 'freeSpinTrigger': {
        for (const p of ev.positions ?? []) reels[p.reel].tiles[p.row]?.classList.add('tile--scatter-hit');
        if (ev.positions?.length) await wait(t.bannerShort);
        ui.feature = ev.feature;
        stats[/** @type {'festa'|'rave'} */ (ev.feature)] += 1;
        document.body.dataset.mode = ev.feature;
        el.featureBar.hidden = false;
        el.fsName.textContent = featureName(ev.feature);
        el.fsCount.textContent = `0/${ev.totalFs}`;
        el.fsWin.textContent = money(0);
        await banner({
          kicker: ev.bought ? 'bônus comprado' : `${ev.positions.length} globos de discoteca`,
          title: featureName(ev.feature).toUpperCase(),
          sub: `${ev.totalFs} rodadas grátis${ev.feature === 'rave' ? ' · camelo só lambe e a língua gruda' : ' · gorilas com multiplicador'}`,
        });
        break;
      }
      case 'updateFreeSpin':
        el.fsCount.textContent = `${ev.amount}/${ev.total}`;
        break;
      case 'freeSpinRetrigger':
        for (const p of ev.positions ?? []) reels[p.reel].tiles[p.row]?.classList.add('tile--scatter-hit');
        await banner({ kicker: 'mais globo!', title: `+${RETRIGGER_SPINS} RODADAS`, sub: `total ${ev.totalFs}`, ms: t.bannerShort });
        break;
      case 'freeSpinEnd': {
        const tier = winTier(ev.amount / 100);
        if (tier && !capped) await bigWin(tier.label, ev.amount, `banner--${tier.key}`);
        await banner({ kicker: `fim da ${featureName(ev.feature)}`, title: moneyX(ev.amount), sub: fmtX(ev.amount / 100), ms: t.bannerShort });
        ui.feature = null;
        delete document.body.dataset.mode;
        el.featureBar.hidden = true;
        for (const reel of reels) reel.el.classList.remove('reel--sticky');
        break;
      }
      case 'wincap':
        capped = true;
        stats.maxWins += 1;
        await bigWin('GANHO MÁXIMO', ev.amount, 'banner--max');
        break;
      case 'finalWin':
        if (ev.amount > 0) setWinline(`Total da rodada: ${moneyX(ev.amount)} (${fmtX(ev.amount / 100)})`, 'win');
        else if (!el.winline.classList.contains('winline--bad')) setWinline('Sem ganho dessa vez.');
        break;
      default:
        break;
    }
  }
  ui.board = board;
  ui.feature = null;
}

/* ------------------------------------------------------------------ */
/* rodada                                                              */
/* ------------------------------------------------------------------ */

/** @param {string} mode */
const costOf = (mode) => moneyOf(ui.bet, MODES[/** @type {keyof typeof MODES} */ (mode)].costX100);

/**
 * Uma rodada completa. Devolve false se nao pode jogar (saldo, erro).
 * @param {string} mode
 */
async function playOnce(mode) {
  if (source.balance < costOf(mode)) {
    setWinline('Saldo insuficiente para essa aposta.', 'bad');
    return false;
  }
  ui.busy = true;
  updateControls();
  try {
    const played = await source.play(mode, ui.bet);
    ui.shownBalance = played.balanceAfterDebit;
    renderBalance();
    await playEvents(played.events);
    await played.finish();
    stats.rounds += 1;
    stats.wagered += played.cost;
    const won = moneyOf(ui.bet, played.payoutX100);
    stats.won += won;
    if (won > stats.biggest) { stats.biggest = won; stats.biggestX = played.payoutX100 / 100; }
    return true;
  } catch (err) {
    const msg = err instanceof RgsError ? `${err.message} (${err.code})` : `Erro: ${/** @type {Error} */ (err).message}`;
    setWinline(msg, 'bad');
    console.error(err);
    return false;
  } finally {
    ui.shownBalance = null;
    ui.busy = false;
    renderBalance();
    updateControls();
  }
}

/**
 * Laco do automatico. Iterativo de proposito: recursao empilharia um quadro
 * por rodada (ver achado 8 em docs/REVIEW.md).
 */
async function runAuto() {
  while (ui.autoRemaining > 0) {
    ui.autoRemaining -= 1;
    updateControls();
    const ok = await playOnce(ui.featureMode);
    if (!ok) ui.autoRemaining = 0;
    await wait(T().pause);
  }
  updateControls();
}

/* ------------------------------------------------------------------ */
/* controles                                                           */
/* ------------------------------------------------------------------ */

function renderBalance() {
  el.balance.textContent = money(ui.shownBalance ?? source.balance);
}

function updateControls() {
  const busy = ui.busy || ui.autoRemaining > 0;
  const idx = source.betLevels.indexOf(ui.bet);
  el.betValue.textContent = money(ui.bet);
  el.betDown.disabled = busy || idx <= 0;
  el.betUp.disabled = busy || idx >= source.betLevels.length - 1;
  el.spin.disabled = ui.busy && ui.autoRemaining === 0;
  el.spin.classList.toggle('spin-btn--busy', ui.busy);
  el.spinLabel.textContent = ui.autoRemaining > 0 ? 'PARAR' : 'GIRAR';
  el.spinCost.textContent = money(costOf(ui.featureMode));
  el.hunt.setAttribute('aria-pressed', String(ui.featureMode === 'hunt'));
  el.lingua.setAttribute('aria-pressed', String(ui.featureMode === 'lingua'));
  el.hunt.disabled = busy;
  el.lingua.disabled = busy;
  el.buy.disabled = busy;
  el.turbo.setAttribute('aria-pressed', String(ui.turbo));
  el.auto.setAttribute('aria-pressed', String(ui.autoRemaining > 0));
  const size = ui.autoSizes[ui.autoSizeIndex];
  el.autoCount.textContent = ui.autoRemaining > 0
    ? (ui.autoRemaining > 1e6 ? '∞' : `${ui.autoRemaining}×`)
    : (size === 0 ? '∞' : `${size}×`);
  renderBalance();
}

/** @param {number} dir */
function stepBet(dir) {
  const idx = source.betLevels.indexOf(ui.bet);
  const next = source.betLevels[Math.max(0, Math.min(source.betLevels.length - 1, idx + dir))];
  if (next !== undefined) ui.bet = next;
  updateControls();
}

/** @param {'hunt'|'lingua'} mode */
function toggleFeatureMode(mode) {
  ui.featureMode = ui.featureMode === mode ? 'base' : mode;
  updateControls();
}

async function onSpin() {
  if (ui.autoRemaining > 0) { ui.autoRemaining = 0; updateControls(); return; }
  if (ui.busy) return;
  await playOnce(ui.featureMode);
}

/* ------------------------------------------------------------------ */
/* modais                                                              */
/* ------------------------------------------------------------------ */

/** @param {string} id */
function openModal(id) { $(id).hidden = false; }
/** @param {string} id */
function closeModal(id) { $(id).hidden = true; }

function wireModals() {
  for (const modal of document.querySelectorAll('.modal')) {
    modal.addEventListener('click', (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      if (target === modal || target.closest('[data-close]')) /** @type {HTMLElement} */ (modal).hidden = true;
    });
  }
  document.addEventListener('keydown', (e) => {
    const open = /** @type {HTMLElement|null} */ (document.querySelector('.modal:not([hidden])'));
    if (e.key === 'Escape' && open) { open.hidden = true; return; }
    if (e.code === 'Space' && !open && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      onSpin();
    }
  });
}

function renderBuy() {
  const grid = $('buy-grid');
  const cards = [
    { mode: 'festa', icon: '🪩', title: 'Festa Freaky', desc: `${BUY_SPINS} rodadas · gorilas ×2 a ×100` },
    { mode: 'rave', icon: '🐪', title: 'Rave Sigma', desc: `${BUY_SPINS} rodadas · língua grudenta, sem cuspe` },
  ];
  grid.replaceChildren(...cards.map((c) => {
    const btn = document.createElement('button');
    btn.className = 'buy-card';
    const cost = costOf(c.mode);
    btn.disabled = source.balance < cost;
    btn.innerHTML = `<span class="buy-card-icon">${c.icon}</span><span><strong>${c.title}</strong><small>${c.desc}</small></span><span class="buy-card-price">${money(cost)}<small>${MODES[/** @type {'festa'|'rave'} */ (c.mode)].costX100 / 100}×</small></span>`;
    btn.addEventListener('click', () => {
      closeModal('modal-buy');
      playOnce(c.mode);
    });
    return btn;
  }));
}

function renderRules() {
  const pct = (/** @type {number} */ p) => `${Math.round(p * 100)}%`;
  const rows = PAYTABLE.map((pays, s) => {
    const code = SYMBOLS[s].code;
    const skin = SKINS[code];
    return `<tr><td><span class="pay-sym">${makeTile({ name: code }).outerHTML.replace('class="tile', 'class="tile mini')}${skin.name}</span></td>${pays.map((p) => `<td>${fmtX(p / 100)}<br><small class="note">${moneyX(p)}</small></td>`).join('')}</tr>`;
  }).join('');
  const triggers = Object.entries(FEATURE_TRIGGERS).map(([n, t]) => `${n} globos → ${featureName(t.feature)} (${t.spins} rodadas)`).join(' · ');
  $('rules-body').innerHTML = `
    <h3>Como ganhar</h3>
    <p><strong>4.096 ways</strong>: 3 ou mais símbolos iguais em rolos vizinhos, a partir do primeiro rolo à esquerda, em qualquer linha. O prêmio da tabela é <em>por way</em> e multiplica pelo número de ways.</p>
    <p>Multiplicadores de wild <strong>somam</strong> dentro de um rolo e <strong>multiplicam</strong> entre rolos: gorilas ×10 em dois rolos diferentes = ×100.</p>
    <table class="pays"><thead><tr><th>Símbolo</th><th>3</th><th>4</th><th>5</th><th>6</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="note">Valores por way, em múltiplos da aposta e na aposta atual.</p>
    <h3>🦍 Gorila Freaky (wild)</h3>
    <p>Aparece do rolo 2 ao 6 e substitui todos os símbolos, menos o camelo e o globo. Nas rodadas grátis cada gorila chega com multiplicador de ×${GORILLA_MULT_VALUES[0]} a ×${GORILLA_MULT_VALUES.at(-1)}.</p>
    <h3>🐪 Camelo</h3>
    <p>Aparece do rolo 2 ao 5 e reage na hora:</p>
    <p>👅 <strong>Língua</strong> — o rolo inteiro vira wild (menos globos e gorilas, que mantêm o multiplicador).<br>
    💦 <strong>Cuspe</strong> — todo Leão vira A, todo Macaco vira K, toda Tartaruga vira Q, e o camelo vira J.</p>
    <p>Chance de língua: jogo base ${pct(CAMEL_TONGUE_CHANCE.base)} · Festa Freaky ${pct(CAMEL_TONGUE_CHANCE.festa)} · Rave Sigma ${pct(CAMEL_TONGUE_CHANCE.rave)}. Os cuspes resolvem antes das línguas.</p>
    <h3>⚡ Surto Freaky</h3>
    <p>No jogo base, de vez em quando o gorila invade a tela e joga de 2 a 5 wilds ×${FRENZY_WILD_MULT} nos rolos 2 a 6.</p>
    <h3>🪩 Globo de Discoteca</h3>
    <p>${triggers}. Durante o bônus, ${RETRIGGER_SCATTERS}+ globos dão +${RETRIGGER_SPINS} rodadas.</p>
    <h3>Festa Freaky (bônus)</h3>
    <p>Gorilas com multiplicador em todo giro. O camelo lambe mais do que cospe.</p>
    <h3>Rave Sigma (super bônus)</h3>
    <p>O camelo só lambe — e a língua <strong>gruda</strong>: o rolo fica wild até o fim do bônus. Gorilas com multiplicador em cima disso.</p>
    <h3>FeatureSpins</h3>
    <p><strong>Caçada Freaky</strong> (${MODES.hunt.costX100 / 100}× a aposta): bônus cerca de 4× mais frequente e Rave Sigma cerca de 9× mais.<br>
    <strong>Língua Garantida</strong> (${MODES.lingua.costX100 / 100}× a aposta): todo giro tem um camelo lambendo.<br>
    <strong>Compra</strong>: Festa Freaky ${MODES.festa.costX100 / 100}× · Rave Sigma ${MODES.rave.costX100 / 100}×.</p>
    <h3>Números</h3>
    <dl class="kv">
      <dt>RTP (todos os modos)</dt><dd>${(TARGET_RTP * 100).toFixed(2).replace('.', ',')}%</dd>
      <dt>Volatilidade</dt><dd>muito alta</dd>
      <dt>Ganho máximo</dt><dd>${(MAX_WIN_X100 / 100).toLocaleString('pt-BR')}× a aposta</dd>
    </dl>
    <p class="note">Ao atingir o ganho máximo a rodada termina na hora e as rodadas grátis restantes são descartadas. Mau funcionamento anula jogadas e prêmios.</p>`;
}

function renderStats() {
  const rtp = stats.wagered ? stats.won / stats.wagered : 0;
  $('stats-body').innerHTML = `<dl class="kv">
    <dt>Rodadas</dt><dd>${stats.rounds}</dd>
    <dt>Apostado</dt><dd>${money(stats.wagered)}</dd>
    <dt>Ganho</dt><dd>${money(stats.won)}</dd>
    <dt>RTP da sessão</dt><dd>${(rtp * 100).toFixed(2)}%</dd>
    <dt>Maior ganho</dt><dd>${money(stats.biggest)} (${fmtX(stats.biggestX)})</dd>
    <dt>Festas Freaky</dt><dd>${stats.festa}</dd>
    <dt>Raves Sigma</dt><dd>${stats.rave}</dd>
    <dt>Línguas 👅</dt><dd>${stats.tongues}</dd>
    <dt>Cuspes 💦</dt><dd>${stats.spits}</dd>
    <dt>Surtos Freaky</dt><dd>${stats.frenzies}</dd>
    <dt>Ganhos máximos</dt><dd>${stats.maxWins}</dd>
  </dl>
  <p class="note">Com volatilidade muito alta, o RTP de algumas centenas de rodadas não diz quase nada: ele converge para ${(TARGET_RTP * 100).toFixed(1)}% só em milhões de rodadas.</p>`;
}

/** Escapa texto do usuario antes de entrar em innerHTML. */
const escapeHtml = (/** @type {string} */ s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** @type {{ serverSeed: string, hash: string, rounds: number }[]} */
const revealed = [];

function renderFair() {
  const body = $('fair-body');
  const session = source.session;
  if (!session) {
    body.innerHTML = '<p>Jogando pelo RGS da Stake Engine: cada rodada é sorteada no servidor a partir da biblioteca de books publicada e auditada pela Stake.</p>';
    return;
  }
  body.innerHTML = `
    <p>Cada rodada usa <code>HMAC-SHA256(semente do servidor, semente do cliente:nonce:bloco)</code>. O hash da semente do servidor é mostrado <em>antes</em> das rodadas; ao revelar, confira que ela gera esse hash.</p>
    <p class="note">Hash da semente do servidor</p>
    <div class="fair-hash">${session.serverSeedHash()}</div>
    <dl class="kv"><dt>Nonce</dt><dd>${session.nonce}</dd></dl>
    <div class="fair-row"><input id="fair-client" value="${escapeHtml(session.clientSeed)}" maxlength="64" aria-label="Semente do cliente" /><button class="ghost-btn" id="fair-set">Usar</button></div>
    <div class="fair-row"><button class="ghost-btn" id="fair-rotate">Revelar e trocar semente</button></div>
    ${revealed.map((r) => `<p class="note">Revelada (${r.rounds} rodadas)</p><div class="fair-hash">${r.serverSeed}<br>sha256 = ${r.hash}</div>`).join('')}`;
  $('fair-set').addEventListener('click', () => {
    try { session.setClientSeed(/** @type {HTMLInputElement} */ ($('fair-client')).value); } catch (e) { setWinline(/** @type {Error} */ (e).message, 'bad'); }
    renderFair();
  });
  $('fair-rotate').addEventListener('click', () => {
    revealed.unshift(session.rotateServerSeed());
    renderFair();
  });
}

/* ------------------------------------------------------------------ */
/* inicio                                                              */
/* ------------------------------------------------------------------ */

function wireControls() {
  el.spin.addEventListener('click', onSpin);
  el.betDown.addEventListener('click', () => stepBet(-1));
  el.betUp.addEventListener('click', () => stepBet(1));
  el.hunt.addEventListener('click', () => toggleFeatureMode('hunt'));
  el.lingua.addEventListener('click', () => toggleFeatureMode('lingua'));
  el.turbo.addEventListener('click', () => { ui.turbo = !ui.turbo; updateControls(); });
  el.auto.addEventListener('click', () => {
    if (ui.autoRemaining > 0) { ui.autoRemaining = 0; updateControls(); return; }
    if (ui.busy) return;
    const size = ui.autoSizes[ui.autoSizeIndex];
    ui.autoSizeIndex = (ui.autoSizeIndex + 1) % ui.autoSizes.length;
    ui.autoRemaining = size === 0 ? Number.MAX_SAFE_INTEGER : size;
    runAuto();
  });
  el.buy.addEventListener('click', () => { renderBuy(); openModal('modal-buy'); });
  $('btn-rules').addEventListener('click', () => { renderRules(); openModal('modal-rules'); });
  $('btn-stats').addEventListener('click', () => { renderStats(); openModal('modal-stats'); });
  el.fairBtn.addEventListener('click', () => { renderFair(); openModal('modal-fair'); });
}

async function init() {
  const params = rgsParamsFromUrl(location.href);
  if (params) {
    try {
      source = await rgsSource(params);
      el.balanceLabel.textContent = 'Saldo';
    } catch (err) {
      setWinline(`Não consegui conectar ao RGS: ${/** @type {Error} */ (err).message}`, 'bad');
    }
  }
  ui.bet = source.betLevels.includes(source.defaultBet) ? source.defaultBet : source.betLevels[0];
  el.rtpBadge.textContent = `${(TARGET_RTP * 100).toFixed(2).replace('.', ',')}%`;
  buildBoard();
  wireControls();
  wireModals();
  updateControls();
  // rodada que ficou aberta no RGS (queda de conexao): termina de mostrar e fecha
  if (source.pendingRound) {
    ui.busy = true;
    updateControls();
    try {
      await playEvents(eventsOfRound(source.pendingRound));
      await source.closePending?.();
    } finally {
      ui.busy = false;
      updateControls();
    }
  }
}

init();
