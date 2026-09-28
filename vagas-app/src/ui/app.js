/**
 * Controlador da interface.
 *
 * Nenhuma regra de negócio mora aqui: nota de chance, golpe, currículo,
 * planos e candidaturas vêm de src/core/. A UI só lê o estado, chama o núcleo
 * e desenha.
 */

import { vagasDeExemplo } from '../core/exemplos.js';
import { buscar } from '../core/busca.js';
import { gerarCurriculo, gerarCarta, prepararEntrevista } from '../core/curriculo.js';
import { PLANOS, DIAS_GARANTIA, podeUsar, registrarUso, restantes } from '../core/planos.js';
import { ETAPAS, moverPara, remover, precisamDeRetorno } from '../core/candidaturas.js';
import { ESCOLARIDADES, NOME_ESCOLARIDADE, perfilVazio } from '../core/tipos.js';
import { formatarSalario, formatarReais } from '../core/text.js';
import { ler, gravar } from './loja.js';

/** @typedef {import('../core/tipos.js').Vaga} Vaga */
/** @typedef {import('../core/tipos.js').Perfil} Perfil */
/** @typedef {import('../core/planos.js').Recurso} Recurso */

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const AREAS = ['Administrativo', 'Alimentação', 'Atendimento', 'Construção Civil', 'Educação', 'Finanças', 'Indústria',
  'Limpeza e Conservação', 'Logística', 'Manutenção', 'Marketing', 'Recursos Humanos', 'Saúde', 'Segurança e Portaria',
  'Tecnologia', 'Varejo', 'Vendas'];
const MODALIDADE = { presencial: 'Presencial', remoto: 'Remoto', hibrido: 'Híbrido' };

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

const estado = {
  /** @type {Vaga[]} */ vagas: vagasDeExemplo(),
  fonte: 'exemplo',
  /** @type {Perfil} */ perfil: ler('perfil', perfilExemplo()),
  perfilDeExemplo: ler('perfilDeExemplo', true),
  /** @type {import('../core/planos.js').IdPlano} */ plano: ler('plano', 'gratis'),
  /** @type {import('../core/planos.js').Uso} */ uso: ler('uso', {}),
  /** @type {import('../core/candidaturas.js').Candidatura[]} */ candidaturas: ler('candidaturas', []),
  letraGrande: ler('letraGrande', false),
  /** textos já gerados nesta sessão: reabrir não gasta cota de novo */
  /** @type {Map<string, string>} */ gerados: new Map(),
  /** @type {string | null} */ vagaAberta: null,
  subAba: 'chance',
};

const $ = (/** @type {string} */ s) => /** @type {HTMLElement} */ (document.querySelector(s));
const $in = (/** @type {string} */ s) => /** @type {HTMLInputElement} */ (document.querySelector(s));

/** @param {unknown} t */
function esc(t) {
  return String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}

