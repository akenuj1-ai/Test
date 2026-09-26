/**
 * Configuracao matematica de "Freaky Zoo".
 *
 * Mesmas regras de casa do Fortuna Real: nada de ponto flutuante para
 * dinheiro. O motor deste jogo nem conhece dinheiro — ele trabalha em
 * CENTESIMOS DA APOSTA BASE (x100), a mesma unidade do `payoutMultiplier` da
 * Stake Engine (1150 = 11,5x). A conversao para centavos e feita uma unica vez,
 * na sessao, por `payToCents`.
 *
 * Formato do jogo
 * ---------------
 * 6 rolos x 4 linhas, 4.096 ways (pagamento da esquerda para a direita, 3 ou
 * mais rolos seguidos a partir do primeiro). Cada rolo e uma FITA fisica
 * (reel strip) gerada de forma deterministica a partir das contagens abaixo;
 * o sorteio escolhe uma parada por rolo, exatamente como a math-sdk da Stake.
 *
 * Multiplicadores em ways: dentro de um rolo os multiplicadores das celulas
 * que servem ao simbolo SE SOMAM; entre rolos eles SE MULTIPLICAM. Um rolo com
 * um J e um gorila x5 vale 1 + 5 = 6 "ways" para o J. E o que faz dois gorilas
 * x10 em rolos diferentes virarem x100.
 *
 * Regras de contorno assumidas:
 *  1. Gorila (WILD) e camelo nunca aparecem no rolo 1, entao todo way comeca
 *     num simbolo pagante de verdade — nao existe way "so de wild".
 *  2. Scatter e camelo sao "especiais": na fita ficam a pelo menos 4 posicoes
 *     um do outro, entao cada rolo mostra no maximo UM especial por giro.
 *  3. O camelo reage ao cair: LINGUA (vira wild expandido no rolo inteiro) ou
 *     CUSPE (todo simbolo alto da grade vira carta). Todos os cuspes resolvem
 *     antes das linguas.
 *  4. A lingua cobre tudo no rolo menos scatter e gorila — o gorila mantem o
 *     multiplicador dele.
 */

export const GRID = Object.freeze({ REELS: 6, ROWS: 4, CELLS: 24 });

/** Identificadores de simbolo. A ordem e usada como indice de tabela. */
export const Sym = Object.freeze({
  J: 0, Q: 1, K: 2, A: 3,          // cartas (baixos)
  TURTLE: 4, MONKEY: 5, LION: 6,   // altos
  WILD: 7,                         // Gorila Freaky
  CAMEL: 8,                        // Camelo (lingua ou cuspe)
  SCATTER: 9,                      // Globo de Discoteca
});

export const SYMBOL_COUNT = 10;
/** Simbolos 0..PAYING_COUNT-1 formam combinacao. */
export const PAYING_COUNT = 7;

/**
 * Metadado visto pelo motor. `code` e o nome usado nos books da Stake Engine
 * (convencao da math-sdk: H = alto, L = baixo, W = wild, S = scatter).
 * Nome, emoji e arte moram em src/freaky/ui/skins.js.
 *
 * @typedef {object} SymbolMeta
 * @property {number} id
 * @property {string} key
 * @property {string} code
 * @property {'low'|'high'|'wild'|'camel'|'scatter'} kind
 */

/** @type {readonly SymbolMeta[]} */
export const SYMBOLS = Object.freeze([
  { id: Sym.J,       key: 'J',       code: 'L4', kind: 'low' },
  { id: Sym.Q,       key: 'Q',       code: 'L3', kind: 'low' },
  { id: Sym.K,       key: 'K',       code: 'L2', kind: 'low' },
  { id: Sym.A,       key: 'A',       code: 'L1', kind: 'low' },
  { id: Sym.TURTLE,  key: 'TURTLE',  code: 'H3', kind: 'high' },
  { id: Sym.MONKEY,  key: 'MONKEY',  code: 'H2', kind: 'high' },
  { id: Sym.LION,    key: 'LION',    code: 'H1', kind: 'high' },
  { id: Sym.WILD,    key: 'WILD',    code: 'W',  kind: 'wild' },
  { id: Sym.CAMEL,   key: 'CAMEL',   code: 'C',  kind: 'camel' },
  { id: Sym.SCATTER, key: 'SCATTER', code: 'S',  kind: 'scatter' },
]);

/**
 * Tabela de premios POR WAY, em centesimos da aposta, para 3, 4, 5 e 6 rolos.
 *
 * Os valores sao pequenos porque o jogo tem so 7 simbolos pagantes em 4
 * linhas: cada simbolo aparece em media em ~0,7 celula por rolo, entao ways
 * longos e multiplos sao comuns. O que paga e a MULTIPLICACAO de ways — um
 * Leao x6 com 4x3x2x2x3x2 = 288 ways paga 0,80 x 288 = 230x. Ver
 * docs/FREAKY_ZOO.md.
 * @type {readonly (readonly number[])[]}
 */
