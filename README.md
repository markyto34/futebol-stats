# Futebol Stats

Aplicação estática para explorar resultados históricos de futebol, estatísticas de cantos e estimativas simples de golos.

## Aceder à aplicação

- Site: https://markyto34.github.io/futebol-stats/
- Repositório: https://github.com/markyto34/futebol-stats
- Fonte dos CSV: https://github.com/oladeeayo/open-matchday

## Como utilizar

1. Abre a página correspondente ao mercado que queres analisar.
2. Escolhe a competição e a época.
3. Carrega os dados e seleciona as equipas disponíveis.
4. Confirma sempre o número de jogos usados em cada estatística e se existem dados de cantos.
5. Para estimativas, compara o resultado com outras fontes e não interpretes a percentagem histórica como garantia para o próximo jogo.

## Páginas

- `index.html`: entrada principal.
- `jogos.html`: jogos e calendário.
- `cantos.html`: estatísticas e previsões de cantos.
- `golos.html`: estimativas de golos.
- `btts.html`: mercado Ambas Marcam.
- `previsao-1x2.html`: previsão 1X2.
- `app.js`: carregamento, normalização de dados, estatísticas e lógica partilhada.
- `golos.js`: interface de estimativas de golos.

## Dados e atualização

A aplicação lê ficheiros CSV públicos do projeto [open-matchday](https://github.com/oladeeayo/open-matchday). A disponibilidade de competições, épocas, resultados e estatísticas de cantos depende dessa fonte. O carregamento bem-sucedido de um CSV não garante que todos os jogos ou campos estejam completos ou atualizados em tempo real.

Os dados são carregados no navegador; não existe uma base de dados própria neste projeto. A aplicação pode depender da disponibilidade do GitHub/CDN e dos ficheiros da fonte externa.

## Limitações estatísticas

- As estimativas são heurísticas baseadas nos resultados históricos disponíveis e em amostras limitadas.
- Jogos com campos em falta não devem ser interpretados como jogos com zero cantos.
- Percentagens históricas descrevem a amostra observada; não são probabilidades calibradas nem garantia de resultados futuros.
- O modelo ainda precisa de backtesting cronológico fora da amostra, comparação com uma referência simples e métricas de calibração antes de se concluir que tem valor preditivo.
- Não incorpora de forma sistemática onzes iniciais, lesões, suspensões, xG, árbitro, meteorologia, odds de mercado ou alterações táticas.
- Não existe garantia de lucro. Não apostes dinheiro que não podes perder.

## Desenvolvimento e validação

Após alterações, verifica as páginas principais no navegador e testa:
- carregamento de diferentes competições e épocas;
- comportamento quando os dados não estão disponíveis;
- ausência de erros na consola;
- consistência das amostras e tratamento de valores em falta;
- comparação das previsões com resultados posteriores usando apenas dados que estavam disponíveis antes de cada jogo.

As alterações no site podem demorar algum tempo a aparecer devido à cache do navegador ou à publicação do GitHub Pages.

## Licença e utilização

Projeto pessoal e informativo. Consulta a licença e as condições de utilização da fonte de dados original antes de redistribuir dados ou usar o projeto comercialmente.

### Testes automáticos

O repositório executa verificações de sintaxe JavaScript e testes unitários através do GitHub Actions em cada push e pull request. Para executar localmente com Node.js 22 ou compatível:

```bash
node --check app.js
node --check golos.js
node --test tests/*.test.cjs
```

Os testes atuais cobrem funções de parsing/normalização e fórmulas básicas; não substituem testes no navegador nem um backtesting cronológico com resultados reais.

### Backtesting cronológico (experimental)

Foi acrescentado um script walk-forward que só usa jogos de datas anteriores para prever os jogos seguintes. Todos os jogos da mesma data são previstos antes de os resultados desse dia entrarem no histórico, evitando fuga de informação entre partidas do mesmo dia. Descarrega/obtém um CSV de resultados compatível com o formato usado pela aplicação e executa:

```bash
node scripts/backtest.cjs caminho/para/results.csv --min-history=30
# ou diretamente a partir de um URL público
node scripts/backtest.cjs https://raw.githubusercontent.com/oladeeayo/open-matchday/master/data/POR_1_primeira-liga/results_2627.csv --min-history=30
```

Métricas: erro absoluto médio (MAE) dos golos por equipa, Brier score 1X2, acerto do resultado mais provável e, quando existem dados de cantos suficientes, MAE do total de cantos e acerto da classificação Over 8.5. O script não calcula ROI porque o CSV não contém odds históricas. O teste de cantos é uma referência simples, não uma reprodução do modelo de cantos da interface. Usar várias épocas e comparar com baselines antes de tirar conclusões.
