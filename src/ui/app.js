/**
 * Controlador da interface.
 *
 * Responsabilidade unica: transformar o resultado ja calculado de uma rodada
 * em animacao e texto. Nenhuma regra de jogo mora aqui — a UI le o `trace`
 * devolvido por round.js e reproduz passo a passo. Se um numero aparece na
 * tela, ele veio do motor; a UI nunca recalcula premio.
 *
 * Consequencia pratica: mudar a animacao nao pode mudar o RTP.
 */

import { createSession } from '../engine/session.js';
import { Mode, costOf } from '../engine/round.js';
import {
  GRID, SYMBOLS, Sym, PAYTABLE, SCATTER_PAYS, BET_LEVELS_CENTS,
  BUY_PRICES_X100, ANTE_COST_X100, MAX_WIN_X100, TARGET_RTP,
  FREE_SPINS_AWARDED, SCATTER_TRIGGER, MIN_CLUSTER,
} from '../engine/config.js';
import { formatCents, formatMultiplier } from '../engine/money.js';

const { COLS, ROWS, CELLS } = GRID;

/* ------------------------------------------------------------------ */
/* estado da apresentacao                                              */
/* ------------------------------------------------------------------ */

const session = createSession();

const ui = {
  busy: false,
  turbo: false,
  ante: false,
  autoRemaining: 0,
  autoSizes: [10, 25, 50, 100, 0],
  autoSizeIndex: 0,
  /** @type {number[]} */
  lastGrid: new Array(CELLS).fill(Sym.BLUE),
};

/** Duracoes base em ms; divididas pelo fator de turbo. */
const TIMING = { reveal: 330, highlight: 600, pop: 230, betweenSpins: 360, banner: 900 };

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

const el = {
  board: $('board'),
  balance: $('balance'),
  betValue: $('bet-value'),
  spinCost: $('spin-cost'),
  winline: $('winline'),
  winOverlay: $('win-overlay'),
  winOverlayLabel: $('win-overlay-label'),
  winOverlayValue: $('win-overlay-value'),
  toast: $('toast'),
  featureBar: $('feature-bar'),
  fsRemaining: $('fs-remaining'),
  fsMultiplier: $('fs-multiplier'),
  btnSpin: /** @type {HTMLButtonElement} */ ($('btn-spin')),
  btnBuy: /** @type {HTMLButtonElement} */ ($('btn-buy')),
  btnAnte: /** @type {HTMLButtonElement} */ ($('btn-ante')),
  btnTurbo: /** @type {HTMLButtonElement} */ ($('btn-turbo')),
  btnAuto: /** @type {HTMLButtonElement} */ ($('btn-auto')),
  autoCount: $('auto-count'),
  anteCost: $('ante-cost'),
  betDown: /** @type {HTMLButtonElement} */ ($('bet-down')),
  betUp: /** @type {HTMLButtonElement} */ ($('bet-up')),
  rtpBadge: $('rtp-badge'),
};

/** @type {HTMLElement[]} indexado por indice de grade (col * ROWS + row) */
const tiles = new Array(CELLS);

/** Todos os indices da grade — usado no primeiro sorteio de cada giro. */
const ALL_CELLS = Array.from({ length: CELLS }, (_, i) => i);

/* ------------------------------------------------------------------ */
/* tabuleiro                                                           */
/* ------------------------------------------------------------------ */

function buildBoard() {
  el.board.replaceChildren();
  // o CSS grid preenche por linha, mas o indice do motor e por coluna
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.setAttribute('role', 'gridcell');
      el.board.appendChild(tile);
      tiles[col * ROWS + row] = tile;
    }
  }
}

/**
 * Pinta uma celula.
 * @param {number} i indice de grade
 * @param {number} symbolId
 * @param {number} orbValue
 * @param {boolean} winning
 */
