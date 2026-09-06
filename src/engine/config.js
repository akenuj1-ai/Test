/**
 * Configuracao matematica de "Fortuna Real".
 *
 * TODO valor monetario neste projeto e um INTEIRO em centavos. Nada de ponto
 * flutuante para dinheiro. Os valores da tabela de premios sao expressos em
 * "centesimos da aposta total" (ex.: 250 = 2,50x a aposta), tambem inteiros.
 *
 * Formato do jogo
 * ---------------
 * Grade 6x5 (30 celulas), pagamento por dispersao ("scatter pays" / pay
 * anywhere): 8 ou mais simbolos iguais em qualquer posicao pagam. Nao ha
 * linhas de pagamento. Simbolos vencedores explodem e os de cima caem
 * (mecanica de tumble/cascata) ate nao haver mais ganho.
 *
 * Modelo de sorteio
 * -----------------
 * Cada celula e sorteada de forma independente a partir da distribuicao de
 * pesos do seu rolo (coluna). E um modelo de "rolo infinito": equivale a uma
 * fita de rolo muito longa e e o que torna a matematica de cascata tratavel.
 * Consequencia: a contagem de um simbolo na grade e uma soma de binomiais
 * independentes por coluna.
 *
 * Regras de contorno assumidas (documentadas para evitar ambiguidade):
 *  1. SCATTER so aparece no sorteio inicial de cada giro; refis de cascata
 *     nunca trazem scatter. Isso impede gatilhos "gratis" durante a cascata.
 *  2. SCATTER e ORBE nao participam de combinacoes e nao explodem: permanecem
 *     na grade ate o fim da sequencia de cascatas.
 *  3. ORBES podem cair em refis (e o que torna a cascata emocionante) e sao
 *     coletados ao final da sequencia.
 *  4. O pagamento de scatter e creditado uma unica vez, no sorteio inicial.
 */

export const GRID = Object.freeze({ COLS: 6, ROWS: 5, CELLS: 30 });

/** Identificadores de simbolo. A ordem e usada como indice em arrays de peso. */
export const Sym = Object.freeze({
  BLUE: 0, GREEN: 1, YELLOW: 2, PURPLE: 3, RED: 4,   // baixos
  CUP: 5, RING: 6, HOURGLASS: 7, CROWN: 8,           // altos
  SCATTER: 9,
  ORB: 10,
});

export const SYMBOL_COUNT = 11;

/** Primeiro e ultimo indice dos simbolos que formam combinacao. */
export const PAYING_FIRST = Sym.BLUE;
export const PAYING_LAST = Sym.CROWN;

/**
 * Metadado de simbolo visto pelo motor.
 *
 * Nome, arte e cor NAO moram aqui: sao aparencia e vivem em src/ui/themes.js.
 * A separacao e deliberada — trocar de tema nao pode mover o RTP, e a unica
 * garantia solida disso e o motor nao ter acesso a nada de aparencia.
 *
 * @typedef {object} SymbolMeta
 * @property {number} id
 * @property {string} key   chave usada pelos temas para achar a arte
 * @property {'low'|'high'|'scatter'|'orb'} kind
 */

/** @type {readonly SymbolMeta[]} */
export const SYMBOLS = Object.freeze([
  { id: Sym.BLUE,      key: 'BLUE',      kind: 'low' },
  { id: Sym.GREEN,     key: 'GREEN',     kind: 'low' },
  { id: Sym.YELLOW,    key: 'YELLOW',    kind: 'low' },
  { id: Sym.PURPLE,    key: 'PURPLE',    kind: 'low' },
  { id: Sym.RED,       key: 'RED',       kind: 'low' },
  { id: Sym.CUP,       key: 'CUP',       kind: 'high' },
  { id: Sym.RING,      key: 'RING',      kind: 'high' },
  { id: Sym.HOURGLASS, key: 'HOURGLASS', kind: 'high' },
  { id: Sym.CROWN,     key: 'CROWN',     kind: 'high' },
  { id: Sym.SCATTER,   key: 'SCATTER',   kind: 'scatter' },
  { id: Sym.ORB,       key: 'ORB',       kind: 'orb' },
]);

