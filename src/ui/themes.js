/**
 * Temas: tudo o que é aparência, e nada além disso.
 *
 * A matemática não sabe que temas existem. `config.js` guarda o que o motor
 * precisa — id, chave e categoria de cada símbolo — e é aqui que mora o que o
 * jogador vê: nome, arte e cor. Trocar de tema não pode mexer em peso de rolo,
 * tabela de prêmios ou RTP, e a separação de arquivos é o que garante isso.
 *
 * Arte de cada símbolo, em ordem de preferência:
 *
 *   art   caminho ou data: URI de imagem — usado quando existe
 *   glyph emoji, o padrão enquanto não há arte
 *
 * Para trocar emoji por ilustração basta acrescentar `art` ao símbolo; o resto
 * da interface não muda. Em um pacote de arquivo único a imagem precisa ser
 * data: URI, porque a política de segurança da página bloqueia imagem externa.
 *
 * @typedef {object} SymbolSkin
 * @property {string} name   nome exibido na tabela de prêmios
 * @property {string} color  cor do brilho quando o símbolo forma combinação
 * @property {string} [glyph]
 * @property {string} [art]
 *
 * @typedef {object} Theme
 * @property {string} id
 * @property {string} name
 * @property {string} tagline
 * @property {string} badge          emoji do logotipo
 * @property {Record<string, string>} tokens   variáveis CSS sobrescritas
 * @property {Record<string, SymbolSkin>} symbols  indexado pela chave do símbolo
 */

/** @type {readonly Theme[]} */
export const THEMES = Object.freeze([
  {
    id: 'fortuna',
    name: 'Fortuna Real',
    tagline: 'Pedras preciosas e ouro',
    badge: '👑',
    tokens: {
      '--bg': '#0a0713',
      '--bg-glow-1': '#2b1150',
      '--bg-glow-2': '#1b0e3a',
      '--panel': 'rgba(30, 18, 54, 0.72)',
      '--panel-solid': '#1a1030',
      '--text': '#f1ecff',
      '--muted': '#a396c4',
      '--gold': '#ffcb45',
      '--gold-deep': '#c8902a',
      '--gold-ink': '#2a1a00',
      '--win': '#45e0a0',
    },
    symbols: {
      BLUE:      { name: 'Safira',    color: '#3f8cff', glyph: '💎' },
      GREEN:     { name: 'Esmeralda', color: '#2fd06a', glyph: '🟢' },
      YELLOW:    { name: 'Topázio',   color: '#f5c518', glyph: '🟡' },
      PURPLE:    { name: 'Ametista',  color: '#a55bff', glyph: '🟣' },
      RED:       { name: 'Rubi',      color: '#ff4d5a', glyph: '🔴' },
      CUP:       { name: 'Cálice',    color: '#ffb347', glyph: '🏆' },
      RING:      { name: 'Anel',      color: '#7ce0ff', glyph: '💍' },
      HOURGLASS: { name: 'Ampulheta', color: '#ff8ae0', glyph: '⏳' },
      CROWN:     { name: 'Coroa',     color: '#ffd700', glyph: '👑' },
      SCATTER:   { name: 'Moeda',     color: '#ffcf40', glyph: '🪙' },
      ORB:       { name: 'Orbe',      color: '#c084fc', glyph: '🔮' },
    },
  },
  {
    id: 'arraia',
    name: 'Arraiá da Sorte',
    tagline: 'Festa junina na fogueira',
    badge: '🔥',
    tokens: {
      // céu de junho: azul profundo em cima, brasa da fogueira embaixo
      '--bg': '#080d1f',
      '--bg-glow-1': '#1b2a5c',
      '--bg-glow-2': '#5c2a10',
      '--panel': 'rgba(20, 30, 58, 0.74)',
      '--panel-solid': '#141d38',
      '--text': '#f6efe2',
      '--muted': '#93a3c6',
      '--gold': '#ffb43d',
      '--gold-deep': '#c4681a',
      '--gold-ink': '#2a1400',
      '--win': '#63d98d',
    },
    symbols: {
      BLUE:      { name: 'Pipoca',          color: '#f3e3c2', glyph: '🍿' },
      GREEN:     { name: 'Milho',           color: '#ffd23f', glyph: '🌽' },
      YELLOW:    { name: 'Pé de moleque',   color: '#d99a4e', glyph: '🥜' },
      PURPLE:    { name: 'Maçã do amor',    color: '#ff4d5a', glyph: '🍎' },
      RED:       { name: 'Quentão',         color: '#e8703a', glyph: '☕' },
      CUP:       { name: 'Chapéu de palha', color: '#e0b962', glyph: '👒' },
      RING:      { name: 'Sanfona',         color: '#ff8c42', glyph: '🪗' },
      HOURGLASS: { name: 'Bandeirinhas',    color: '#4ec9e0', glyph: '🎏' },
      CROWN:     { name: 'Fogueira',        color: '#ff6b1a', glyph: '🔥' },
      SCATTER:   { name: 'Balão',           color: '#ff5ea8', glyph: '🎈' },
      ORB:       { name: 'Fogos',           color: '#ffd84d', glyph: '🎆' },
    },
  },
]);

export const DEFAULT_THEME_ID = THEMES[0].id;
const STORAGE_KEY = 'fortuna-real:tema';

/**
 * @param {string} id
 * @returns {Theme}
 */
export function themeById(id) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/**
 * Lê o tema guardado. Pode falhar de verdade — janela anônima, dados do site
 * bloqueados, captura de miniatura — então o acesso vai dentro de try/catch e
 * a ausência cai no tema padrão.
 * @returns {string}
 */
export function loadThemeId() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

/** @param {string} id */
export function saveThemeId(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // preferência de aparência não vale um erro na tela
  }
}

/**
 * Aplica os tokens do tema na raiz do documento.
 * @param {Theme} theme
 */
export function applyTheme(theme) {
  const root = document.documentElement;
  for (const [nome, valor] of Object.entries(theme.tokens)) {
    root.style.setProperty(nome, valor);
  }
  root.dataset.tema = theme.id;
}