function paintTile(i, symbolId, orbValue, winning) {
  const meta = SYMBOLS[symbolId];
  const tile = tiles[i];
  const classes = ['tile'];
  if (symbolId === Sym.SCATTER) classes.push('tile--scatter');
  if (symbolId === Sym.ORB) classes.push('tile--orb');
  if (winning) classes.push('tile--win');
  tile.className = classes.join(' ');
  tile.style.setProperty('--glow', meta.color);
  tile.setAttribute('aria-label', meta.name);

  if (symbolId === Sym.ORB && orbValue > 0) {
    tile.textContent = meta.glyph;
    const badge = document.createElement('span');
    badge.className = 'orb-value';
    badge.textContent = `×${orbValue}`;
    tile.appendChild(badge);
  } else {
    tile.textContent = meta.glyph;
  }
}

/**
 * Renderiza uma grade inteira.
 * @param {number[]} grid
 * @param {number[]} [orbValues]
 * @param {Set<number>|null} [winning]
 * @param {number[]|null} [fallIndices] celulas que devem animar a queda
 */
function renderGrid(grid, orbValues, winning = null, fallIndices = null) {
  for (let i = 0; i < CELLS; i++) {
    paintTile(i, grid[i], orbValues?.[i] ?? 0, winning?.has(i) ?? false);
  }
  if (fallIndices) {
    for (const i of fallIndices) {
      const tile = tiles[i];
      tile.classList.remove('tile--fall');
      void tile.offsetWidth; // forca reflow para reiniciar a animacao
      tile.classList.add('tile--fall');
    }
  }
  ui.lastGrid = grid;
}

/* ------------------------------------------------------------------ */
/* utilidades de tempo                                                 */
/* ------------------------------------------------------------------ */

const speed = () => (ui.turbo ? 2.4 : 1);
/** @param {number} ms */
const wait = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms / speed())));

/** @param {string} text @param {number} [ms] */
async function toast(text, ms = 1400) {
  el.toast.textContent = text;
  el.toast.hidden = false;
  await wait(ms);
  el.toast.hidden = true;
}

/* ------------------------------------------------------------------ */
/* apresentacao da rodada                                              */
/* ------------------------------------------------------------------ */

/**
 * Reproduz visualmente uma rodada ja resolvida pelo motor.
 * @param {ReturnType<typeof session.play>} play
 */
async function presentRound(play) {
  const { result } = play;
  const bet = result.betCents;
  let running = 0;

  for (const spin of result.spins) {
    if (spin.kind === 'free') {
      el.featureBar.hidden = false;
      const played = result.spins.filter((s) => s.kind === 'free' && s.index <= spin.index).length;
      el.fsRemaining.textContent = String(Math.max(0, result.freeSpinsAwarded - played));
      el.fsMultiplier.textContent = `×${Math.max(1, spin.globalMultiplier)}`;
    }

    /** Celulas que devem animar a queda no proximo passo da cascata. */
    let falling = ALL_CELLS;

    for (let d = 0; d < spin.drops.length; d++) {
      const drop = spin.drops[d];
      const grid = /** @type {number[]} */ (drop.grid);
      const orbs = /** @type {number[]} */ (drop.orbValues);
      renderGrid(grid, orbs, null, falling);
      await wait(TIMING.reveal);

      if (drop.wins.length === 0) break;

      const winning = new Set(/** @type {number[]} */ (drop.removed));
      renderGrid(grid, orbs, winning);
      running += drop.winCents;
      el.winline.textContent = describeWins(drop.wins, running, bet);
      el.winline.className = 'winline is-win';
      await wait(TIMING.highlight);

      for (const i of winning) tiles[i].classList.add('tile--pop');
      await wait(TIMING.pop);

      // so as colunas que perderam pecas se movem no proximo passo
      falling = fallingColumns(winning);
    }

    if (spin.spinWinCents > 0) {
      const mult = spin.multiplierApplied;
      if (mult > 1) {
        await showOverlay(`Multiplicador ×${mult}`, formatCents(spin.spinWinCents), TIMING.banner);
      }
    }
    if (spin.retriggered) await toast(`🪙 ${spin.scatterCount} moedas — mais rodadas!`, 900);
    if (spin.kind === 'base' && result.featureTriggered && result.mode !== Mode.BUY_FREE_SPINS
        && result.mode !== Mode.BUY_SUPER_FREE_SPINS) {
      await showOverlay(`${spin.scatterCount} moedas!`, `${FREE_SPINS_AWARDED} rodadas grátis`, TIMING.banner * 1.3);
    }
    await wait(TIMING.betweenSpins);
  }

  el.featureBar.hidden = true;
  await finishRound(result);
}

