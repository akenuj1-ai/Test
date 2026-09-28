#!/usr/bin/env node
/**
 * Envia os alertas de vagas novas. Rode de hora em hora (cron, agendador do
 * Render/Fly, GitHub Actions).
 *
 *   node tools/enviar-alertas.js                # só mostra o que enviaria
 *   WHATSAPP_TOKEN=.. WHATSAPP_NUMERO_ID=.. \
 *   WHATSAPP_MODELO=vagas_novas \
 *   URL_APP=https://seu-dominio node tools/enviar-alertas.js --enviar
 *
 * Com modelo (WHATSAPP_MODELO), manda o modelo aprovado pela Meta com dois
 * parâmetros: {{1}} quantidade de vagas e {{2}} a busca. Sem modelo, manda
 * texto livre — que a Meta só entrega se a pessoa falou com o número nas
 * últimas 24 h. Para avisos, cadastre um modelo.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vagasDeExemplo } from '../src/core/exemplos.js';
import { vagasNovasDoAlerta, mensagemDoAlerta } from '../src/core/alertas.js';
import { criarAgregador } from '../src/sources/agregador.js';
import { fontesDoAmbiente } from '../src/servidor/fontes.js';
import { enviarTexto, enviarModelo } from '../src/integracoes/whatsapp.js';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const env = process.env;
const ARQ = resolve(RAIZ, env.DADOS ?? 'dados', 'alertas.json');
const enviarDeVerdade = process.argv.includes('--enviar');
const hoje = new Date();

/** @type {import('../src/core/alertas.js').Alerta[]} */
let alertas;
try {
  alertas = JSON.parse(await readFile(ARQ, 'utf8'));
} catch {
  console.log('Nenhum alerta cadastrado ainda.');
  process.exit(0);
}

const fontes = fontesDoAmbiente(env);
const agregador = criarAgregador({ fontes });
if (enviarDeVerdade && (!env.WHATSAPP_TOKEN || !env.WHATSAPP_NUMERO_ID)) {
  console.error('Para enviar, defina WHATSAPP_TOKEN e WHATSAPP_NUMERO_ID.');
  process.exit(1);
}

let enviados = 0;
for (const alerta of alertas) {
  const vagas = fontes.length
    ? (await agregador.buscar({ what: alerta.texto, where: alerta.uf })).vagas
    : vagasDeExemplo(hoje);
  const novas = vagasNovasDoAlerta(alerta, vagas, hoje);
  if (novas.length === 0) continue;

  const texto = mensagemDoAlerta(alerta, novas, env.URL_APP ?? 'https://vagacerta.app');
  if (!enviarDeVerdade) {
    console.log(`\n--- para ${alerta.telefone} ---\n${texto}`);
  } else {
    try {
      const token = /** @type {string} */ (env.WHATSAPP_TOKEN);
      const numeroId = /** @type {string} */ (env.WHATSAPP_NUMERO_ID);
      if (env.WHATSAPP_MODELO) {
        const busca = [alerta.texto, alerta.uf].filter(Boolean).join(' em ');
        await enviarModelo({ token, numeroId, para: alerta.telefone, modelo: env.WHATSAPP_MODELO, parametros: [String(novas.length), busca] });
      } else {
        await enviarTexto({ token, numeroId, para: alerta.telefone, texto });
      }
    } catch (e) {
      console.error(`Falhou para ${alerta.telefone}:`, e instanceof Error ? e.message : e);
      continue;
    }
  }
  alerta.ultimoEnvio = hoje.toISOString().slice(0, 10);
  enviados++;
}

if (enviarDeVerdade) await writeFile(ARQ, JSON.stringify(alertas));
console.log(`\n${enviados} de ${alertas.length} alertas ${enviarDeVerdade ? 'enviados' : 'enviariam (use --enviar)'}.`);
