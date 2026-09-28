# Como o VagaCerta chega às pessoas

Um único código serve **site, app instalável (PWA), Android (Play Store) e
iPhone (App Store)**. Nada de três apps para manter.

```
                ┌── navegador (celular e computador)
código único ───┼── app instalado pelo próprio site (PWA)
 (este repo)    ├── Play Store  (TWA: o site dentro de um app Android)
                └── App Store   (Capacitor: o site dentro de um app iOS)
```

## 1. Colocar no ar (1 hora)

Qualquer serviço que rode Docker. Sugestões com plano barato:

| Serviço | Como |
|---|---|
| **Render** | New → Web Service → este repositório, pasta `vagas-app`, Docker. Disco de 1 GB em `/dados`. |
| **Railway** | New Project → Deploy from GitHub → raiz `vagas-app`. Volume em `/dados`. |
| **Fly.io** | `fly launch` dentro de `vagas-app`, `fly volumes create dados`. |

Variáveis mínimas:

```
URL_PUBLICA=https://seu-dominio.com.br
PAINEL_CHAVE=uma-senha-longa
JOOBLE_KEY=...            # pelo menos uma fonte de vagas reais
```

Domínio: registre em registro.br (ex.: `vagacerta.com.br`, ~R$ 40/ano) e
aponte para o serviço. HTTPS é obrigatório para instalar o app; os três
serviços acima dão HTTPS grátis.

Agende o envio de alertas de hora em hora (Render Cron Job, Railway Cron):
`node tools/enviar-alertas.js --enviar`.

## 2. App instalável (já pronto)

Com o site no ar em HTTPS:

- **Android e computador (Chrome, Edge)**: aparece o botão **Instalar app**
  no topo. O app ganha ícone, abre sem barra de navegador, tem atalhos
  (Vagas, Salvas, Pro) e **funciona sem internet** com as últimas vagas.
- **iPhone**: o botão abre o passo a passo do Safari (Compartilhar →
  Adicionar à Tela de Início).

## 3. Play Store (1 dia, taxa única de US$ 25)

Use o **Bubblewrap** (do Google), que embrulha o site num app Android:

```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://seu-dominio.com.br/manifest.webmanifest
bubblewrap build
```

Ele gera o `.aab` para enviar ao Play Console e mostra a impressão digital
SHA-256 da chave. Coloque no servidor:

```
TWA_PACOTE=br.com.vagacerta.app
TWA_SHA256=AA:BB:CC:...
```

O servidor responde `/.well-known/assetlinks.json` e o Android passa a abrir
o app sem barra de endereço. As capturas para a loja já estão em
`src/ui/marca/tela-*.png`.

## 4. App Store (precisa de Mac, US$ 99/ano)

A Apple não aceita app que é só um site; use o **Capacitor** e aproveite
recursos nativos (notificações). Resumo:

```bash
npm i @capacitor/core @capacitor/cli @capacitor/ios
npx cap init VagaCerta br.com.vagacerta.app --web-dir src/ui
npx cap add ios && npx cap open ios
```

Configure `server.url` para o seu domínio. Compras dentro do app no iPhone
seguem as regras da Apple (taxa de 15% a 30%).

## 5. Fazer as pessoas chegarem

Em ordem de custo:

1. **WhatsApp**: todo cartão de vaga tem "Enviar". A prévia do link mostra o
   logo e a promessa (`og.jpg`). Quem manda vaga para amigo traz usuário.
2. **Grupos locais**: grupos de vagas da cidade, igrejas, associações de
   bairro, CRAS. Um post por semana com "5 vagas com chance alta em
   [cidade]".
3. **Vídeos curtos** (TikTok, Reels, Shorts): "Fiz o teste de chance para
   motorista em SP" mostrando o app. O quiz de 30 segundos existe para isso.
4. **Parcerias**: SINE e prefeituras (programas de emprego), ONGs de
   recolocação 50+.
5. **Anúncios** só depois de medir: use o funil (`/api/funil`) para saber
   quantos visitantes viram assinantes e quanto pode pagar por visita.

## 6. Medir

O funil mostra onde as pessoas param: visitaram → abriram vaga → geraram
currículo → viram a oferta → clicaram em assinar → assinaram. Mexa primeiro
na etapa com a maior queda.
