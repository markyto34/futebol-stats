# API-Football Worker

Este Worker faz de intermediário seguro entre o Futebol Stats (GitHub Pages) e a API-Football. A chave fica num segredo do Cloudflare, nunca no JavaScript público do site.

## Antes de publicar

1. No Cloudflare Dashboard, abre **Workers & Pages** e cria um Worker novo.
2. Usa o conteúdo de `api-football-worker.js` como código do Worker.
3. Em **Settings → Variables and Secrets**, adiciona um segredo:
   - Nome: `API_FOOTBALL_KEY`
   - Valor: a tua chave privada da API-Football
4. Guarda e faz deploy.
5. Abre `https://TEU-WORKER.workers.dev/?action=status`. Deve aparecer `"ok": true` e informação do estado da conta. Não partilhes a chave.
6. Testa uma liga, por exemplo: `https://TEU-WORKER.workers.dev/?action=fixtures&league=POR_1_primeira-liga&season=2627`.

## Parâmetros

- `action=status` — verifica a ligação e mostra utilização/limite de pedidos.
- `action=fixtures&league=POR_1_primeira-liga&season=2627` — jogos e estatísticas disponíveis para a época.
- `status=FT` — filtra jogos terminados.
- `status=NS` — filtra jogos ainda não iniciados.

Épocas do site no formato `2627` são convertidas para a época API-Football `2026`.

## Ligas configuradas

Portugal Primeira Liga (94), Premier League (39), La Liga (140), Serie A italiana (135), Bundesliga (78), Ligue 1 (61), Eredivisie (88), Brasileirão Série A (71), Champions League (2), Bélgica Pro League (144), Turquia Süper Lig (203), Championship inglesa (40) e MLS (253).

## Importante

Este primeiro passo disponibiliza uma API segura e testável. **Ainda não altera o site para consumir estes dados**: depois de o Worker estar publicado e testado, a integração do frontend será feita numa alteração separada e revista. Não contém odds nem odds justas.
