/**
 * Alertas de vagas novas (recurso do Pro).
 *
 * A pessoa salva uma busca ("motorista em SP") e um WhatsApp. De tempos em
 * tempos, o servidor roda a busca, pega só o que foi publicado depois do
 * último aviso e manda as melhores vagas.
 */

import { buscar } from './busca.js';
import { formatarSalario } from './text.js';

/** @typedef {import('./tipos.js').Vaga} Vaga */

/**
 * @typedef {Object} Alerta
 * @property {string} id
 * @property {string} telefone   formato internacional só com dígitos: 55 + DDD + número
 * @property {string} texto      o que buscar
 * @property {string} uf         '' = Brasil todo
 * @property {string} criadoEm   AAAA-MM-DD
 * @property {string} ultimoEnvio AAAA-MM-DD ('' = nunca)
 */

/** DDDs válidos no Brasil. */
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/**
 * "(11) 98765-4321", "+55 11 98765 4321", "011987654321" → "5511987654321".
 * Só aceita celular (9 dígitos começando com 9): é para WhatsApp.
 * @param {string} bruto
 * @returns {string | null}
 */
export function normalizarCelular(bruto) {
  let d = String(bruto ?? '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length === 13) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (!DDDS.has(ddd) || d[2] !== '9') return null;
  return `55${d}`;
}

/**
 * Valida o pedido de alerta vindo do navegador.
 * @param {any} bruto
 * @param {Date} hoje
 * @param {string} id
 * @returns {{ alerta: Alerta } | { erro: string }}
 */
export function criarAlerta(bruto, hoje, id) {
  const telefone = normalizarCelular(bruto?.telefone);
  if (!telefone) return { erro: 'Informe um celular com DDD, como (11) 98765-4321.' };
  const texto = String(bruto?.texto ?? '').trim().slice(0, 80);
  const uf = String(bruto?.uf ?? '').toUpperCase();
  if (uf && !/^[A-Z]{2}$/.test(uf)) return { erro: 'Estado inválido.' };
  if (!texto && !uf) return { erro: 'Diga o que buscar ou escolha um estado.' };
  return { alerta: { id, telefone, texto, uf, criadoEm: hoje.toISOString().slice(0, 10), ultimoEnvio: '' } };
}

/**
 * Vagas do alerta publicadas depois do último envio (ou da criação), sem
 * golpes, as mais relevantes primeiro.
 * @param {Alerta} alerta
 * @param {Vaga[]} vagas
 * @param {Date} hoje
 * @param {number} [limite]
 */
export function vagasNovasDoAlerta(alerta, vagas, hoje, limite = 5) {
  const desde = alerta.ultimoEnvio || alerta.criadoEm;
  return buscar(vagas, { texto: alerta.texto, uf: alerta.uf, esconderSuspeitas: true }, null, hoje)
    .filter((i) => i.vaga.publicadaEm > desde)
    .slice(0, limite)
    .map((i) => i.vaga);
}

/**
 * Texto do aviso. Curto, com o essencial de cada vaga e o link do app.
 * @param {Alerta} alerta
 * @param {Vaga[]} vagas
 * @param {string} linkApp
 */
export function mensagemDoAlerta(alerta, vagas, linkApp) {
  const busca = [alerta.texto, alerta.uf].filter(Boolean).join(' em ');
  const linhas = vagas.map((v) => `• ${v.titulo} — ${v.empresa}, ${v.modalidade === 'remoto' ? 'remoto' : `${v.cidade}/${v.uf}`}. ${formatarSalario(v.salarioMin, v.salarioMax)}`);
  return [
    `VagaCerta: ${vagas.length} ${vagas.length === 1 ? 'vaga nova' : 'vagas novas'} para "${busca}"`,
    '',
    ...linhas,
    '',
    `Veja sua chance em cada uma: ${linkApp}`,
    'Para parar os avisos, responda SAIR.',
  ].join('\n');
}
