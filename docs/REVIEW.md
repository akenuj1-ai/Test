# Revisão de código

Registro do que foi revisado, do que estava errado e do que continua sendo
risco. A revisão foi feita durante a construção, com cada achado fechado por um
teste que falha sem a correção.

## Método

| Técnica | Onde |
|---|---|
| Teste diferencial contra implementação de referência | SHA-256/HMAC vs `node:crypto`, todos os comprimentos até 200 bytes |
| Verificação estatística | χ² e média do RNG; distribuição de pesos |
| Checagem cruzada exato × Monte Carlo | `src/sim/analytic.js` vs `src/sim/simulate.js` |
| Invariantes de contabilidade | saldo fecha; todo valor inteiro e não negativo |
| Teste de propriedade | ganho escala linearmente com a aposta; teto nunca ultrapassado |
| Teste de ponta a ponta em navegador | Chromium headless: giros, modais, compra de bônus |

## Achados corrigidos

### 1. SHA-256 gerava digest errado para certos comprimentos — crítico

O cálculo do preenchimento era `floor((len + 9) / 64) * 64 + 64`. Quando
`len + 9` já é múltiplo exato de 64 (`len` = 55, 119, 183…), isso acrescenta um
bloco inteiro de zeros e muda o digest.

Os vetores canônicos do NIST (string vazia, `"abc"`, a de 56 bytes) **passavam**
— nenhum deles cai no caso ruim. O bug só apareceu quando o teste passou a
comparar contra `node:crypto` em todo comprimento de 0 a 200.

Impacto: o esquema *provably fair* deixaria de ser verificável. O jogador
recalcularia o HMAC com uma biblioteca correta e obteria outro resultado, e não
haveria como distinguir isso de fraude.

Correção: `Math.ceil((len + 9) / 64) * 64`. Comentado no código com a explicação
do caso limite, para não regredir.

### 2. Aposta ante pagaria 399,9% de RTP — crítico

A ideia inicial era a convencional: "a aposta ante custa 25% a mais e dobra a
chance de bônus", implementada dobrando o peso do scatter.

Isso não dobra a chance de bônus. Como o gatilho exige 4 ou mais scatters, a
probabilidade cresce aproximadamente com a **quarta potência** do peso: dobrar o
peso multiplicava o gatilho por 9,3 (1 em 215 → 1 em 23). O ante pagaria
399,9% de RTP por 1,25× do custo — todo jogador racional jogaria só assim, e a
casa quebraria em horas.

O módulo analítico expôs isso na primeira execução, antes de qualquer simulação.

Correção: o multiplicador virou um valor resolvido numericamente (**1,1335**),
não escolhido. O ante custa 25% a mais, dispara 1,50× mais e paga o mesmo RTP.
A sensibilidade é de ~1,7 p.p. de RTP por 0,001 do parâmetro, o que justifica as
quatro casas decimais e um comentário grande em `config.js`.

### 3. RTP inicial de 183% — alto

A primeira configuração de pesos e prêmios pagava quase o dobro do alvo. A
decomposição mostrou onde: os orbes multiplicadores apareciam em ~2% das células
e amplificavam o jogo base por um fator ~4.

Correção: peso do orbe no rolo de 26 para 8, e a frequência por modo virou o
parâmetro de calibragem. Processo completo em [MATH.md](MATH.md).

### 4. Compra do super bônus estava 24 p.p. fora — alto

O preço configurado era 400× enquanto o valor esperado medido do recurso era
290,5×, ou seja **72,6% de RTP na compra** contra 96,5% do jogo base. Um preço
escolhido por parecer redondo, não derivado.

Correção: preço passou a ser derivado (`E[recurso] / RTP alvo`) e a frequência
de orbes do super foi ajustada para que o preço justo caísse em 300× redondos.
`npm run tune` recalcula e reporta o preço justo a cada execução.

### 5. Modal fechado bloqueava todos os cliques — médio

`.modal { position: fixed; inset: 0; display: grid }` com o atributo `hidden`
para esconder. Não funciona: a regra `[hidden] { display: none }` vem da folha
de estilo do agente do usuário, e qualquer regra de autor que defina `display`
ganha dela. O modal ficava invisível (fundo transparente) mas continuava
cobrindo a tela inteira e engolindo os cliques.

Encontrado pelo teste headless: o clique em "Turbo" expirava porque
`#modal-stats` interceptava o ponteiro.

