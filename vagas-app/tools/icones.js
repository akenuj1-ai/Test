#!/usr/bin/env node
/**
 * Gera os PNGs da marca a partir dos SVGs de src/ui/marca/:
 *   ícones do app (192, 512, maskable, Apple), imagem de prévia de link
 *   (og.jpg, 1200×630) e capturas do app para o instalador do Android.
 *
 *   node tools/bundle.js && node tools/icones.js
 *
 * Usa o Playwright (Chromium) só aqui, na hora de gerar. O app em si continua
 * sem dependência nenhuma.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MARCA = resolve(RAIZ, 'src/ui/marca');

/** @type {any} */
let playwright;
try {
  playwright = await import('playwright');
} catch {
  console.error('Instale o Playwright para gerar as imagens: npm i -D playwright');
  process.exit(1);
}

const svg = async (/** @type {string} */ nome) => readFile(resolve(MARCA, nome), 'utf8');
const navegador = await playwright.chromium.launch();

/**
 * @param {string} html
 * @param {number} largura
 * @param {number} altura
 * @param {string} saida
 */
async function foto(html, largura, altura, saida) {
  const p = await navegador.newPage({ viewport: { width: largura, height: altura } });
  await p.setContent(`<!doctype html><html><body style="margin:0">${html}</body></html>`);
  await p.waitForTimeout(150);
  const jpeg = saida.endsWith('.jpg');
  await p.screenshot({ path: resolve(MARCA, saida), ...(jpeg ? { type: 'jpeg', quality: 82 } : { omitBackground: true }) });
  await p.close();
  console.log(`marca/${saida}`);
}

const encaixa = (/** @type {string} */ s, /** @type {number} */ n) => s.replace(/width="\d+" height="\d+"/, `width="${n}" height="${n}"`);

const icone = await svg('icone.svg');
const maskable = await svg('icone-maskable.svg');
await foto(encaixa(icone, 192), 192, 192, 'icone-192.png');
await foto(encaixa(icone, 512), 512, 512, 'icone-512.png');
await foto(encaixa(maskable, 512), 512, 512, 'icone-maskable-512.png');
// o iPhone arredonda sozinho: o ícone da Apple é quadrado e sem transparência
await foto(encaixa(maskable, 180), 180, 180, 'apple-touch-icon.png');

const logoEscuro = await svg('logo-escuro.svg');
await foto(`
<div style="width:1200px;height:630px;box-sizing:border-box;padding:72px 80px;color:#fff;font-family:'Familjen Grotesk','Atkinson Hyperlegible',system-ui,sans-serif;
  background:repeating-radial-gradient(circle at 105% -5%,rgba(255,255,255,.06) 0 1px,transparent 1px 10px),repeating-radial-gradient(circle at -5% 110%,rgba(242,181,68,.08) 0 1px,transparent 1px 12px),linear-gradient(135deg,#16326B,#0F2552);
  display:grid;grid-template-columns:1fr 330px;gap:40px;align-items:center">
  <div style="display:grid;gap:30px">
    <div style="height:64px">${logoEscuro.replace(/width="[\d.]+" height="\d+"/, 'height="64"')}</div>
    <div style="font-size:60px;font-weight:700;line-height:1.05;letter-spacing:-1.5px">Descubra em quais vagas você tem <span style="color:#F2B544">chance de verdade</span>.</div>
    <div style="font-size:23px;color:rgba(255,255,255,.82);white-space:nowrap">Nota de chance · Currículo adaptado · Alerta de golpe</div>
  </div>
  <div style="background:#fff;color:#0E1A30;border-radius:22px;padding:26px;display:grid;gap:14px;box-shadow:0 30px 60px -20px rgba(0,0,0,.5)">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div><div style="font-size:24px;font-weight:700">Motorista Entregador</div><div style="font-size:17px;color:#4A5670">São Paulo/SP · CLT</div></div>
    </div>
    <div style="display:flex;align-items:center;gap:16px">
      <div style="width:92px;height:92px;border-radius:50%;background:conic-gradient(#157347 92%,#E4E9F2 0);display:grid;place-items:center;position:relative">
        <div style="position:absolute;inset:8px;border-radius:50%;background:#fff"></div>
        <div style="position:relative;text-align:center;line-height:1"><div style="font-size:32px;font-weight:700">92</div><div style="font-size:11px;letter-spacing:1.5px;color:#6B7690;font-weight:700">CHANCE</div></div>
      </div>
      <div style="font-size:14px;font-weight:700;letter-spacing:2px;color:#157347;border:2px solid #157347;outline:1px solid #157347;outline-offset:2px;border-radius:4px;padding:3px 8px;transform:rotate(-7deg)">CHANCE ALTA</div>
    </div>
    <div style="font-size:17px;color:#4A5670">✓ Você tem 3 de 3 requisitos</div>
  </div>
</div>`, 1200, 630, 'og.jpg'); // JPEG: o WhatsApp só mostra prévia de imagem pequena

// capturas do próprio app, a partir do arquivo único
const pagina = pathToFileURL(resolve(RAIZ, 'dist/vagacerta.html')).href;
for (const [nome, largura, altura, escala] of /** @type {[string, number, number, number][]} */ ([['tela-celular.png', 390, 844, 2], ['tela-computador.png', 1440, 900, 1]])) {
  const p = await navegador.newPage({ viewport: { width: largura, height: altura }, deviceScaleFactor: escala });
  await p.goto(pagina);
  await p.waitForTimeout(600);
  // no computador, a captura mostra a lista com o detalhe ao lado
  if (largura > 1000) await p.evaluate(() => window.scrollTo(0, /** @type {HTMLElement} */ (document.querySelector('.vagas-corpo')).offsetTop - 80));
  await p.waitForTimeout(200);
  await p.screenshot({ path: resolve(MARCA, nome) });
  await p.close();
  console.log(`marca/${nome}`);
}

await navegador.close();
