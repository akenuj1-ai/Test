import { perfilVazio } from '../src/core/tipos.js';

/** Data fixa: os testes não podem depender do relógio. */
export const HOJE = new Date('2026-09-28T12:00:00Z');

/**
 * Perfil de um motorista de 56 anos em São Paulo — o caso que motivou o app.
 * @param {Partial<import('../src/core/tipos.js').Perfil>} [extra]
 */
export function motorista(extra = {}) {
  return {
    ...perfilVazio(),
    nome: 'José da Silva', cidade: 'São Paulo', uf: 'SP', cargoDesejado: 'Motorista', area: 'Logística',
    anosExperiencia: 25, habilidades: ['direção defensiva', 'conhecer a cidade', 'atendimento ao cliente'],
    escolaridade: 'medio', aceitaRemoto: 'nao', salarioMin: 250000, temCnh: true,
    telefone: '(11) 90000-0000', email: 'jose@exemplo.com',
    experiencias: [{ cargo: 'Motorista de entregas', empresa: 'Transportadora X', periodo: '2001 – 2025', descricao: 'Entregas na Grande SP.' }],
    ...extra,
  };
}
