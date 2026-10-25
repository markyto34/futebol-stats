"use strict";

(function () {
  const $g = id => document.getElementById(id);
  const lines = [0.5, 1.5, 2.5, 3.5, 4.5];

  function parseOdd(value) {
    const cleaned = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 1 ? n : null;
  }

  function pct(value) {
    return value === null || !Number.isFinite(value) ? "N/D" : (value * 100).toFixed(1).replace(".", ",") + "%";
  }

  function odds(value) {
    return value === null || !Number.isFinite(value) || value <= 0 ? "N/D" : value.toFixed(2).replace(".", ",");
  }

  function averageGoalSample(home, away) {
    const homeGames = recentTeamGames(home, "home", 10);
    const awayGames = recentTeamGames(away, "away", 10);
    const homeTotals = homeGames.map(m => m.homeGoals + m.awayGoals);
    const awayTotals = awayGames.map(m => m.homeGoals + m.awayGoals);
    const values = [...homeTotals, ...awayTotals];
    return {
      count: values.length,
      percentages: lines.map(line => ({
        line,
        over: values.length ? values.filter(total => total > line).length / values.length : null,
        under: values.length ? values.filter(total => total < line).length / values.length : null
      }))
    };
  }

  function renderGoals() {
    const output = $g("goalsResult");
    const home = $g("goalHome")?.value;
    const away = $g("goalAway")?.value;
    if (!output || !home || !away) return;
    if (home === away) {
      output.innerHTML = "<p>Escolhe duas equipas diferentes.</p>";
      return;
    }

    const expected = expectedGoalsForMatch(home, away);
    if (!expected) {
      output.innerHTML = "<p>Não existem dados suficientes para estimar os golos deste confronto.</p>";
      return;
    }

    const totalLambda = expected.lambdaHome + expected.lambdaAway;
    const modelLines = lines.map(line => {
      const over = poissonOverLine(totalLambda, line);
      return { line, over, under: over === null ? null : 1 - over };
    });
    const historical = averageGoalSample(home, away);
    const oddOver = parseOdd($g("goalOddsOver25")?.value);
    const oddUnder = parseOdd($g("goalOddsUnder25")?.value);
    const over25 = modelLines.find(x => x.line === 2.5)?.over;
    let marketHtml = "<p class=\"muted\">Introduz as odds Over e Under 2,5 para comparar o modelo com o mercado.</p>";

    if (oddOver && oddUnder && over25 !== null) {
      const rawOver = 1 / oddOver;
      const rawUnder = 1 / oddUnder;
      const marketOver = rawOver / (rawOver + rawUnder);
      const edge = over25 * oddOver - 1;
      marketHtml = `<h3>Comparação de mercado — linha 2,5</h3>
        <p>Probabilidade de mercado normalizada Over: <strong>${pct(marketOver)}</strong>. Modelo Over: <strong>${pct(over25)}</strong>.</p>
        <p>Odd justa Over: <strong>${odds(over25 > 0 ? 1 / over25 : null)}</strong>; odd justa Under: <strong>${odds(over25 < 1 ? 1 / (1 - over25) : null)}</strong>.</p>
        <p>Diferença matemática estimada (probabilidade do modelo × odd − 1): <strong>${pct(edge)}</strong>. Isto não confirma uma vantagem real nem garante lucro.</p>`;
    }

    output.innerHTML = `<h3>${home.replace(/&/g, "&amp;").replace(/</g, "&lt;")} vs. ${away.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</h3>
      <div class="stats">
        <div class="stat"><span>Golos esperados — casa</span><strong>${expected.lambdaHome.toFixed(2).replace(".", ",")}</strong></div>
        <div class="stat"><span>Golos esperados — fora</span><strong>${expected.lambdaAway.toFixed(2).replace(".", ",")}</strong></div>
        <div class="stat"><span>Total esperado de golos</span><strong>${totalLambda.toFixed(2).replace(".", ",")}</strong></div>
        <div class="stat"><span>Amostra histórica</span><strong>${historical.count} jogos-equipa</strong></div>
      </div>
      <div class="tablewrap"><table>
        <thead><tr><th>Linha</th><th>Modelo Over</th><th>Odd justa Over</th><th>Modelo Under</th><th>Odd justa Under</th><th>Histórico Over</th></tr></thead>
        <tbody>${modelLines.map(row => {
          const hist = historical.percentages.find(x => x.line === row.line);
          return `<tr><td>${row.line.toFixed(1).replace(".", ",")}</td>
            <td>${pct(row.over)}</td><td>${odds(row.over > 0 ? 1 / row.over : null)}</td>
            <td>${pct(row.under)}</td><td>${odds(row.under > 0 ? 1 / row.under : null)}</td>
            <td>${pct(hist?.over ?? null)}</td></tr>`;
        }).join("")}</tbody>
      </table></div>
      ${marketHtml}
      <p class="muted">O modelo de Poisson usa médias recentes de golos marcados/sofridos em casa e fora, ajustadas à média da competição. O histórico considera até 10 jogos em casa da equipa da casa e 10 jogos fora da visitante. Amostras pequenas e força dos adversários podem distorcer os resultados.</p>`;
  }

  function avoidSame(changedId, otherId) {
    const changed = $g(changedId), other = $g(otherId);
    if (changed.value !== other.value) return;
    const alternative = [...other.options].find(option => option.value !== changed.value);
    if (alternative) other.value = alternative.value;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const button = $g("analyseGoals");
    if (button) button.addEventListener("click", renderGoals);
    ["goalOddsOver25", "goalOddsUnder25"].forEach(id => {
      const field = $g(id);
      if (field) {
        field.addEventListener("input", renderGoals);
        field.addEventListener("change", renderGoals);
      }
    });
    $g("goalHome")?.addEventListener("change", () => avoidSame("goalHome", "goalAway"));
    $g("goalAway")?.addEventListener("change", () => avoidSame("goalAway", "goalHome"));
  });
})();