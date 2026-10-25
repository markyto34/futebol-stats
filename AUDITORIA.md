# Auditoria técnica — Futebol Stats

Data: 25/10/2026  
Repositório: https://github.com/markyto34/futebol-stats  
Site: https://markyto34.github.io/futebol-stats/

## Objetivo e estado

A aplicação é um site estático para consultar resultados históricos e produzir estimativas estatísticas de golos, BTTS, 1X2 e cantos. A interface foi alterada para não depender de odds: as previsões devem apresentar probabilidades, médias/valores esperados e frequências históricas, sem cotações nem comparação com mercado.

A última revisão deste documento encontrou conteúdo antigo que ainda descrevia odds justas, edge de mercado e inputs de odds. Esse texto foi removido porque já não descreve o objetivo atual do projeto.

## O que está confirmado

- O repositório tem páginas HTML separadas para visão geral, jogos, cantos, BTTS, 1X2 e golos.
- O JavaScript principal é `app.js`; a página de golos também usa `golos.js`.
- A fonte de dados indicada pela aplicação é o projeto CSV [open-matchday](https://github.com/oladeeayo/open-matchday).
- Existe cache de sessão com validade de 15 minutos em `app.js`.
- O próprio projeto contém documentação sobre inspeção de ficheiros CSV.
- A existência de testes automáticos e de uma publicação bem-sucedida não prova, por si só, que todas as interações funcionam no navegador nem que as previsões estão bem calibradas.

## Problemas que exigem validação ou correção

### P0 — Integridade das previsões

1. **Não confundir ausência de dados com zero.** Se uma equipa não tiver estatísticas de cantos HT, isso não pode ser apresentado como zero cantos. Cada métrica deve usar apenas jogos com essa métrica disponível e indicar o tamanho da amostra.
2. **Mostrar amostras por métrica.** Médias de golos, cantos FT, cantos HT e resultados podem usar conjuntos de jogos diferentes. O número de jogos deve acompanhar cada estimativa.
3. **Probabilidades são estimativas, não certezas.** Um modelo Poisson simples assume condições que nem sempre se verificam no futebol (dependência entre equipas, estado do marcador, expulsões e variação de estilo). Não apresentar precisão decimal como se fosse garantia.
4. **Backtest antes de confiar no modelo.** Avaliar em épocas não usadas para ajustar o modelo, usando separação temporal (walk-forward). Para probabilidades: Brier score, log loss e calibração; para contagens de golos/cantos: MAE e comparação com uma baseline simples. Publicar o número de jogos avaliados e a cobertura dos dados.
5. **Evitar fuga de informação.** A previsão de cada jogo deve usar apenas dados disponíveis antes desse jogo; médias da época completa não podem ser usadas para prever jogos dessa mesma época no backtest.

### P1 — Dados e robustez

6. **Validar CSVs reais.** Testar cabeçalhos, campos vazios, delimitadores, números em falta, datas inválidas, equipas com nomes alternativos e linhas duplicadas. Manter amostras fixas de CSV para testes de regressão.
7. **Separar resultados históricos de fixtures futuros.** Um jogo sem resultado não deve entrar em médias ou backtests; um campo vazio não deve ser convertido silenciosamente em zero.
8. **Cache e falhas de rede.** Informar quando a fonte falha e quando são apresentados dados em cache. Uma cache antiga não deve ser confundida com dados acabados de atualizar.
9. **Cobertura variável.** Antes de calcular previsões, mostrar a competição, época, intervalo temporal e quantidade de jogos válidos. Se a amostra for pequena, avisar ou impedir a previsão.
10. **Proteção contra dados externos malformados.** Validar valores numéricos e datas antes de calcular; não confiar cegamente em conteúdo vindo de CSV.

### P1 — Interface e funcionamento

11. **Revisão completa no navegador ainda necessária.** A análise estática e a passagem de workflows não substituem testar todas as páginas, filtros, seletores, botões, estados vazios e erros de rede.
12. **Responsividade e acessibilidade.** Verificar em telemóvel e desktop: tabelas largas, navegação por teclado, foco visível, contraste, rótulos dos controlos e mensagens de erro.
13. **Cache de scripts.** Quando se alteram ficheiros JavaScript, atualizar os parâmetros de versão nas páginas que os carregam, para reduzir a hipótese de o navegador manter uma versão antiga.
14. **Consistência de conteúdo.** Não deixar texto de odds/mercado em páginas, documentação, comentários ou testes se a aplicação já não oferece essa funcionalidade.

## Plano de validação final

- [ ] Confirmar sintaxe JavaScript de todos os ficheiros executáveis.
- [ ] Executar todos os testes automatizados e verificar o resultado dos workflows.
- [ ] Verificar referências a elementos HTML e funções chamadas por botões/eventos.
- [ ] Testar CSV com estatísticas ausentes, valores zero legítimos, datas inválidas e ficheiro indisponível.
- [ ] Confirmar que não há odds nem comparação de mercado na interface.
- [ ] Fazer backtest temporal separado por liga/época e guardar métricas reproduzíveis.
- [ ] Abrir cada página publicada em telemóvel e desktop e testar os percursos principais.

## Conclusão

O site pode servir para explorar dados históricos e gerar estimativas experimentais, mas não deve ser considerado um modelo comprovadamente preditivo até passar um backtest temporal robusto e uma revisão funcional no navegador. Esta auditoria distingue os pontos identificados por inspeção do código dos testes que ainda precisam de execução; não declara como concluída nenhuma validação que não tenha sido efetivamente realizada.