Correção: `[hidden] { display: none !important }` no topo da folha, com o
comentário explicando a precedência.

### 6. Intervalo de confiança do RTP era estimado por palpite — médio

`tools/tune.js` derivava o erro do componente base multiplicando o IC total por
0,75 ("o giro base responde por ~3/4 da variância"). Um número inventado, que
declarava ±0,90 p.p. onde o erro real era ±0,13 p.p.

Correção: o simulador acumula Welford sobre o componente base separadamente e
reporta `baseRtpCi95`. Mesma amostra, erro declarado 7× menor — e agora correto.

### 7. `B` do ante não é igual ao `B` do jogo base — baixo

A bissecção analítica do ante assumia que o jogo base rende o mesmo com e sem
ante. Não rende: com mais scatters na grade sobram menos células para símbolos
que pagam, e o componente base cai de 49,60% para 48,51%.

Ignorar isso deixou o ante 0,85 p.p. abaixo do alvo na primeira medição precisa.
Correção: o multiplicador foi re-resolvido sobre pontos **medidos**, não sobre o
modelo analítico puro.

### 8. `var` em escopo de bloco na animação de cascata — baixo

O índice das células que caem vinha de um `var` declarado dentro do laço e lido
na iteração seguinte. Funcionava por *hoisting*, mas a dependência entre
iterações era invisível. Reescrito com `let` declarado antes do laço e uma
função nomeada `fallingColumns`.

## Verificado e correto

- **Contabilidade**: saldo final = inicial − apostado + ganho, ao centavo, em
  800 rodadas. Rodada recusada por falta de saldo não move o saldo nem consome
  nonce.
- **Aritmética monetária**: o produto cartesiano de todas as apostas por todos
  os prêmios da tabela dá inteiro exato, sem arredondamento. Overflow além do
  inteiro seguro lança em vez de perder precisão silenciosamente.
- **Linearidade**: apostar 10× rende exatamente 10× com a mesma semente.
- **Teto**: nunca ultrapassado em 4.000 rodadas de super bônus; ao ser atingido,
  a rodada para e as rodadas grátis restantes são descartadas.
- **Determinismo**: mesma semente reproduz a rodada campo a campo; `trace`
  ligado e desligado dão o mesmo dinheiro (a UI não pode mudar o resultado).
- **Exato × Monte Carlo**: distribuição de contagem por símbolo, ganho esperado
  do primeiro sorteio e taxa de gatilho concordam dentro de 4 desvios padrão.
- **Travessia de caminho** em `tools/serve.js`: `..` é normalizado e comparado
  contra a raiz antes de qualquer acesso ao disco.
- **Injeção de HTML** na UI: a semente do cliente é o único texto controlado
  pelo usuário que entra em `innerHTML`, e passa por `escapeHtml`.

## Riscos residuais

**Este código não é software de cassino certificado.** O que faltaria:

1. **O motor tem de rodar no servidor.** Hoje ele roda no navegador, onde o
   jogador controla tudo. Para valer dinheiro, `round.js` fica atrás de uma API
   e o cliente só recebe o resultado já assinado.
2. **Sem certificação de RNG.** Um laboratório (GLI, BMM, iTech) precisa
   auditar a fonte de entropia e o esquema *provably fair*.
3. **SHA-256 em JS puro não é resistente a canal lateral (timing).** Aceitável
   aqui porque a semente do servidor é revelada de qualquer forma, mas não serve
   onde o segredo persiste.
4. **Sem persistência, contas, limites de depósito ou autoexclusão.** Requisitos
   legais em praticamente todo mercado regulado.
5. **O modelo de rolo é "célula independente"**, não fita de rolo física. É uma
   escolha declarada, não um descuido — ver [MATH.md](MATH.md#modelo-de-sorteio)
   — mas um laboratório vai querer fitas explícitas.
6. **O RTP declarado carrega a incerteza da medição** (±0,13 p.p. com 40 milhões
   de rodadas). Certificação normalmente exige amostra maior ou cálculo fechado.
7. **Aproximação conhecida no teto**: em uma rodada disparada naturalmente, o
   ganho do giro base também conta para o teto, então `E[bônus | disparado]` é
   marginalmente menor que `E[bônus | comprado]`. O efeito é da ordem de
   1 em 59.000 rodadas de bônus e está abaixo do erro de medição, mas existe.