/**
 * Colunas que perderam pecas — todas as suas celulas se deslocam, entao
 * animamos a coluna inteira. Colunas intactas ficam paradas, o que faz a
 * cascata parecer local em vez de um re-sorteio geral.
 *
 * @param {Set<number>} removed indices que explodiram
 * @returns {number[]}
 */
function fallingColumns(removed) {
  const touched = new Set();
  for (const i of removed) touched.add((i / ROWS) | 0);
  /** @type {number[]} */
  const out = [];
  for (const col of touched) {
    for (let row = 0; row < ROWS; row++) out.push(col * ROWS + row);
  }
  return out;
}

/** @param {import('../engine/round.js').RoundResult} result */
async function finishRound(result) {
  const win = result.totalWinCents;
  const x = win / result.betCents;
  refreshMeters();

  if (result.cappedAtMaxWin) {
    await showOverlay('GANHO MÁXIMO!', `${MAX_WIN_X100 / 100}× · ${formatCents(win)}`, 2600);
    el.winline.textContent = `Teto de ${MAX_WIN_X100 / 100}× atingido — ${formatCents(win)}`;
    el.winline.className = 'winline is-big';
    return;
  }
  if (win === 0) {
    el.winline.textContent = 'Sem ganho. Tente novamente!';
    el.winline.className = 'winline';
    return;
  }
  if (x >= 20) {
    const label = x >= 100 ? 'GANHO ÉPICO' : x >= 50 ? 'GANHO ENORME' : 'GANHO GRANDE';
    await showOverlay(label, formatCents(win), 1800);
  }
  el.winline.textContent = `Ganho total ${formatCents(win)} (${formatMultiplier(win, result.betCents)})`;
  el.winline.className = x >= 20 ? 'winline is-big' : 'winline is-win';
}

/** @param {string} label @param {string} value @param {number} ms */
async function showOverlay(label, value, ms) {
  el.winOverlayLabel.textContent = label;
  el.winOverlayValue.textContent = value;
  el.winOverlay.hidden = false;
  await wait(ms);
  el.winOverlay.hidden = true;
}

/**
 * @param {import('../engine/evaluate.js').SymbolWin[]} wins
 * @param {number} running
 * @param {number} bet
 */
function describeWins(wins, running, bet) {
  const parts = wins.map((w) => `${SYMBOLS[w.symbolId].glyph}×${w.count}`);
  return `${parts.join('  ')}  →  ${formatCents(running)} (${formatMultiplier(running, bet)})`;
}

/* ------------------------------------------------------------------ */
/* fluxo de jogo                                                       */
/* ------------------------------------------------------------------ */

/** @param {import('../engine/round.js').ModeName} mode */
async function spin(mode) {
  if (ui.busy) return;
  if (!session.canAfford(mode)) {
    await toast('Saldo insuficiente. Use "Estatísticas" para recarregar créditos de demonstração.', 2400);
    ui.autoRemaining = 0;
    updateControls();
    return;
  }

  ui.busy = true;
  el.btnSpin.classList.add('is-spinning');
  el.winline.textContent = 'Girando…';
  el.winline.className = 'winline';
  el.winOverlay.hidden = true;
  updateControls();

  try {
    const play = session.play({ mode, trace: true });
    await presentRound(play);
  } catch (err) {
    console.error(err);
    await toast(`Erro na rodada: ${err instanceof Error ? err.message : String(err)}`, 3000);
    ui.autoRemaining = 0;
  } finally {
    ui.busy = false;
    el.btnSpin.classList.remove('is-spinning');
    refreshMeters();
    updateControls();
  }

  if (ui.autoRemaining > 0) {
    ui.autoRemaining -= 1;
    updateControls();
    await wait(260);
    if (ui.autoRemaining >= 0 && !ui.busy) await spin(mode);
  }
}

