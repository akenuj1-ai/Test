#!/usr/bin/env node
/**
 * Sobe o VagaCerta.
 *
 *   node tools/serve.js                 # vagas de exemplo, http://localhost:8080
 *
 * Variáveis de ambiente (todas opcionais):
 *   PORT                                porta (padrão 8080)
 *   ADZUNA_APP_ID, ADZUNA_APP_KEY       vagas reais da Adzuna
 *   JOOBLE_KEY                          vagas reais da Jooble
 *   CAREERJET_AFFID                     vagas reais da Careerjet
 *   PAINEL_CHAVE                        libera /api/funil?chave=
 *   URL_PUBLICA                         endereço público, ex.: https://vagacerta.app
 *   TWA_PACOTE, TWA_SHA256              app Android na Play Store (assetlinks)
 *   DADOS                               pasta de dados (padrão ./dados)
 *
 * Sem nenhuma chave de vagas, mostra só as vagas de exemplo. Com alguma,
 * mostra só vagas reais: vaga fictícia nunca se mistura com vaga real.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarServidor } from '../src/servidor/app.js';
import { fontesDoAmbiente } from '../src/servidor/fontes.js';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const env = process.env;
const fontes = fontesDoAmbiente(env);

const { servidor } = criarServidor({
  raiz: RAIZ,
  dados: resolve(RAIZ, env.DADOS ?? 'dados'),
  fontes,
  painelChave: env.PAINEL_CHAVE ?? '',
  urlPublica: env.URL_PUBLICA ?? '',
  twa: env.TWA_PACOTE && env.TWA_SHA256 ? { pacote: env.TWA_PACOTE, sha256: env.TWA_SHA256 } : null,
});

const porta = Number(env.PORT ?? 8080);
servidor.listen(porta, () => {
  const modo = fontes.length ? `vagas reais (${fontes.map((f) => f.nome).join(', ')})` : 'vagas de exemplo';
  console.log(`VagaCerta em http://localhost:${porta}/ — ${modo}`);
  if (!env.PAINEL_CHAVE) console.log('Painel do funil desligado: defina PAINEL_CHAVE para ver /api/funil.');
});

// desligamento limpo (Docker, Render, Fly mandam SIGTERM)
for (const sinal of ['SIGTERM', 'SIGINT']) process.on(sinal, () => servidor.close(() => process.exit(0)));
