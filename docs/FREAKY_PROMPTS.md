# Freaky Zoo — prompts de arte

Prompts para gerar os ícones do jogo em qualquer gerador de imagem
(Midjourney, GPT-image/DALL·E, Leonardo, Ideogram, SDXL/Flux). Estão em
**inglês** porque esses modelos seguem melhor instruções em inglês; a
explicação de cada um está em português.

A regra de ouro de um slot: **os 10 ícones precisam parecer do mesmo
jogo**. Por isso todo prompt termina com o mesmo bloco de estilo, e vale gerar
todos na mesma sessão, com a mesma semente (`--seed` no Midjourney) ou com
uma imagem de referência de estilo (`--sref`) depois que o primeiro ícone
ficar bom.

---

## 1. Estilo da casa (cole no fim de TODO prompt)

```
bold cartoon slot game icon, thick clean black outline, chunky exaggerated proportions,
glossy vinyl-toy shading, vibrant neon party palette (hot pink, acid green, electric purple,
sunny yellow), strong rim light, centered, full character visible, single subject,
transparent background, no text, 1:1, high detail, mobile game asset
```

**Negativo** (Stable Diffusion, Leonardo, Flux; no Midjourney use `--no`):

```
text, letters, watermark, signature, frame, border, background scenery, cropped,
multiple characters, realistic photo, blurry, low contrast, extra limbs, deformed hands
```

Parâmetros sugeridos:

| Ferramenta | Sufixo |
|---|---|
| Midjourney | `--ar 1:1 --style raw --stylize 250 --no text, watermark, background` |
| GPT-image / DALL·E | peça "PNG com fundo transparente, 1024×1024" no final |
| Leonardo / SDXL | 1024×1024, modelo de ilustração/cartoon, *transparency* ligado |

---

## 2. Símbolos

### 🦍 Gorila Freaky — WILD

O astro. "Freaky" no sentido do meme: sobrancelha arqueada, sorriso de quem
aprontou, olhar de lado. Mantenha brincalhão, nada sexual.

```
a muscular silverback gorilla with a mischievous "freaky" meme face: one eyebrow raised
high, sly side-eye, huge toothy grin, tongue poking out of the corner of the mouth,
wearing a tiny neon-pink party headband and gold chain, doing a goofy disco pose with
one finger pointing up, sparkles around him, the word "WILD" is NOT written,
[ESTILO DA CASA]
```

Variação para o **Surto Freaky** (arte grande, banner de 16:9):

```
the same freaky gorilla crashing through the screen like a wrecking ball, glass shards
flying, both arms up, screaming with excitement, lightning bolts and confetti,
neon zoo party background out of focus, dynamic action shot, [ESTILO DA CASA sem
"transparent background", use --ar 16:9]
```

### 🐪 Camelo — símbolo especial

Precisa de **três poses** com o mesmo personagem: parado, língua e cuspe. Gere
a pose parada primeiro e use-a como referência (`--cref` no Midjourney) nas
outras duas.

Parado (o símbolo que cai no rolo):

```
a goofy dromedary camel with big derpy eyes looking in different directions, buck teeth,
a tiny fez hat tilted on its head, fluffy hump with a disco sticker on it, chewing
something suspiciously, arms crossed, chaotic energy, [ESTILO DA CASA]
```

👅 **Língua** (vira wild expandido no rolo inteiro):

```
the same derpy camel sticking out an absurdly long pink tongue that rolls down like a
red carpet, slobbery and shiny, eyes squeezed shut in joy, drool droplets flying,
cartoon motion lines, [ESTILO DA CASA]
```

Textura da língua para cobrir o rolo (4 células de altura, 1:4):

```
a long vertical cartoon camel tongue texture, glossy bubblegum pink with darker center
groove and taste-bud dots, wet highlights, tileable top and bottom edges, flat front view,
thick black outline, transparent background, --ar 1:4
```

💦 **Cuspe** (o lado ruim: todo alto vira carta):

```
the same derpy camel leaning back and spitting a huge blob of green goo like a cannon,
cheeks puffed, evil little smirk, goo splatter trail with bubbles, cartoon impact
lines, [ESTILO DA CASA]
```

Projétil do cuspe (efeito, pequeno):

```
a single cartoon blob of lime-green spit goo mid-flight, glossy bubbles, splash trail,
thick black outline, transparent background, [ESTILO DA CASA]
```

### 🦁 Leão Sigma — alto (paga mais)

O "mogger": maxilar esculpido, óculos escuros, pose de quem nem se esforça.

```
a lion with an absurdly chiseled square jawline and perfect golden mane blowing in the
wind, dark aviator sunglasses, smug unimpressed "sigma" expression, arms crossed,
one eyebrow slightly raised, thick gold chain, subtle glowing aura behind him,
"mogging" everyone, [ESTILO DA CASA]
```

### 🐒 Macaco do Chapéu Rosa — alto

Caos puro. O chapéu rosa de aba larga é a marca registrada — deixe-o enorme.