const currentMode = () => (ui.ante ? Mode.ANTE : Mode.BASE);

function refreshMeters() {
  el.balance.textContent = formatCents(session.balanceCents);
  el.betValue.textContent = formatCents(session.betCents);
  el.spinCost.textContent = formatCents(costOf(session.betCents, currentMode()));
}

function updateControls() {
  const locked = ui.busy;
  el.btnSpin.disabled = locked;
  el.btnBuy.disabled = locked;
  el.btnAnte.disabled = locked;
  el.betDown.disabled = locked || BET_LEVELS_CENTS.indexOf(session.betCents) === 0;
  el.betUp.disabled = locked || BET_LEVELS_CENTS.indexOf(session.betCents) === BET_LEVELS_CENTS.length - 1;
  el.btnAnte.setAttribute('aria-pressed', String(ui.ante));
  el.btnTurbo.setAttribute('aria-pressed', String(ui.turbo));
  el.btnAuto.setAttribute('aria-pressed', String(ui.autoRemaining > 0));
  el.autoCount.textContent = ui.autoRemaining > 0
    ? `${ui.autoRemaining}×`
    : (ui.autoSizes[ui.autoSizeIndex] === 0 ? '∞' : `${ui.autoSizes[ui.autoSizeIndex]}×`);
}

/** @param {number} direction */
function stepBet(direction) {
  const i = BET_LEVELS_CENTS.indexOf(session.betCents) + direction;
  if (i < 0 || i >= BET_LEVELS_CENTS.length) return;
  session.setBet(BET_LEVELS_CENTS[i]);
  refreshMeters();
  updateControls();
}

/* ------------------------------------------------------------------ */
/* modais                                                              */
/* ------------------------------------------------------------------ */

/** @param {string} id */
function openModal(id) {
  const m = $(id);
  m.hidden = false;
  m.querySelector('[data-close]')?.addEventListener('click', () => { m.hidden = true; }, { once: true });
  m.addEventListener('click', (e) => { if (e.target === m) m.hidden = true; }, { once: true });
}

function renderPaytable() {
  const body = $('paytable-body');
  const rows = [`
    <div class="pay-row pay-row--head">
      <span></span><span>Símbolo</span><span class="pay-val">8–9</span>
      <span class="pay-val">10–11</span><span class="pay-val">12+</span>
    </div>`];
  for (let s = SYMBOLS.length - 1; s >= 0; s--) {
    const meta = SYMBOLS[s];
    if (meta.kind !== 'low' && meta.kind !== 'high') continue;
    const t = PAYTABLE[s];
    rows.push(`
      <div class="pay-row">
        <span class="pay-glyph">${meta.glyph}</span>
        <span class="pay-name">${meta.name}</span>
        ${t.map(([, , pay]) => `<span class="pay-val">${(pay / 100).toLocaleString('pt-BR')}×</span>`).join('')}
      </div>`);
  }
  body.innerHTML = `
    ${rows.join('')}
    <p class="note">
      <strong>Paga em qualquer posição:</strong> ${MIN_CLUSTER} ou mais símbolos iguais na grade pagam,
      não importa onde estejam. Os prêmios são múltiplos da <em>aposta total</em>.
    </p>
    <div class="kv"><span>🪙 Moeda (scatter) — 4 / 5 / 6+</span>
      <strong>${SCATTER_PAYS[4] / 100}× · ${SCATTER_PAYS[5] / 100}× · ${SCATTER_PAYS[6] / 100}×</strong></div>
    <div class="kv"><span>🪙 ${SCATTER_TRIGGER}+ moedas</span><strong>${FREE_SPINS_AWARDED} rodadas grátis</strong></div>
    <div class="kv"><span>🔮 Orbe multiplicador</span><strong>×2 até ×500</strong></div>
    <div class="kv"><span>Ganho máximo por rodada</span><strong>${(MAX_WIN_X100 / 100).toLocaleString('pt-BR')}×</strong></div>
    <div class="kv"><span>RTP teórico</span><strong>${(TARGET_RTP * 100).toFixed(2).replace('.', ',')}%</strong></div>
    <p class="note">
      <strong>Cascata:</strong> símbolos vencedores explodem e novos caem no lugar, na mesma rodada, até
      não haver mais ganho. <strong>Orbes:</strong> no jogo base, a soma dos orbes multiplica o ganho da
      sequência; nas rodadas grátis a soma é acumulada em um multiplicador global que nunca zera.
    </p>`;
}

