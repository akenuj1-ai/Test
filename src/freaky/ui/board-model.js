/**
 * Modelo da grade do lado da interface — logica pura, sem DOM.
 *
 * A interface nunca roda o motor para decidir o que mostrar: ela recebe os
 * EVENTOS de um book (do motor local ou do RGS da Stake) e reproduz. Os
 * eventos que mexem na grade trazem so a diferenca (quem virou wild, quem
 * levou cuspe), e este modulo aplica essas diferencas. Um teste confere que,
 * para milhares de rodadas, a grade reconstruida aqui e exatamente a que o
 * motor avaliou — e o que garante que a tela nunca mostre um ganho que a
 * grade nao justifica.
 */

/**
 * @typedef {{ name: string, multiplier?: number, tongue?: true, sticky?: true, frenzy?: true }} Cell
 * @typedef {Cell[][]} Board  board[reel][row]
 */

/** @param {Board} board @returns {Board} */
export function cloneBoard(board) {
  return board.map((col) => col.map((c) => ({ ...c })));
}

/**
 * Aplica um evento que modifica a grade. Eventos que nao mexem na grade
 * devolvem a mesma referencia.
 * @param {Board} board
 * @param {Record<string, any>} ev
 * @returns {Board}
 */
export function applyEvent(board, ev) {
  switch (ev.type) {
    case 'reveal':
      return cloneBoard(ev.board);
    case 'stickyWilds': {
      const next = cloneBoard(board);
      for (const r of ev.reels) {
        next[r] = next[r].map((c) => (c.name === 'S' || c.name === 'W' ? c : { name: 'W', sticky: true }));
      }
      return next;
    }
    case 'gorillaMultipliers':
    case 'freakyFrenzy': {
      const next = cloneBoard(board);
      for (const w of ev.wilds) {
        /** @type {Cell} */
        const cell = { name: 'W' };
        if (w.multiplier > 1) cell.multiplier = w.multiplier;
        if (ev.type === 'freakyFrenzy') cell.frenzy = true;
        next[w.reel][w.row] = cell;
      }
      return next;
    }
    case 'camel': {
      const next = cloneBoard(board);
      for (const s of ev.spit ?? []) next[s.reel][s.row] = { name: s.to };
      for (const t of ev.tongues ?? []) {
        for (const row of t.rows) {
          /** @type {Cell} */
          const cell = { name: 'W', tongue: true };
          if (t.sticky) cell.sticky = true;
          next[t.reel][row] = cell;
        }
      }
      return next;
    }
    default:
      return board;
  }
}

/**
 * Divide os eventos de um book em giros: cada `reveal` abre um giro novo.
 * Eventos antes do primeiro reveal (gatilho de compra) ficam num giro 0 sem
 * grade.
 * @param {Record<string, any>[]} events
 * @returns {Record<string, any>[][]}
 */
export function splitSpins(events) {
  /** @type {Record<string, any>[][]} */
  const spins = [[]];
  for (const ev of events) {
    if (ev.type === 'reveal') spins.push([]);
    spins[spins.length - 1].push(ev);
  }
  return spins.filter((s) => s.length > 0);
}

/**
 * Plano de parada dos rolos: ordem da esquerda para a direita, com
 * ANTECIPACAO nos rolos seguintes quando ja ha scatters suficientes para que
 * o proximo complete o gatilho (2+ no jogo base; 2+ no bonus para o
 * re-gatilho de 3).
 * @param {Board} board  grade do reveal
 * @returns {{ anticipation: boolean }[]}
 */
export function stopPlan(board) {
  let seen = 0;
  return board.map((col) => {
    const anticipation = seen >= 2;
    if (col.some((c) => c.name === 'S')) seen += 1;
    return { anticipation };
  });
}

/**
 * Faixa de celebracao de um ganho, em multiplos da aposta base.
 * @param {number} x
 * @param {boolean} capped
 * @returns {{ key: string, label: string } | null}
 */
export function winTier(x, capped = false) {
  if (capped) return { key: 'max', label: 'GANHO MAXIMO' };
  if (x >= 2500) return { key: 'sigma', label: 'SIGMA WIN' };
  if (x >= 500) return { key: 'freaky', label: 'FREAKY WIN' };
  if (x >= 100) return { key: 'mega', label: 'MEGA WIN' };
  if (x >= 20) return { key: 'big', label: 'BIG WIN' };
  return null;
}
