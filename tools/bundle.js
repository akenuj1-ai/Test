#!/usr/bin/env node
/**
 * Empacotador de arquivo único.
 *
 *   node tools/bundle.js
 *   -> dist/fortuna-real.html   página completa, abre com duplo clique
 *   -> dist/artifact.html       o mesmo conteúdo sem <html>/<head>/<body>
 *
 * Por que existe: a interface é ESM puro em vários arquivos, o que é bom para
 * ler e testar, mas exige um servidor HTTP. Para mandar o jogo para um celular
 * (ou abrir de um pen drive, ou publicar como Artifact) é preciso um arquivo só.
 *
 * Não é um empacotador de uso geral — é o mínimo que este código exige, e
 * valida essa premissa. Aceita exatamente três formas:
 *
 *     import { a, b } from './x.js';      (inclusive em várias linhas)
 *     export const NOME = ...             export function NOME(...)
 *     export { a, b };
 *
 * Qualquer outra forma (`export default`, `import * as`, `a as b`,
 * `import` dinâmico) faz o empacotamento falhar com erro explícito, em vez de
 * gerar silenciosamente um pacote quebrado.
 *
 * A saída não renomeia identificadores: cada módulo vira uma função que
 * devolve seus exports, e os imports viram desestruturação do registro. É por
 * isso que colisões entre módulos (três deles declaram `CELLS`) não importam.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SRC = resolve(ROOT, 'src');
const ENTRY = resolve(SRC, 'ui/app.js');
const HTML = resolve(SRC, 'ui/index.html');
const CSS = resolve(SRC, 'ui/styles.css');
const OUT_DIR = resolve(ROOT, 'dist');

/**
 * Formas de import/export que este empacotador não aceita.
 * @type {readonly [RegExp, string][]}
 */
const PROIBIDO = [
  [/^\s*export\s+default\b/m, 'export default'],
  [/^\s*import\s+\*\s+as\b/m, 'import * as'],
  [/^\s*import\s+[A-Za-z_$]/m, 'import padrão (sem chaves)'],
  [/\bimport\s*\(/, 'import() dinâmico'],
  [/^\s*export\s+\*/m, 'export *'],
];

const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?[ \t]*$/gm;
const EXPORT_LIST_RE = /^export\s*\{([^}]*)\}\s*;?[ \t]*$/gm;
const EXPORT_DECL_RE = /^export\s+(const|let|function|class)\s+/gm;

/**
 * Remove comentários para a checagem de formas proibidas.
 *
 * Necessário porque as anotações JSDoc deste projeto usam
 * `{import('./x.js').Tipo}`, que a busca por `import(` acusaria como import
 * dinâmico. O resultado serve só para inspeção — o código emitido é sempre o
 * original, com os comentários preservados.
 *
 * @param {string} texto
 */
function semComentarios(texto) {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
}

/** @type {Map<string, { id: string, code: string, exports: string[] }>} */
const modulos = new Map();

/**
 * Identificador do módulo: caminho relativo a src/, sempre com barra normal.
 * @param {string} caminhoAbsoluto
 */
const idDe = (caminhoAbsoluto) => relative(SRC, caminhoAbsoluto).split('\\').join('/');

/**
 * Lê um módulo, reescreve seus imports/exports e desce recursivamente.
 * @param {string} caminho caminho absoluto do arquivo
 */
async function carregar(caminho) {
  const id = idDe(caminho);
  if (modulos.has(id)) return;
  modulos.set(id, { id, code: '', exports: [] }); // reserva a vaga (corta ciclos)

  const original = await readFile(caminho, 'utf8');
  const paraInspecao = semComentarios(original);
  for (const [re, nome] of PROIBIDO) {
    if (re.test(paraInspecao)) throw new Error(`${id}: ${nome} não é suportado pelo empacotador.`);
  }

  /** @type {string[]} */
  const dependencias = [];
  /** @type {Set<string>} */
  const exportados = new Set();

  // 1. imports -> desestruturação do registro
  let code = original.replace(IMPORT_RE,
    /** @param {string} _todo @param {string} nomes @param {string} especificador */
    (_todo, nomes, especificador) => {
    const alvo = resolve(dirname(caminho), especificador);
    const alvoId = idDe(alvo);
    dependencias.push(alvo);
    const lista = nomes.split(',').map((n) => n.trim()).filter(Boolean);
    for (const n of lista) {
      if (n.includes(' as ')) throw new Error(`${id}: "import { x as y }" não é suportado (${n}).`);
    }
    return `const { ${lista.join(', ')} } = __mod(${JSON.stringify(alvoId)});`;
  });

  // 2. `export { a, b };` -> some da saída, os nomes vão para a lista
  code = code.replace(EXPORT_LIST_RE,
    /** @param {string} _todo @param {string} nomes */
    (_todo, nomes) => {
    for (const n of nomes.split(',').map((x) => x.trim()).filter(Boolean)) {
      if (n.includes(' as ')) throw new Error(`${id}: "export { x as y }" não é suportado (${n}).`);
      exportados.add(n);
    }
    return '';
  });

  // 3. `export const/function NOME` -> declaração normal, nome registrado
  code = code.replace(EXPORT_DECL_RE,
    /** @param {string} _todo @param {string} palavra @param {number} deslocamento @param {string} texto */
    (_todo, palavra, deslocamento, texto) => {
    const resto = texto.slice(deslocamento + _todo.length);
    const nome = /^([A-Za-z_$][\w$]*)/.exec(resto)?.[1];
    if (!nome) throw new Error(`${id}: não consegui ler o nome exportado perto de "${_todo.trim()}".`);
    exportados.add(nome);
    return `${palavra} `;
  });

  if (/^\s*export\b/m.test(semComentarios(code))) {
    throw new Error(`${id}: sobrou um "export" que o empacotador não reconheceu.`);
  }

  for (const dep of dependencias) await carregar(dep);
  modulos.set(id, { id, code, exports: [...exportados] });
}

