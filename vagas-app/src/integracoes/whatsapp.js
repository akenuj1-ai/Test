/**
 * Envio pela API oficial do WhatsApp Business (Cloud API da Meta).
 *
 * Regras da Meta que moldam isto:
 * - para iniciar conversa com alguém, só com MODELO aprovado (template);
 * - texto livre só vale dentro de 24 h depois que a pessoa escreveu.
 * Por isso o envio de alerta usa `enviarModelo`, e `enviarTexto` fica para
 * responder quem mandou mensagem.
 *
 * Precisa de WHATSAPP_TOKEN e WHATSAPP_NUMERO_ID (painel da Meta).
 */

const VERSAO = 'v20.0';

/**
 * @param {{ token: string, numeroId: string, corpo: object }} p
 * @param {typeof fetch} fetchFn
 */
async function enviar({ token, numeroId, corpo }, fetchFn) {
  const resp = await fetchFn(`https://graph.facebook.com/${VERSAO}/${encodeURIComponent(numeroId)}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...corpo }),
  });
  const dados = /** @type {any} */ (await resp.json().catch(() => ({})));
  if (!resp.ok) throw new Error(`WhatsApp respondeu ${resp.status}: ${dados?.error?.message ?? 'erro'}`);
  return /** @type {string} */ (dados?.messages?.[0]?.id ?? '');
}

/**
 * @param {{ token: string, numeroId: string, para: string, texto: string }} p
 * @param {typeof fetch} [fetchFn]
 */
export function enviarTexto({ token, numeroId, para, texto }, fetchFn = fetch) {
  return enviar({ token, numeroId, corpo: { to: para, type: 'text', text: { body: texto.slice(0, 4096), preview_url: true } } }, fetchFn);
}

/**
 * @param {{ token: string, numeroId: string, para: string, modelo: string, idioma?: string, parametros?: string[] }} p
 * @param {typeof fetch} [fetchFn]
 */
export function enviarModelo({ token, numeroId, para, modelo, idioma = 'pt_BR', parametros = [] }, fetchFn = fetch) {
  const componentes = parametros.length
    ? [{ type: 'body', parameters: parametros.map((t) => ({ type: 'text', text: t.slice(0, 1000) })) }]
    : [];
  return enviar({ token, numeroId, corpo: { to: para, type: 'template', template: { name: modelo, language: { code: idioma }, components: componentes } } }, fetchFn);
}
