# Publicador próprio do Instagram (sem plataforma paga)

Publica reels, carrosséis, posts de feed e stories no @souolucasribeiro pela API oficial
do Instagram e guarda as métricas. Roda de graça no GitHub Actions deste repo público.

## Como funciona

1. Cada post é um arquivo `.json` na pasta `fila/`, com a mídia em `fila/midia/`.
2. A cada 15 minutos o GitHub roda `publicar.mjs`: o que já venceu **e** tem `"aprovado": true` é publicado.
3. Depois de publicado, o `.json` vai para `gestao/publicados/AAAA-MM/` (com link e id) e a mídia sai da fila.
4. `gestao/AGENDA.md` mostra a fila e os últimos publicados.
5. Às 9h e às 21h o `metricas.mjs` atualiza `gestao/RELATORIO.md` (5 melhores e 5 piores por comentário,
   compartilhamento e salvamento a cada mil alcançados) e os CSVs em `gestao/metricas/`.
6. Toda segunda o token é renovado sozinho (ele vence em 60 dias).

Se algo falhar, o post fica na fila com `"status": "erro"` e o motivo, o GitHub manda e-mail,
e o sistema tenta de novo até 3 vezes.

## Post na fila

```json
{
  "quando": "2026-10-30T19:00:00-03:00",
  "tipo": "REELS",
  "aprovado": true,
  "legenda": "Primeira linha que prende...\n\nComenta LEILÃO",
  "midias": ["fila/midia/20261030-1900-reels-casa/01.mp4"],
  "capa": "fila/midia/20261030-1900-reels-casa/capa.jpg"
}
```

- `tipo`: `REELS`, `CARROSSEL` (2 a 10 mídias), `FEED` (1 foto) ou `STORY` (1 foto ou vídeo, sem legenda).
- Imagem tem de ser JPEG. O `enfileirar.mjs` converte PNG sozinho:
  `node publicador/enfileirar.mjs --tipo CARROSSEL --quando 2026-10-30T08:00-03:00 --legenda legenda.txt --aprovado tela1.png tela2.png`
- Opcionais: `capa` (reels), `capaMs` (frame da capa em ms), `compartilharNoFeed` (padrão true), `colaboradores` (lista de @).

## Limites da API (iguais aos do Metricool)

- Story não leva figurinha (link, enquete, caixinha). Música da biblioteca do Instagram não entra no reel.
- Até 100 publicações por 24h.
- O horário pode atrasar alguns minutos (o agendador do GitHub roda a cada 15 min e às vezes atrasa).
- O repo é público: legenda e mídia da fila ficam visíveis para quem procurar o repo antes de publicar.

## Configuração (uma vez só)

Secrets em Settings → Secrets and variables → Actions:

| Secret | O que é |
|---|---|
| `IG_TOKEN` | token do Instagram: de login do Instagram (`IG...`, renovado toda semana) ou token de página do login do Facebook (`EAA...`, não expira) |
| `IG_USER_ID` | id numérico da conta do Instagram (no login do Facebook é o `instagram_business_account` da página) |
| `GH_PAT` | token do GitHub com "Secrets: read and write" só neste repo, para renovar o `IG_TOKEN` |

Permissões do app Meta. Login do Instagram: `instagram_business_basic`, `instagram_business_content_publish`,
`instagram_business_manage_insights`. Login do Facebook: `instagram_basic`, `instagram_content_publish`,
`instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`, `business_management`. Como o app é só para a própria conta, não precisa de revisão da Meta.

## Testes

`cd publicador && npm test` (simula a API, não publica nada).