```
a hyperactive little monkey wearing an oversized hot-pink wide-brim sun hat with a
ribbon and a flower, crazy spiral eyes, wide open-mouth laugh showing all teeth, holding
a half-eaten banana like a microphone, tail curled into a question mark, pure chaotic
energy, [ESTILO DA CASA]
```

### 🐢 Tartaruga Pride — alto

Fabulosa e orgulhosa — a piada é o carisma dela, não ela. Celebração, sem
caricatura ofensiva.

```
a fabulous confident turtle with a rainbow pride-colored shell covered in glitter,
heart-shaped pink sunglasses, long eyelashes, freshly painted nails, blowing a kiss
with a sassy pose, tiny rainbow sparkles and hearts floating around, radiating
self-love and main-character energy, [ESTILO DA CASA]
```

### 🪩 Globo de Discoteca — scatter

Dispara o bônus. Tem que ler "especial" de longe: mais brilho que qualquer outro
ícone.

```
a glowing disco ball with little animal ears on top (gorilla ears) and a mischievous
cartoon face reflected in its mirror tiles, rays of pink, cyan and yellow light bursting
out, sparkles, floating slightly, magical party vibe, [ESTILO DA CASA]
```

### A · K · Q · J — cartas (baixos)

Cartas de baralho, mas com a roupa de cada bicho, para o tabuleiro não ficar
genérico. Gere as quatro no mesmo prompt de estilo, trocando só a linha
do meio.

```
a chunky 3D cartoon playing-card letter "A", [LINHA DO BICHO],
bold inflated bubble lettering, thick black outline, glossy highlights,
centered, transparent background, slot game low-pay symbol, no other text
```

| Carta | Cor | [LINHA DO BICHO] |
|---|---|---|
| **A** | rosa-choque | `hot-pink letter wearing tiny aviator sunglasses and a lion-mane fringe around it` |
| **K** | laranja | `orange letter wearing a tiny pink wide-brim hat, monkey tail curling from its side` |
| **Q** | verde-ácido | `acid-green letter with a rainbow glitter gradient and a little heart sticker` |
| **J** | azul-elétrico | `electric-blue letter with gorilla fur texture on the edges and a party headband` |

> Nos geradores que erram letras (quase todos, menos Ideogram e GPT-image), é
> mais seguro gerar só o **enfeite** (óculos, chapéu, pelo) e montar a letra no
> próprio jogo — hoje as cartas já são texto estilizado em CSS.

---

## 3. Telas e marca

Logo:

```
game logo that says "FREAKY ZOO" in huge chunky cartoon bubble letters, hot pink and
yellow with thick black outline and drop shadow, a gorilla hand grabbing the letter F,
a camel tongue licking the letter Z, disco sparkles, transparent background,
--ar 3:1
```

> Texto em logo: use Ideogram ou GPT-image, que escrevem certo. Nos outros, gere
> sem texto e escreva por cima.

Fundo do jogo base:

```
a neon jungle nightclub at night, palm trees with LED strips, a zoo enclosure turned
into a dance floor, giant disco ball hanging from a tree, purple and pink fog, blurred
bokeh lights, empty center area for the slot reels, cartoon painted style, --ar 16:9
```

Fundo da **Festa Freaky** (bônus):

```
the same neon jungle nightclub at peak party: confetti rain, pink spotlights sweeping,
silhouettes of animals dancing, heart-shaped balloons, warm magenta glow, empty center
for the reels, cartoon painted style, --ar 16:9
```

Fundo da **Rave Sigma** (super bônus):

```
an underground jungle rave, green lasers cutting through smoke, strobe lights, a giant
camel-shaped neon sign with its tongue out, bass speakers made of tree trunks, acid
green and cyan palette, intense energy, empty center for the reels, --ar 16:9
```

Faixas de ganho (BIG / MEGA / FREAKY / SIGMA WIN):

```
a cartoon win banner shape, glossy golden ribbon with starbursts and coins exploding
outward, confetti, neon pink glow, no text, transparent background, --ar 3:1
```

---

## 4. Da imagem para o jogo

1. Recorte cada ícone em **512×512** com fundo transparente (PNG ou WebP).
2. Em `src/freaky/ui/skins.js`, preencha `art` do símbolo:

   ```js
   H1: { name: 'Leão Sigma', glyph: '🦁', art: './art/leao.webp', ... },
   ```

   Com `art` definido, a peça mostra a imagem no lugar do emoji; o resto da
   interface (brilho, multiplicador, animações) continua igual.
3. No **arquivo único** (`npm run freaky:bundle`) a imagem precisa ser
   `data:` URI — a página não carrega arquivos externos. Um WebP de 512 px fica
   entre 20 e 60 KB; os dez ícones cabem folgado.
4. A arte não mexe no RTP: o motor só conhece os códigos (`H1`, `W`, `C`...).
   Há um teste que garante que nome e arte nunca voltem para `config.js`.

Para a publicação na Stake Engine a arte vai no front (pasta do jogo que você
sobe no painel), não nos arquivos de math.