/**
 * Tabela de premios por dispersao.
 * Cada entrada e a tripla [minimo, maximo, premio em centesimos da aposta].
 * A contiguidade das faixas e a cobertura ate a grade cheia sao garantidas
 * por invariante em test/config.test.js — JavaScript nao tem tuplas para
 * expressar isso no tipo.
 * Os premios sao multiplos de 5 por construcao — ver nota de arredondamento
 * em money.js.
 * @type {readonly (readonly (readonly number[])[])[]}
 */
export const PAYTABLE = Object.freeze([
  /* BLUE      */ Object.freeze([[8, 9, 25], [10, 11, 75], [12, 30, 200]]),
  /* GREEN     */ Object.freeze([[8, 9, 40], [10, 11, 90], [12, 30, 300]]),
  /* YELLOW    */ Object.freeze([[8, 9, 50], [10, 11, 100], [12, 30, 400]]),
  /* PURPLE    */ Object.freeze([[8, 9, 80], [10, 11, 120], [12, 30, 800]]),
  /* RED       */ Object.freeze([[8, 9, 100], [10, 11, 150], [12, 30, 1000]]),
  /* CUP       */ Object.freeze([[8, 9, 150], [10, 11, 200], [12, 30, 1200]]),
  /* RING      */ Object.freeze([[8, 9, 200], [10, 11, 500], [12, 30, 1500]]),
  /* HOURGLASS */ Object.freeze([[8, 9, 250], [10, 11, 1000], [12, 30, 2500]]),
  /* CROWN     */ Object.freeze([[8, 9, 1000], [10, 11, 2500], [12, 30, 5000]]),
]);

/** Minimo de simbolos iguais para formar combinacao. */
export const MIN_CLUSTER = 8;

/**
 * Premio de scatter, em centesimos da aposta, indexado pela quantidade.
 * Indices 0..3 nao pagam; 4 -> 3x, 5 -> 5x, 6 ou mais -> 100x.
 * @type {readonly number[]}
 */
export const SCATTER_PAYS = Object.freeze([0, 0, 0, 0, 300, 500, 10000]);

/** Quantidade minima de scatters para disparar as rodadas gratis. */
export const SCATTER_TRIGGER = 4;
/** Quantidade minima de scatters para re-disparar durante as rodadas gratis. */
export const SCATTER_RETRIGGER = 3;
/** Rodadas concedidas no gatilho e em cada re-gatilho. */
export const FREE_SPINS_AWARDED = 15;
export const FREE_SPINS_RETRIGGER_AWARD = 5;

/** Teto de ganho por rodada, em centesimos da aposta total (5.000x). */
export const MAX_WIN_X100 = 500000;

/** Limite defensivo de cascatas por giro. Nunca deve ser atingido em jogo normal. */
export const MAX_TUMBLES_PER_SPIN = 40;

/**
 * Pesos por rolo. Linha = rolo (0..5), coluna = simbolo (Sym.*).
 * Calibrados por Monte Carlo — ver docs/MATH.md. Nao edite sem rodar
 * `npm run sim` novamente: qualquer alteracao aqui move o RTP.
 * @type {readonly (readonly number[])[]}
 */
export const REEL_WEIGHTS = Object.freeze([
  //  BLU  GRN  YEL  PUR  RED  CUP  RNG  HRG  CRW   SC  ORB
  Object.freeze([206, 196, 186, 172, 158, 118,  98,  76,  56, 30, 8]),
  Object.freeze([200, 194, 188, 176, 160, 120, 100,  78,  58, 30, 8]),
  Object.freeze([198, 192, 190, 178, 162, 122, 102,  80,  60, 30, 8]),
  Object.freeze([198, 192, 190, 178, 162, 122, 102,  80,  60, 30, 8]),
  Object.freeze([200, 194, 188, 176, 160, 120, 100,  78,  58, 30, 8]),
  Object.freeze([206, 196, 186, 172, 158, 118,  98,  76,  56, 30, 8]),
]);

