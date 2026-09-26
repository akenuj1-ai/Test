/**
 * Aparencia dos simbolos do Freaky Zoo.
 *
 * Mesmo principio do Fortuna Real: o motor conhece `code` (L4, H1, W...) e
 * nada mais. Nome, emoji, cor e arte moram aqui — trocar a arte nao pode mover
 * o RTP.
 *
 * Cada simbolo aceita `art` (URL ou data: URI de uma imagem). Enquanto nao
 * houver arte, a interface compoe emoji + acessorio. Os prompts para gerar as
 * ilustracoes estao em docs/FREAKY_PROMPTS.md; para trocar, basta preencher
 * `art` (no pacote de arquivo unico a imagem precisa ser data: URI).
 */

/**
 * @typedef {object} Skin
 * @property {string} name        nome exibido
 * @property {string} glyph       emoji ou letra
 * @property {string} [accessory] emoji sobreposto (chapeu, oculos...)
 * @property {string} color       cor de brilho do simbolo
 * @property {'card'|'animal'|'wild'|'camel'|'scatter'} look
 * @property {string} blurb       frase curta para a tabela de premios
 * @property {string} [art]       imagem que substitui glyph + accessory
 */

/** @type {Readonly<Record<string, Skin>>} */
export const SKINS = Object.freeze({
  L4: { name: 'J', glyph: 'J', color: '#39c6ff', look: 'card', blurb: 'Carta.' },
  L3: { name: 'Q', glyph: 'Q', color: '#6dff7a', look: 'card', blurb: 'Carta.' },
  L2: { name: 'K', glyph: 'K', color: '#ffb33d', look: 'card', blurb: 'Carta.' },
  L1: { name: 'A', glyph: 'A', color: '#ff4f9a', look: 'card', blurb: 'Carta.' },
  H3: {
    name: 'Tartaruga Pride', glyph: '🐢', accessory: '💅', color: '#b56bff', look: 'animal',
    blurb: 'Casco arco-íris, unhas feitas, zero pressa.',
  },
  H2: {
    name: 'Macaco do Chapéu Rosa', glyph: '🐒', accessory: '👒', color: '#ff7ad9', look: 'animal',
    blurb: 'Chapéu rosa de aba larga e energia caótica.',
  },
  H1: {
    name: 'Leão Sigma', glyph: '🦁', accessory: '🕶️', color: '#ffd23d', look: 'animal',
    blurb: 'Mogger oficial. Paga mais que todo mundo.',
  },
  W: {
    name: 'Gorila Freaky', glyph: '🦍', color: '#ff3df2', look: 'wild',
    blurb: 'Wild. Substitui tudo menos camelo e globo. No bônus vem com multiplicador ×2 a ×100.',
  },
  C: {
    name: 'Camelo', glyph: '🐪', color: '#ffae5c', look: 'camel',
    blurb: 'Língua: vira wild no rolo inteiro. Cuspe: todo símbolo alto vira carta.',
  },
  S: {
    name: 'Globo de Discoteca', glyph: '🪩', color: '#9ff6ff', look: 'scatter',
    blurb: '3 = Festa Freaky · 4+ = Rave Sigma.',
  },
});

/**
 * @param {string} code
 * @returns {Skin}
 */
export function skinOf(code) {
  const skin = SKINS[code];
  if (!skin) throw new RangeError(`Simbolo sem aparencia: ${code}`);
  return skin;
}