/** @param {string} dataIso */
function haQuantoTempo(dataIso) {
  const dias = Math.round((Date.now() - new Date(`${dataIso}T12:00:00`).getTime()) / 86_400_000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  return `há ${dias} dias`;
}

/** @type {number | undefined} */
let timerToast;
/** @param {string} msg */
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(timerToast);
  timerToast = setTimeout(() => { el.hidden = true; }, 2600);
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
/* navegação                                                           */
/* ------------------------------------------------------------------ */

/** @param {string} aba */
function irPara(aba) {
  for (const b of document.querySelectorAll('.abas .aba')) {
    const ativa = /** @type {HTMLElement} */ (b).dataset.aba === aba;
    if (ativa) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  for (const t of document.querySelectorAll('.tela')) /** @type {HTMLElement} */ (t).hidden = t.id !== `tela-${aba}`;
  if (aba === 'perfil') desenharPerfil();
  if (aba === 'candidaturas') desenharCandidaturas();
  if (aba === 'planos') desenharPlanos();
  if (aba === 'vagas') desenharVagas();
  window.scrollTo({ top: 0 });
}

/* ------------------------------------------------------------------ */
/* vagas                                                               */
/* ------------------------------------------------------------------ */

function lerFiltros() {
  const modalidades = /** @type {import('../core/tipos.js').Modalidade[]} */ (
    ['presencial', 'hibrido', 'remoto'].filter((m) => $in(`#f-${m}`).checked));
  const contrato = $in('#f-contrato').value;
  return {
    texto: $in('#f-texto').value,
    uf: $in('#f-uf').value,
    contratos: contrato ? [contrato] : [],
    modalidades,
    ordenar: /** @type {'chance' | 'recentes' | 'salario'} */ ($in('#f-ordem').value),
    so50mais: $in('#f-50').checked,
    diasMax: $in('#f-recentes').checked ? 3 : 0,
    esconderSuspeitas: $in('#f-golpe').checked,
  };
}

/** @param {import('../core/match.js').Resultado | null} chance @param {boolean} suspeita */
function carimbo(chance, suspeita) {
  if (suspeita) return '<div class="carimbo golpe" aria-label="Vaga suspeita"><span class="carimbo-num">ALERTA</span><span class="carimbo-rot">golpe?</span></div>';
  if (!chance) return '';
  return `<div class="carimbo ${chance.faixa}" aria-label="Chance ${chance.nota} de 100">
    <span class="carimbo-num">${chance.nota}</span><span class="carimbo-rot">chance</span></div>`;
}

function desenharVagas() {
  $('#aviso-exemplo').hidden = !estado.perfilDeExemplo;
  const itens = buscar(estado.vagas, lerFiltros(), estado.perfil);
  const altas = itens.filter((i) => i.chance?.faixa === 'alta').length;
  const suspeitas = itens.filter((i) => i.alertas.some((a) => a.nivel === 'grave')).length;

  $('#resumo-busca').innerHTML = itens.length
    ? `<strong>${itens.length}</strong> vagas · <strong>${altas}</strong> com chance alta para você${suspeitas ? ` · <strong>${suspeitas}</strong> com sinal de golpe` : ''}`
    : 'Nenhuma vaga com esses filtros. Tente tirar algum filtro ou buscar outra palavra.';

  const salvas = new Set(estado.candidaturas.map((c) => c.vagaId));
  $('#lista-vagas').innerHTML = itens.map(({ vaga: v, chance, alertas }) => {
    const suspeita = alertas.some((a) => a.nivel === 'grave');
    const destaque = suspeita
      ? `<div class="alerta grave"><strong>Cuidado: sinais de golpe.</strong> ${esc(alertas[0].motivo)}</div>`
      : chance?.faltando[0] && chance.faixa !== 'alta'
        ? `<p class="vaga-motivo falta">→ ${esc(chance.faltando[0])}</p>`
        : chance?.motivos[0] ? `<p class="vaga-motivo">✓ ${esc(chance.motivos[0])}</p>` : '';
    return `<li class="vaga${suspeita ? ' suspeita' : ''}">
      ${carimbo(chance, suspeita)}
      <div class="vaga-info">
        <h3 class="vaga-titulo">${esc(v.titulo)}</h3>
        <p class="vaga-meta"><span>${esc(v.empresa)}</span><span>${esc(v.modalidade === 'remoto' ? 'Remoto' : `${v.cidade}/${v.uf}`)}</span><span>${esc(v.contrato)}</span><span>${haQuantoTempo(v.publicadaEm)}</span></p>
        <p class="vaga-salario">${esc(formatarSalario(v.salarioMin, v.salarioMax))}</p>
        <div class="etiquetas">
          <span class="etiqueta">${MODALIDADE[v.modalidade]}</span>
          ${v.valorizaExperiencia ? '<span class="etiqueta ok">Valoriza 50+</span>' : ''}
          ${v.exigeCnh ? '<span class="etiqueta">Exige CNH</span>' : ''}
        </div>
        ${destaque}
        <div class="vaga-acoes">
          <button type="button" class="botao" data-abrir="${esc(v.id)}">Ver chance e currículo</button>
          <button type="button" class="botao-leve" data-salvar="${esc(v.id)}" ${salvas.has(v.id) ? 'disabled' : ''}>${salvas.has(v.id) ? 'Salva ✓' : 'Salvar'}</button>
        </div>
      </div>
    </li>`;
  }).join('');
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
  desenharDetalhe();
  const d = /** @type {HTMLDialogElement} */ ($('#detalhe'));
  if (!d.open) d.showModal();
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

  const abas = Object.entries(SUB_ABAS).map(([id, a]) =>
    `<button type="button" class="aba" data-sub="${id}" ${estado.subAba === id ? 'aria-current="page"' : ''}>${a.rotulo}</button>`).join('');

  $('#detalhe-corpo').innerHTML = `
    <div class="detalhe-topo">
      ${carimbo(chance, suspeita)}
      <div class="vaga-info">
        <h2 id="d-titulo">${esc(v.titulo)}</h2>
        <p class="vaga-meta"><span>${esc(v.empresa)}</span><span>${esc(v.modalidade === 'remoto' ? 'Remoto' : `${v.cidade}/${v.uf}`)}</span><span>${esc(v.fonte)}</span></p>
      </div>
      <button type="button" class="fechar" data-fechar aria-label="Fechar">✕</button>
    </div>
    ${alertas.length ? `<div class="alerta ${suspeita ? 'grave' : 'atencao'}"><strong>${suspeita ? 'Cuidado: esta vaga tem sinais de golpe.' : 'Atenção a estes pontos:'}</strong>
      <ul>${alertas.map((a) => `<li>${esc(a.motivo)}</li>`).join('')}</ul>
      ${suspeita ? '<span>Nunca pague para se candidatar e nunca envie senha ou dados bancários.</span>' : ''}</div>` : ''}
    <div class="sub-abas" role="tablist">${abas}</div>
    <div id="sub-conteudo">${conteudoSubAba(v, chance)}</div>`;
}

/**
 * @param {Vaga} v
 * @param {import('../core/match.js').Resultado | null} chance
 */
function conteudoSubAba(v, chance) {
  if (estado.subAba === 'chance') {
    return `<div class="bloco">
      ${chance ? `
        ${chance.motivos.length ? `<h3>A seu favor</h3><ul class="lista-simples bons">${chance.motivos.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
        ${chance.faltando.length ? `<h3>O que melhorar</h3><ul class="lista-simples faltas">${chance.faltando.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}` : ''}
      <dl class="dados">
        <div><dt>Salário</dt><dd>${esc(formatarSalario(v.salarioMin, v.salarioMax))}</dd></div>
        <div><dt>Contrato</dt><dd>${esc(v.contrato)}</dd></div>
        <div><dt>Modalidade</dt><dd>${MODALIDADE[v.modalidade]}</dd></div>
        <div><dt>Experiência</dt><dd>${v.experienciaMin ? `${v.experienciaMin} ano(s)` : 'Não exige'}</dd></div>
        <div><dt>Escolaridade</dt><dd>${NOME_ESCOLARIDADE[v.escolaridadeMin]}</dd></div>
        <div><dt>Publicada</dt><dd>${haQuantoTempo(v.publicadaEm)}</dd></div>
      </dl>
      <p>${esc(v.descricao)}</p>
      ${v.requisitos.length ? `<p><strong>Requisitos:</strong> ${esc(v.requisitos.join(', '))}</p>` : ''}
      ${v.diferenciais.length ? `<p><strong>Diferenciais:</strong> ${esc(v.diferenciais.join(', '))}</p>` : ''}
      ${v.beneficios.length ? `<p><strong>Benefícios:</strong> ${esc(v.beneficios.join(', '))}</p>` : ''}
      <div class="vaga-acoes">
        ${v.url ? `<a class="botao" href="${esc(v.url)}" target="_blank" rel="noopener">Candidatar-se no site da vaga</a>` : ''}
        <button type="button" class="botao-leve" data-salvar="${esc(v.id)}">Salvar em candidaturas</button>
      </div>
    </div>`;
  }

  const recurso = /** @type {Recurso} */ (SUB_ABAS[estado.subAba].recurso);
  const chave = `${recurso}:${v.id}`;
  const pronto = estado.gerados.get(chave);
  const nomes = { curriculo: 'currículo adaptado', carta: 'carta de apresentação', entrevista: 'preparação para entrevista' };
  const nome = nomes[/** @type {'curriculo' | 'carta' | 'entrevista'} */ (recurso)];

  if (!pronto) {
    if (!podeUsar(estado.plano, recurso, estado.uso)) {
      return `<div class="paywall">
        <h3>Você já usou o ${nome} grátis de hoje</h3>
        <p>Amanhã tem mais um. Ou libere ilimitado com o Pro por ${formatarReais(PLANOS.pro.precoMensal)}/mês, com ${DIAS_GARANTIA} dias de garantia.</p>
        <button type="button" class="botao" data-assinar>Conhecer o Pro</button>
      </div>`;
    }
    const resta = restantes(estado.plano, recurso, estado.uso);
    return `<div class="bloco">
      <p>Vamos montar ${recurso === 'entrevista' ? 'as perguntas mais prováveis desta entrevista, com dicas de resposta' : `seu ${nome} para esta vaga, usando só o que está no seu perfil`}.</p>
      <p class="cota">${resta === Infinity ? 'Plano Pro: ilimitado.' : `Grátis: resta ${resta} hoje.`}</p>
      <button type="button" class="botao" data-gerar="${recurso}">Gerar ${nome}</button>
    </div>`;
  }

  if (recurso === 'entrevista') {
    const perguntas = /** @type {import('../core/curriculo.js').Pergunta[]} */ (JSON.parse(pronto));
    return `<ol class="perguntas">${perguntas.map((p) => `<li><strong>${esc(p.pergunta)}</strong><span class="dica">${esc(p.dica)}</span></li>`).join('')}</ol>`;
  }
  return `<div class="bloco">
    <pre class="texto-gerado" id="texto-gerado">${esc(pronto)}</pre>
    <div class="vaga-acoes"><button type="button" class="botao" data-copiar>Copiar texto</button></div>
  </div>`;
}

/** @param {Recurso} recurso */
function gerar(recurso) {
  const v = estado.vagaAberta ? vagaPorId(estado.vagaAberta) : null;
  if (!v || !podeUsar(estado.plano, recurso, estado.uso)) return;
  const texto = recurso === 'curriculo' ? gerarCurriculo(estado.perfil, v)
    : recurso === 'carta' ? gerarCarta(estado.perfil, v)
      : JSON.stringify(prepararEntrevista(estado.perfil, v));
  estado.gerados.set(`${recurso}:${v.id}`, texto);
  estado.uso = registrarUso(recurso, estado.uso);
  salvarTudo();
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
function salvarVaga(id) {
  if (!estado.candidaturas.some((c) => c.vagaId === id)) {
    estado.candidaturas = moverPara(estado.candidaturas, id, 'salva');
    salvarTudo();
    toast('Vaga salva em Candidaturas');
  }
  atualizarContador();
  desenharVagas();
}

/* ------------------------------------------------------------------ */
/* perfil                                                              */
/* ------------------------------------------------------------------ */

function preencherSelects() {
  $('#f-uf').insertAdjacentHTML('beforeend', UFS.map((u) => `<option>${u}</option>`).join(''));
  $('#p-uf').innerHTML = `<option value="">Selecione</option>${UFS.map((u) => `<option>${u}</option>`).join('')}`;
  $('#p-area').innerHTML = `<option value="">Selecione</option>${AREAS.map((a) => `<option>${a}</option>`).join('')}`;
  $('#p-esc').innerHTML = ESCOLARIDADES.map((e) => `<option value="${e}">${NOME_ESCOLARIDADE[e]}</option>`).join('');
}

/** @param {import('../core/tipos.js').Experiencia} e @param {number} i */
function linhaExp(e, i) {
  return `<li class="exp" data-i="${i}">
    <div class="campo"><label for="e-cargo-${i}">Cargo</label><input id="e-cargo-${i}" data-c="cargo" value="${esc(e.cargo)}" /></div>
    <div class="campo"><label for="e-emp-${i}">Empresa</label><input id="e-emp-${i}" data-c="empresa" value="${esc(e.empresa)}" /></div>
    <div class="campo"><label for="e-per-${i}">Período</label><input id="e-per-${i}" data-c="periodo" value="${esc(e.periodo)}" placeholder="2015 – 2023" /></div>
    <button type="button" class="botao-leve" data-remover-exp="${i}" aria-label="Remover experiência">Remover</button>
    <div class="campo campo-desc"><label for="e-desc-${i}">O que você fazia</label><input id="e-desc-${i}" data-c="descricao" value="${esc(e.descricao)}" /></div>
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
}

/** @returns {import('../core/tipos.js').Experiencia[]} */
function lerExperiencias() {
  return [...document.querySelectorAll('#lista-exp .exp')].map((li) => {
    const campo = (/** @type {string} */ c) => /** @type {HTMLInputElement} */ (li.querySelector(`[data-c="${c}"]`)).value.trim();
    return { cargo: campo('cargo'), empresa: campo('empresa'), periodo: campo('periodo'), descricao: campo('descricao') };
  });
}

function lerPerfil() {
  /** @type {Perfil} */
  const p = {
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
  return p;
}

/* ------------------------------------------------------------------ */
/* candidaturas                                                        */
/* ------------------------------------------------------------------ */

function atualizarContador() {
  $('#cont-cand').textContent = String(estado.candidaturas.length);
}

function desenharCandidaturas() {
  const cobrar = precisamDeRetorno(estado.candidaturas);
  $('#alerta-retorno').innerHTML = cobrar.length
    ? `<div class="alerta atencao"><strong>${cobrar.length} candidatura(s) sem resposta há mais de 7 dias.</strong> Mande uma mensagem educada perguntando como está o processo.</div>`
    : '';

  if (estado.candidaturas.length === 0) {
    $('#quadro').innerHTML = '<p class="vazio">Nenhuma vaga salva ainda. Na aba Vagas, toque em “Salvar” nas que interessarem.</p>';
    return;
  }

  $('#quadro').innerHTML = ETAPAS.map((etapa) => {
    const cards = estado.candidaturas.filter((c) => c.etapa === etapa.id).map((c) => {
      const v = vagaPorId(c.vagaId);
      if (!v) return '';
      return `<div class="cartao-cand">
        <strong>${esc(v.titulo)}</strong>
        <span class="coluna-dica">${esc(v.empresa)} · atualizada ${haQuantoTempo(c.atualizadaEm)}</span>
        <label class="coluna-dica" for="mv-${esc(v.id)}">Mover para</label>
        <select id="mv-${esc(v.id)}" data-mover="${esc(v.id)}">${ETAPAS.map((e) => `<option value="${e.id}" ${e.id === c.etapa ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}</select>
        <div class="vaga-acoes">
          <button type="button" class="botao-leve" data-abrir="${esc(v.id)}">Abrir</button>
          <button type="button" class="botao-leve" data-tirar="${esc(v.id)}">Tirar</button>
        </div>
      </div>`;
    }).join('');
    return `<section class="coluna">
      <div class="coluna-topo"><h3>${esc(etapa.nome)}</h3><span class="contador">${estado.candidaturas.filter((c) => c.etapa === etapa.id).length}</span></div>
      <p class="coluna-dica">${esc(etapa.proximo)}</p>
      ${cards || '<p class="vazio">—</p>'}
    </section>`;
  }).join('');
}

/* ------------------------------------------------------------------ */
/* planos                                                              */
/* ------------------------------------------------------------------ */

function desenharPlanos() {
  $('#planos').innerHTML = Object.values(PLANOS).map((p) => {
    const atual = estado.plano === p.id;
    return `<article class="plano ${p.id === 'pro' ? 'destaque' : ''}">
      <h2>${esc(p.nome)}</h2>
      <p class="preco">${p.precoMensal ? `${formatarReais(p.precoMensal)} <small>/mês</small>` : 'R$ 0'}</p>
      <ul class="lista-simples bons">${p.inclui.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
      ${p.id === 'pro' ? `<p class="cota">Cancele quando quiser. ${DIAS_GARANTIA} dias de garantia: não gostou, devolvemos tudo.</p>` : ''}
      ${atual ? '<button type="button" class="botao-leve" disabled>Seu plano atual</button>'
        : `<button type="button" class="botao" data-plano="${p.id}">${p.id === 'pro' ? 'Assinar o Pro (simulação)' : 'Voltar ao grátis'}</button>`}
    </article>`;
  }).join('');
}

function atualizarPilula() {
  const el = $('#pilula-plano');
  el.textContent = `Plano ${PLANOS[estado.plano].nome}`;
  el.classList.toggle('pro', estado.plano === 'pro');
}

function aplicarLetra() {
  document.documentElement.classList.toggle('letra-grande', estado.letraGrande);
  $('#btn-letra').setAttribute('aria-pressed', String(estado.letraGrande));
}

/* ------------------------------------------------------------------ */
/* eventos                                                             */
/* ------------------------------------------------------------------ */

document.addEventListener('click', (ev) => {
  const alvo = /** @type {HTMLElement} */ (ev.target).closest('button, [data-ir]');
  if (!(alvo instanceof HTMLElement)) return;
  const d = alvo.dataset;

  if (d.aba) irPara(d.aba);
  else if (d.ir) irPara(d.ir);
  else if (d.abrir) abrirVaga(d.abrir);
  else if (d.salvar) { salvarVaga(d.salvar); if (estado.vagaAberta) desenharDetalhe(); }
  else if (d.sub) { estado.subAba = d.sub; desenharDetalhe(); }
  else if (d.gerar) gerar(/** @type {Recurso} */ (d.gerar));
  else if ('copiar' in d) copiar();
  else if ('fechar' in d) /** @type {HTMLDialogElement} */ ($('#detalhe')).close();
  else if ('assinar' in d) { /** @type {HTMLDialogElement} */ ($('#detalhe')).close(); irPara('planos'); }
  else if (d.plano) {
    estado.plano = /** @type {any} */ (d.plano);
    salvarTudo();
    atualizarPilula();
    desenharPlanos();
    toast(estado.plano === 'pro' ? 'Pro ativado (simulação)' : 'Você voltou ao plano grátis');
  } else if (d.tirar) {
    estado.candidaturas = remover(estado.candidaturas, d.tirar);
    salvarTudo(); atualizarContador(); desenharCandidaturas();
  } else if (d.removerExp) {
    estado.perfil = { ...estado.perfil, experiencias: lerExperiencias().filter((_, i) => i !== Number(d.removerExp)) };
    $('#lista-exp').innerHTML = estado.perfil.experiencias.map(linhaExp).join('');
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

$('#form-filtros').addEventListener('input', desenharVagas);
$('#form-filtros').addEventListener('submit', (ev) => ev.preventDefault());

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

$('#form-perfil').addEventListener('submit', (ev) => {
  ev.preventDefault();
  estado.perfil = lerPerfil();
  estado.perfilDeExemplo = false;
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

/* ------------------------------------------------------------------ */
/* início                                                              */
/* ------------------------------------------------------------------ */

/** Tenta vagas reais do servidor; sem servidor (arquivo único), fica no exemplo. */
async function carregarVagas() {
  if (!/^https?:$/.test(location.protocol) || !location.pathname.includes('/src/ui/')) return;
  try {
    const resp = await fetch('/api/vagas');
    if (!resp.ok) return;
    const dados = await resp.json();
    if (Array.isArray(dados.vagas) && dados.vagas.length) {
      estado.vagas = dados.vagas;
      estado.fonte = dados.fonte;
      $('#rodape-fonte').textContent = dados.fonte === 'adzuna'
        ? 'Vagas reais via Adzuna. Confira sempre no site da empresa antes de se candidatar.'
        : 'Vagas de exemplo fictícias, para demonstração.';
      desenharVagas();
    }
  } catch {
    // sem servidor: segue com as vagas de exemplo
  }
}

preencherSelects();
aplicarLetra();
atualizarPilula();
atualizarContador();
desenharVagas();
carregarVagas();