/**
 * Valores possiveis de um orbe multiplicador e seus pesos.
 * `base`   : giros normais e rodadas gratis padrao.
 * `super`  : rodadas gratis compradas no modo "super" (orbes mais generosos).
 * @type {readonly number[]}
 */
export const ORB_VALUES = Object.freeze([2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100, 250, 500]);

export const ORB_WEIGHTS = Object.freeze({
  base:  Object.freeze([2400, 1750, 1300, 980, 760, 520, 360, 250, 170, 110, 62, 26, 9, 3, 1]),
  super: Object.freeze([1200,  980,  880, 800, 700, 560, 430, 330, 250, 180, 120, 60, 24, 8, 3]),
});

/**
 * Multiplicador aplicado ao peso do ORB conforme o modo de jogo.
 *
 * O orbe e o principal regulador de RTP e de volatilidade, e frequencia e
 * valor sao parametros separados de proposito. Estes tres numeros sao as
 * constantes de calibragem do jogo — cada um resolve um alvo:
 *
 *   base      -> fixa a divisao entre jogo base (49,6%) e bonus (44,9%)
 *   free      -> fixa E[bonus] = 96,5x, o que faz a compra de 100x pagar 96,5%
 *   superFree -> fixa E[super] = 289,5x, o que faz a compra de 300x pagar 96,5%
 *
 * Reproduza com `npm run tune`. Nao mexa em um sem re-rodar o outro.
 */
export const ORB_FREQUENCY = Object.freeze({
  base: 0.976,
  free: 2.285,
  superFree: 6.01,
});

/**
 * Multiplicador do peso do SCATTER quando a aposta "ante" esta ativa.
 *
 * Nao e um numero redondo por um motivo: como sao necessarios 4+ scatters, a
 * taxa de gatilho cresce aproximadamente com a QUARTA POTENCIA do peso. Dobrar
 * o peso multiplicaria o gatilho por ~9 e faria o ante pagar ~400% de RTP.
 * Este valor foi resolvido para que o ante custe 25% a mais, dispare ~1,5x
 * mais e pague o MESMO RTP. A sensibilidade e brutal — cerca de 1,7 p.p. de
 * RTP para cada 0,001 aqui — por isso as quatro casas decimais.
 *
 * Um detalhe que a bisseccao puramente analitica erra: com mais scatters na
 * grade sobram menos celulas para simbolos que pagam, e o jogo base do ante
 * rende 48,5% em vez de 49,6%. Esse termo so aparece medindo. O valor abaixo
 * ja o inclui (ver docs/MATH.md).
 */
export const ANTE_SCATTER_MULTIPLIER = 1.1335;
/** Custo da aposta ante, em centesimos da aposta base (125 = 1,25x). */
export const ANTE_COST_X100 = 125;

/**
 * Precos de compra de bonus, em centesimos da aposta base.
 * Calibrados para que o RTP da compra fique dentro de +-0,5 p.p. do RTP base
 * (ver docs/MATH.md e `npm run sim -- --all`).
 */
export const BUY_PRICES_X100 = Object.freeze({
  freeSpins: 10000,      // 100x — E[bonus] = 96,5x  =>  96,5% de RTP
  superFreeSpins: 30000, // 300x — E[super] = 289,5x =>  96,5% de RTP
});

/** Numero de scatters "virtuais" com que a compra inicia (afeta so a exibicao). */
export const BUY_SCATTER_DISPLAY = 4;

/** RTP alvo do jogo. Usado pelos testes de regressao matematica. */
export const TARGET_RTP = 0.965;
/** Tolerancia absoluta aceita nos testes de RTP (p.p. em fracao). */
export const RTP_TOLERANCE = 0.004;

/** Niveis de aposta disponiveis, em centavos. Todos multiplos de 20. */
export const BET_LEVELS_CENTS = Object.freeze([
  20, 40, 60, 100, 200, 400, 600, 1000, 2000, 4000, 10000, 20000,
]);

export const DEFAULT_BET_CENTS = 100;
export const DEFAULT_BALANCE_CENTS = 100000; // 1.000,00 em creditos de demonstracao
