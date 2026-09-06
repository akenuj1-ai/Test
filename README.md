# Fortuna Real

Slot 6×5 completo — motor matemático, interface jogável e ferramentas de
verificação de RTP. **Zero dependências de runtime**: só Node 20+ e um
navegador, sem `npm install`, sem bundler.

> ⚠️ **Jogo de demonstração.** Créditos fictícios, sem depósito, sem aposta e
> sem prêmio em dinheiro real. O objetivo é servir de referência de como a
> matemática de um slot moderno é construída, calibrada e auditada.

![Rodadas grátis com multiplicador global acumulado](docs/captura-bonus.png)

```bash
npm test        # 102 testes
npm run serve   # abre a interface em http://localhost:8080
npm run sim     # simulação de Monte Carlo com relatório
npm run tune    # verificação do RTP com intervalos de confiança
```

---

## O jogo

| | |
|---|---|
| **Formato** | 6 colunas × 5 linhas, pagamento por dispersão (*pay anywhere*) |
| **Combinação** | 8 ou mais símbolos iguais em qualquer posição |
| **Cascata** | vencedores explodem, os de cima caem, novos entram — até não haver ganho |
| **Orbe multiplicador** | ×2 a ×500; soma-se e multiplica o ganho da sequência |
| **Rodadas grátis** | 4+ moedas → 15 rodadas, com multiplicador global acumulativo |
| **Compra de bônus** | 100× (normal) e 300× (super) |
| **Aposta ante** | +25% de custo, 1,51× mais gatilhos, mesmo RTP |
| **Ganho máximo** | 5.000× a aposta |
| **RTP** | 96,50% (alvo) — medido em todos os modos, ver `docs/MATH.md` |

![Tabela de prêmios](docs/captura-tabela.png)

Regras completas e a derivação de cada número: **[docs/MATH.md](docs/MATH.md)**.
Registro da revisão de código, incluindo os bugs encontrados:
**[docs/REVIEW.md](docs/REVIEW.md)**.

---

## Arquitetura

```
src/engine/     motor puro — sem DOM, sem estado global, sem Math.random
  config.js       símbolos, tabela de prêmios, pesos dos rolos, calibragem
  rng.js          xoshiro128** (semeado) · CSPRNG · provably fair (HMAC)
  sha256.js       SHA-256/HMAC síncronos (Node e navegador dão o mesmo resultado)
  paytable.js     tabelas de prêmio pré-calculadas para o laço quente
  grid.js         grade 6×5, sorteio e cascata
  evaluate.js     avaliação pura de uma grade
  money.js        aritmética monetária em inteiros
  round.js        máquina de estados da rodada (cascatas, bônus, teto)
  session.js      carteira, aposta, histórico, provably fair

src/sim/        ferramentas de matemática
  analytic.js     resultados EXATOS (distribuições binomiais convoluídas)
  simulate.js     Monte Carlo com RTP, volatilidade e distribuição
  cli.js          relatório de linha de comando

src/ui/         interface (ESM puro, sem bundler)
tools/          servidor estático e verificador de RTP
test/           102 testes com o runner nativo do Node
```

O princípio que organiza tudo: **o motor é uma função pura de
`(aleatoriedade, aposta, modo) → resultado`**. Ele não sabe o que é uma
carteira nem o que é um pixel. Por isso a mesma linha de código que roda no
navegador roda 40 milhões de vezes no simulador, e o RTP medido é o RTP que o
jogador recebe — não há um "modo simulação" que se comporte diferente.

### Dinheiro é sempre inteiro

Todo valor monetário é um inteiro em centavos, e todo prêmio é um inteiro em
centésimos da aposta. As apostas são múltiplas de 20 centavos e os prêmios
múltiplos de 5, o que torna toda conversão exata — sem arredondamento. Um teste
percorre o produto cartesiano de apostas × prêmios para provar isso.

### Aleatoriedade injetada

Nenhum módulo chama `Math.random`. O gerador entra por parâmetro, o que dá três
propriedades: rodadas reproduzíveis a partir de uma semente, simulação
determinística, e a possibilidade de trocar por um esquema *provably fair* sem
tocar na lógica do jogo.

---

## Verificação justa (*provably fair*)

Cada rodada usa `HMAC-SHA256(sementeServidor, sementeCliente:nonce:bloco)`.
O hash da semente do servidor é publicado **antes** das rodadas; ao revelá-la,
o jogador confere que ela gera o hash prometido — o resultado não pôde ter sido
escolhido depois da aposta. A tela 🔐 permite trocar a semente do cliente e
pedir a revelação a qualquer momento.

---

## Comandos

| Comando | O que faz |
|---|---|
| `npm test` | suíte completa (~22 s) |
| `npm run serve` | servidor estático da interface |
| `npm run sim` | 200.000 rodadas, com histograma de ganhos |
| `npm run sim -- --spins 2000000 --all` | todos os modos |
| `npm run sim -- --json` | saída legível por máquina |
| `npm run tune` | RTP decomposto com IC 95% (~30 s) |
| `npm run tune -- --precise` | mesma medição com 10× mais amostras |
| `npm run tune -- --solve` | sugere o próximo valor das constantes de calibragem |
| `npm run typecheck` | checagem de tipos via JSDoc (requer `typescript`; os testes também pedem `@types/node`) |

---

## Jogo responsável

Este projeto é material de estudo. Slots reais são jogos de azar com valor
esperado negativo para o jogador: mesmo a 96,5% de RTP, a expectativa é perder
3,5% de tudo o que for apostado, e a alta variância significa que resultados de
curto prazo dizem muito pouco. Se for adaptar este código para uso real,
verificação de idade, limites de depósito, autoexclusão e certificação por
laboratório independente não são opcionais.
