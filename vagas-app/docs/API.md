# API do VagaCerta

Base: o mesmo endereço do app (ex.: `https://vagacerta.app`). Respostas em
JSON, UTF-8. Todas as rotas `/api/*` têm limite de requisições por IP e
respondem `429` com `retry-after` quando passam dele.

## `GET /api/saude`

Para monitoramento e para o Docker saber se está no ar.

```json
{ "ok": true, "fontes": ["Adzuna", "Jooble"], "modo": "ao-vivo" }
```

## `GET /api/vagas?q=&onde=&pagina=`

| Parâmetro | Exemplo | |
|---|---|---|
| `q` | `motorista` | o que buscar (até 100 caracteres) |
| `onde` | `SP` ou `Campinas` | local (até 60) |
| `pagina` | `1` a `10` | |

Sem chave de fonte configurada, devolve as vagas de exemplo
(`"fonte": "exemplo"`). Com chave, só vagas reais (`"fonte": "ao-vivo"`),
de todas as fontes ao mesmo tempo, sem repetidas, com cache de 10 minutos.

```json
{
  "fonte": "ao-vivo",
  "cache": false,
  "fontes": [{ "nome": "Jooble", "ok": true, "quantidade": 20, "ms": 412 }],
  "vagas": [{
    "id": "joo-123", "titulo": "Porteiro", "empresa": "Condomínio X",
    "cidade": "Santos", "uf": "SP", "modalidade": "presencial", "contrato": "CLT",
    "salarioMin": 200000, "salarioMax": 220000,
    "requisitos": ["controle de acesso"], "publicadaEm": "2026-09-27",
    "fonte": "Jooble", "url": "https://..."
  }]
}
```

Salários sempre em **centavos por mês** (anuais e por hora são convertidos).

## `GET /api/sugestoes?q=mot`

```json
{ "sugestoes": ["Motorista Entregador", "Motoboy Entregador", "Motorista de Van Escolar"] }
```

## `POST /api/alertas`

Cria alerta de vagas novas no WhatsApp. Pedir o mesmo alerta de novo não
duplica.

```json
{ "telefone": "(11) 98765-4321", "texto": "motorista", "uf": "SP" }
```

`201 { "id": "..." }` ou `400 { "erro": "Informe um celular com DDD..." }`.
Só aceita celular brasileiro válido (DDD existente, 9 dígitos).

Os avisos saem pelo `npm run alertas -- --enviar` (agende de hora em hora).

## `POST /api/eventos`

Registra um passo do funil. Corpo até 4 KB.

```json
{ "nome": "abrir_vaga", "sessao": "k3j2h4g5f6d7s8a9", "dados": { "vaga": "v01" } }
```

Nomes aceitos: `visita`, `abrir_vaga`, `gerar`, `ver_oferta`,
`clique_assinar`, `assinou`, `buscar`, `salvar`, `compartilhar`,
`quiz_concluido`, `filtro`. `204` quando aceito.

## `GET /api/funil?chave=PAINEL_CHAVE`

```json
{ "total": 5321, "alertas": 87, "funil": [
  { "evento": "visita", "nome": "Visitaram", "sessoes": 1200, "doTopo": 100, "daAnterior": null },
  { "evento": "abrir_vaga", "nome": "Abriram uma vaga", "sessoes": 640, "doTopo": 53.3, "daAnterior": 53.3 }
] }
```

## `GET /.well-known/assetlinks.json`

Prova para o Android que o app da Play Store e o site são do mesmo dono
(necessário para o app abrir sem barra de navegador). Configure
`TWA_PACOTE` e `TWA_SHA256`.

## Integrações

| Serviço | Para quê | Variáveis |
|---|---|---|
| Adzuna, Jooble, Careerjet | vagas reais | ver README |
| WhatsApp Cloud API (Meta) | alertas | `WHATSAPP_TOKEN`, `WHATSAPP_NUMERO_ID`, `WHATSAPP_MODELO` |
| Mercado Pago ou Stripe | assinatura (próxima etapa) | — |

## Segurança

- Chaves das APIs só no servidor; o navegador nunca as vê.
- Cabeçalhos: CSP restrita, `nosniff`, `X-Frame-Options: DENY`.
- Corpo de POST limitado a 4 KB; nomes de evento em lista fechada.
- A pasta `dados/` nunca é servida.