function renderBuyMenu() {
  const grid = $('buy-grid');
  const options = [
    {
      mode: Mode.BUY_FREE_SPINS,
      title: `${FREE_SPINS_AWARDED} Rodadas Grátis`,
      desc: 'Multiplicador global acumulativo. Idêntico ao bônus disparado naturalmente.',
      priceX100: BUY_PRICES_X100.freeSpins,
    },
    {
      mode: Mode.BUY_SUPER_FREE_SPINS,
      title: `${FREE_SPINS_AWARDED} Super Rodadas Grátis`,
      desc: 'Orbes mais frequentes e com valores maiores. Muito mais volátil.',
      priceX100: BUY_PRICES_X100.superFreeSpins,
    },
  ];
  grid.replaceChildren();
  for (const opt of options) {
    const cost = costOf(session.betCents, opt.mode);
    const card = document.createElement('div');
    card.className = 'buy-card';
    card.innerHTML = `
      <div>
        <h3>${opt.title}</h3>
        <p>${opt.desc}</p>
      </div>
      <button class="buy-btn" ${session.canAfford(opt.mode) ? '' : 'disabled'}>
        ${opt.priceX100 / 100}× · ${formatCents(cost)}
      </button>`;
    card.querySelector('button')?.addEventListener('click', () => {
      $('modal-buy').hidden = true;
      void spin(opt.mode);
    });
    grid.appendChild(card);
  }
}

function renderFair() {
  const body = $('fair-body');
  body.innerHTML = `
    <p class="note" style="margin-top:0">
      Antes de qualquer rodada o jogo publica o <em>hash</em> da semente do servidor. Cada rodada usa
      <code>HMAC-SHA256(sementeServidor, sementeCliente:nonce:bloco)</code>. Ao revelar a semente, você
      confere que ela bate com o hash publicado — o resultado não pôde ter sido alterado depois da aposta.
    </p>
    <p class="kv"><span>Hash da semente do servidor (compromisso)</span></p>
    <p class="mono">${session.serverSeedHash()}</p>
    <div class="kv"><span>Semente do cliente</span><strong>${escapeHtml(session.clientSeed)}</strong></div>
    <div class="kv"><span>Próximo nonce</span><strong>${session.nonce}</strong></div>
    <div class="field">
      <input id="fair-input" type="text" maxlength="64" placeholder="nova semente do cliente"
             value="${escapeHtml(session.clientSeed)}" />
      <button id="fair-apply">Aplicar</button>
    </div>
    <div class="field">
      <button id="fair-rotate" style="flex:1">Revelar semente e trocar</button>
    </div>
    <div id="fair-reveal"></div>`;

  $('fair-apply').addEventListener('click', () => {
    const input = /** @type {HTMLInputElement} */ ($('fair-input'));
    try {
      session.setClientSeed(input.value);
      renderFair();
    } catch (err) {
      void toast(err instanceof Error ? err.message : String(err));
    }
  });
  $('fair-rotate').addEventListener('click', () => {
    const r = session.rotateServerSeed();
    renderFair();
    $('fair-reveal').innerHTML = `
      <p class="note"><strong>Semente revelada</strong> (cobre ${r.roundsCovered} rodada(s)):</p>
      <p class="mono">${r.revealedServerSeed}</p>
      <p class="note">Confira que <code>sha256</code> dela é:</p>
      <p class="mono">${r.revealedHash}</p>`;
  });
}

