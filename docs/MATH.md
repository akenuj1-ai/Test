# Matemática de Fortuna Real

Relatório completo: regras, modelo probabilístico, como o RTP foi calibrado e
quais números saíram da medição. Todos os valores aqui são reproduzíveis com
`npm run tune -- --precise` e `npm run sim`.

---

## 1. Resumo

| Métrica | Valor | Como foi obtido |
|---|---|---|
| **RTP — jogo base** | **96,539%** ±0,126 p.p. | decomposto, 40 M rodadas |
| **RTP — aposta ante** | **96,484%** ±0,183 p.p. | decomposto, 10 M rodadas |
| **RTP — compra 100×** | **96,555%** ±0,143 p.p. | direto, 3 M compras |
| **RTP — compra super 300×** | **96,357%** ±0,154 p.p. | direto, 2 M compras |
| Frequência de acerto | 26,27% | 40 M rodadas |
| Volatilidade (desvio padrão por rodada) | 11,67× a aposta | 40 M rodadas |
| Gatilho do bônus | 1 em 214,9 | **exato** |
| Gatilho com aposta ante | 1 em 140,2 (1,53× mais) | **exato** |
| Ganho médio de uma sessão de bônus | 96,6× | 3 M sessões |
| Rodadas grátis médias por sessão | 17,6 | 3 M sessões |
| Ganho máximo | 5.000× | teto de projeto |
| Teto atingido (compra super) | 1 em 5.305 | 2 M compras |

Os quatro modos ficam a menos de 0,2 p.p. uns dos outros, todos dentro do erro
de medição do alvo de 96,50%. **Nenhum modo é melhor que outro** — comprar o
bônus ou usar a aposta ante muda a variância, não a expectativa.

---

## 2. Regras

**Formato.** Grade de 6 colunas × 5 linhas, 30 células. Pagamento por dispersão:
**8 ou mais símbolos iguais**, em qualquer posição, formam combinação. Não há
linhas de pagamento — a posição é irrelevante, só a contagem importa.

**Símbolos.** 5 baixos (Safira, Esmeralda, Topázio, Ametista, Rubi), 4 altos
(Cálice, Anel, Ampulheta, Coroa), a Moeda (*scatter*) e o Orbe multiplicador.
Moeda e Orbe nunca formam combinação.

**Tabela de prêmios**, em múltiplos da aposta total:

| Símbolo | 8–9 | 10–11 | 12+ |
|---|---:|---:|---:|
| 👑 Coroa | 10× | 25× | 50× |
| ⏳ Ampulheta | 2,5× | 10× | 25× |
| 💍 Anel | 2× | 5× | 15× |
| 🏆 Cálice | 1,5× | 2× | 12× |
| 🔴 Rubi | 1× | 1,5× | 10× |
| 🟣 Ametista | 0,8× | 1,2× | 8× |
| 🟡 Topázio | 0,5× | 1× | 4× |
| 🟢 Esmeralda | 0,4× | 0,9× | 3× |
| 💎 Safira | 0,25× | 0,75× | 2× |
| 🪙 Moeda | 4 → 3× | 5 → 5× | 6+ → 100× |

**Cascata.** Os símbolos vencedores explodem, os de cima caem e novos entram
pelo topo. Repete até não haver mais combinação. Tudo isso é um único giro.

**Orbe multiplicador.** Vale de ×2 a ×500.
No **jogo base**, se a sequência de cascatas teve ganho, a **soma** dos orbes
que apareceram nela multiplica o ganho da sequência.
Nas **rodadas grátis**, os orbes sempre entram em um **multiplicador global** que
acumula durante toda a sessão e nunca zera.

**Rodadas grátis.** 4+ moedas no sorteio inicial dão 15 rodadas. Durante elas,
3+ moedas dão +5 rodadas. A moeda só paga prêmio no jogo base.

**Teto.** 5.000× a aposta por rodada. Ao ser atingido, a rodada encerra na hora
e as rodadas grátis restantes são descartadas.

---

## 3. Modelo de sorteio

Cada célula é sorteada **independentemente** da distribuição de pesos do seu
rolo. É um modelo de "rolo infinito": equivale a uma fita de rolo muito longa em
que nenhuma posição condiciona a vizinha.

Isso é uma **escolha declarada**, com dois efeitos:

- A contagem de um símbolo na grade é a soma de 6 binomiais independentes
  `Bin(5, p_coluna)`. Convoluindo, obtém-se a distribuição **exata** — nada de
  Monte Carlo para taxa de gatilho, prêmio de moeda ou ganho do primeiro
  sorteio.
