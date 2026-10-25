"use strict";

(function () {
  const $g = id => document.getElementById(id);
  const lines = [0.5, 1.5, 2.5, 3.5, 4.5];

  function renderGoals() {
    const home=$g("goalHome")?.value,away=$g("goalAway")?.value,output=$g("goalResult");if(!output)return;
    if(!home||!away){output.innerHTML="<p>Seleciona as duas equipas.</p>";return;}if(home===away){output.innerHTML="<p>Escolhe duas equipas diferentes.</p>";return;}
    const p=estimateMatch(home,away);if(!p){output.innerHTML="<p>Não existem dados suficientes para esta previsão.</p>";return;}
    const lines=[1.5,2.5,3.5,4.5];
    const hg = p.homeGoals, ag = p.awayGoals, total = hg !== null && ag !== null ? hg + ag : null;
    output.innerHTML=`<h3>${esc(home)} vs. ${esc(away)}</h3><div class="stats"><div class="stat"><span>Golos esperados casa</span><strong>${num(hg,2)}</strong></div><div class="stat"><span>Golos esperados fora</span><strong>${num(ag,2)}</strong></div><div class="stat"><span>Cantos esperados totais</span><strong>${num(p.totalCorners,2)}</strong></div><div class="stat"><span>Amostra de cantos</span><strong>${p.cornerSample}</strong></div></div>${total === null ? "<p>Não foi possível calcular probabilidades de golos: faltam dados de golos para o modelo. As estatísticas de cantos acima continuam disponíveis quando existem.</p>" : `<div class="tablewrap"><table><thead><tr><th>Linha</th><th>Prob. Over</th><th>Prob. Under</th><th>Histórico Over</th></tr></thead><tbody>${lines.map(line=>{const over=poissonOver(total,line);return `<tr><td>${line.toString().replace(".",",")}</td><td>${pct(over)}</td><td>${pct(1-over)}</td><td>${historicalOver(line)}</td></tr>`;}).join("")}</tbody></table></div>`}<p class="muted">Probabilidades estatísticas estimadas; não são garantias. N/D indica ausência de dados válidos.</p>`;
  }

  function renderGoalsHT() {
    const output = $g("goalsHtResult");
    const home = $g("goalHome")?.value;
    const away = $g("goalAway")?.value;
    if (!output || !home || !away) return;
    if (home === away) { output.innerHTML = "<p>Escolhe duas equipas diferentes.</p>"; return; }
    const p = expectedHalfGoals(home, away);
    if (!p) {
      const hr = recentTeamGames(home, "home", 10).filter(m => m.htHomeGoals !== null && m.htAwayGoals !== null);
      const ar = recentTeamGames(away, "away", 10).filter(m => m.htHomeGoals !== null && m.htAwayGoals !== null);
      const avg = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
      output.innerHTML = `<h3>${esc(home)} vs. ${esc(away)} — intervalo</h3>
        <p>Não há dados HT suficientes para calcular as probabilidades, mas estes são os registos disponíveis.</p>
        <div class="stats">
          <div class="stat"><span>Golos HT marcados — casa</span><strong>${avg(hr.map(m => m.htHomeGoals)) === null ? "N/D" : avg(hr.map(m => m.htHomeGoals)).toFixed(2).replace(".", ",")}</strong></div>
          <div class="stat"><span>Golos HT sofridos — casa</span><strong>${avg(hr.map(m => m.htAwayGoals)) === null ? "N/D" : avg(hr.map(m => m.htAwayGoals)).toFixed(2).replace(".", ",")}</strong></div>
          <div class="stat"><span>Golos HT marcados — visitante</span><strong>${avg(ar.map(m => m.htAwayGoals)) === null ? "N/D" : avg(ar.map(m => m.htAwayGoals)).toFixed(2).replace(".", ",")}</strong></div>
          <div class="stat"><span>Golos HT sofridos — visitante</span><strong>${avg(ar.map(m => m.htHomeGoals)) === null ? "N/D" : avg(ar.map(m => m.htHomeGoals)).toFixed(2).replace(".", ",")}</strong></div>
        </div>
        <p class="muted">Amostra HT: ${hr.length} jogos em casa e ${ar.length} fora. Não se inventam probabilidades quando faltam dados.</p>`;
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
    output.innerHTML = `<h3>${esc(home)} vs. ${esc(away)} — intervalo</h3>
      <div class="stats">
        <div class="stat"><span>Golos HT esperados — casa</span><strong>${p.home.toFixed(2).replace(".", ",")}</strong></div>
        <div class="stat"><span>Golos HT esperados — fora</span><strong>${p.away.toFixed(2).replace(".", ",")}</strong></div>
        <div class="stat"><span>Total esperado HT</span><strong>${total.toFixed(2).replace(".", ",")}</strong></div>
        <div class="stat"><span>Amostra casa / fora</span><strong>${p.homeSample} / ${p.awaySample}</strong></div>
      </div>
      <h3>Over / Under ao intervalo</h3>
      <div class="tablewrap"><table><thead><tr><th>Linha HT</th><th>Prob. Over</th><th>Prob. Under</th></tr></thead><tbody>
      ${linesHT.map(x => `<tr><td>${x.line.toString().replace(".", ",")}</td><td>${pct(x.over)}</td><td>${pct(x.under)}</td></tr>`).join("")}
      </tbody></table></div>
      <h3>Resultado ao intervalo (1X2 HT)</h3>
      <div class="stats">
        <div class="stat"><span>Casa a vencer HT</span><strong>${pct(h)}</strong></div>
        <div class="stat"><span>Empate HT</span><strong>${pct(d)}</strong></div>
        <div class="stat"><span>Visitante a vencer HT</span><strong>${pct(a)}</strong></div>
      </div>
      <p class="muted">Base: golos HT dos últimos jogos em casa da equipa da casa e fora da visitante, ajustados à média da competição. Registos HT válidos na competição: ${p.leagueSample}. Modelo Poisson simples, ainda sem validação retrospetiva; probabilidades são estimativas, não garantias.</p>`;
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
    $g("goalHome")?.addEventListener("change", () => { avoidSame("goalHome", "goalAway"); renderGoalsHT(); });
    $g("goalAway")?.addEventListener("change", () => { avoidSame("goalAway", "goalHome"); renderGoalsHT(); });
  });
})();