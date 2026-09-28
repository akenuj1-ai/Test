# Marca VagaCerta

![Logo](../src/ui/marca/logo.svg)

## A ideia

O símbolo é um **carimbo de aprovação**, como os da Carteira de Trabalho. O
**✓** também é o **V** de VagaCerta, e sua ponta **atravessa o anel do
carimbo e sai por cima**: é a aprovação que tira a pessoa de onde ela está.

O anel pontilhado interno lembra a picotagem dos documentos oficiais; ele
some nas versões pequenas (favicon), onde viraria ruído.

## Arquivos (`src/ui/marca/`)

| Arquivo | Uso |
|---|---|
| `logo.svg` | Logo principal, fundo claro |
| `logo-escuro.svg` | Fundo escuro ou azul |
| `logo-mono.svg` / `logo-mono-branco.svg` | Uma cor: carimbos, bordados, impressão barata |
| `simbolo.svg` | Só o símbolo (avatar de redes sociais, 64 px ou mais) |
| `favicon.svg` | Aba do navegador (16–32 px), sem o anel pontilhado |
| `icone.svg`, `icone-192.png`, `icone-512.png` | Ícone do app |
| `icone-maskable-512.png` | Ícone do Android, que corta em círculo ou gota |
| `apple-touch-icon.png` | Ícone do iPhone |
| `og.jpg` | Prévia quando alguém compartilha o link (WhatsApp, Facebook) |
| `tela-celular.png`, `tela-computador.png` | Capturas para o instalador e as lojas |

O nome está convertido em desenho vetorial: aparece igual em qualquer
computador, sem precisar da fonte. Para regerar: `python3 tools/marca.py
FamiljenGrotesk-Bold.ttf` e depois `npm run bundle && npm run icones`.

## Cores

| Nome | Hex | Onde |
|---|---|---|
| Capa (azul-marinho) | `#16326B` | Fundo do símbolo, topo, faixas |
| Capa escura | `#0F2552` | Gradientes, fundo do logo escuro |
| Ouro | `#F2B544` | Símbolo, **só** nos botões que levam a resultado ou venda |
| Ação | `#2256D0` | Links e botões comuns, "Certa" no logo claro |
| Tinta | `#0E1A30` | Texto |
| Chance alta | `#157347` | Nota alta, carimbo "Chance alta" |
| Golpe | `#B42318` | Alertas de golpe, nunca decorativo |

## Tipografia

- **Familjen Grotesk** (títulos e logo): firme, com personalidade, sem
  parecer banco.
- **Atkinson Hyperlegible** (texto): criada para leitura fácil por quem
  enxerga pouco. Escolhida pelo público 50+.

## Elementos de identidade

- **Guilhochê**: as linhas finas curvas de fundo, como nos documentos com
  proteção contra falsificação. Usado no topo, na página Pro e na prévia de
  link.
- **Carimbo "Chance alta"**: selo girado, borda dupla, verde. Só aparece em
  vaga com nota 70 ou mais.
- **Ficha "Contrato de trabalho"**: os dados da vaga em linhas pontilhadas,
  como na página da carteira.

## Não fazer

- Não esticar, girar ou mudar as cores do símbolo.
- Não usar o ouro em texto sobre fundo claro (não dá para ler).
- Não colocar o logo claro sobre foto; use `logo-escuro.svg` com sombra.
- Deixar em volta do logo um espaço livre de, no mínimo, meia altura do
  símbolo.