- Perde-se o controle fino que uma fita física dá (por exemplo, garantir no
  máximo uma moeda por rolo). Um laboratório de certificação normalmente exige
  fitas explícitas; ver [REVIEW.md](REVIEW.md#riscos-residuais).

Duas regras de contorno, para não deixar ambiguidade:

1. A **moeda só aparece no sorteio inicial** de cada giro. Refis de cascata
   nunca trazem moeda — não há gatilho "de graça" no meio da cascata.
2. **Moeda e orbe não explodem**: permanecem na grade até o fim da sequência.
   Orbes *podem* cair em refis, e são coletados ao final.

### Probabilidades por célula (rolo 0)

| Símbolo | p | E[quantidade na grade] |
|---|---:|---:|
| 💎 Safira | 15,800% | 4,74 |
| 🟢 Esmeralda | 15,033% | 4,51 |
| 🟡 Topázio | 14,266% | 4,28 |
| 🟣 Ametista | 13,192% | 3,96 |
| 🔴 Rubi | 12,118% | 3,64 |
| 🏆 Cálice | 9,050% | 2,72 |
| 💍 Anel | 7,516% | 2,25 |
| ⏳ Ampulheta | 5,829% | 1,75 |
| 👑 Coroa | 4,295% | 1,29 |
| 🪙 Moeda | 2,301% | 0,69 |
| 🔮 Orbe | 0,599% | 0,18 |

Os rolos das pontas são levemente mais generosos em símbolos baixos que os
centrais — variação pequena, herdada da prática do mercado.

### Distribuição exata da moeda

| Moedas | Probabilidade | 1 em |
|---:|---:|---:|
| 3 | 2,5972% | 39 |
| 4 | 0,4101% | 244 |
| 5 | 0,0499% | 2.005 |
| 6 | 0,0049% | 20.565 |
| 7 | 0,0004% | 256.414 |

**Gatilho (4+): 0,4653%, 1 em 214,9.** Re-gatilho (3+): 3,0625%, 1 em 32,7 —
por isso a sessão média tem 17,6 rodadas e não 15.

---

## 4. De onde vem o RTP

O ganho esperado do **primeiro sorteio**, sem cascata e sem multiplicador, é
calculável em forma fechada: **0,1629× a aposta**. Decomposto por símbolo:

| Símbolo | Contribuição | Fatia |
|---|---:|---:|
| 🟣 Ametista | 0,03476× | 21,3% |
| 🟡 Topázio | 0,03288× | 20,2% |
| 🟢 Esmeralda | 0,03181× | 19,5% |
| 💎 Safira | 0,02628× | 16,1% |
| 🔴 Rubi | 0,02604× | 16,0% |
| 🏆 Cálice | 0,00698× | 4,3% |
| 💍 Anel | 0,00304× | 1,9% |
| ⏳ Ampulheta | 0,00074× | 0,5% |
| 👑 Coroa | 0,00036× | 0,2% |

Os símbolos baixos carregam 93% do ganho do primeiro sorteio. A Coroa, que
domina a tabela de prêmios, contribui com 0,2% — ela existe para o momento
raro, não para o RTP. Esse é o desenho típico do gênero: a tabela vende o sonho,
os símbolos baixos pagam a conta.

De 0,1629× até os 96,5% finais, os multiplicadores são:

| Etapa | Efeito |
|---|---|
| Cascata | cada ganho gera um novo sorteio; a série geométrica multiplica ~1,3× |
| Orbes (jogo base) | E[valor] = 5,20; amplificam as sequências vencedoras |
| **Subtotal do jogo base** | **49,61%** |
| Prêmio de moeda | **2,01%** (exato) |
| Rodadas grátis | 1/214,9 × 96,56× = **44,93%** |
| **Total** | **96,54%** |

### Pesos e valores dos orbes

| Tabela | E[valor] | P(≥100×) |
|---|---:|---:|
| base (jogo base e bônus normal) | 5,20 | 0,149% |
| super (bônus comprado no super) | 7,52 | 0,536% |

---

## 5. Como o RTP foi medido

Medir RTP de slot por simulação direta é caro. O desvio padrão do ganho por
rodada é **11,67× a aposta**; para um intervalo de confiança de ±0,1 p.p. seriam
necessárias

```
N = (1,96 × 11,67 / 0,001)² ≈ 523 milhões de rodadas
```

Em vez disso, o RTP é **decomposto**:

```
RTP  =  B  +  S  +  P × E[bônus]

B         ganho do giro base            Monte Carlo (variância moderada)
S         prêmio de moeda               EXATO   (analytic.js)
P         probabilidade de gatilho      EXATO   (analytic.js)
E[bônus]  ganho médio da sessão grátis  Monte Carlo (medido separadamente)
```

Duas das quatro parcelas saem sem erro nenhum, e as duas restantes são medidas
cada uma com a amostra que precisa — `E[bônus]` é medido comprando o bônus, o
que dá uma amostra por rodada em vez de uma a cada 215.

O ganho é grande. Comparando as duas abordagens com custo de CPU semelhante:

| Método | Amostra | Resultado |
|---|---|---|
| Simulação direta | 3 M rodadas (5,9 s) | 96,48% **±1,33 p.p.** |
| Estimador decomposto | 40 M + 3 M (259 s) | 96,539% **±0,126 p.p.** |

Os dois concordam, o que é a validação cruzada que importa: se houvesse um erro
no módulo analítico ou no motor, os dois números divergiriam.

> **Por que `E[bônus]` comprado vale para o bônus disparado.** No motor, a compra
> e o gatilho natural entram exatamente no mesmo código, com os mesmos pesos e o
> mesmo número de rodadas. A única diferença é o teto: numa rodada disparada, o
> ganho do giro base também conta para os 5.000×. O efeito é da ordem de
> 1 em 70.000 e está abaixo do erro de medição.

---

## 6. Calibragem

O jogo nasceu com **RTP de 183%**. O caminho até 96,5% está registrado abaixo
porque o *processo* é mais útil que os números finais.

### Constantes de calibragem

Todos os pesos dos rolos e a tabela de prêmios são fixos — foram escolhidos pelo
desenho do jogo, não pelo RTP. O ajuste fino sai de **três constantes**, cada uma
resolvendo um alvo:

| Constante | Valor | Alvo que resolve |
|---|---:|---|
| `ORB_FREQUENCY.base` | 0,976 | divisão base (49,6%) × bônus (44,9%) |
| `ORB_FREQUENCY.free` | 2,285 | `E[bônus] = 96,5×` → compra de 100× paga 96,5% |
| `ORB_FREQUENCY.superFree` | 6,01 | `E[super] = 289,5×` → compra de 300× paga 96,5% |

O orbe é o parâmetro certo para isso: ele multiplica o ganho sem tocar em quais
símbolos pagam nem em quanto pagam, então mexer nele muda o RTP sem mudar como o
jogo se sente. As três constantes são **independentes** — cada uma afeta um modo
só — o que torna a resolução sequencial em vez de um sistema acoplado.

`npm run tune -- --solve` mede o estado atual e imprime o próximo valor de cada
uma pelo método da secante.

### Preço da compra de bônus

O preço não é escolhido, é **derivado**:

```
preço = E[recurso] / RTP alvo
```

| Compra | E[recurso] | Preço justo | Preço cobrado | RTP resultante |
|---|---:|---:|---:|---:|
| Rodadas grátis | 96,56× | 100,1× | **100×** | 96,555% |
| Super rodadas grátis | 289,07× | 299,6× | **300×** | 96,357% |

Os preços redondos não são coincidência: `ORB_FREQUENCY.free` e `superFree`
foram calibradas *para que* o preço justo caísse em 100× e 300×.

### Aposta ante

A ideia convencional — "custa 25% a mais e dobra a chance de bônus" — não
funciona neste formato, e o módulo analítico mostrou isso antes de qualquer
simulação.

Como o gatilho exige **4 ou mais** moedas, a probabilidade cresce
aproximadamente com a **quarta potência** do peso da moeda. Dobrar o peso
multiplica o gatilho por 9,3:

| Multiplicador do peso | Gatilho | RTP a 1,25× de custo |
|---:|---:|---:|
| 1,0 | 1 em 215 | 96,5% |
| 1,2 | 1 em 116 | 109,7% |
| 1,5 | 1 em 56 | 186,0% |
| 2,0 | 1 em 23 | **399,9%** |

O valor foi então **resolvido**, não escolhido: **1,1335**, que dá 1 em 140,2
(1,53× mais gatilhos) e RTP de 96,484% — empatando com o jogo base.

Um detalhe que só aparece medindo: com mais moedas na grade sobram menos células
para símbolos que pagam, e o componente base do ante rende **48,51%** contra
49,61% do jogo normal. A bissecção puramente analítica, que assumia os dois
iguais, errou o alvo em 0,85 p.p.

A sensibilidade é de ~1,7 p.p. de RTP para cada 0,001 do parâmetro — daí as
quatro casas decimais em `config.js`.

---

## 7. Distribuição de ganhos

3 milhões de rodadas no jogo base:

| Faixa | Frequência |
|---|---:|
| sem ganho ou < 0,5× | 80,20% |
| 0,5× – 1× | 7,39% |
| 1× – 2× | 6,54% |
| 2× – 5× | 3,63% |
| 5× – 10× | 1,08% |
| 10× – 20× | 0,54% |
| 20× – 50× | 0,31% |
| 50× – 100× | 0,15% |
| 100× – 250× | 0,13% |
| 250× – 500× | 0,03% |
| 500× – 1.000× | 0,01% |
| acima de 1.000× | < 0,01% |

Frequência de acerto de 26,27%, mas **80,2% das rodadas devolvem menos da metade
da aposta**. Metade do RTP está concentrada num bônus que sai 1 vez a cada 215
rodadas. É assim que um jogo de alta volatilidade se comporta, e é por isso que
o RTP de uma sessão curta não diz nada: com 500 rodadas, o intervalo de
confiança de 95% do RTP observado vai de ~-6% a ~+200%.

---

## 8. Reproduzindo

```bash
npm run tune -- --precise   # a tabela do resumo (~4 min)
npm run sim -- --spins 3000000            # distribuição de ganhos
npm run sim -- --spins 2000000 --all      # todos os modos
npm test                                  # invariantes e regressão
```

Os valores exatos (probabilidades da moeda, ganho do primeiro sorteio,
contribuição por símbolo) saem de `src/sim/analytic.js` e não dependem de
semente nem de amostra.
