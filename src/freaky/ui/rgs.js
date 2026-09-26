/**
 * Cliente do RGS da Stake Engine.
 *
 * Quando o jogo e aberto pela Stake, a URL traz `sessionID` e `rgs_url`. Nesse
 * caso a interface NAO usa o motor local: ela pede a rodada ao RGS, que sorteia
 * um book da biblioteca exportada por tools/freaky-stake.js, e anima os mesmos
 * eventos que o modo demonstracao anima. Sem esses parametros, o jogo roda em
 * modo demonstracao com o motor local.
 *
 * Endpoints (docs/rgs_docs/RGS.md da math-sdk):
 *   POST /wallet/authenticate { sessionID }            -> balance, config, round
 *   POST /wallet/play         { sessionID, amount, mode } -> balance, round
 *   POST /wallet/end-round    { sessionID }            -> balance
 * Dinheiro em inteiros com 6 casas: 1.000.000 = 1 unidade de moeda.
 *
 * O formato exato de `round` nao e documentado na pagina do RGS; este cliente
 * aceita os eventos em `round.state` (usado pelo web-sdk) ou `round.events`.
 * Confira contra a documentacao vigente antes de publicar.
 */

/**
 * @typedef {object} RgsParams
 * @property {string} sessionID
 * @property {string} rgsUrl
 * @property {string} lang
 * @property {string} device
 */

/**
 * Le os parametros que a Stake passa na URL do jogo.
 * @param {string} href
 * @returns {RgsParams|null}
 */
export function rgsParamsFromUrl(href) {
  const url = new URL(href);
  const sessionID = url.searchParams.get('sessionID');
  const rgsUrl = url.searchParams.get('rgs_url');
  if (!sessionID || !rgsUrl) return null;
  return {
    sessionID,
    rgsUrl,
    lang: url.searchParams.get('lang') ?? 'pt',
    device: url.searchParams.get('device') ?? 'desktop',
  };
}

/** Erro do RGS com o codigo da Stake (ERR_IPB, ERR_IS...). */
export class RgsError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Mensagens para os codigos documentados. */
export const RGS_MESSAGES = Object.freeze({
  ERR_VAL: 'Requisição inválida.',
  ERR_IPB: 'Saldo insuficiente.',
  ERR_IS: 'Sessão inválida ou expirada.',
  ERR_ATE: 'Falha de autenticação.',
  ERR_GLE: 'Limite de jogo atingido.',
  ERR_LOC: 'Jogo indisponível na sua região.',
  ERR_GEN: 'Erro no servidor.',
  ERR_MAINTENANCE: 'Servidor em manutenção.',
});

/**
 * @param {RgsParams} params
 * @param {typeof fetch} [fetchImpl]
 */
export function createRgsClient(params, fetchImpl = globalThis.fetch.bind(globalThis)) {
  const base = /^https?:\/\//.test(params.rgsUrl) ? params.rgsUrl : `https://${params.rgsUrl}`;

  /**
   * @param {string} path
   * @param {Record<string, unknown>} body
   */
  async function post(path, body) {
    const res = await fetchImpl(`${base.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionID: params.sessionID, ...body }),
    });
    /** @type {any} */
    let data = null;
    try { data = await res.json(); } catch { /* corpo vazio */ }
    if (!res.ok) {
      const code = data?.code ?? data?.error ?? `HTTP_${res.status}`;
      throw new RgsError(code, RGS_MESSAGES[/** @type {keyof typeof RGS_MESSAGES} */ (code)] ?? data?.message ?? `Erro ${res.status}`);
    }
    return data;
  }

  return {
    params,
    authenticate: () => post('/wallet/authenticate', { language: params.lang }),
    balance: () => post('/wallet/balance', {}),
    /**
     * @param {number} amount aposta BASE em micro-unidades (o RGS multiplica pelo custo do modo)
     * @param {string} mode nome do modo no index.json
     */
    play: (amount, mode) => post('/wallet/play', { amount, mode: mode.toUpperCase() }),
    endRound: () => post('/wallet/end-round', {}),
  };
}

/**
 * Eventos de uma rodada devolvida pelo RGS.
 * @param {any} round
 * @returns {Record<string, any>[]}
 */
export function eventsOfRound(round) {
  const events = round?.state ?? round?.events;
  if (!Array.isArray(events)) throw new RgsError('ERR_VAL', 'Rodada sem eventos.');
  return events;
}
