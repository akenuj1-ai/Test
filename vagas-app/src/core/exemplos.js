/**
 * Vagas de exemplo para o protótipo funcionar sem internet e sem chave de API.
 *
 * TODAS AS EMPRESAS E VAGAS DAQUI SÃO FICTÍCIAS. Servem para demonstrar a
 * busca, o cálculo de chance e o detector de golpe. Em produção, as vagas vêm
 * de src/sources/ (ex.: Adzuna), convertidas para o mesmo formato.
 *
 * As datas são guardadas como "dias atrás" e convertidas na hora, para o
 * filtro "publicadas recentemente" continuar fazendo sentido no futuro.
 */

/** @typedef {import('./tipos.js').Vaga} Vaga */

const R = (reais) => reais * 100;

/**
 * [id, titulo, empresa, cidade, uf, modalidade, contrato, salMin, salMax, area,
 *  requisitos, diferenciais, escolaridade, expMin, beneficios, descricao,
 *  diasAtras, valorizaExperiencia, exigeCnh, contato?]
 * @type {any[][]}
 */
const BRUTAS = [
  ['v01', 'Motorista Entregador', 'Rota Sul Logística', 'São Paulo', 'SP', 'presencial', 'CLT', R(2600), R(3200), 'Logística',
    ['CNH categoria B', 'direção defensiva', 'conhecer a cidade'], ['aplicativos de rota', 'atendimento ao cliente'], 'fundamental', 1,
    ['Vale-refeição', 'Plano de saúde', 'Seguro de vida'], 'Entregas de pequenos volumes na zona sul com veículo da empresa. Rotas definidas pelo sistema.', 2, true, true],
  ['v02', 'Porteiro Diurno', 'Condomínio Parque das Flores', 'São Paulo', 'SP', 'presencial', 'CLT', R(2100), R(2100), 'Segurança e Portaria',
    ['controle de acesso', 'atendimento ao público', 'responsabilidade'], ['curso de porteiro', 'informática básica'], 'fundamental', 1,
    ['Vale-transporte', 'Cesta básica'], 'Escala 12x36. Controle de entrada de moradores, visitantes e entregas.', 1, true, false],
  ['v03', 'Eletricista Predial', 'Manutenção Total Serviços', 'Campinas', 'SP', 'presencial', 'CLT', R(3100), R(3800), 'Manutenção',
    ['NR-10', 'instalações elétricas', 'leitura de projeto elétrico'], ['NR-35', 'CNH categoria B'], 'tecnico', 3,
    ['Vale-refeição', 'Plano de saúde', 'Plano odontológico'], 'Manutenção preventiva e corretiva em prédios comerciais.', 4, true, false],
  ['v04', 'Vendedor Externo', 'Distribuidora Boa Mesa', 'Belo Horizonte', 'MG', 'presencial', 'CLT', R(2200), R(5500), 'Vendas',
    ['vendas', 'negociação', 'CNH categoria B'], ['carteira de clientes', 'food service'], 'medio', 2,
    ['Comissão', 'Ajuda de combustível', 'Vale-alimentação'], 'Visitas a restaurantes e mercados da região metropolitana. Salário fixo + comissão.', 3, true, true],
  ['v05', 'Auxiliar Administrativo', 'Contábil Horizonte', 'Belo Horizonte', 'MG', 'presencial', 'CLT', R(1900), R(2300), 'Administrativo',
    ['pacote office', 'excel', 'organização', 'atendimento telefônico'], ['rotinas de departamento pessoal'], 'medio', 1,
    ['Vale-transporte', 'Vale-refeição'], 'Apoio às rotinas do escritório: arquivo, planilhas, atendimento a clientes.', 6, false, false],
  ['v06', 'Desenvolvedor Front-end Pleno', 'Nuvem Clara Tecnologia', 'Remoto', 'BR', 'remoto', 'PJ', R(9000), R(13000), 'Tecnologia',
    ['javascript', 'react', 'html', 'css', 'git'], ['typescript', 'testes automatizados', 'acessibilidade'], 'superior', 3,
    ['Horário flexível', 'Auxílio home office'], 'Construção de telas do produto principal, em time pequeno e com revisão de código.', 1, false, false],
  ['v07', 'Analista de Suporte Técnico', 'Conecta Telecom', 'Recife', 'PE', 'hibrido', 'CLT', R(2800), R(3500), 'Tecnologia',
    ['suporte técnico', 'redes', 'windows', 'atendimento ao cliente'], ['linux', 'ITIL'], 'tecnico', 1,
    ['Plano de saúde', 'Vale-refeição', 'Gympass'], 'Atendimento de chamados de clientes corporativos, presencial 2x por semana.', 5, false, false],
  ['v08', 'Técnico de Enfermagem', 'Hospital Vida Plena', 'Salvador', 'BA', 'presencial', 'CLT', R(2700), R(3100), 'Saúde',
    ['COREN ativo', 'curso técnico de enfermagem', 'administração de medicamentos'], ['UTI', 'urgência e emergência'], 'tecnico', 1,
    ['Adicional de insalubridade', 'Plano de saúde', 'Refeição no local'], 'Plantões 12x36 na ala de internação.', 2, true, false],
  ['v09', 'Operador de Caixa', 'Supermercado Bom Preço Nordeste', 'Fortaleza', 'CE', 'presencial', 'CLT', R(1550), R(1700), 'Varejo',
    ['atendimento ao cliente', 'agilidade', 'operar caixa'], ['experiência com PDV'], 'medio', 0,
    ['Vale-transporte', 'Desconto em compras', 'Cesta básica'], 'Primeiro emprego bem-vindo. Treinamento pago.', 1, true, false],
  ['v10', 'Pedreiro', 'Construtora Alicerce', 'Goiânia', 'GO', 'presencial', 'CLT', R(2800), R(3400), 'Construção Civil',
    ['alvenaria', 'reboco', 'leitura de planta'], ['acabamento', 'NR-18'], 'fundamental', 3,
    ['Café da manhã', 'Almoço no canteiro', 'Vale-transporte'], 'Obra residencial de médio porte, com previsão de 14 meses.', 3, true, false],
  ['v11', 'Cozinheiro(a)', 'Restaurante Sabor da Terra', 'Rio de Janeiro', 'RJ', 'presencial', 'CLT', R(2300), R(2700), 'Alimentação',
    ['cozinha industrial', 'boas práticas de manipulação', 'preparo de refeições'], ['cozinha regional'], 'fundamental', 2,
    ['Refeição no local', 'Vale-transporte'], 'Restaurante de almoço executivo, cerca de 300 refeições por dia.', 7, true, false],
  ['v12', 'Assistente de Recursos Humanos', 'Grupo Atlântico', 'Rio de Janeiro', 'RJ', 'hibrido', 'CLT', R(3000), R(3600), 'Recursos Humanos',
    ['recrutamento e seleção', 'excel', 'departamento pessoal'], ['eSocial', 'entrevista por competências'], 'superior', 2,
    ['Plano de saúde', 'Vale-refeição', 'Participação nos lucros'], 'Apoio em processos seletivos, admissões e folha.', 4, false, false],
  ['v13', 'Mecânico de Manutenção Industrial', 'Metalúrgica Gaúcha', 'Caxias do Sul', 'RS', 'presencial', 'CLT', R(4200), R(5200), 'Manutenção',
    ['mecânica industrial', 'hidráulica', 'pneumática', 'NR-12'], ['solda', 'torno'], 'tecnico', 5,
    ['Plano de saúde', 'Refeitório', 'Transporte fretado', 'PLR'], 'Manutenção de prensas e linhas de produção. Turno A.', 2, true, false],
  ['v14', 'Atendente de Telemarketing', 'Voz Ativa Contact Center', 'Curitiba', 'PR', 'presencial', 'CLT', R(1450), R(1800), 'Atendimento',
    ['atendimento ao cliente', 'boa comunicação', 'informática básica'], ['vendas por telefone'], 'medio', 0,
    ['Vale-transporte', 'Vale-alimentação', 'Premiação por metas'], 'Jornada de 6h20. Sem experiência, com treinamento.', 1, true, false],
  ['v15', 'Analista de Dados Júnior', 'Mercado Vivo', 'Remoto', 'BR', 'remoto', 'CLT', R(5000), R(6500), 'Tecnologia',
    ['sql', 'excel', 'power bi'], ['python', 'estatística'], 'superior', 1,
    ['Plano de saúde', 'Vale-refeição', 'Auxílio home office'], 'Relatórios de vendas e indicadores para o time comercial.', 3, false, false],
  ['v16', 'Auxiliar de Limpeza', 'Brilho Serviços Terceirizados', 'Brasília', 'DF', 'presencial', 'CLT', R(1500), R(1600), 'Limpeza e Conservação',
    ['limpeza', 'organização', 'pontualidade'], ['limpeza hospitalar'], 'fundamental', 0,
    ['Vale-transporte', 'Vale-alimentação'], 'Limpeza de prédio público, segunda a sexta.', 2, true, false],
  ['v17', 'Contador', 'Escritório Contábil Planalto', 'Brasília', 'DF', 'hibrido', 'CLT', R(6000), R(8000), 'Finanças',
    ['CRC ativo', 'fechamento contábil', 'apuração de impostos', 'sped'], ['lucro real', 'IFRS'], 'superior', 5,
    ['Plano de saúde', 'Vale-refeição', 'Bônus anual'], 'Responsável por carteira de empresas do lucro presumido e real.', 8, true, false],
  ['v18', 'Motorista de Caminhão', 'Transportes Cerrado', 'Goiânia', 'GO', 'presencial', 'CLT', R(3800), R(4600), 'Logística',
    ['CNH categoria E', 'MOPP', 'direção defensiva'], ['rastreamento', 'carga e descarga'], 'fundamental', 3,
    ['Diárias de viagem', 'Plano de saúde', 'Seguro de vida'], 'Viagens regionais GO/MG/DF, retorno semanal.', 5, true, true],
  ['v19', 'Professor(a) de Matemática', 'Colégio Saber Mais', 'Recife', 'PE', 'presencial', 'CLT', R(3200), R(4200), 'Educação',
    ['licenciatura em matemática', 'didática', 'ensino fundamental II'], ['preparação para ENEM'], 'superior', 2,
    ['Bolsa de estudo para filhos', 'Vale-transporte'], 'Aulas para 8º e 9º anos no período da manhã.', 9, true, false],
  ['v20', 'Recepcionista', 'Clínica Sorriso Pleno', 'Salvador', 'BA', 'presencial', 'CLT', R(1600), R(1900), 'Atendimento',
    ['atendimento ao público', 'agendamento', 'informática básica'], ['sistemas de clínica'], 'medio', 1,
    ['Vale-transporte', 'Plano odontológico'], 'Recepção de pacientes, agenda e confirmação de consultas.', 3, true, false],
  ['v21', 'Almoxarife', 'Indústria Química Paraná', 'Curitiba', 'PR', 'presencial', 'CLT', R(2400), R(2900), 'Logística',
    ['controle de estoque', 'excel', 'recebimento de materiais'], ['empilhadeira', 'ERP'], 'medio', 2,
    ['Plano de saúde', 'Refeitório', 'Transporte fretado'], 'Controle de entrada e saída de materiais e inventários mensais.', 6, true, false],
  ['v22', 'Designer Gráfico', 'Agência Faísca', 'Remoto', 'BR', 'remoto', 'PJ', R(4000), R(6000), 'Marketing',
    ['photoshop', 'illustrator', 'identidade visual'], ['figma', 'motion design'], 'superior', 2,
    ['Horário flexível'], 'Peças para redes sociais e campanhas de clientes do varejo.', 4, false, false],
  ['v23', 'Soldador', 'Estaleiro Baía Azul', 'Niterói', 'RJ', 'presencial', 'CLT', R(3500), R(4300), 'Indústria',
    ['solda MIG', 'solda eletrodo revestido', 'leitura de desenho técnico'], ['solda TIG', 'NR-34'], 'fundamental', 3,
    ['Plano de saúde', 'Refeitório', 'Adicional de periculosidade'], 'Montagem de estruturas navais.', 2, true, false],
  ['v24', 'Cuidador(a) de Idosos', 'Lar Bem Viver', 'Porto Alegre', 'RS', 'presencial', 'CLT', R(1900), R(2200), 'Saúde',
    ['cuidados com idosos', 'paciência', 'higiene pessoal'], ['curso de cuidador', 'primeiros socorros'], 'fundamental', 1,
    ['Refeição no local', 'Vale-transporte'], 'Escala 12x36 em residencial para idosos.', 1, true, false],
  ['v25', 'Gerente de Loja', 'Calçados Passo Firme', 'São Paulo', 'SP', 'presencial', 'CLT', R(4500), R(6000), 'Varejo',
    ['gestão de equipe', 'vendas', 'metas', 'controle de estoque'], ['visual merchandising'], 'medio', 4,
    ['Comissão', 'Plano de saúde', 'Vale-refeição'], 'Loja de shopping com equipe de 8 vendedores.', 5, true, false],
  ['v26', 'Estágio em Administração', 'Cooperativa Agro Forte', 'Londrina', 'PR', 'presencial', 'Estágio', R(1200), R(1200), 'Administrativo',
    ['cursando administração', 'excel', 'boa comunicação'], ['power bi'], 'medio', 0,
    ['Bolsa-auxílio', 'Vale-transporte', 'Seguro de vida'], 'Estágio de 6h no setor financeiro.', 3, false, false],
  ['v27', 'Jardineiro', 'Verde Vivo Paisagismo', 'Florianópolis', 'SC', 'presencial', 'CLT', R(2000), R(2400), 'Manutenção',
    ['jardinagem', 'poda', 'uso de roçadeira'], ['paisagismo', 'irrigação'], 'fundamental', 1,
    ['Vale-transporte', 'Vale-alimentação'], 'Manutenção de áreas verdes de condomínios.', 4, true, false],
  ['v28', 'Assistente Financeiro', 'Rede Farma Norte', 'Manaus', 'AM', 'presencial', 'CLT', R(2500), R(3000), 'Finanças',
    ['contas a pagar', 'contas a receber', 'excel', 'conciliação bancária'], ['ERP', 'faturamento'], 'medio', 2,
    ['Plano de saúde', 'Vale-refeição'], 'Rotinas financeiras da matriz de uma rede de farmácias.', 2, true, false],
  ['v29', 'Vigilante', 'Guarda Forte Segurança', 'Fortaleza', 'CE', 'presencial', 'CLT', R(2200), R(2500), 'Segurança e Portaria',
    ['curso de vigilante', 'reciclagem em dia', 'ronda'], ['CNV'], 'medio', 1,
    ['Adicional de periculosidade', 'Vale-alimentação', 'Plano de saúde'], 'Escala 12x36 em shopping center.', 3, true, false],
  ['v30', 'Motorista de Aplicativo Corporativo', 'Executivo Transportes', 'Belo Horizonte', 'MG', 'presencial', 'CLT', R(2500), R(2900), 'Logística',
    ['CNH categoria B', 'direção defensiva', 'boa apresentação'], ['inglês básico'], 'medio', 3,
    ['Vale-refeição', 'Plano de saúde'], 'Transporte de executivos com carro da empresa.', 6, true, true],
  ['v31', 'Consultor(a) de Vendas Online', 'Loja Virtual Casa Linda', 'Remoto', 'BR', 'remoto', 'CLT', R(1800), R(3500), 'Vendas',
    ['vendas', 'atendimento por whatsapp', 'boa escrita'], ['e-commerce', 'CRM'], 'medio', 1,
    ['Comissão', 'Auxílio home office'], 'Atendimento e venda para clientes do site, de casa.', 2, true, false],
  ['v32', 'Fiscal de Obras', 'Construtora Horizonte Norte', 'Belém', 'PA', 'presencial', 'CLT', R(3800), R(4500), 'Construção Civil',
    ['acompanhamento de obras', 'leitura de planta', 'NR-18'], ['autocad', 'CNH categoria B'], 'tecnico', 4,
    ['Plano de saúde', 'Vale-refeição', 'Carro da empresa'], 'Fiscalização de obras de infraestrutura urbana.', 7, true, false],

  // --- dois exemplos com cara de golpe, para demonstrar o detector ---
  ['g01', 'Digitador em Casa – Ganhe R$ 8.000 por Semana', 'Oportunidade Digital', 'Remoto', 'BR', 'remoto', 'PJ', R(32000), R(40000), 'Administrativo',
    ['saber digitar'], [], 'fundamental', 0,
    [], 'Sem experiência! Para começar é só pagar a taxa de cadastro de R$ 97 e receber o kit de materiais. Vagas limitadas, chame no WhatsApp.', 1, false, false,
    'Somente WhatsApp'],
  ['g02', 'Auxiliar de Escritório (com curso incluso)', 'Instituto Carreira Rápida', 'São Paulo', 'SP', 'presencial', 'CLT', R(2800), R(2800), 'Administrativo',
    ['pacote office'], [], 'medio', 0,
    ['Vale-transporte'], 'Contratação imediata após conclusão do curso obrigatório de qualificação (valor promocional de R$ 349). Envie seus dados bancários para a pré-contratação.', 2, false, false],
];

const MS_DIA = 86_400_000;

/**
 * Vagas de exemplo com datas relativas a `hoje`.
 * @param {Date} [hoje]
 * @returns {Vaga[]}
 */
export function vagasDeExemplo(hoje = new Date()) {
  return BRUTAS.map(([id, titulo, empresa, cidade, uf, modalidade, contrato, salarioMin, salarioMax, area,
    requisitos, diferenciais, escolaridadeMin, experienciaMin, beneficios, descricao, diasAtras,
    valorizaExperiencia, exigeCnh, contato]) => ({
    id, titulo, empresa, cidade, uf, modalidade, contrato, salarioMin, salarioMax, area,
    requisitos, diferenciais, escolaridadeMin, experienciaMin, beneficios, descricao,
    publicadaEm: new Date(hoje.getTime() - diasAtras * MS_DIA).toISOString().slice(0, 10),
    fonte: 'Exemplo (fictícia)',
    url: '',
    valorizaExperiencia, exigeCnh,
    ...(contato ? { contato } : {}),
  }));
}
