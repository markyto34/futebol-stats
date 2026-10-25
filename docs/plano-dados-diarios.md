# Plano de dados diários — futebol-stats

## Objetivo

Preparar o projeto para atualizar uma base histórica uma vez por dia e alimentar as páginas de cantos, BTTS e previsão 1X2. Esta fase documenta a arquitetura; não ativa recolha automática nem faz pedidos ao Flashscore.

## Competições prioritárias

- Portugal: Primeira Liga
- Inglaterra: Premier League
- Espanha: La Liga
- Itália: Serie A
- Alemanha: Bundesliga
- França: Ligue 1
- Europa: Liga dos Campeões e Liga Europa

## Campos a guardar

### Jogos
- `source`: origem dos dados
- `source_match_id`: identificador da partida na origem, quando disponível
- `competition`, `season`, `match_date`, `status`
- `home_team`, `away_team`
- `home_goals`, `away_goals`

### Estatísticas finais
- `home_corners`, `away_corners`
- `home_shots`, `away_shots`
- `home_shots_on_target`, `away_shots_on_target`
- `home_possession`, `away_possession`
- `home_yellow_cards`, `away_yellow_cards`
- `home_red_cards`, `away_red_cards`

Estatísticas indisponíveis devem ficar vazias/nulas, nunca ser estimadas como se fossem observadas.

### Odds pré-jogo
Guardar cada mercado e seleção com a casa/fonte, odd decimal, timestamp da captura e indicação clara de que é pré-jogo. Não misturar odds de abertura, odds de fecho e odds ao vivo.

## Processo diário proposto

1. Executar a recolha através de uma fonte/API cuja utilização automatizada esteja autorizada.
2. Normalizar nomes de equipas e competições.
3. Fazer upsert pela combinação de origem e identificador do jogo; evitar duplicados.
4. Atualizar resultados e estatísticas apenas quando houver dados finais confirmados.
5. Registar data/hora, número de jogos lidos, atualizados, ignorados e erros.
6. Não publicar dados parciais se a recolha falhar; manter a última versão válida.
7. Alimentar as páginas existentes a partir dos dados normalizados.

## Qualidade e análise

- Distinguir valor desconhecido de zero.
- Registar a origem e o momento de cada dado.
- Separar estatísticas pré-jogo das estatísticas finais para evitar fuga de informação no backtest.
- Avaliar previsões por período temporal e por liga, incluindo tamanho da amostra, calibração e retorno hipotético com comissões/margens consideradas.
- Não interpretar resultados históricos como garantia de resultados futuros.

## Flashscore

O site móvel pode ser avaliado como referência para os campos e a cobertura pretendida. A recolha automatizada só deve ser ativada se existir autorização adequada ou um método de acesso permitido pelos termos aplicáveis. Não incluir técnicas de evasão a bloqueios, CAPTCHA, autenticação ou limites de acesso.

## Implementação futura

Depois de escolher a fonte autorizada e confirmar os campos disponíveis, implementar um adaptador de ingestão separado da lógica das páginas. Manter credenciais e tokens fora do repositório e usar variáveis secretas do ambiente de execução.
