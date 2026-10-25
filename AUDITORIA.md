# Auditoria técnica — Futebol Stats

Data da auditoria: 25/10/2026

## Âmbito e limitações

Revisão estática do repositório `markyto34/futebol-stats`, das páginas HTML, do JavaScript, dos testes e dos workflows GitHub Actions. Não equivale a um teste visual completo em vários telemóveis/navegadores nem a uma validação estatística com uma base histórica extensa.

## Estado geral

- A aplicação está publicada via GitHub Pages e tem páginas para visão geral, cantos, BTTS, próximos jogos, 1X2 e Over/Under golos.
- O carregamento atual usa ficheiros CSV públicos do projeto `oladeeayo/open-matchday`; a API-Football não está integrada no carregamento normal do site.
- Existem testes de parsing, normalização de dados e funções Poisson, mais workflows manuais para verificar a chave API-Football e consultar jogos da Liga Portugal.
- O backtest é experimental e não inclui odds históricas; por isso ainda não permite concluir que existe ROI positivo ou vantagem sustentável.

## Problemas e prioridades

### P0 — Corrigir antes de confiar nas previsões

1. **Separar edge do modelo e edge ajustado ao mercado no 1X2.** A interface combina a probabilidade histórica com a probabilidade de mercado e depois calcula o indicador matemático sobre a probabilidade combinada. Esse indicador não é uma estimativa independente do modelo; deve mostrar ambos, claramente identificados.
2. **Validar calibração e amostras.** As odds justas são derivadas de modelos Poisson simples. Devem ser apresentadas como estimativas experimentais até existirem testes walk-forward multiépoca, Brier/Log Loss e curvas de calibração.
3. **Auditar disponibilidade dos dados.** A fonte pode não conter cantos, estatísticas HT ou calendários para todas as ligas/épocas. A interface deve distinguir claramente “zero” de “sem dados” e mostrar tamanho de amostra para cada mercado.
4. **Evitar misturar amostras.** As médias de golos e cantos usam subconjuntos diferentes quando faltam estatísticas. Os rótulos devem deixar explícito o número de jogos usados para cada estimativa.

### P1 — Fiabilidade de dados e testes

5. **Cobertura de testes insuficiente.** Os testes existentes cobrem algumas funções isoladas, mas não validam integralmente o backtest, cálculo das probabilidades 1X2, cantos HT, comparação com odds, filtros de calendário nem comportamento de erros de rede.
6. **Testar a fonte CSV real.** Adicionar testes de integração com amostras fixas e anonimizadas/guardadas no repositório para detetar alterações de cabeçalhos e campos ausentes.
7. **Datas e calendários.** A aplicação normaliza formatos de data, mas a lógica de fixtures deve ser testada com datas portuguesas, ISO, viragem do dia e jogos com hora/fuso.
8. **Cache e atualidade.** A cache de sessão dura 15 minutos. A interface já tenta apresentar data da compilação da fonte; deve deixar explícito quando os dados vieram da cache e quando a fonte não disponibiliza atualização.
9. **API-Football ainda é apenas uma verificação manual.** Os workflows confirmam acesso/fixtures, mas não recolhem nem guardam diariamente resultados, cantos, cartões ou odds. Não agendar recolha antes de confirmar quota gratuita, cobertura por competição e termos de utilização.

### P2 — Melhorias funcionais

10. **Validação de odds inseridas.** Testar entradas vazias, vírgulas decimais, odds iguais a 1, valores absurdos e mercados incompletos; impedir resultados enganosos.
11. **Acessibilidade e experiência móvel.** Testar navegação por teclado, foco, mensagens de erro, tabelas largas em ecrãs pequenos e estados de carregamento.
12. **Monitorização da publicação.** Os workflows de testes e GitHub Pages estão a funcionar; convém manter ambos e verificar o estado após cada alteração.
13. **Documentação de fontes.** Registar os campos disponíveis por liga/época, limitações, licença/termos e a diferença entre dados históricos e calendário futuro.

## Plano recomendado

1. Corrigir a semântica do edge 1X2 e acrescentar testes para esse cálculo.
2. Criar testes unitários e de regressão para o backtest, incluindo amostras iguais para modelo e baseline.
3. Criar um relatório de cobertura por liga/época: número de jogos, cobertura de cantos FT/HT, datas inicial/final e jogos futuros.
4. Executar backtests em várias épocas e ligas; reportar MAE, Brier/Log Loss, calibração e amostra de cada métrica.
5. Só depois avaliar ingestão automática de API-Football, respeitando quota e termos, sem expor a chave no frontend.
6. Fazer revisão visual em telemóvel e desktop e corrigir os problemas encontrados.

## Conclusão

O site já tem uma base funcional e testes automáticos úteis, mas ainda não deve ser tratado como um sistema de previsões comprovadamente lucrativo. O maior risco atual não é apenas um erro de código: é a falsa confiança em probabilidades teóricas sem validação fora da amostra e sem odds históricas. A prioridade é melhorar transparência, cobertura de testes e evidência estatística antes de acrescentar mais mercados.
