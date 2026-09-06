# Matéria em Movimento

Apresentação em HTML de arquivo único, com cenário 3D em WebGL renderizado em tempo real.
Abra `slideshow/index.html` no navegador — não há build, dependências locais ou imagens.

## Oito cenas

| # | Cena | Técnica em destaque |
|---|------|---------------------|
| 1 | Nó de toro | `TorusKnotGeometry` metálico, luzes em órbita |
| 2 | Icosaedro | malha, arestas (`EdgesGeometry`) e vértices como pontos |
| 3 | Esfera deslocada | ruído simplex 3D em vertex shader próprio + rim light |
| 4 | Grade instanciada | 1.024 cubos via `InstancedMesh` em um único draw call |
| 5 | Espiral | 24.000 partículas com mistura aditiva e cor por raio |
| 6 | Onda paramétrica | plano 120×120 deformado inteiramente na GPU |
| 7 | Pilares na névoa | `FogExp2` + dolly contínuo da câmera |
| 8 | Convergência | partículas atraídas para alvos amostrados de um canvas 2D |

## Controles

- `←` `→` `espaço` `Home` `End` — navegação
- `A` ou o botão **Auto** — avanço automático a cada 9 s
- arrastar na horizontal — navegação por toque
- marcas no rodapé — ir direto a uma cena

Respeita `prefers-reduced-motion`: com a preferência ativa, cada cena é desenhada
em um único quadro estático e o avanço automático não roda sozinho.

## Dependência

Three.js r128, carregado por CDN (cdnjs). É o único recurso externo além das fontes
(Bodoni Moda, Archivo, IBM Plex Mono, via Google Fonts).
