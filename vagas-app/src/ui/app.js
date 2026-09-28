/**
 * Controlador da interface.
 *
 * Nenhuma regra de negócio mora aqui: busca, nota de chance, golpe,
 * currículo, planos, funil e candidaturas vêm de src/core/. A UI lê o estado,
 * chama o núcleo, desenha e registra os eventos do funil.
 */

import { vagasDeExemplo } from '../core/exemplos.js';
import { buscar } from '../core/busca.js';
import { sugestoes } from '../core/relevancia.js';
import { PESOS } from '../core/match.js';
import { medianasPorArea, comparacaoSalarial } from '../core/mercado.js';
import { gerarCurriculo, gerarCarta, prepararEntrevista } from '../core/curriculo.js';
import { PLANOS, DIAS_GARANTIA, DIAS_TESTE, podeUsar, registrarUso, restantes, economiaAnual, ehPago } from '../core/planos.js';
import { ETAPAS, moverPara, remover, precisamDeRetorno } from '../core/candidaturas.js';
import { ESCOLARIDADES, NOME_ESCOLARIDADE, perfilVazio } from '../core/tipos.js';
import { completude, inferirArea, habilidadesSugeridas } from '../core/perfil.js';
import { funil, registrar, projetarReceita, novaSessao } from '../core/metricas.js';
import { normalizarCelular } from '../core/alertas.js';
import { formatarSalario, formatarReais } from '../core/text.js';
import { ler, gravar } from './loja.js';

/** @typedef {import('../core/tipos.js').Vaga} Vaga */
/** @typedef {import('../core/tipos.js').Perfil} Perfil */
/** @typedef {import('../core/planos.js').Recurso} Recurso */
/** @typedef {import('../core/busca.js').ItemBusca} ItemBusca */

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const AREAS = ['Administrativo', 'Alimentação', 'Atendimento', 'Construção Civil', 'Educação', 'Finanças', 'Indústria',
  'Limpeza e Conservação', 'Logística', 'Manutenção', 'Marketing', 'Recursos Humanos', 'Saúde', 'Segurança e Portaria',
  'Tecnologia', 'Varejo', 'Vendas'];
const ATALHOS_CARGO = ['Motorista', 'Vendedor', 'Limpeza', 'Administrativo', 'Porteiro', 'Cozinha', 'Atendimento', 'Tecnologia'];
const MODALIDADE = { presencial: 'Presencial', remoto: 'Remoto', hibrido: 'Híbrido' };
const NOME_CRITERIO = { requisitos: 'Requisitos', cargo: 'Cargo e área', local: 'Local', salario: 'Salário', experiencia: 'Experiência', escolaridade: 'Escolaridade' };
/** Tons dos monogramas das empresas; misturados com a cor do cartão, funcionam nos dois temas. */
const TONS = ['#2256D0', '#157347', '#B8740A', '#8E3FB5', '#C0392B', '#0E8A8A'];
const ABAS = ['vagas', 'perfil', 'candidaturas', 'planos', 'painel'];

