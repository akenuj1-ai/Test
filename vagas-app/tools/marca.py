#!/usr/bin/env python3
"""
Gera os arquivos da marca VagaCerta (SVG) a partir da fonte Familjen Grotesk.

    pip install fonttools
    python3 tools/marca.py caminho/para/FamiljenGrotesk-Bold.ttf

O nome é convertido em contornos (paths): o logo aparece igual em qualquer
lugar, sem depender de a fonte estar instalada. Os PNGs (ícones do app e
imagem de compartilhamento) saem de `node tools/icones.js`, que desenha
estes SVGs no navegador.
"""
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

SAIDA = Path(__file__).resolve().parent.parent / 'src' / 'ui' / 'marca'

MARINHO = '#16326B'
MARINHO_ESCURO = '#0F2552'
OURO = '#F2B544'
TINTA = '#0E1A30'
AZUL = '#2256D0'


def simbolo(x=0.0, y=0.0, lado=64.0, fundo=MARINHO, raio=15.0, sangria=False, cor=OURO, detalhe=True):
    """O carimbo com o V/✓ saindo dele. Desenhado numa grade 64×64.

    sangria=True: fundo ocupa o quadrado todo e o desenho encolhe para a zona
    segura dos ícones "maskable" do Android (círculo de 80%).
    detalhe=False: sem o anel pontilhado interno, para favicon de 16–32 px.

    O gesto da marca: o ✓ (que também é o V de Vaga) atravessa o anel do
    carimbo e sai por cima — a aprovação que tira a pessoa de onde está.
    """
    k = lado / 64
    esc = 0.72 if sangria else 1.0
    d = 32 * (1 - esc)
    t = f'translate({x + d * k:.3f} {y + d * k:.3f}) scale({k * esc:.5f})'
    base = (f'<rect x="{x}" y="{y}" width="{lado}" height="{lado}" fill="{fundo}"/>' if sangria
            else f'<rect x="{x}" y="{y}" width="{lado}" height="{lado}" rx="{raio * k:.3f}" fill="{fundo}"/>')
    anel_interno = (f'<circle cx="29.5" cy="35" r="14.6" stroke="{cor}" stroke-width="1.2" stroke-dasharray="1.5 2.6" opacity=".8"/>'
                    if detalhe else '')
    return base + f'''<g transform="{t}" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="29.5" cy="35" r="19" stroke="{cor}" stroke-width="2.8"/>
  {anel_interno}
  <path d="M18.5 33 L27.5 43.8 L49 13.5" stroke="{fundo}" stroke-width="12"/>
  <path d="M18.5 33 L27.5 43.8 L49 13.5" stroke="{cor}" stroke-width="6.4"/>
</g>'''


def palavra(fonte, texto, tamanho, x, y, cores, espaco=-0.012):
    """Texto em contornos. cores: lista de (quantidade_de_letras, cor)."""
    glyphs = fonte.getGlyphSet()
    cmap = fonte.getBestCmap()
    upm = fonte['head'].unitsPerEm
    esc = tamanho / upm
    hmtx = fonte['hmtx']
    partes, cursor, i = [], x, 0
    for n, cor in cores:
        caminhos = []
        for ch in texto[i:i + n]:
            nome = cmap[ord(ch)]
            pen = SVGPathPen(glyphs)
            glyphs[nome].draw(TransformPen(pen, (esc, 0, 0, -esc, cursor, y)))
            caminhos.append(pen.getCommands())
            cursor += hmtx[nome][0] * esc + espaco * tamanho
        partes.append(f'<path fill="{cor}" d="{" ".join(caminhos)}"/>')
        i += n
    return ''.join(partes), cursor - x


def svg(largura, altura, corpo, titulo='VagaCerta'):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {largura:.2f} {altura:.2f}" '
            f'width="{largura:.0f}" height="{altura:.0f}" role="img" aria-label="{titulo}">'
            f'<title>{titulo}</title>{corpo}</svg>\n')


def main():
    fonte = TTFont(sys.argv[1])
    SAIDA.mkdir(parents=True, exist_ok=True)

    (SAIDA / 'simbolo.svg').write_text(svg(64, 64, simbolo()))
    (SAIDA / 'icone-maskable.svg').write_text(svg(512, 512, simbolo(lado=512, sangria=True)))
    (SAIDA / 'icone.svg').write_text(svg(512, 512, simbolo(lado=512, raio=15)))
    (SAIDA / 'favicon.svg').write_text(svg(64, 64, simbolo(detalhe=False)))

    # logo horizontal: símbolo + nome, nas versões clara, escura e de uma cor
    altura, lado, tam = 64, 64, 40
    for nome, cores, fundo_simbolo, cor_simbolo in [
        ('logo', [(4, TINTA), (5, AZUL)], MARINHO, OURO),
        ('logo-escuro', [(4, '#FFFFFF'), (5, OURO)], MARINHO_ESCURO, OURO),
        ('logo-mono', [(9, TINTA)], TINTA, '#FFFFFF'),
        ('logo-mono-branco', [(9, '#FFFFFF')], '#FFFFFF', TINTA),
    ]:
        texto, largura = palavra(fonte, 'VagaCerta', tam, lado + 14, 46, cores)
        corpo = simbolo(fundo=fundo_simbolo, cor=cor_simbolo) + texto
        (SAIDA / f'{nome}.svg').write_text(svg(lado + 14 + largura + 2, altura, corpo))

    # só o nome, para rodapés e documentos
    texto, largura = palavra(fonte, 'VagaCerta', 40, 0, 40, [(4, TINTA), (5, AZUL)])
    (SAIDA / 'nome.svg').write_text(svg(largura + 2, 52, texto))
    print('marca gerada em', SAIDA)


if __name__ == '__main__':
    main()