export const PAYTABLE = Object.freeze([
  /* J      */ Object.freeze([1, 2, 4, 8]),
  /* Q      */ Object.freeze([1, 2, 5, 10]),
  /* K      */ Object.freeze([2, 3, 6, 12]),
  /* A      */ Object.freeze([2, 4, 8, 15]),
  /* TURTLE */ Object.freeze([4, 8, 15, 30]),
  /* MONKEY */ Object.freeze([5, 10, 25, 50]),
  /* LION   */ Object.freeze([8, 15, 40, 80]),
]);

/** Menor quantidade de rolos seguidos que paga. */
export const MIN_KIND = 3;

/** Para onde cada simbolo alto vai quando leva cuspe. O camelo que cospe vira J. */
export const SPIT_DOWNGRADE = Object.freeze({
  [Sym.LION]: Sym.A,
  [Sym.MONKEY]: Sym.K,
  [Sym.TURTLE]: Sym.Q,
  [Sym.CAMEL]: Sym.J,
});

/**
 * Tipos de jogo. `festa` e `rave` sao os dois bonus; cada um tem fitas e
 * regras proprias.
 * @typedef {'base'|'festa'|'rave'} GameType
 */

/** Probabilidade de o camelo mostrar a LINGUA (o resto e CUSPE), por tipo de jogo. */
export const CAMEL_TONGUE_CHANCE = Object.freeze({
  base: 0.6,
  festa: 0.8,
  rave: 1,      // na Rave Sigma o camelo esta de bom humor: nunca cospe
});

/**
 * Contagens das fitas. Linha = rolo, coluna = simbolo (ordem de `Sym`).
 * As fitas sao montadas por src/freaky/reels.js com semente fixa, entao a
 * mesma contagem gera sempre a mesma fita.
 *
 *  BR0  jogo base
 *  BRH  jogo base "cheio de scatter" — misturado ao BR0 na Cacada Freaky
 *  FR0  Festa Freaky (bonus)
 *  FRS  Rave Sigma (super bonus)
 *
 * @type {Readonly<Record<string, readonly (readonly number[])[]>>}
 */
export const REEL_COUNTS = Object.freeze({
  //                    J   Q   K   A  TRT MNK LIO  W  CML  SC
  BR0: Object.freeze([
    Object.freeze([21, 20, 19, 18, 17, 16, 15,  0,  0,  2]),
    Object.freeze([20, 19, 18, 18, 17, 16, 14,  3,  1,  2]),
    Object.freeze([20, 19, 18, 18, 17, 16, 14,  3,  1,  2]),
    Object.freeze([20, 19, 18, 18, 17, 16, 14,  3,  1,  2]),
    Object.freeze([20, 19, 18, 18, 17, 16, 14,  3,  1,  2]),
    Object.freeze([20, 19, 18, 18, 17, 16, 15,  3,  0,  2]),
  ]),
  BRH: Object.freeze([
    Object.freeze([19, 18, 17, 16, 15, 14, 13,  0,  0,  4]),
    Object.freeze([18, 17, 16, 16, 15, 14, 12,  3,  1,  4]),
    Object.freeze([18, 17, 16, 16, 15, 14, 12,  3,  1,  4]),
    Object.freeze([18, 17, 16, 16, 15, 14, 12,  3,  1,  4]),
    Object.freeze([18, 17, 16, 16, 15, 14, 12,  3,  1,  4]),
    Object.freeze([18, 17, 16, 16, 15, 14, 13,  3,  0,  4]),
  ]),
  FR0: Object.freeze([
    Object.freeze([21, 20, 19, 18, 17, 16, 15,  0,  0,  2]),
    Object.freeze([19, 18, 17, 17, 16, 15, 14,  8,  2,  2]),
    Object.freeze([19, 18, 17, 17, 16, 15, 14,  8,  2,  2]),
    Object.freeze([19, 18, 17, 17, 16, 15, 14,  8,  2,  2]),
    Object.freeze([19, 18, 17, 17, 16, 15, 14,  8,  2,  2]),
    Object.freeze([20, 19, 18, 17, 16, 15, 15,  8,  0,  2]),
  ]),
  FRS: Object.freeze([
    Object.freeze([21, 20, 19, 18, 17, 16, 15,  0,  0,  2]),
    Object.freeze([19, 18, 17, 17, 16, 15, 14,  6,  2,  2]),
    Object.freeze([19, 18, 17, 17, 16, 15, 14,  6,  2,  2]),
    Object.freeze([19, 18, 17, 17, 16, 15, 14,  6,  2,  2]),
    Object.freeze([19, 18, 17, 17, 16, 15, 14,  6,  2,  2]),
    Object.freeze([20, 19, 18, 17, 16, 15, 15,  6,  0,  2]),
  ]),
});

/**
 * Tamanho das pilhas nas fitas: pesos para pilhas de 1, 2, 3 e 4 simbolos
 * iguais. Pilhas deixam a janela com menos simbolos diferentes (acerto menor)
 * e fazem os ganhos grandes chegarem em blocos (volatilidade maior).
 */
