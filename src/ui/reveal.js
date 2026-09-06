/**
 * Cronograma de revelação do sorteio inicial — lógica pura, sem DOM.
 *
 * As colunas aparecem da esquerda para a direita. Quando as moedas já visíveis
 * chegam a UMA de disparar o bônus, as colunas restantes passam a demorar
 * muito mais: é a "antecipação", o momento em que o slot segura o resultado.
 *
 * Duas coisas importam aqui, e por isso este arquivo é separado da interface:
 *
 * 1. A antecipação **não decide nada**. O motor já sorteou a rodada inteira
 *    antes de a primeira peça aparecer; isto só escolhe em que ritmo mostrar.
 *    Nenhuma função deste módulo recebe ou devolve dinheiro.
 * 2. A regra usa exclusivamente o que o jogador já tem na tela — as moedas das
 *    colunas anteriores. Segurar a coluna por causa de uma moeda que ainda não
 *    apareceu seria mentir para o jogador sobre o que ele está vendo.
 */

/**
 * @typedef {object} OpcoesRevelacao
 * @property {number} cols
 * @property {number} rows
 * @property {number} scatterId    id do símbolo que dispara o bônus
 * @property {number} trigger      quantas moedas o bônus exige
 * @property {number} step         atraso entre colunas, em ms
 * @property {number} anticipation atraso entre colunas durante a antecipação
 * @property {number} rowStep      escalonamento vertical dentro da coluna
 * @property {number} tile         duração da queda de uma peça
 */

/**
 * @typedef {object} Revelacao
 * @property {number[]} delays     atraso em ms por índice de grade
 * @property {boolean} anticipated houve pelo menos uma coluna segurada
 * @property {number} total        quanto tempo até a última peça assentar
 */

/**
 * @param {ArrayLike<number>} grid  grade achatada, índice col * rows + row
 * @param {OpcoesRevelacao} opcoes
 * @returns {Revelacao}
 */
export function revealSchedule(grid, opcoes) {
  const { cols, rows, scatterId, trigger, step, anticipation, rowStep, tile } = opcoes;
  const delays = new Array(cols * rows).fill(0);

  let acumulado = 0;
  let moedas = 0;
  let anticipated = false;

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const i = col * rows + row;
      delays[i] = acumulado + row * rowStep;
      if (grid[i] === scatterId) moedas += 1;
    }

    // Segurar só faz sentido se ainda houver coluna para revelar: na última,
    // não há nada pelo que esperar.
    const aUmaDoGatilho = moedas >= trigger - 1 && col < cols - 1;
    if (aUmaDoGatilho) anticipated = true;
    acumulado += aUmaDoGatilho ? anticipation : step;
  }

  return {
    delays,
    anticipated,
    total: acumulado + (rows - 1) * rowStep + tile,
  };
}