/** @returns {Perfil} */
function perfilExemplo() {
  return {
    ...perfilVazio(),
    nome: 'José Carlos Pereira', cidade: 'São Paulo', uf: 'SP', cargoDesejado: 'Motorista', area: 'Logística',
    anosExperiencia: 25, habilidades: ['direção defensiva', 'conhecer a cidade', 'atendimento ao cliente', 'carga e descarga'],
    escolaridade: 'medio', aceitaRemoto: 'nao', salarioMin: 250000, temCnh: true,
    telefone: '(11) 90000-0000', email: 'jose.exemplo@email.com',
    resumo: 'Motorista com 25 anos de estrada, sem acidentes, acostumado com entregas urbanas e atendimento direto ao cliente.',
    experiencias: [
      { cargo: 'Motorista de entregas', empresa: 'Transportadora Paulista', periodo: '2008 – 2025', descricao: 'Entregas diárias na Grande São Paulo, 40 a 60 paradas por dia.' },
      { cargo: 'Motorista particular', empresa: 'Família Andrade', periodo: '2000 – 2008', descricao: 'Transporte da família e serviços gerais.' },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* estado                                                              */
/* ------------------------------------------------------------------ */

/**
 * Página servida pelo servidor do projeto (e não o arquivo único)? Só a
 * página servida tem manifesto; o empacotador não o leva.
 */
const COM_SERVIDOR = /^https?:$/.test(location.protocol) && document.querySelector('link[rel="manifest"]') !== null;
/** Computador: lista e detalhe lado a lado, sem folha por cima. */
const telaLarga = window.matchMedia('(min-width: 1100px)');

function lerSessao() {
  try {
    const s = sessionStorage.getItem('vagacerta:sessao');
    if (s) return s;
    const nova = novaSessao();
    sessionStorage.setItem('vagacerta:sessao', nova);
    return nova;
  } catch {
    return novaSessao();
  }
}

const estado = {
  /** @type {Vaga[]} */ vagas: vagasDeExemplo(),
  fonte: 'exemplo',
  /** @type {Perfil} */ perfil: ler('perfil', perfilExemplo()),
  perfilDeExemplo: ler('perfilDeExemplo', true),
  /** @type {import('../core/planos.js').IdPlano} */ plano: ler('plano', 'gratis'),
  /** @type {import('../core/planos.js').Uso} */ uso: ler('uso', {}),
  /** @type {import('../core/candidaturas.js').Candidatura[]} */ candidaturas: ler('candidaturas', []),
  /** @type {import('../core/metricas.js').Evento[]} */ eventos: ler('eventos', []),
  letraGrande: ler('letraGrande', false),
  /** @type {{ id: string, telefone: string, texto: string, uf: string }[]} */ alertas: ler('alertas', []),
  /** @type {any} */ pedidoInstalacao: null,
  /** @type {'mensal' | 'anual'} */ ciclo: 'anual',
  sessao: lerSessao(),
  /** eventos que só contam uma vez por sessão */
  /** @type {Set<string>} */ jaRegistrados: new Set(),
  /** textos já gerados nesta sessão: reabrir não gasta cota de novo */
  /** @type {Map<string, string>} */ gerados: new Map(),
  /** @type {string | null} */ vagaAberta: null,
  subAba: 'chance',
  quiz: { passo: 1, cargo: '', area: '', habilidades: /** @type {Set<string>} */ (new Set()), concluido: false },
  /** @type {Map<string, number>} */ medianas: new Map(),
};
estado.medianas = medianasPorArea(estado.vagas);

const $ = (/** @type {string} */ s) => /** @type {HTMLElement} */ (document.querySelector(s));
const $in = (/** @type {string} */ s) => /** @type {HTMLInputElement} */ (document.querySelector(s));
const icone = (/** @type {string} */ nome) => `<svg aria-hidden="true"><use href="#i-${nome}"/></svg>`;

/** @param {unknown} t */
function esc(t) {
  return String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}

/** @param {number} centavos */
const reaisInteiros = (centavos) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/** @param {string} dataIso */
function diasDesde(dataIso) {
  if (!dataIso) return Infinity;
  return Math.max(0, Math.round((Date.now() - new Date(`${dataIso}T12:00:00`).getTime()) / 86_400_000));
}
/** @param {string} dataIso */
function haQuantoTempo(dataIso) {
  const d = diasDesde(dataIso);
  if (d === Infinity) return '';
  return d === 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`;
}

/** @param {string} empresa */
function monograma(empresa) {
  const partes = empresa.split(/\s+/).filter((p) => p.length > 2 || /^[A-Z]/.test(p));
  const iniciais = (partes.length > 1 ? partes[0][0] + partes[1][0] : empresa.slice(0, 2)).toUpperCase();
  let h = 0;
  for (const c of empresa) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const tom = TONS[h % TONS.length];
  return `<span class="monograma" style="--m: color-mix(in srgb, ${tom} 22%, var(--folha))" aria-hidden="true">${esc(iniciais)}</span>`;
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let timerToast;
/** @param {string} msg */
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(timerToast);
  timerToast = setTimeout(() => { el.hidden = true; }, 2800);
}

function salvarTudo() {
  gravar('perfil', estado.perfil);
  gravar('perfilDeExemplo', estado.perfilDeExemplo);
  gravar('plano', estado.plano);
  gravar('uso', estado.uso);
  gravar('candidaturas', estado.candidaturas);
  gravar('letraGrande', estado.letraGrande);
}

/* ------------------------------------------------------------------ */
/* funil: cada passo importante vira um evento                         */
/* ------------------------------------------------------------------ */

const UMA_VEZ = new Set(['visita', 'ver_oferta']);

/**
 * @param {string} nome
 * @param {Record<string, string | number>} [dados]
 */
function rastrear(nome, dados = {}) {
  if (UMA_VEZ.has(nome)) {
    if (estado.jaRegistrados.has(nome)) return;
    estado.jaRegistrados.add(nome);
  }
  const evento = { nome, sessao: estado.sessao, quando: Date.now(), dados };
  estado.eventos = registrar(estado.eventos, evento);
  gravar('eventos', estado.eventos.slice(-1000));
  if (COM_SERVIDOR) {
    fetch('/api/eventos', { method: 'POST', body: JSON.stringify(evento), keepalive: true }).catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/* navegação                                                           */
/* ------------------------------------------------------------------ */

/** @param {string} aba */
function irPara(aba) {
  if (!ABAS.includes(aba)) aba = 'vagas';
  for (const b of document.querySelectorAll('.nav-item')) {
    if (/** @type {HTMLElement} */ (b).dataset.aba === aba) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  for (const t of document.querySelectorAll('.tela')) /** @type {HTMLElement} */ (t).hidden = t.id !== `tela-${aba}`;
  if (aba === 'perfil') desenharPerfil();
  if (aba === 'candidaturas') desenharCandidaturas();
  if (aba === 'planos') { desenharPlanos(); rastrear('ver_oferta', { onde: 'planos' }); }
  if (aba === 'painel') desenharPainel();
  if (aba === 'vagas') desenharVagas();
  window.scrollTo({ top: 0 });
}

/* ------------------------------------------------------------------ */
/* vagas                                                               */
/* ------------------------------------------------------------------ */

/** @returns {import('../core/busca.js').Filtros} */
function lerFiltros() {
  const ufEscolhida = $in('#f-uf').value;
  const ordem = $in('#f-ordem').value;
  return {
    texto: $in('#f-texto').value,
    uf: ufEscolhida || ($in('#f-perto').checked ? estado.perfil.uf : ''),
    modalidades: $in('#f-remoto').checked ? ['remoto'] : [],
    contratos: $in('#f-clt').checked ? ['CLT'] : [],
    so50mais: $in('#f-50').checked,
    diasMax: $in('#f-novas').checked ? 3 : 0,
    esconderSuspeitas: $in('#f-golpe').checked,
    ...(ordem ? { ordenar: /** @type {any} */ (ordem) } : {}),
  };
}

/** @param {import('../core/match.js').Resultado | null} chance @param {boolean} suspeita @param {boolean} [grande] */
function anel(chance, suspeita, grande = false) {
  const g = grande ? ' grande' : '';
  if (suspeita) return `<div class="anel golpe${g}" role="img" aria-label="Vaga com sinal de golpe">${icone('alerta')}</div>`;
  if (!chance) return '';
  return `<div class="anel ${chance.faixa}${g}" style="--v:${chance.nota}" role="img" aria-label="Chance ${chance.nota} de 100">
    <span><b>${chance.nota}</b><small>chance</small></span></div>`;
}

/** @param {Vaga} v */
function linkWhatsApp(v) {
  const local = v.modalidade === 'remoto' ? 'remoto' : `${v.cidade}/${v.uf}`;
  const texto = `Olha essa vaga: ${v.titulo} na ${v.empresa} (${local}), ${formatarSalario(v.salarioMin, v.salarioMax)}. Vi no VagaCerta, que mostra a chance em cada vaga.${v.url ? ` ${v.url}` : ''}`;
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

/** @param {Vaga} v */
function etiquetaSalario(v) {
  const dif = comparacaoSalarial(v, estado.medianas);
  return dif != null && dif >= 10 ? `<span class="etiqueta acima" title="Comparado com a mediana das vagas de ${esc(v.area)} listadas">+${dif}% que a média da área</span>` : '';
}

/**
 * @param {ItemBusca} item
 * @param {boolean} destaque
 * @param {Set<string>} salvas
 */
function cartaoVaga({ vaga: v, chance, alertas }, destaque, salvas) {
  const suspeita = alertas.some((a) => a.nivel === 'grave');
  const salva = salvas.has(v.id);
  let motivo = '';
  if (suspeita) motivo = `<div class="alerta grave"><span class="alerta-linha">${icone('alerta')}<span><b>Cuidado: sinal de golpe.</b> ${esc(alertas[0].motivo)}</span></span></div>`;
  else if (chance?.faixa === 'alta' && chance.motivos[0]) motivo = `<p class="vaga-motivo bom">${icone('check')}<span>${esc(chance.motivos[0])}</span></p>`;
  else if (chance?.faltando[0]) motivo = `<p class="vaga-motivo falta">${icone('seta')}<span>${esc(chance.faltando[0])}</span></p>`;

  const alta = !suspeita && chance?.faixa === 'alta';
  const selecionada = telaLarga.matches && estado.vagaAberta === v.id;
  return `<li class="vaga${suspeita ? ' suspeita' : ''}${destaque ? ' destaque' : ''}${selecionada ? ' selecionada' : ''}" data-id="${esc(v.id)}">
    ${destaque ? '<span class="faixa-destaque">Melhor chance para você</span>' : ''}
    ${monograma(v.empresa)}
    <div class="vaga-info">
      <h3 class="vaga-titulo"><button type="button" data-abrir="${esc(v.id)}">${esc(v.titulo)}</button></h3>
      <p class="vaga-meta"><span>${esc(v.empresa)}</span><span>${esc(v.modalidade === 'remoto' ? 'Remoto' : `${v.cidade}/${v.uf}`)}</span><span>${esc(haQuantoTempo(v.publicadaEm))}</span></p>
      <div class="vaga-salario"><strong>${esc(formatarSalario(v.salarioMin, v.salarioMax))}</strong>${etiquetaSalario(v)}</div>
      <div class="etiquetas">
        ${diasDesde(v.publicadaEm) <= 1 ? '<span class="etiqueta nova">Nova</span>' : ''}
        <span class="etiqueta">${esc(v.contrato)}</span>
        <span class="etiqueta">${MODALIDADE[v.modalidade]}</span>
        ${v.valorizaExperiencia ? '<span class="etiqueta ok">Valoriza 50+</span>' : ''}
        ${v.exigeCnh ? '<span class="etiqueta">Exige CNH</span>' : ''}
      </div>
      ${motivo}
    </div>
    <div class="vaga-nota">${anel(chance, suspeita)}${alta ? '<span class="carimbo">Chance alta</span>' : ''}</div>
    <div class="vaga-acoes">
      <button type="button" class="botao" data-abrir="${esc(v.id)}">Ver minha chance</button>
      <button type="button" class="botao-leve botao-quadrado${salva ? ' salvo' : ''}" data-salvar="${esc(v.id)}" aria-pressed="${salva}" aria-label="${salva ? 'Vaga salva' : 'Salvar vaga'}" title="${salva ? 'Salva' : 'Salvar'}">${icone(salva ? 'salvo-cheio' : 'salvo')}</button>
      <a class="botao-leve botao-quadrado zap" href="${linkWhatsApp(v)}" target="_blank" rel="noopener" data-compartilhar="${esc(v.id)}" aria-label="Enviar pelo WhatsApp" title="Enviar pelo WhatsApp">${icone('zap')}</a>
    </div>
  </li>`;
}

/** @param {number} altas */
function cartaoOferta(altas) {
  rastrear('ver_oferta', { onde: 'lista' });
  const titulo = altas > 1
    ? `Você tem <b>${altas} vagas com chance alta</b>. Mande um currículo sob medida para cada uma.`
    : 'Mande um <b>currículo sob medida</b> para cada vaga, sem limite.';
  return `<li class="oferta">
    <p class="sobretitulo" style="color:var(--ouro)">VagaCerta Pro</p>
    <h3>${titulo}</h3>
    <p>Currículo adaptado, carta e treino de entrevista ilimitados, e aviso de vagas novas no WhatsApp.</p>
    <div class="oferta-acoes">
      <button type="button" class="botao botao-ouro" data-assinar="lista">Testar ${DIAS_TESTE} dias grátis</button>
      <small>Depois ${reaisInteiros(/** @type {number} */ (PLANOS.anual.precoAnual))}/ano ou ${formatarReais(PLANOS.pro.precoMensal)}/mês. Cancele quando quiser.</small>
    </div>
  </li>`;
}

function desenharNumerosHero() {
  const itens = buscar(estado.vagas, {}, estado.perfilDeExemplo ? null : estado.perfil);
  const limpas = itens.filter((i) => !i.alertas.some((a) => a.nivel === 'grave'));
  const novas = limpas.filter((i) => diasDesde(i.vaga.publicadaEm) <= 3).length;
  const golpes = itens.length - limpas.length;
  const altas = estado.perfilDeExemplo ? 0 : limpas.filter((i) => i.chance?.faixa === 'alta').length;
  $('#hero-numeros').innerHTML = [
    `<li><b>${limpas.length}</b> vagas abertas</li>`,
    `<li><b>${novas}</b> novas nos últimos 3 dias</li>`,
    altas ? `<li class="ouro"><b>${altas}</b> com chance alta para você</li>` : '',
    golpes ? `<li><b>${golpes}</b> com sinal de golpe, já marcadas</li>` : '',
  ].join('');
}

function desenharVagas() {
  $('#aviso-exemplo').hidden = !estado.perfilDeExemplo;
  $('#quiz').hidden = !estado.perfilDeExemplo && !estado.quiz.concluido;
  desenharNumerosHero();

  const filtros = lerFiltros();
  const itens = buscar(estado.vagas, filtros, estado.perfil);
  const altas = itens.filter((i) => i.chance?.faixa === 'alta' && !i.alertas.some((a) => a.nivel === 'grave')).length;

  $('#resumo-busca').innerHTML = itens.length
    ? `<b>${itens.length}</b> ${itens.length === 1 ? 'vaga' : 'vagas'}${altas ? ` · <b>${altas}</b> com chance alta` : ''}`
    : 'Nenhuma vaga com esses filtros.';

  if (itens.length === 0) {
    if (telaLarga.matches) {
      estado.vagaAberta = null;
      $('#painel-vaga').innerHTML = `<div class="painel-vazio">${'<svg aria-hidden="true"><use href="#i-marca"/></svg>'}<p>Nenhuma vaga para mostrar com esses filtros.</p></div>`;
    }
    $('#lista-vagas').innerHTML = `<li class="vazio">Tente tirar um filtro ou buscar de outro jeito, como “vendas” em vez de “vendedor externo”.
      ${filtros.texto ? '<button type="button" class="link" data-limpar-busca>Limpar busca</button>' : ''}</li>`;
    return;
  }

  const salvas = new Set(estado.candidaturas.map((c) => c.vagaId));
  const primeiraLimpa = itens.findIndex((i) => !i.alertas.some((a) => a.nivel === 'grave'));
  const destacar = primeiraLimpa >= 0 && itens[primeiraLimpa].chance?.faixa === 'alta' && !filtros.ordenar ? primeiraLimpa : -1;
  const partes = itens.map((item, i) => cartaoVaga(item, i === destacar, salvas));
  if (!ehPago(estado.plano) && partes.length > 5) partes.splice(4, 0, cartaoOferta(altas));

  // no computador o painel ao lado nunca fica vazio: mostra a melhor vaga
  if (telaLarga.matches && !itens.some((i) => i.vaga.id === estado.vagaAberta)) {
    estado.vagaAberta = itens[primeiraLimpa >= 0 ? primeiraLimpa : 0].vaga.id;
    estado.subAba = 'chance';
    partes.splice(0, partes.length, ...itens.map((item, i) => cartaoVaga(item, i === destacar, salvas)));
    if (!ehPago(estado.plano) && partes.length > 5) partes.splice(4, 0, cartaoOferta(altas));
  }
  $('#lista-vagas').innerHTML = partes.join('');
  if (telaLarga.matches) desenharDetalhe();
}

function atualizarSugestoes() {
  const lista = sugestoes(estado.vagas, $in('#f-texto').value || $in('#q-cargo').value, 8);
  $('#sugestoes').innerHTML = lista.map((s) => `<option value="${esc(s)}"></option>`).join('');
}

/** Com vagas ao vivo, a busca vai ao servidor; sem, filtra localmente. */
async function buscarNoServidor() {
  if (estado.fonte !== 'ao-vivo') return;
  const q = $in('#f-texto').value.trim();
  const onde = $in('#f-uf').value;
  $('#resumo-busca').textContent = 'Buscando vagas em todas as fontes…';
  try {
    const resp = await fetch(`/api/vagas?q=${encodeURIComponent(q)}&onde=${encodeURIComponent(onde)}`);
    if (!resp.ok) throw new Error(String(resp.status));
    const dados = await resp.json();
    estado.vagas = dados.vagas;
    estado.medianas = medianasPorArea(estado.vagas);
  } catch {
    toast('Não consegui buscar agora. Mostrando as vagas que já estavam carregadas.');
  }
  desenharVagas();
}

/* ------------------------------------------------------------------ */
/* quiz de 30 segundos                                                 */
/* ------------------------------------------------------------------ */

function desenharQuiz() {
  const q = estado.quiz;
  const quiz = $('#quiz');
  quiz.classList.toggle('concluido', q.concluido);
  $('#quiz-perguntas').hidden = q.concluido;
  $('#quiz-feito').hidden = !q.concluido;
  if (q.concluido) {
    const itens = buscar(estado.vagas, { esconderSuspeitas: true }, estado.perfil);
    const altas = itens.filter((i) => i.chance?.faixa === 'alta').length;
    const medias = itens.filter((i) => i.chance?.faixa === 'media').length;
    const c = completude(estado.perfil);
    $('#quiz-feito').innerHTML = `<div class="quiz-topo"><div>
        <h2>Pronto! ${altas ? `${altas} ${altas === 1 ? 'vaga tem' : 'vagas têm'} chance alta para você` : `${medias} vagas têm chance média para você`}.</h2>
        <p class="quiz-sub">As melhores estão no topo da lista. Seu perfil está ${c.porcento}% completo: ${c.proximo ? `adicione ${esc(c.proximo)} para a nota ficar ainda mais certa.` : 'ótimo!'}</p>
      </div></div>
      <div class="quiz-acoes" style="justify-content:flex-start">
        <button type="button" class="botao" data-rolar-lista>Ver minhas vagas ${icone('seta')}</button>
        <button type="button" class="botao-leve" data-aba="perfil">Completar perfil</button>
      </div>`;
    return;
  }
  for (const el of quiz.querySelectorAll('[data-passo]')) /** @type {HTMLElement} */ (el).hidden = Number(/** @type {HTMLElement} */ (el).dataset.passo) !== q.passo;
  quiz.querySelectorAll('.quiz-passos li').forEach((li, i) => li.classList.toggle('ativo', i < q.passo));
  $('#q-voltar').hidden = q.passo === 1;
  $('#q-avancar').innerHTML = q.passo === 3 ? `Ver minhas vagas ${icone('seta')}` : `Continuar ${icone('seta')}`;

  if (q.passo === 1) {
    $('#q-atalhos').innerHTML = ATALHOS_CARGO.map((c) => `<button type="button" class="atalho" data-atalho="${c}" aria-pressed="${q.cargo === c}">${c}</button>`).join('');
  }
  if (q.passo === 3) {
    const lista = habilidadesSugeridas(q.area, estado.vagas, 9);
    $('#quiz-sub').textContent = 'Marque o que você sabe fazer. É isso que as empresas mais pedem.';
    const passo = /** @type {HTMLElement} */ (quiz.querySelector('[data-passo="3"]'));
    let caixa = passo.querySelector('.atalhos');
    if (!caixa) { caixa = document.createElement('div'); caixa.className = 'atalhos'; passo.append(caixa); }
    caixa.innerHTML = lista.map((h) => `<button type="button" class="atalho" data-habilidade="${esc(h)}" aria-pressed="${q.habilidades.has(h)}">${esc(h)}</button>`).join('');
  }
}

function avancarQuiz() {
  const q = estado.quiz;
  if (q.passo === 1) {
    q.cargo = $in('#q-cargo').value.trim();
    if (!q.cargo) { toast('Escreva ou toque no trabalho que você procura.'); $in('#q-cargo').focus(); return; }
    q.area = inferirArea(q.cargo, estado.vagas);
    q.passo = 2;
  } else if (q.passo === 2) {
    if (!$in('#q-uf').value) { toast('Escolha seu estado.'); $in('#q-uf').focus(); return; }
    q.passo = 3;
  } else {
    estado.perfil = {
      ...perfilVazio(),
      cargoDesejado: q.cargo,
      area: q.area,
      cidade: $in('#q-cidade').value.trim(),
      uf: $in('#q-uf').value,
      temCnh: $in('#q-cnh').checked,
      anosExperiencia: Math.max(0, Number($in('#q-anos').value) || 0),
      escolaridade: /** @type {any} */ ($in('#q-esc').value),
      habilidades: [...q.habilidades],
    };
    estado.perfilDeExemplo = false;
    estado.gerados.clear();
    q.concluido = true;
    salvarTudo();
    rastrear('quiz_concluido', { area: q.area || 'outra' });
    $in('#f-ordem').value = '';
    desenharVagas();
  }
  desenharQuiz();
}

/* ------------------------------------------------------------------ */
/* detalhe da vaga                                                     */
/* ------------------------------------------------------------------ */

/** @param {string} id */
const vagaPorId = (id) => estado.vagas.find((v) => v.id === id);

/** @param {string} id */
function abrirVaga(id) {
  estado.vagaAberta = id;
  estado.subAba = 'chance';
  if (telaLarga.matches) {
    for (const li of document.querySelectorAll('.lista-vagas .vaga')) li.classList.toggle('selecionada', /** @type {HTMLElement} */ (li).dataset.id === id);
    desenharDetalhe();
    $('#painel-vaga').scrollTop = 0;
  } else {
    desenharDetalhe();
    const d = /** @type {HTMLDialogElement} */ ($('#detalhe'));
    if (!d.open) d.showModal();
  }
  rastrear('abrir_vaga', { vaga: id });
}

/** Onde o detalhe aparece: painel ao lado (computador) ou folha (celular). */
function alvoDetalhe() {
  if (telaLarga.matches) {
    $('#detalhe-corpo').innerHTML = '';
    return $('#painel-vaga');
  }
  $('#painel-vaga').innerHTML = '';
  return $('#detalhe-corpo');
}

/** @type {Record<string, { rotulo: string, recurso: Recurso | null }>} */
const SUB_ABAS = {
  chance: { rotulo: 'Sua chance', recurso: null },
  curriculo: { rotulo: 'Currículo', recurso: 'curriculo' },
  carta: { rotulo: 'Carta', recurso: 'carta' },
  entrevista: { rotulo: 'Entrevista', recurso: 'entrevista' },
};

function desenharDetalhe() {
  const v = estado.vagaAberta ? vagaPorId(estado.vagaAberta) : null;
  if (!v) return;
  const [item] = buscar([v], {}, estado.perfil);
  const { chance, alertas } = item;
  const suspeita = alertas.some((a) => a.nivel === 'grave');
  const bloqueia = (/** @type {Recurso | null} */ r) => r && !estado.gerados.has(`${r}:${v.id}`) && !podeUsar(estado.plano, r, estado.uso);

  const abas = Object.entries(SUB_ABAS).map(([id, a]) =>
    `<button type="button" role="tab" data-sub="${id}" aria-selected="${estado.subAba === id}">${a.rotulo}${bloqueia(a.recurso) ? icone('cadeado') : ''}</button>`).join('');

  alvoDetalhe().innerHTML = `<div class="folha-corpo">
    <div class="folha-topo">
      ${monograma(v.empresa)}
      <div class="vaga-info">
        <h2 id="d-titulo">${esc(v.titulo)}</h2>
        <p class="vaga-meta"><span>${esc(v.empresa)}</span><span>${esc(v.modalidade === 'remoto' ? 'Remoto' : `${v.cidade}/${v.uf}`)}</span></p>
      </div>
      <button type="button" class="fechar" data-fechar="detalhe" aria-label="Fechar">✕</button>
    </div>
    ${alertas.length ? `<div class="alerta ${suspeita ? 'grave' : 'atencao'}"><b>${suspeita ? 'Cuidado: esta vaga tem sinais de golpe.' : 'Atenção a estes pontos:'}</b>
      <ul>${alertas.map((a) => `<li>${esc(a.motivo)}</li>`).join('')}</ul>
      ${suspeita ? '<span>Nunca pague para se candidatar e nunca envie senha ou dados bancários.</span>' : ''}</div>` : ''}
    <div class="abas-folha" role="tablist">${abas}</div>
    <div id="sub-conteudo">${conteudoSubAba(v, chance, suspeita)}</div></div>`;
}

/**
 * @param {Vaga} v
 * @param {import('../core/match.js').Resultado | null} chance
 * @param {boolean} suspeita
 */
function abaChance(v, chance, suspeita) {
  const criterios = chance ? Object.entries(chance.partes).map(([k, pts]) => {
    const max = PESOS[/** @type {keyof typeof PESOS} */ (k)];
    return `<div class="criterio" title="${NOME_CRITERIO[/** @type {keyof typeof NOME_CRITERIO} */ (k)]}: ${pts} de ${max} pontos">
      <span class="criterio-nome">${NOME_CRITERIO[/** @type {keyof typeof NOME_CRITERIO} */ (k)]}</span>
      <span class="criterio-trilho"><span class="criterio-barra" style="width:${Math.round((pts / max) * 100)}%"></span></span>
      <span class="criterio-valor">${Math.round(pts)}/${max}</span>
    </div>`;
  }).join('') : '';

  return `<div class="bloco">
    ${chance ? `<div class="folha-topo" style="grid-template-columns:auto 1fr">
        ${anel(chance, suspeita, true)}
        <div><h3>${chance.faixa === 'alta' ? 'Você tem chance alta nesta vaga' : chance.faixa === 'media' ? 'Você tem chance média nesta vaga' : 'Sua chance nesta vaga é baixa'}</h3>
        <p class="cota">${chance.eliminatorio ? 'Um requisito obrigatório não foi atendido; por isso a nota tem teto.' : 'Veja de onde vem cada ponto.'}</p></div>
      </div>
      <div class="criterios">${criterios}</div>
      ${chance.motivos.length ? `<h3>A seu favor</h3><ul class="lista-simples bons">${chance.motivos.map((m) => `<li>${icone('check')}<span>${esc(m)}</span></li>`).join('')}</ul>` : ''}
      ${chance.faltando.length ? `<h3>O que melhorar</h3><ul class="lista-simples faltas">${chance.faltando.map((m) => `<li>${icone('seta')}<span>${esc(m)}</span></li>`).join('')}</ul>` : ''}` : ''}
    <section class="ficha" aria-label="Dados da vaga">
      <p class="ficha-titulo">Contrato de trabalho</p>
      <dl>${[
        ['Empregador', v.empresa],
        ['Cargo', v.titulo],
        ['Remuneração', formatarSalario(v.salarioMin, v.salarioMax)],
        ['Regime', v.contrato],
        ['Local', v.modalidade === 'remoto' ? 'Remoto' : `${v.cidade}/${v.uf}`],
        ['Modalidade', MODALIDADE[v.modalidade]],
        ['Experiência', v.experienciaMin ? `${v.experienciaMin} ano(s)` : 'Não exige'],
        ['Escolaridade', NOME_ESCOLARIDADE[v.escolaridadeMin]],
        ['Publicada', haQuantoTempo(v.publicadaEm) || '—'],
      ].map(([k, val]) => `<div><dt>${k}</dt><span class="pontilhado" aria-hidden="true"></span><dd>${esc(val)}</dd></div>`).join('')}</dl>
    </section>
    <p>${esc(v.descricao)}</p>
    ${v.requisitos.length ? `<p><b>Requisitos:</b> ${esc(v.requisitos.join(', '))}</p>` : ''}
    ${v.diferenciais.length ? `<p><b>Diferenciais:</b> ${esc(v.diferenciais.join(', '))}</p>` : ''}
    ${v.beneficios.length ? `<p><b>Benefícios:</b> ${esc(v.beneficios.join(', '))}</p>` : ''}
    <p class="nota-rodape">Fonte: ${esc(v.fonte)}</p>
    <div class="vaga-acoes" style="grid-column:auto">
      ${suspeita ? '' : `<button type="button" class="botao botao-ouro" data-sub="curriculo">Gerar meu currículo para esta vaga</button>`}
      ${v.url && !suspeita ? `<a class="botao-leve" href="${esc(v.url)}" target="_blank" rel="noopener">Candidatar-se no site ${icone('seta')}</a>` : ''}
      <button type="button" class="botao-leve" data-salvar="${esc(v.id)}">${icone('salvo')} Salvar</button>
      <a class="botao-leve zap" href="${linkWhatsApp(v)}" target="_blank" rel="noopener" data-compartilhar="${esc(v.id)}">${icone('zap')} Enviar</a>
    </div>
  </div>`;
}

/** @param {Recurso} recurso @param {Vaga} v */
function gerarTexto(recurso, v) {
  return recurso === 'curriculo' ? gerarCurriculo(estado.perfil, v)
    : recurso === 'carta' ? gerarCarta(estado.perfil, v)
      : JSON.stringify(prepararEntrevista(estado.perfil, v));
}

/** @param {Recurso} recurso @param {string} texto */
function mostrarTexto(recurso, texto) {
  if (recurso === 'entrevista') {
    const perguntas = /** @type {import('../core/curriculo.js').Pergunta[]} */ (JSON.parse(texto));
    return `<ol class="perguntas">${perguntas.map((p) => `<li><b>${esc(p.pergunta)}</b><span class="dica">${esc(p.dica)}</span></li>`).join('')}</ol>`;
  }
  return `<pre class="texto-gerado" id="texto-gerado">${esc(texto)}</pre>`;
}

/**
 * @param {Vaga} v
 * @param {import('../core/match.js').Resultado | null} chance
 * @param {boolean} suspeita
 */
function conteudoSubAba(v, chance, suspeita) {
  if (estado.subAba === 'chance') return abaChance(v, chance, suspeita);

  const recurso = /** @type {Recurso} */ (SUB_ABAS[estado.subAba].recurso);
  const pronto = estado.gerados.get(`${recurso}:${v.id}`);
  const nomes = { curriculo: 'currículo', carta: 'carta de apresentação', entrevista: 'treino de entrevista' };
  const nome = nomes[/** @type {'curriculo' | 'carta' | 'entrevista'} */ (recurso)];

  if (pronto) {
    return `<div class="bloco">
      ${mostrarTexto(recurso, pronto)}
      ${recurso !== 'entrevista' ? `<div class="vaga-acoes" style="grid-column:auto"><button type="button" class="botao" data-copiar>Copiar texto</button>
        ${v.url && !suspeita ? `<a class="botao-leve" href="${esc(v.url)}" target="_blank" rel="noopener">Candidatar-se no site ${icone('seta')}</a>` : ''}</div>` : ''}
      ${!ehPago(estado.plano) ? `<p class="dica-pro">Gostou? No Pro você gera para todas as vagas, sem limite. <button type="button" class="link" data-assinar="depois-gerar">Testar ${DIAS_TESTE} dias grátis</button></p>` : ''}
    </div>`;
  }

  if (!podeUsar(estado.plano, recurso, estado.uso)) {
    // o resultado é mostrado borrado: a pessoa vê que está pronto e só falta liberar
    rastrear('ver_oferta', { onde: `bloqueio-${recurso}` });
    return `<div class="bloqueado">
      ${mostrarTexto(recurso, gerarTexto(recurso, v))}
      <div class="cadeado">
        <span class="icone-cadeado">${icone('cadeado')}</span>
        <h3>Seu ${nome} para esta vaga está pronto</h3>
        <p>Você já usou o grátis de hoje. Libere agora e mande para todas as vagas que combinam com você.</p>
        <button type="button" class="botao botao-ouro" data-assinar="bloqueio">Liberar com ${DIAS_TESTE} dias grátis</button>
        <p class="cota">ou volte amanhã para mais 1 grátis</p>
      </div>
    </div>`;
  }

  const resta = restantes(estado.plano, recurso, estado.uso);
  const explica = {
    curriculo: 'Montamos seu currículo destacando primeiro o que esta vaga pede, usando só o que está no seu perfil.',
    carta: 'Uma carta curta e direta, citando a empresa e os requisitos que você atende.',
    entrevista: 'As perguntas mais prováveis desta entrevista, com dica de como responder cada uma.',
  }[/** @type {'curriculo' | 'carta' | 'entrevista'} */ (recurso)];
  return `<div class="bloco">
    <p>${explica}</p>
    <p class="cota">${resta === Infinity ? 'Plano Pro: ilimitado.' : `Plano grátis: resta ${resta} hoje.`}</p>
    <button type="button" class="botao botao-ouro" data-gerar="${recurso}">Gerar ${nome}</button>
  </div>`;
}

/** @param {Recurso} recurso */
function gerar(recurso) {
  const v = estado.vagaAberta ? vagaPorId(estado.vagaAberta) : null;
  if (!v || !podeUsar(estado.plano, recurso, estado.uso)) return;
  estado.gerados.set(`${recurso}:${v.id}`, gerarTexto(recurso, v));
  estado.uso = registrarUso(recurso, estado.uso);
  salvarTudo();
  rastrear('gerar', { recurso });
  desenharDetalhe();
}

async function copiar() {
  const el = $('#texto-gerado');
  try {
    await navigator.clipboard.writeText(el.textContent ?? '');
    toast('Texto copiado');
  } catch {
    const sel = window.getSelection();
    const r = document.createRange();
    r.selectNodeContents(el);
    sel?.removeAllRanges();
    sel?.addRange(r);
    toast('Texto selecionado: use Copiar do seu aparelho');
  }
}

/** @param {string} id */
function alternarSalva(id) {
  if (estado.candidaturas.some((c) => c.vagaId === id)) {
    estado.candidaturas = remover(estado.candidaturas, id);
    toast('Vaga removida das salvas');
  } else {
    estado.candidaturas = moverPara(estado.candidaturas, id, 'salva');
    rastrear('salvar', { vaga: id });
    toast('Vaga salva. Acompanhe em “Salvas”.');
  }
  salvarTudo();
  atualizarContador();
}

/* ------------------------------------------------------------------ */
/* assinatura (simulada)                                               */
/* ------------------------------------------------------------------ */

/** @param {string} origem */
function abrirCheckout(origem) {
  rastrear('clique_assinar', { origem, ciclo: estado.ciclo });
  const anual = estado.ciclo === 'anual';
  const depois = anual ? `${formatarReais(/** @type {number} */ (PLANOS.anual.precoAnual))} por ano (${formatarReais(PLANOS.anual.precoMensal)}/mês)` : `${formatarReais(PLANOS.pro.precoMensal)} por mês`;
  $('#checkout-corpo').innerHTML = `
    <div class="folha-topo" style="grid-template-columns:1fr auto">
      <div><p class="sobretitulo" style="color:var(--acao)">VagaCerta Pro</p><h2 id="c-titulo">Comece seus ${DIAS_TESTE} dias grátis</h2></div>
      <button type="button" class="fechar" data-fechar="checkout" aria-label="Fechar">✕</button>
    </div>
    <div class="alternador" role="radiogroup" aria-label="Forma de pagamento" style="background:var(--folha-2)">
      <button type="button" role="radio" data-ciclo="mensal" aria-checked="${!anual}" style="color:var(--tinta)">Mensal</button>
      <button type="button" role="radio" data-ciclo="anual" aria-checked="${anual}" style="color:var(--tinta)">Anual <b>-${economiaAnual().porcento}%</b></button>
    </div>
    <dl class="dados">
      <div><dt>Hoje</dt><dd>R$ 0,00</dd></div>
      <div><dt>Depois de ${DIAS_TESTE} dias</dt><dd>${depois}</dd></div>
    </dl>
    <ul class="lista-simples bons">${PLANOS.pro.inclui.slice(1).map((i) => `<li>${icone('check')}<span>${esc(i)}</span></li>`).join('')}</ul>
    <button type="button" class="botao botao-ouro botao-largo" data-confirmar-assinatura>Começar teste grátis</button>
    <p class="garantia">${icone('escudo')}<span>Cancele quando quiser antes do fim do teste e não paga nada. Depois, ${DIAS_GARANTIA} dias de garantia.</span></p>
    <p class="nota-rodape">Protótipo: esta assinatura é uma simulação e nenhum valor é cobrado.</p>`;
  const d = /** @type {HTMLDialogElement} */ ($('#checkout'));
  if (!d.open) d.showModal();
}

function confirmarAssinatura() {
  estado.plano = estado.ciclo === 'anual' ? 'anual' : 'pro';
  salvarTudo();
  rastrear('assinou', { plano: estado.plano });
  /** @type {HTMLDialogElement} */ ($('#checkout')).close();
  atualizarPilula();
  toast(`Pro ativado. Aproveite seus ${DIAS_TESTE} dias grátis!`);
  if (/** @type {HTMLDialogElement} */ ($('#detalhe')).open) desenharDetalhe();
  if (!$('#tela-planos').hidden) desenharPlanos();
  desenharVagas();
}

/* ------------------------------------------------------------------ */
/* alertas de vagas novas no WhatsApp (Pro)                            */
/* ------------------------------------------------------------------ */

/** @param {string} tel 5511987654321 */
const formatarCelular = (tel) => tel.replace(/^55(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');

function abrirAlerta() {
  if (!ehPago(estado.plano)) {
    abrirCheckout('alerta');
    return;
  }
  const texto = $in('#f-texto').value.trim() || estado.perfil.cargoDesejado;
  const uf = $in('#f-uf').value || estado.perfil.uf;
  $('#aviso-corpo').innerHTML = `
    <div class="folha-topo" style="grid-template-columns:1fr auto">
      <div><p class="sobretitulo" style="color:var(--acao)">Alerta de vagas</p><h2 id="a-titulo">Receba vagas novas no WhatsApp</h2></div>
      <button type="button" class="fechar" data-fechar="aviso" aria-label="Fechar">✕</button>
    </div>
    <form id="form-alerta" class="bloco" novalidate>
      <label class="campo"><span>O que buscar</span><input id="a-texto" value="${esc(texto)}" placeholder="Ex.: motorista" /></label>
      <label class="campo"><span>Estado</span><select id="a-uf"><option value="">Todo o Brasil</option>${UFS.map((u) => `<option ${u === uf ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
      <label class="campo"><span>Seu WhatsApp</span><input id="a-tel" inputmode="tel" autocomplete="tel" placeholder="(11) 98765-4321" value="${esc(estado.perfil.telefone)}" /></label>
      <p class="cota" id="a-erro" role="alert"></p>
      <button type="submit" class="botao botao-ouro botao-largo">${icone('sino')} Criar alerta</button>
      <p class="nota-rodape">Mandamos no máximo uma mensagem por dia, só quando houver vaga nova. Responda SAIR para parar.</p>
    </form>`;
  const d = /** @type {HTMLDialogElement} */ ($('#aviso'));
  if (!d.open) d.showModal();
  $('#form-alerta').addEventListener('submit', salvarAlerta);
}

/** @param {Event} ev */
async function salvarAlerta(ev) {
  ev.preventDefault();
  const telefone = normalizarCelular($in('#a-tel').value);
  const texto = $in('#a-texto').value.trim();
  const uf = $in('#a-uf').value;
  if (!telefone) { $('#a-erro').textContent = 'Confira o celular: precisa ter DDD e 9 dígitos, como (11) 98765-4321.'; return; }
  if (!texto && !uf) { $('#a-erro').textContent = 'Diga o que buscar ou escolha um estado.'; return; }
  let id = `local-${Date.now().toString(36)}`;
  if (COM_SERVIDOR) {
    try {
      const resp = await fetch('/api/alertas', { method: 'POST', body: JSON.stringify({ telefone, texto, uf }) });
      const dados = await resp.json();
      if (!resp.ok) { $('#a-erro').textContent = dados.erro ?? 'Não deu certo agora. Tente de novo.'; return; }
      id = dados.id;
    } catch {
      $('#a-erro').textContent = 'Sem conexão. Tente de novo quando a internet voltar.';
      return;
    }
  }
  if (!estado.alertas.some((a) => a.id === id)) estado.alertas = [...estado.alertas, { id, telefone, texto, uf }];
  gravar('alertas', estado.alertas);
  /** @type {HTMLDialogElement} */ ($('#aviso')).close();
  toast(COM_SERVIDOR ? 'Alerta criado. Avisaremos no seu WhatsApp.' : 'Alerta salvo (simulação neste protótipo).');
}

/* ------------------------------------------------------------------ */
/* instalar o app (PWA)                                                */
/* ------------------------------------------------------------------ */

const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const jaInstalado = window.matchMedia('(display-mode: standalone)').matches || /** @type {any} */ (navigator).standalone === true;

function mostrarBotoesInstalar() {
  const pode = COM_SERVIDOR && !jaInstalado && (estado.pedidoInstalacao !== null || ehIOS);
  $('#btn-instalar').hidden = !pode;
  $('#link-instalar').hidden = !pode;
}

async function instalar() {
  if (estado.pedidoInstalacao) {
    estado.pedidoInstalacao.prompt();
    const { outcome } = await estado.pedidoInstalacao.userChoice;
    estado.pedidoInstalacao = null;
    mostrarBotoesInstalar();
    if (outcome === 'accepted') toast('VagaCerta instalado! Procure o ícone na sua tela.');
    return;
  }
  // iPhone não tem botão de instalar: explica o caminho do Safari
  $('#aviso-corpo').innerHTML = `
    <div class="folha-topo" style="grid-template-columns:auto 1fr auto">
      <svg class="marca-simbolo" aria-hidden="true" style="width:48px;height:48px"><use href="#i-marca"/></svg>
      <div><h2 id="a-titulo">Instale o VagaCerta no iPhone</h2><p class="cota">Leva 10 segundos e abre como aplicativo.</p></div>
      <button type="button" class="fechar" data-fechar="aviso" aria-label="Fechar">✕</button>
    </div>
    <ol class="passos-ios">
      <li>No Safari, toque em <b>Compartilhar</b> ${icone('ios-compartilhar')} na barra de baixo.</li>
      <li>Role e toque em <b>Adicionar à Tela de Início</b>.</li>
      <li>Toque em <b>Adicionar</b>. Pronto!</li>
    </ol>`;
  const d = /** @type {HTMLDialogElement} */ ($('#aviso'));
  if (!d.open) d.showModal();
}

window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  estado.pedidoInstalacao = ev;
  mostrarBotoesInstalar();
});
window.addEventListener('appinstalled', () => { estado.pedidoInstalacao = null; mostrarBotoesInstalar(); rastrear('filtro', { qual: 'instalou' }); });

/* ------------------------------------------------------------------ */
/* perfil                                                              */
/* ------------------------------------------------------------------ */

function preencherSelects() {
  const ufs = UFS.map((u) => `<option>${u}</option>`).join('');
  $('#f-uf').insertAdjacentHTML('beforeend', ufs);
  $('#p-uf').innerHTML = `<option value="">Selecione</option>${ufs}`;
  $('#q-uf').innerHTML = `<option value="">Selecione</option>${ufs}`;
  $('#p-area').innerHTML = `<option value="">Selecione</option>${AREAS.map((a) => `<option>${a}</option>`).join('')}`;
  const escolaridades = ESCOLARIDADES.map((e) => `<option value="${e}">${NOME_ESCOLARIDADE[e]}</option>`).join('');
  $('#p-esc').innerHTML = escolaridades;
  $('#q-esc').innerHTML = escolaridades;
  $in('#q-esc').value = 'medio';
}

/** @param {import('../core/tipos.js').Experiencia} e @param {number} i */
function linhaExp(e, i) {
  return `<li class="exp" data-i="${i}">
    <label class="campo"><span>Cargo</span><input id="e-cargo-${i}" data-c="cargo" value="${esc(e.cargo)}" /></label>
    <label class="campo"><span>Empresa</span><input id="e-emp-${i}" data-c="empresa" value="${esc(e.empresa)}" /></label>
    <label class="campo"><span>Período</span><input id="e-per-${i}" data-c="periodo" value="${esc(e.periodo)}" placeholder="2015 – 2023" /></label>
    <button type="button" class="botao-leve" data-remover-exp="${i}">Remover</button>
    <label class="campo campo-desc"><span>O que você fazia</span><input id="e-desc-${i}" data-c="descricao" value="${esc(e.descricao)}" /></label>
  </li>`;
}

function desenharPerfil() {
  const p = estado.perfil;
  $in('#p-nome').value = p.nome;
  $in('#p-cargo').value = p.cargoDesejado;
  $in('#p-area').value = p.area;
  $in('#p-cidade').value = p.cidade;
  $in('#p-uf').value = p.uf;
  $in('#p-anos').value = String(p.anosExperiencia);
  $in('#p-esc').value = p.escolaridade;
  $in('#p-sal').value = p.salarioMin ? String(p.salarioMin / 100) : '';
  $in('#p-remoto').value = p.aceitaRemoto;
  $in('#p-tel').value = p.telefone;
  $in('#p-email').value = p.email;
  $in('#p-cnh').checked = p.temCnh;
  /** @type {HTMLTextAreaElement} */ ($('#p-hab')).value = p.habilidades.join(', ');
  /** @type {HTMLTextAreaElement} */ ($('#p-resumo')).value = p.resumo;
  $('#lista-exp').innerHTML = p.experiencias.map(linhaExp).join('');
  desenharMedidor(p);
}

/** @param {Perfil} p */
function desenharMedidor(p) {
  const c = completude(p);
  $('#medidor-perfil').innerHTML = `
    <div class="medidor-topo"><span>Perfil ${c.porcento}% completo</span>${estado.perfilDeExemplo ? '<span class="cota">Este é o perfil de exemplo. Troque pelos seus dados.</span>' : ''}</div>
    <div class="medidor-trilho" role="progressbar" aria-valuenow="${c.porcento}" aria-valuemin="0" aria-valuemax="100"><div class="medidor-barra" style="width:${c.porcento}%"></div></div>
    <p class="medidor-dica">${c.proximo ? `Próximo passo: adicione ${esc(c.proximo)}.` : 'Perfil completo. Suas notas de chance estão no máximo de precisão.'}</p>`;
}

/** @returns {import('../core/tipos.js').Experiencia[]} */
function lerExperiencias() {
  return [...document.querySelectorAll('#lista-exp .exp')].map((li) => {
    const campo = (/** @type {string} */ c) => /** @type {HTMLInputElement} */ (li.querySelector(`[data-c="${c}"]`)).value.trim();
    return { cargo: campo('cargo'), empresa: campo('empresa'), periodo: campo('periodo'), descricao: campo('descricao') };
  });
}

/** @returns {Perfil} */
function lerPerfil() {
  return {
    nome: $in('#p-nome').value.trim(),
    cargoDesejado: $in('#p-cargo').value.trim(),
    area: $in('#p-area').value,
    cidade: $in('#p-cidade').value.trim(),
    uf: $in('#p-uf').value,
    anosExperiencia: Math.max(0, Number($in('#p-anos').value) || 0),
    escolaridade: /** @type {any} */ ($in('#p-esc').value),
    salarioMin: Math.max(0, Math.round((Number($in('#p-sal').value) || 0) * 100)),
    aceitaRemoto: /** @type {any} */ ($in('#p-remoto').value),
    telefone: $in('#p-tel').value.trim(),
    email: $in('#p-email').value.trim(),
    temCnh: $in('#p-cnh').checked,
    habilidades: /** @type {HTMLTextAreaElement} */ ($('#p-hab')).value.split(',').map((h) => h.trim()).filter(Boolean),
    resumo: /** @type {HTMLTextAreaElement} */ ($('#p-resumo')).value.trim(),
    experiencias: lerExperiencias().filter((e) => e.cargo || e.empresa),
  };
}

/* ------------------------------------------------------------------ */
/* candidaturas                                                        */
/* ------------------------------------------------------------------ */

function atualizarContador() {
  const el = $('#cont-cand');
  el.textContent = String(estado.candidaturas.length);
  el.hidden = estado.candidaturas.length === 0;
}

function desenharCandidaturas() {
  const cobrar = precisamDeRetorno(estado.candidaturas);
  $('#alerta-retorno').innerHTML = cobrar.length
    ? `<div class="alerta atencao"><b>${cobrar.length} candidatura(s) sem resposta há mais de 7 dias.</b> Mande uma mensagem educada perguntando como está o processo.</div>`
    : '';

  $('#meus-alertas').innerHTML = estado.alertas.length
    ? `<section class="cartao"><h2>Seus alertas no WhatsApp</h2><ul class="lista-alertas">${estado.alertas.map((a) =>
      `<li><span>${icone('sino')} <b>${esc(a.texto || 'Todas as vagas')}</b>${a.uf ? ` em ${esc(a.uf)}` : ''} · ${esc(formatarCelular(a.telefone))}</span>
       <button type="button" class="botao-leve" data-remover-alerta="${esc(a.id)}">Parar</button></li>`).join('')}</ul></section>`
    : '';

  if (estado.candidaturas.length === 0) {
    $('#quadro').innerHTML = `<div class="cartao" style="grid-column:1/-1;justify-items:start">
      <h2>Nenhuma vaga salva ainda</h2>
      <p class="cota">Toque no ícone ${icone('salvo')} de uma vaga para acompanhar aqui cada etapa, do envio até a contratação.</p>
      <button type="button" class="botao" data-aba="vagas">Ver vagas</button></div>`;
    return;
  }

  $('#quadro').innerHTML = ETAPAS.map((etapa) => {
    const daEtapa = estado.candidaturas.filter((c) => c.etapa === etapa.id);
    const cards = daEtapa.map((c) => {
      const v = vagaPorId(c.vagaId);
      if (!v) return '';
      return `<div class="cartao-cand">
        <b>${esc(v.titulo)}</b>
        <span class="coluna-dica">${esc(v.empresa)} · atualizada ${esc(haQuantoTempo(c.atualizadaEm))}</span>
        <label class="campo"><span>Etapa</span>
          <select id="mv-${esc(v.id)}" data-mover="${esc(v.id)}">${ETAPAS.map((e) => `<option value="${e.id}" ${e.id === c.etapa ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}</select>
        </label>
        <div class="linha">
          <button type="button" class="botao-leve" data-abrir="${esc(v.id)}">Abrir</button>
          <button type="button" class="botao-leve" data-tirar="${esc(v.id)}">Tirar</button>
        </div>
      </div>`;
    }).join('');
    return `<section class="coluna">
      <div class="coluna-topo"><h3>${esc(etapa.nome)}</h3><span class="bolinha">${daEtapa.length}</span></div>
      <p class="coluna-dica">${esc(etapa.proximo)}</p>
      ${cards}
    </section>`;
  }).join('');
}

/* ------------------------------------------------------------------ */
/* planos                                                              */
/* ------------------------------------------------------------------ */

const LINHAS_COMPARACAO = /** @type {[string, string, string][]} */ ([
  ['Busca em todas as fontes de vagas', 'sim', 'sim'],
  ['Nota de chance em cada vaga', 'sim', 'sim'],
  ['Alerta de vaga golpe', 'sim', 'sim'],
  ['Currículo adaptado à vaga', '1 por dia', 'Ilimitado'],
  ['Carta de apresentação', '1 por dia', 'Ilimitado'],
  ['Treino de entrevista', '1 por dia', 'Ilimitado'],
  ['Aviso de vagas novas no WhatsApp', 'nao', 'sim'],
  ['Pausa grátis quando for contratado', 'nao', 'sim'],
]);

const FAQ = /** @type {[string, string][]} */ ([
  ['Posso cancelar quando quiser?', `Sim, sem multa e sem ligação. No teste de ${DIAS_TESTE} dias, se cancelar antes do fim, você não paga nada.`],
  ['De onde vêm as vagas?', 'De agregadores com API oficial (Adzuna, Jooble e Careerjet), que juntam vagas de milhares de sites de emprego do Brasil. Confira sempre no site da empresa antes de se candidatar.'],
  ['A nota de chance garante a contratação?', 'Não. Ela mostra o quanto seu perfil combina com o que a vaga pede e o que você pode melhorar. Quem decide é a empresa.'],
  ['O currículo inventa experiência?', 'Nunca. Ele só reorganiza e destaca o que você escreveu no perfil, colocando primeiro o que a vaga pede.'],
  ['Arrumei emprego. E agora?', 'Parabéns! Pause a assinatura sem custo e volte quando precisar.'],
  ['Onde ficam meus dados?', 'Nesta versão, só no seu aparelho. Nada é enviado para outras empresas.'],
]);

function desenharPlanos() {
  const anual = estado.ciclo === 'anual';
  const eco = economiaAnual();
  $('#selo-economia').textContent = `-${eco.porcento}%`;
  for (const b of document.querySelectorAll('#tela-planos [data-ciclo]')) b.setAttribute('aria-checked', String(/** @type {HTMLElement} */ (b).dataset.ciclo === estado.ciclo));

  const pago = ehPago(estado.plano);
  const precoPro = anual
    ? `<p class="preco">${formatarReais(PLANOS.anual.precoMensal)} <small>/mês</small></p>
       <p class="preco-nota">Cobrado ${formatarReais(/** @type {number} */ (PLANOS.anual.precoAnual))} por ano. Economia de ${formatarReais(eco.centavos)}.</p>`
    : `<p class="preco">${formatarReais(PLANOS.pro.precoMensal)} <small>/mês</small></p>
       <p class="preco-nota">No anual sai ${formatarReais(PLANOS.anual.precoMensal)}/mês.</p>`;

  $('#planos').innerHTML = `
    <article class="plano">
      <h2>Grátis</h2>
      <p class="preco">R$ 0</p>
      <p class="preco-nota">Para começar a procurar hoje.</p>
      <ul class="lista-simples bons">${PLANOS.gratis.inclui.map((i) => `<li>${icone('check')}<span>${esc(i)}</span></li>`).join('')}</ul>
      ${pago ? '<button type="button" class="botao-leve" data-plano-gratis>Voltar ao grátis</button>' : '<button type="button" class="botao-leve" disabled>Seu plano atual</button>'}
    </article>
    <article class="plano destaque">
      <span class="faixa-destaque">Recomendado</span>
      <h2>Pro</h2>
      ${precoPro}
      <ul class="lista-simples bons">${PLANOS.pro.inclui.map((i) => `<li>${icone('check')}<span>${esc(i)}</span></li>`).join('')}</ul>
      ${pago ? `<button type="button" class="botao" disabled>Você já é Pro</button>`
        : `<button type="button" class="botao botao-ouro botao-largo" data-assinar="planos">Testar ${DIAS_TESTE} dias grátis</button>`}
      <p class="garantia">${icone('escudo')}<span>Sem cobrança no teste. Depois, ${DIAS_GARANTIA} dias de garantia.</span></p>
    </article>`;

  const celula = (/** @type {string} */ v) => v === 'sim' ? `<td class="sim">${icone('check')}<span class="sr">Sim</span></td>`
    : v === 'nao' ? '<td class="nao">—<span class="sr">Não</span></td>' : `<td>${esc(v)}</td>`;
  $('#comparacao').innerHTML = `<thead><tr><th scope="col">O que você recebe</th><th scope="col">Grátis</th><th scope="col">Pro</th></tr></thead>
    <tbody>${LINHAS_COMPARACAO.map(([n, g, p]) => `<tr><th scope="row" style="font-weight:400">${esc(n)}</th>${celula(g)}${celula(p)}</tr>`).join('')}</tbody>`;
  $('#faq').innerHTML = FAQ.map(([p, r]) => `<details><summary>${esc(p)}</summary><p>${esc(r)}</p></details>`).join('');
}

function atualizarPilula() {
  const el = $('#pilula-plano');
  el.textContent = ehPago(estado.plano) ? 'Pro' : 'Grátis';
  el.classList.toggle('pro', ehPago(estado.plano));
}

function aplicarLetra() {
  document.documentElement.classList.toggle('letra-grande', estado.letraGrande);
  $('#btn-letra').setAttribute('aria-pressed', String(estado.letraGrande));
}

/* ------------------------------------------------------------------ */
/* painel do dono                                                      */
/* ------------------------------------------------------------------ */

function desenharPainel() {
  const etapas = funil(estado.eventos);
  const topo = Math.max(1, etapas[0].sessoes);
  $('#funil').innerHTML = etapas[0].sessoes === 0
    ? '<p class="vazio">Ainda não há cliques registrados.</p>'
    : etapas.map((e) => {
      const passagem = e.daAnterior == null ? '' : ` · ${String(e.daAnterior).replace('.', ',')}% da etapa anterior`;
      return `<div class="funil-linha" title="${esc(e.nome)}: ${e.sessoes} sessões${passagem}">
        <span class="funil-nome">${esc(e.nome)}</span>
        <span class="funil-trilho"><span class="funil-barra" style="width:${(e.sessoes / topo) * 100}%"></span>
          <span class="funil-valor">${e.sessoes} (${String(e.doTopo).replace('.', ',')}%)</span></span>
      </div>`;
    }).join('');
  desenharSimulador();
}

function desenharSimulador() {
  const usuarios = Number($in('#s-usuarios').value);
  const conv = Number($in('#s-conv').value) / 100;
  const fracaoAnual = Number($in('#s-anual').value) / 100;
  $('#s-usuarios-v').textContent = usuarios.toLocaleString('pt-BR');
  $('#s-conv-v').textContent = `${String(conv * 100).replace('.', ',')}%`;
  $('#s-anual-v').textContent = `${Math.round(fracaoAnual * 100)}%`;
  const r = projetarReceita({ usuarios, conversao: conv, fracaoAnual, precoMensal: PLANOS.pro.precoMensal, precoAnual: /** @type {number} */ (PLANOS.anual.precoAnual) });
  const porUsuarioAno = usuarios ? r.porAno / usuarios : 0;
  const paraMilhao = porUsuarioAno ? Math.ceil(100_000_000 / porUsuarioAno) : 0;
  $('#s-resultado').innerHTML = `
    <div class="numero"><span>Assinantes</span><b>${r.assinantes.toLocaleString('pt-BR')}</b></div>
    <div class="numero"><span>Receita por mês</span><b>${reaisInteiros(r.porMes)}</b></div>
    <div class="numero principal"><span>Receita por ano</span><b>${reaisInteiros(r.porAno)}</b></div>
    <p class="meta-milhao">${paraMilhao ? `Para chegar a R$ 1 milhão por ano com essa taxa de assinatura, são necessários cerca de <b>${paraMilhao.toLocaleString('pt-BR')}</b> usuários ativos por mês.` : ''} Valores antes de impostos e taxas de pagamento.</p>`;
}

/* ------------------------------------------------------------------ */
/* eventos da página                                                   */
/* ------------------------------------------------------------------ */

document.addEventListener('click', (ev) => {
  const alvo = /** @type {HTMLElement} */ (ev.target).closest('button, a');
  if (!(alvo instanceof HTMLElement)) return;
  const d = alvo.dataset;

  if (d.compartilhar) { rastrear('compartilhar', { vaga: d.compartilhar }); return; }
  if (d.aba) {
    ev.preventDefault();
    for (const id of ['detalhe', 'checkout', 'aviso']) { const dlg = /** @type {HTMLDialogElement} */ ($(`#${id}`)); if (dlg.open) dlg.close(); }
    irPara(d.aba);
  } else if (d.abrir) abrirVaga(d.abrir);
  else if (d.salvar) {
    alternarSalva(d.salvar);
    if (/** @type {HTMLDialogElement} */ ($('#detalhe')).open) desenharDetalhe();
    desenharVagas();
  } else if (d.sub) { estado.subAba = d.sub; desenharDetalhe(); }
  else if (d.gerar) gerar(/** @type {Recurso} */ (d.gerar));
  else if ('copiar' in d) copiar();
  else if ('criarAlerta' in d) abrirAlerta();
  else if (d.removerAlerta) {
    estado.alertas = estado.alertas.filter((a) => a.id !== d.removerAlerta);
    gravar('alertas', estado.alertas);
    desenharCandidaturas();
    toast('Alerta removido.');
  }
  else if (d.fechar) /** @type {HTMLDialogElement} */ ($(`#${d.fechar}`)).close();
  else if (d.assinar) abrirCheckout(d.assinar);
  else if (d.ciclo) {
    estado.ciclo = /** @type {'mensal' | 'anual'} */ (d.ciclo);
    if (/** @type {HTMLDialogElement} */ ($('#checkout')).open) abrirCheckout('troca-ciclo');
    if (!$('#tela-planos').hidden) desenharPlanos();
  } else if ('confirmarAssinatura' in d) confirmarAssinatura();
  else if ('planoGratis' in d) {
    estado.plano = 'gratis';
    salvarTudo(); atualizarPilula(); desenharPlanos();
    toast('Você voltou ao plano grátis');
  } else if (d.tirar) {
    estado.candidaturas = remover(estado.candidaturas, d.tirar);
    salvarTudo(); atualizarContador(); desenharCandidaturas();
  } else if (d.removerExp) {
    const lista = lerExperiencias().filter((_, i) => i !== Number(d.removerExp));
    $('#lista-exp').innerHTML = lista.map(linhaExp).join('');
  } else if (d.atalho) {
    $in('#q-cargo').value = d.atalho;
    estado.quiz.cargo = d.atalho;
    avancarQuiz();
  } else if (d.habilidade) {
    const h = estado.quiz.habilidades;
    if (h.has(d.habilidade)) h.delete(d.habilidade); else h.add(d.habilidade);
    alvo.setAttribute('aria-pressed', String(h.has(d.habilidade)));
  } else if ('rolarLista' in d) {
    $('.barra-filtros').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if ('limparBusca' in d) {
    $in('#f-texto').value = '';
    desenharVagas();
  }
});

document.addEventListener('change', (ev) => {
  const el = /** @type {HTMLSelectElement} */ (ev.target);
  if (el.dataset?.mover) {
    estado.candidaturas = moverPara(estado.candidaturas, el.dataset.mover, /** @type {any} */ (el.value));
    salvarTudo();
    desenharCandidaturas();
    if (el.value === 'contratado') toast('Parabéns pelo emprego! 🎉');
  }
});

/** @type {ReturnType<typeof setTimeout> | undefined} */
let timerBusca;
$in('#f-texto').addEventListener('input', () => {
  atualizarSugestoes();
  clearTimeout(timerBusca);
  timerBusca = setTimeout(() => {
    desenharVagas();
    if ($in('#f-texto').value.trim()) rastrear('buscar', { termo: $in('#f-texto').value.trim().slice(0, 40) });
  }, 180);
});
$('#form-busca').addEventListener('submit', (ev) => {
  ev.preventDefault();
  $in('#f-texto').blur();
  if (estado.fonte === 'ao-vivo') buscarNoServidor();
  else desenharVagas();
  $('.barra-filtros').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
for (const id of ['#f-uf', '#f-ordem', '#f-perto', '#f-remoto', '#f-clt', '#f-50', '#f-novas', '#f-golpe']) {
  $(id).addEventListener('change', () => { desenharVagas(); rastrear('filtro', { qual: id.slice(3) }); });
}

$in('#q-cargo').addEventListener('input', atualizarSugestoes);
$in('#q-cargo').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); avancarQuiz(); } });
$('#q-avancar').addEventListener('click', avancarQuiz);
$('#q-voltar').addEventListener('click', () => { estado.quiz.passo = Math.max(1, estado.quiz.passo - 1); desenharQuiz(); });

$('#btn-add-exp').addEventListener('click', () => {
  const lista = [...lerExperiencias(), { cargo: '', empresa: '', periodo: '', descricao: '' }];
  $('#lista-exp').innerHTML = lista.map(linhaExp).join('');
  $in(`#e-cargo-${lista.length - 1}`).focus();
});
$('#btn-limpar').addEventListener('click', () => {
  estado.perfil = perfilVazio();
  desenharPerfil();
  $in('#p-nome').focus();
});
$('#form-perfil').addEventListener('input', () => desenharMedidor(lerPerfil()));
$('#form-perfil').addEventListener('submit', (ev) => {
  ev.preventDefault();
  estado.perfil = lerPerfil();
  estado.perfilDeExemplo = false;
  estado.quiz.concluido = false;
  estado.gerados.clear();
  salvarTudo();
  toast('Perfil salvo. As notas foram recalculadas.');
  irPara('vagas');
});

$('#btn-letra').addEventListener('click', () => {
  estado.letraGrande = !estado.letraGrande;
  aplicarLetra();
  salvarTudo();
});
for (const id of ['#s-usuarios', '#s-conv', '#s-anual']) $(id).addEventListener('input', desenharSimulador);

/* ------------------------------------------------------------------ */
/* início                                                              */
/* ------------------------------------------------------------------ */

/** Tenta vagas reais do servidor; sem servidor (arquivo único), fica no exemplo. */
async function carregarVagas() {
  if (!COM_SERVIDOR) return;
  try {
    const resp = await fetch('/api/vagas');
    if (!resp.ok) return;
    const dados = await resp.json();
    if (!Array.isArray(dados.vagas) || dados.vagas.length === 0) return;
    estado.vagas = dados.vagas;
    estado.fonte = dados.fonte;
    estado.medianas = medianasPorArea(estado.vagas);
    if (dados.fonte === 'ao-vivo') {
      const nomes = (dados.fontes ?? []).filter((/** @type {any} */ f) => f.ok).map((/** @type {any} */ f) => f.nome).join(', ');
      $('#rodape-fonte').textContent = `Vagas reais via ${nomes || 'agregadores'}. Confira sempre no site da empresa antes de se candidatar.`;
    }
    desenharVagas();
    atualizarSugestoes();
  } catch {
    // sem servidor: segue com as vagas de exemplo
  }
}

$('#btn-instalar').addEventListener('click', instalar);
$('#link-instalar').addEventListener('click', instalar);

// trocar entre celular e computador: o detalhe muda de lugar
telaLarga.addEventListener('change', () => {
  const d = /** @type {HTMLDialogElement} */ ($('#detalhe'));
  if (telaLarga.matches && d.open) d.close();
  if (!$('#tela-vagas').hidden) desenharVagas();
});

if (COM_SERVIDOR && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}

preencherSelects();
mostrarBotoesInstalar();
aplicarLetra();
atualizarPilula();
atualizarContador();
atualizarSugestoes();
desenharQuiz();
rastrear('visita');
const abaInicial = location.hash.slice(1) === 'pro' ? 'planos' : location.hash.slice(1);
irPara(ABAS.includes(abaInicial) ? abaInicial : 'vagas');
carregarVagas();