export const STACK_WEIGHTS = Object.freeze({
  low: Object.freeze([30, 35, 25, 10]),
  high: Object.freeze([25, 30, 25, 20]),
  wild: Object.freeze([1, 0, 0, 0]),
});

/** Semente fixa do gerador de fitas. Mudar a semente muda as fitas (e o RTP medido). */
export const REEL_SEED = 'freaky-zoo-fitas-v1';

/**
 * Gatilho do bonus pelo numero de scatters no jogo base.
 * @type {Readonly<Record<number, { feature: 'festa'|'rave', spins: number }>>}
 */
export const FEATURE_TRIGGERS = Object.freeze({
  3: Object.freeze({ feature: 'festa', spins: 10 }),
  4: Object.freeze({ feature: 'rave', spins: 10 }),
  5: Object.freeze({ feature: 'rave', spins: 12 }),
  6: Object.freeze({ feature: 'rave', spins: 15 }),
});

/** Scatters que re-disparam dentro do bonus, e quantas rodadas somam. */
export const RETRIGGER_SCATTERS = 3;
export const RETRIGGER_SPINS = 5;

/** Rodadas de um bonus comprado. */
export const BUY_SPINS = 10;

/**
 * Multiplicador do Gorila Freaky nas rodadas gratis. No jogo base o gorila e x1.
 * Os pesos-base sao "inclinados" por `GORILLA_TILT` (w_i * v_i^theta): o
 * formato da distribuicao fica igual, so desliza para valores maiores ou
 * menores. E a constante de calibragem de cada bonus.
 */
export const GORILLA_MULT_VALUES = Object.freeze([2, 3, 4, 5, 10, 20, 50, 100]);
export const GORILLA_MULT_WEIGHTS = Object.freeze([400, 300, 160, 100, 40, 14, 4, 1]);

/**
 * Surto Freaky: no jogo base, o gorila as vezes invade a tela e joga wilds x2
 * nos rolos 2 a 6 antes da avaliacao.
 */
export const FRENZY_WILD_COUNTS = Object.freeze([2, 3, 4, 5]);
export const FRENZY_WILD_WEIGHTS = Object.freeze([50, 30, 15, 5]);
export const FRENZY_WILD_MULT = 2;

/**
 * Constantes de calibragem. Cada uma resolve UM alvo e afeta UM modo — por
 * isso a resolucao e sequencial, sem sistema acoplado. Reproduza com
 * `npm run freaky:tune`.
 *
 *   tilt.festa          -> fixa E[Festa] = preco x RTP alvo
 *   tilt.rave           -> fixa E[Rave]  = preco x RTP alvo
 *   frenzyChance        -> fixa o RTP do jogo base (com os bonus ja fixados)
 *   frenzyChanceLingua  -> fixa o RTP da Lingua Garantida
 *   huntMix             -> fracao de giros com a fita BRH na Cacada Freaky
 */
export const CALIBRATION = Object.freeze({
  frenzyChance: 0.01793,
  frenzyChanceLingua: 0.0121,
  tilt: Object.freeze({ festa: -0.1919, rave: 0.0733 }),
  huntMix: 0.39438,
});

/**
 * Modos de aposta (bet modes da Stake Engine). `costX100` em centesimos da
 * aposta base.
 */
export const MODES = Object.freeze({
  base:  Object.freeze({ costX100: 100,   label: 'Giro normal' }),
  hunt:  Object.freeze({ costX100: 300,   label: 'Cacada Freaky' }),
  lingua: Object.freeze({ costX100: 200,  label: 'Lingua Garantida' }),
  festa: Object.freeze({ costX100: 10000, label: 'Comprar Festa Freaky' }),
  rave:  Object.freeze({ costX100: 50000, label: 'Comprar Rave Sigma' }),
});

/** @typedef {keyof typeof MODES} ModeName */

/** Teto de ganho por rodada: 25.000x a aposta. */
export const MAX_WIN_X100 = 2_500_000;

/** RTP alvo de todos os modos. A Stake Engine aceita 90%-98%, com no maximo 0,5 p.p. entre modos. */
export const TARGET_RTP = 0.965;

/**
 * Dinheiro na unidade da Stake Engine: inteiro, 1.000.000 = 1 unidade de moeda.
 * Com apostas multiplas de 100 micro-unidades, qualquer payout x100 vira um
 * inteiro exato (aposta * payout / 100), sem arredondamento.
 */
export const MONEY_UNIT = 1_000_000;

/** Niveis de aposta, em micro-unidades (0,20 a 200,00). */
export const BET_LEVELS = Object.freeze([
  0.2, 0.4, 0.6, 1, 2, 4, 6, 10, 20, 40, 100, 200,
].map((v) => Math.round(v * MONEY_UNIT)));
export const DEFAULT_BET = MONEY_UNIT;
export const DEFAULT_BALANCE = 1000 * MONEY_UNIT;
