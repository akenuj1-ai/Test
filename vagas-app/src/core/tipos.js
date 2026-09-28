/**
 * Formatos de dados compartilhados. Só JSDoc — nenhum código roda aqui.
 *
 * Toda fonte de vagas (exemplo, Adzuna, parceiros futuros) converte para
 * `Vaga`. O resto do app não sabe de onde a vaga veio.
 *
 * @typedef {'fundamental' | 'medio' | 'tecnico' | 'superior' | 'pos'} Escolaridade
 * @typedef {'presencial' | 'remoto' | 'hibrido'} Modalidade
 *
 * @typedef {Object} Vaga
 * @property {string} id
 * @property {string} titulo
 * @property {string} empresa
 * @property {string} cidade
 * @property {string} uf            sigla do estado; "BR" para vaga 100% remota sem sede
 * @property {Modalidade} modalidade
 * @property {string} contrato      CLT, PJ, Temporário, Estágio, Jovem Aprendiz
 * @property {number | null} salarioMin  centavos por mês
 * @property {number | null} salarioMax  centavos por mês
 * @property {string} area
 * @property {string[]} requisitos
 * @property {string[]} diferenciais
 * @property {Escolaridade} escolaridadeMin
 * @property {number} experienciaMin anos
 * @property {string[]} beneficios
 * @property {string} descricao
 * @property {string} publicadaEm   data ISO (AAAA-MM-DD)
 * @property {string} fonte
 * @property {string} url
 * @property {boolean} valorizaExperiencia  empresa sinaliza que acolhe profissionais 50+
 * @property {boolean} exigeCnh
 * @property {string} [contato]     como a vaga pede para ser contatada, quando informado
 *
 * @typedef {Object} Experiencia
 * @property {string} cargo
 * @property {string} empresa
 * @property {string} periodo       texto livre, ex.: "2015 – 2023"
 * @property {string} descricao
 *
 * @typedef {Object} Perfil
 * @property {string} nome
 * @property {string} cidade
 * @property {string} uf
 * @property {string} cargoDesejado
 * @property {string} area
 * @property {number} anosExperiencia
 * @property {string[]} habilidades
 * @property {Escolaridade} escolaridade
 * @property {'sim' | 'nao' | 'tanto-faz'} aceitaRemoto
 * @property {number} salarioMin    centavos; 0 = sem mínimo
 * @property {boolean} temCnh
 * @property {string} telefone
 * @property {string} email
 * @property {string} resumo
 * @property {Experiencia[]} experiencias
 */

export const ESCOLARIDADES = /** @type {const} */ (['fundamental', 'medio', 'tecnico', 'superior', 'pos']);

/** @type {Record<Escolaridade, string>} */
export const NOME_ESCOLARIDADE = {
  fundamental: 'Ensino fundamental',
  medio: 'Ensino médio',
  tecnico: 'Curso técnico',
  superior: 'Ensino superior',
  pos: 'Pós-graduação',
};

/**
 * Perfil vazio, ponto de partida do cadastro.
 * @returns {Perfil}
 */
export function perfilVazio() {
  return {
    nome: '', cidade: '', uf: '', cargoDesejado: '', area: '', anosExperiencia: 0,
    habilidades: [], escolaridade: 'medio', aceitaRemoto: 'tanto-faz', salarioMin: 0,
    temCnh: false, telefone: '', email: '', resumo: '', experiencias: [],
  };
}