function renderStats() {
  const s = session.getStats();
  const body = $('stats-body');
  body.innerHTML = `
    <div class="kv"><span>Rodadas jogadas</span><strong>${s.rounds}</strong></div>
    <div class="kv"><span>Total apostado</span><strong>${formatCents(s.wageredCents)}</strong></div>
    <div class="kv"><span>Total ganho</span><strong>${formatCents(s.wonCents)}</strong></div>
    <div class="kv"><span>Resultado</span>
      <strong style="color:${s.netCents >= 0 ? 'var(--win)' : 'var(--danger)'}">${formatCents(s.netCents)}</strong></div>
    <div class="kv"><span>RTP da sessão</span><strong>${(s.rtp * 100).toFixed(2).replace('.', ',')}%</strong></div>
    <div class="kv"><span>Maior ganho</span>
      <strong>${formatCents(s.biggestWinCents)} (${s.biggestWinX.toFixed(2).replace('.', ',')}×)</strong></div>
    <div class="kv"><span>Bônus disparados / comprados</span>
      <strong>${s.featuresTriggered} / ${s.featuresBought}</strong></div>
    <p class="note">
      O RTP da sessão só converge para o teórico (${(TARGET_RTP * 100).toFixed(2).replace('.', ',')}%) na casa
      dos milhões de rodadas — a variância deste jogo é alta. Use <code>npm run sim</code> para medir a sério.
    </p>
    <div class="field"><button id="stats-topup" style="flex:1">+ R$ 1.000,00 em créditos de demonstração</button></div>`;
  $('stats-topup').addEventListener('click', () => {
    session.deposit(100000);
    refreshMeters();
    renderStats();
  });
}

/** @param {string} str */
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

/* ------------------------------------------------------------------ */
/* inicializacao                                                       */
/* ------------------------------------------------------------------ */

function wireControls() {
  el.btnSpin.addEventListener('click', () => void spin(currentMode()));
  el.betDown.addEventListener('click', () => stepBet(-1));
  el.betUp.addEventListener('click', () => stepBet(1));

  el.btnAnte.addEventListener('click', () => {
    ui.ante = !ui.ante;
    refreshMeters();
    updateControls();
  });
  el.btnTurbo.addEventListener('click', () => {
    ui.turbo = !ui.turbo;
    document.documentElement.style.setProperty('--speed', String(speed()));
    updateControls();
  });
  el.btnAuto.addEventListener('click', () => {
    if (ui.autoRemaining > 0) { ui.autoRemaining = 0; updateControls(); return; }
    const size = ui.autoSizes[ui.autoSizeIndex];
    ui.autoSizeIndex = (ui.autoSizeIndex + 1) % ui.autoSizes.length;
    ui.autoRemaining = size === 0 ? Number.MAX_SAFE_INTEGER : size;
    updateControls();
    void spin(currentMode());
  });

  el.btnBuy.addEventListener('click', () => { renderBuyMenu(); openModal('modal-buy'); });
  $('btn-paytable').addEventListener('click', () => { renderPaytable(); openModal('modal-paytable'); });
  $('btn-fair').addEventListener('click', () => { renderFair(); openModal('modal-fair'); });
  $('btn-stats').addEventListener('click', () => { renderStats(); openModal('modal-stats'); });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !ui.busy) { e.preventDefault(); void spin(currentMode()); }
    if (e.code === 'Escape') for (const m of document.querySelectorAll('.modal')) /** @type {HTMLElement} */ (m).hidden = true;
  });
}

function init() {
  buildBoard();
  // grade inicial apenas decorativa, sem consumir aleatoriedade da sessao
  const decorative = ALL_CELLS.map((i) => (i * 7 + (i % 5)) % 9);
  renderGrid(decorative, new Array(CELLS).fill(0), null, ALL_CELLS);
  el.anteCost.textContent = `+${ANTE_COST_X100 - 100}%`;
  el.btnBuy.querySelector('small')?.replaceChildren(`a partir de ${BUY_PRICES_X100.freeSpins / 100}×`);
  el.rtpBadge.textContent = `${(TARGET_RTP * 100).toFixed(2).replace('.', ',')}%`;
  refreshMeters();
  updateControls();
  wireControls();
}

init();