/** @param {string} texto */
const escaparFimDeScript = (texto) => texto.replace(/<\/script>/gi, '<\\/script>');

async function main() {
  await carregar(ENTRY);

  const html = await readFile(HTML, 'utf8');
  const css = await readFile(CSS, 'utf8');

  const corpos = [...modulos.values()].map(({ id, code, exports }) => {
    const retorno = exports.length ? `\n  return { ${exports.join(', ')} };\n` : '\n  return {};\n';
    return `__reg[${JSON.stringify(id)}] = () => {\n${code}${retorno}};`;
  }).join('\n\n');

  const script = `
// ---------------------------------------------------------------------------
// Gerado por tools/bundle.js — não edite. A fonte está em src/.
// Cada módulo virou uma função que devolve seus exports; __mod resolve e
// memoriza. Nenhum identificador foi renomeado.
// ---------------------------------------------------------------------------
const __reg = {};
const __cache = new Map();
function __mod(id) {
  if (!__cache.has(id)) {
    const fabrica = __reg[id];
    if (!fabrica) throw new Error('Módulo ausente no pacote: ' + id);
    __cache.set(id, fabrica());
  }
  return __cache.get(id);
}

${corpos}

__mod(${JSON.stringify(idDe(ENTRY))});
`;

  // Extrai <title>, o conteúdo do <body> e as tags que valem a pena manter.
  const titulo = /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? 'Fortuna Real';
  const descricao = /<meta name="description" content="([^"]*)"/i.exec(html)?.[1] ?? '';
  const favicon = /<link rel="icon"[^>]*>/i.exec(html)?.[0] ?? '';

  // Links externos (fontes) precisam sobreviver ao empacotamento: o CSS local
  // é embutido, mas uma folha hospedada fora só existe como <link>. Os locais
  // ficam de fora — já viraram <style>.
  const linksExternos = (html.match(/<link\b[^>]*>/gi) ?? [])
    .filter((/** @type {string} */ tag) => /rel="(stylesheet|preconnect)"/i.test(tag) && !/href="\.\//i.test(tag));
  const corpo = /<body>([\s\S]*?)<\/body>/i.exec(html)?.[1]
    ?? (() => { throw new Error('Não achei <body> em index.html'); })();

  // o <script type="module" src> externo dá lugar ao pacote embutido
  const marcacao = corpo.replace(/\s*<script type="module"[^>]*><\/script>/i, '').trimEnd();

  const conteudo = [
    `<title>${titulo}</title>`,
    linksExternos.join('\n'),
    `<style>\n${css}\n</style>`,
    marcacao,
    `<script type="module">${escaparFimDeScript(script)}</script>`,
  ].join('\n\n');

  const paginaCompleta = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="description" content="${descricao}" />
${favicon}
${conteudo.slice(0, conteudo.indexOf('\n\n', conteudo.indexOf('</style>')))}
</head>
<body>
${conteudo.slice(conteudo.indexOf('\n\n', conteudo.indexOf('</style>')) + 2)}
</body>
</html>
`;

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(resolve(OUT_DIR, 'fortuna-real.html'), paginaCompleta);
  await writeFile(resolve(OUT_DIR, 'artifact.html'), `${conteudo}\n`);

  const kb = (/** @type {string} */ t) => `${(Buffer.byteLength(t) / 1024).toFixed(0)} KB`;
  console.log(`${modulos.size} módulos empacotados:`);
  for (const m of modulos.values()) console.log(`  ${m.id.padEnd(22)} ${m.exports.length} exports`);
  console.log(`\ndist/fortuna-real.html  ${kb(paginaCompleta)}  (página completa)`);
  console.log(`dist/artifact.html      ${kb(conteudo)}  (sem html/head/body)`);
}

await main();
