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


  function expectedHalfGoals(home, away) {
    const valid = matches.filter(m => m.htHomeGoals !== null && m.htAwayGoals !== null);
    const leagueHome = valid.length ? valid.reduce((s, m) => s + m.htHomeGoals, 0) / valid.length : null;
    const leagueAway = valid.length ? valid.reduce((s, m) => s + m.htAwayGoals, 0) / valid.length : null;
    if (leagueHome === null || leagueAway === null || leagueHome <= 0 || leagueAway <= 0) return null;

    const homeGames = recentTeamGames(home, "home", 10).filter(m => m.htHomeGoals !== null && m.htAwayGoals !== null);
    const awayGames = recentTeamGames(away, "away", 10).filter(m => m.htHomeGoals !== null && m.htAwayGoals !== null);
    if (homeGames.length < 2 || awayGames.length < 2) return null;

    const homeScored = average(homeGames.map(m => m.htHomeGoals));
    const homeConceded = average(homeGames.map(m => m.htAwayGoals));
    const awayScored = average(awayGames.map(m => m.htAwayGoals));
    const awayConceded = average(awayGames.map(m => m.htHomeGoals));
    const ha = shrinkAverage(homeScored, homeGames.length, leagueHome);
    const hd = shrinkAverage(homeConceded, homeGames.length, leagueAway);
    const aa = shrinkAverage(awayScored, awayGames.length, leagueAway);
    const ad = shrinkAverage(awayConceded, awayGames.length, leagueHome);
    return {
      home: Math.max(0.01, Math.min(3, ha * ad / leagueHome)),
      away: Math.max(0.01, Math.min(3, aa * hd / leagueAway)),
      homeSample: homeGames.length, awaySample: awayGames.length, leagueSample: valid.length
    };
  }

  function renderGoalsHT() {
    const output = $g("goalsHtResult");
    const home = $g("goalHome")?.value;
    const away = $g("goalAway")?.value;
    if (!output || !home || !away) return;
    if (home === away) { output.innerHTML = "<p>Escolhe duas equipas diferentes.</p>"; return; }
    const p = expectedHalfGoals(home, away);
    if (!p) {
      output.innerHTML = "<p>Não há dados HT suficientes para esta competição ou para estas equipas. A fonte pode não disponibilizar resultados ao intervalo nesta época.</p>";
      return;
    }
    const total = p.home + p.away;
    const linesHT = [0.5, 1.5, 2.5].map(line => {
      const over = poissonOverLine(total, line);
      return {line, over, under: 1 - over};
    });
    let h = 0, d = 0, a = 0;
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
      const prob = poissonProbability(i, p.home) * poissonProbability(j, p.away);
      if (i > j) h += prob; else if (i === j) d += prob; else a += prob;
    }
    output.innerHTML = `<h3>${home} vs. ${away} — intervalo</h3>
      <div class="stats">
        <div class="stat"><span>Golos HT esperados — casa</span><strong>${p.home.toFixed(2).replace(".", ",")}</strong></div>
        <div class="stat"><span>Golos HT esperados — fora</span><strong>${p.away.toFixed(2).replace(".", ",")}</strong></div>
        <div class="stat"><span>Total esperado HT</span><strong>${total.toFixed(2).replace(".", ",")}</strong></div>
        <div class="stat"><span>Amostra casa / fora</span><strong>${p.homeSample} / ${p.awaySample}</strong></div>
      </div>
      <h3>Over / Under ao intervalo</h3>
      <div class="tablewrap"><table><thead><tr><th>Linha HT</th><th>Prob. Over</th><th>Odd justa Over</th><th>Prob. Under</th><th>Odd justa Under</th></tr></thead><tbody>
      ${linesHT.map(x => `<tr><td>${x.line.toString().replace(".", ",")}</td><td>${pct(x.over)}</td><td>${odds(x.over > 0 ? 1/x.over : null)}</td><td>${pct(x.under)}</td><td>${odds(x.under > 0 ? 1/x.under : null)}</td></tr>`).join("")}
      </tbody></table></div>
      <h3>Resultado ao intervalo (1X2 HT)</h3>
      <div class="stats">
        <div class="stat"><span>Casa a vencer HT</span><strong>${pct(h)}</strong><span>Odd justa: ${odds(h > 0 ? 1/h : null)}</span></div>
        <div class="stat"><span>Empate HT</span><strong>${pct(d)}</strong><span>Odd justa: ${odds(d > 0 ? 1/d : null)}</span></div>
        <div class="stat"><span>Visitante a vencer HT</span><strong>${pct(a)}</strong><span>Odd justa: ${odds(a > 0 ? 1/a : null)}</span></div>
      </div>
      <p class="muted">Base: golos HT dos últimos jogos em casa da equipa da casa e fora da visitante, ajustados à média da competição. Registos HT válidos na competição: ${p.leagueSample}. Modelo Poisson simples, ainda sem validação retrospetiva; probabilidades e odds justas são estimativas, não garantias.</p>`;
  }

  function avoidSame(changedId, otherId) {
    const changed = $g(changedId), other = $g(otherId);
    if (changed.value !== other.value) return;
    const alternative = [...other.options].find(option => option.value !== changed.value);
    if (alternative) other.value = alternative.value;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const button = $g("analyseGoals");
    if (button) button.addEventListener("click", () => { renderGoals(); renderGoalsHT(); });
    ["goalOddsOver25", "goalOddsUnder25"].forEach(id => {
      const field = $g(id);
      if (field) {
        field.addEventListener("input", renderGoals);
        field.addEventListener("change", renderGoals);
      }
    });
    $g("goalHome")?.addEventListener("change", () => { avoidSame("goalHome", "goalAway"); renderGoalsHT(); });
    $g("goalAway")?.addEventListener("change", () => { avoidSame("goalAway", "goalHome"); renderGoalsHT(); });
  });
})();