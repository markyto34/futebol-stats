
"use strict";

const $ = id => document.getElementById(id);
let matches = [];
let fixturesData = [];

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') quoted = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (c !== "\r") {
        field += c;
      }
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  if (!rows.length) return [];

  const headers = rows.shift().map(x => x.trim().replace(/^\uFEFF/, ""));

  return rows.filter(r => r.some(v => v.trim() !== "")).map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = (r[i] || "").trim());
    return obj;
  });
}

function getValue(obj, names) {
  for (const name of names) {
    if (obj[name] !== undefined && obj[name] !== "") return obj[name];
  }

  const keys = Object.keys(obj);
  for (const name of names) {
    const found = keys.find(k => k.toLowerCase() === name.toLowerCase());
    if (found && obj[found] !== "") return obj[found];
  }

  return "";
}

function numberValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function normalizeResult(row) {
  const home = getValue(row, ["home", "home_team", "HomeTeam"]);
  const away = getValue(row, ["away", "away_team", "AwayTeam"]);
  const homeGoals = numberValue(getValue(row, [
    "ft_home", "home_score", "home_goals", "FTHG"
  ]));
  const awayGoals = numberValue(getValue(row, [
    "ft_away", "away_score", "away_goals", "FTAG"
  ]));

  if (!home || !away || homeGoals === null || awayGoals === null) {
    return null;
  }

  return {
    date: getValue(row, ["date", "match_date", "Date"]),
    home,
    away,
    homeGoals,
    awayGoals,
    homeCorners: numberValue(getValue(row, [
      "home_corners", "HomeCorners", "HC", "home_corner"
    ])),
    awayCorners: numberValue(getValue(row, [
      "away_corners", "AwayCorners", "AC", "away_corner"
    ])),
    played: true
  };
}

function normalizeFixture(row) {
  const home = getValue(row, ["home", "home_team", "HomeTeam"]);
  const away = getValue(row, ["away", "away_team", "AwayTeam"]);
  if (!home || !away) return null;

  return {
    date: getValue(row, ["date", "match_date", "Date"]),
    time: getValue(row, ["time", "Time"]),
    home,
    away
  };
}

function dateValue(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function average(values) {
  const valid = values.filter(v =>
    v !== null && v !== undefined && Number.isFinite(v)
  );
  return valid.length
    ? valid.reduce((sum, v) => sum + v, 0) / valid.length
    : null;
}

function fmt(value, digits = 1) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "N/D"
    : value.toFixed(digits).replace(".", ",");
}

function percent(values, predicate) {
  const valid = values.filter(v => v !== null && Number.isFinite(v));
  return valid.length
    ? 100 * valid.filter(predicate).length / valid.length
    : null;
}

function recentTeamGames(team, venue = "all", limit = 10) {
  const list = matches.filter(m =>
    m.played &&
    (m.home === team || m.away === team) &&
    (venue === "all" ||
      (venue === "home" && m.home === team) ||
      (venue === "away" && m.away === team))
  );

  list.sort((a, b) => {
    const da = dateValue(a.date), db = dateValue(b.date);
    return (db?.getTime() || 0) - (da?.getTime() || 0);
  });

  return limit === "all" ? list : list.slice(0, Number(limit));
}

function teamStats(team, venue = "all", limit = 10) {
  const games = recentTeamGames(team, venue, limit);
  const scored = [], conceded = [];
  const cornersFor = [], cornersAgainst = [], totalCorners = [];

  let over85 = 0, over95 = 0, over105 = 0, over115 = 0, over125 = 0;

  for (const m of games) {
    const isHome = m.home === team;
    scored.push(isHome ? m.homeGoals : m.awayGoals);
    conceded.push(isHome ? m.awayGoals : m.homeGoals);

    if (m.homeCorners !== null && m.awayCorners !== null) {
      const own = isHome ? m.homeCorners : m.awayCorners;
      const opp = isHome ? m.awayCorners : m.homeCorners;
      const total = own + opp;

      cornersFor.push(own);
      cornersAgainst.push(opp);
      totalCorners.push(total);

      if (total >= 9) over85++;
      if (total >= 10) over95++;
      if (total >= 11) over105++;
      if (total >= 12) over115++;
      if (total >= 13) over125++;
    }
  }

  const n = totalCorners.length;

  return {
    games: games.length,
    goalsFor: average(scored),
    goalsAgainst: average(conceded),
    cornersFor: average(cornersFor),
    cornersAgainst: average(cornersAgainst),
    totalCorners: average(totalCorners),
    over85: n ? 100 * over85 / n : null,
    over95: n ? 100 * over95 / n : null,
    over105: n ? 100 * over105 / n : null,
    over115: n ? 100 * over115 / n : null,
    over125: n ? 100 * over125 / n : null
  };
}

function renderStats(team) {
  if (!team) return;

  const period = $("period").value;
  const all = teamStats(team, "all", period);
  const home = teamStats(team, "home", period);
  const away = teamStats(team, "away", period);

  $("teamTitle").textContent = "Estatísticas — " + team;

  const cards = [
    ["Jogos analisados", all.games],
    ["Golos marcados / jogo", fmt(all.goalsFor)],
    ["Golos sofridos / jogo", fmt(all.goalsAgainst)],
    ["Cantos a favor / jogo", fmt(all.cornersFor)],
    ["Cantos contra / jogo", fmt(all.cornersAgainst)],
    ["Média total de cantos", fmt(all.totalCorners)],
    ["Over 8,5 cantos", all.over85 === null ? "N/D" : fmt(all.over85) + "%"],
    ["Over 9,5 cantos", all.over95 === null ? "N/D" : fmt(all.over95) + "%"],
    ["Over 10,5 cantos", all.over105 === null ? "N/D" : fmt(all.over105) + "%"],
    ["Over 11,5 cantos", all.over115 === null ? "N/D" : fmt(all.over115) + "%"],
    ["Over 12,5 cantos", all.over125 === null ? "N/D" : fmt(all.over125) + "%"]
  ];

  $("stats").innerHTML = cards.map(([label, value]) =>
    `<div class="stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`
  ).join("");

  $("venueStats").innerHTML = [
    ["Casa", home],
    ["Fora", away],
    ["Total", all]
  ].map(([label, s]) =>
    `<tr><td>${label}</td><td>${s.games}</td>
    <td>${fmt(s.cornersFor)}</td><td>${fmt(s.cornersAgainst)}</td>
    <td>${fmt(s.totalCorners)}</td>
    <td>${s.over95 === null ? "N/D" : fmt(s.over95) + "%"}</td></tr>`
  ).join("");

  const recent = recentTeamGames(team, "all", period);

  $("recent").innerHTML = recent.length ? recent.map(m => {
    const total = m.homeCorners !== null && m.awayCorners !== null
      ? m.homeCorners + m.awayCorners : null;

    return `<tr><td>${esc(m.date || "N/D")}</td>
    <td>${esc(m.home)}</td><td>${m.homeGoals} - ${m.awayGoals}</td>
    <td>${esc(m.away)}</td>
    <td>${m.homeCorners === null || m.awayCorners === null
      ? "N/D" : m.homeCorners + " - " + m.awayCorners}</td>
    <td>${total === null ? "N/D" : total}</td></tr>`;
  }).join("") : `<tr><td colspan="6">Não existem jogos para esta equipa.</td></tr>`;
}

/* Médias gerais da competição e ajustamento para amostras pequenas. */
function leagueGoalAverages() {
  return {
    home: average(matches.map(m => m.homeGoals)),
    away: average(matches.map(m => m.awayGoals))
  };
}

function shrinkAverage(value, count, baseline, prior = 5) {
  if (baseline === null || !Number.isFinite(baseline)) return value;
  if (value === null || !Number.isFinite(value)) return baseline;
  return (value * count + baseline * prior) / (count + prior);
}

function poissonAtLeastOne(lambda) {
  if (lambda === null || !Number.isFinite(lambda) || lambda < 0) {
    return null;
  }
  return 1 - Math.exp(-lambda);
}

function expectedGoalsForMatch(home, away) {
  if (!home || !away || home === away) return null;

  const league = leagueGoalAverages();
  if (league.home === null || league.away === null ||
      league.home <= 0 || league.away <= 0) return null;

  const homeGames = recentTeamGames(home, "home", 10);
  const awayGames = recentTeamGames(away, "away", 10);

  const homeScored = average(homeGames.map(m => m.homeGoals));
  const homeConceded = average(homeGames.map(m => m.awayGoals));
  const awayScored = average(awayGames.map(m => m.awayGoals));
  const awayConceded = average(awayGames.map(m => m.homeGoals));

  const homeAttack = shrinkAverage(homeScored, homeGames.length, league.home);
  const homeDefence = shrinkAverage(homeConceded, homeGames.length, league.away);
  const awayAttack = shrinkAverage(awayScored, awayGames.length, league.away);
  const awayDefence = shrinkAverage(awayConceded, awayGames.length, league.home);

  if ([homeAttack, homeDefence, awayAttack, awayDefence].some(
    v => v === null || !Number.isFinite(v)
  )) return null;

  const lambdaHome = homeAttack * awayDefence / league.home;
  const lambdaAway = awayAttack * homeDefence / league.away;

  const h = Math.max(0.05, Math.min(5, lambdaHome));
  const a = Math.max(0.05, Math.min(5, lambdaAway));

  const bttsYes = poissonAtLeastOne(h) * poissonAtLeastOne(a);
  const bttsNo = 1 - bttsYes;

  return {
    lambdaHome: h,
    lambdaAway: a,
    bttsYes,
    bttsNo,
    homeSample: homeGames.length,
    awaySample: awayGames.length
  };
}


function poissonProbability(k, lambda) {
  if (k < 0 || lambda < 0 || !Number.isFinite(lambda)) return 0;
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

function calculate1X2(home, away) {
  const expected = expectedGoalsForMatch(home, away);
  if (!expected) return null;
  let pHome = 0, pDraw = 0, pAway = 0;
  // Somatório de resultados de 0 a 10 golos por equipa.
  for (let h = 0; h <= 10; h++) {
    for (let a = 0; a <= 10; a++) {
      const p = poissonProbability(h, expected.lambdaHome) *
                poissonProbability(a, expected.lambdaAway);
      if (h > a) pHome += p;
      else if (h === a) pDraw += p;
      else pAway += p;
    }
  }
  const total = pHome + pDraw + pAway;
  if (!total) return null;
  return {
    home: pHome / total, draw: pDraw / total, away: pAway / total,
    lambdaHome: expected.lambdaHome, lambdaAway: expected.lambdaAway,
    homeSample: expected.homeSample, awaySample: expected.awaySample
  };
}

function renderX12Analysis() {
  const home = $("x12Home")?.value;
  const away = $("x12Away")?.value;
  const result = $("x12Result");
  if (!home || !away || !result) return;
  if (home === away) {
    result.innerHTML = "<p>Escolhe duas equipas diferentes.</p>";
    return;
  }
  const p = calculate1X2(home, away);
  if (!p) {
    result.innerHTML = "<p>Não existem dados suficientes para calcular esta previsão.</p>";
    return;
  }
  const probs = [p.home, p.draw, p.away];
  const labels = ["Vitória da casa (1)", "Empate (X)", "Vitória visitante (2)"];
  const oddsIds = ["x12OddsHome", "x12OddsDraw", "x12OddsAway"];
  const marketOdds = oddsIds.map(id => Number($(id)?.value));
  const hasMarket = marketOdds.every(o => Number.isFinite(o) && o > 1);
  let marketHtml = "";
  if (hasMarket) {
    const implied = marketOdds.map(o => 1 / o);
    const overround = implied.reduce((s, v) => s + v, 0);
    const fairMarket = implied.map(v => v / overround);
    marketHtml = `
      <h3>Comparação com o mercado</h3>
      <p class="muted">Margem teórica da casa: ${fmt((overround - 1) * 100)}%. As probabilidades do mercado abaixo são normalizadas para retirar essa margem.</p>
      <div class="tablewrap"><table><thead><tr><th>Resultado</th><th>Odd mercado</th><th>Prob. modelo</th><th>Prob. mercado*</th><th>Odd justa modelo</th><th>Diferença</th><th>Valor teórico</th></tr></thead><tbody>
      ${labels.map((label, i) => {
        const edge = probs[i] * marketOdds[i] - 1;
        const diff = (probs[i] - fairMarket[i]) * 100;
        const valueText = edge > 0.02 ? "Potencial positivo" : edge < -0.02 ? "Sem valor aparente" : "Marginal/neutro";
        return `<tr><td>${label}</td><td>${fmt(marketOdds[i],2)}</td><td>${fmt(probs[i]*100)}%</td><td>${fmt(fairMarket[i]*100)}%</td><td>${fmt(1/probs[i],2)}</td><td>${diff > 0 ? "+" : ""}${fmt(diff)} p.p.</td><td>${valueText} (${edge > 0 ? "+" : ""}${fmt(edge*100)}%)</td></tr>`;
      }).join("")}
      </tbody></table></div>
      <p class="muted">*Estimativa de mercado normalizada. “Valor teórico” é a diferença matemática entre probabilidade estimada × odd e 1; não garante lucro nem demonstra vantagem real sem validação histórica.</p>`;
  } else {
    marketHtml = "<p class=\"muted\">Para comparar com o mercado, preenche as três odds decimais (1, X e 2). Introduz as odds da mesma casa de apostas e do mesmo momento.</p>";
  }
  result.innerHTML = `
    <h3>${esc(home)} vs. ${esc(away)}</h3>
    <div class="stats">
      <div class="stat"><span>Vitória da casa (1)</span><strong>${fmt(p.home*100)}%</strong><span>Odd justa: ${fmt(1/p.home,2)}</span></div>
      <div class="stat"><span>Empate (X)</span><strong>${fmt(p.draw*100)}%</strong><span>Odd justa: ${fmt(1/p.draw,2)}</span></div>
      <div class="stat"><span>Vitória visitante (2)</span><strong>${fmt(p.away*100)}%</strong><span>Odd justa: ${fmt(1/p.away,2)}</span></div>
    </div>
    <p>Golos esperados pelo modelo: casa ${fmt(p.lambdaHome,2)} — visitante ${fmt(p.lambdaAway,2)}. Amostra usada: ${p.homeSample} jogos recentes da equipa da casa em casa e ${p.awaySample} da visitante fora.</p>
    ${marketHtml}
    <p class="muted">Modelo estatístico inicial baseado em golos históricos e distribuição de Poisson. Não incorpora onzes, lesões, xG, cartões, calendário ou força individual detalhada. As probabilidades não estão validadas retrospetivamente e não devem ser tratadas como certezas.</p>
  `;
}

function renderBttsAnalysis() {
  const homeSelect = $("bttsHome");
  const awaySelect = $("bttsAway");
  const result = $("bttsResult");

  if (!homeSelect || !awaySelect || !result) {
    $("status").textContent =
      "Erro interno: falta um elemento do painel BTTS no HTML.";
    return;
  }

  const home = homeSelect.value;
  const away = awaySelect.value;

  if (!home || !away) {
    result.innerHTML = "<p>Seleciona as duas equipas.</p>";
    return;
  }

  if (home === away) {
    result.innerHTML = "<p>Escolhe duas equipas diferentes.</p>";
    return;
  }

  const p = expectedGoalsForMatch(home, away);

  if (!p) {
    result.innerHTML = "<p>Não existem dados suficientes para calcular esta previsão.</p>";
    return;
  }

  const yesPercent = p.bttsYes * 100;
  const noPercent = p.bttsNo * 100;
  const yesOdds = p.bttsYes > 0 ? 1 / p.bttsYes : null;
  const noOdds = p.bttsNo > 0 ? 1 / p.bttsNo : null;

  let reliability = "Amostra reduzida";
  if (p.homeSample >= 8 && p.awaySample >= 8) reliability = "Amostra razoável";
  if (p.homeSample >= 10 && p.awaySample >= 10) reliability = "10 jogos por equipa";

  result.innerHTML = `
    <h3>${esc(home)} vs. ${esc(away)}</h3>
    <div class="stats">
      <div class="stat"><span>Golos esperados — casa</span><strong>${fmt(p.lambdaHome, 2)}</strong></div>
      <div class="stat"><span>Golos esperados — fora</span><strong>${fmt(p.lambdaAway, 2)}</strong></div>
      <div class="stat"><span>Ambas Marcam — Sim</span><strong>${fmt(yesPercent)}%</strong></div>
      <div class="stat"><span>Ambas Marcam — Não</span><strong>${fmt(noPercent)}%</strong></div>
      <div class="stat"><span>Odd justa — Sim</span><strong>${fmt(yesOdds, 2)}</strong></div>
      <div class="stat"><span>Odd justa — Não</span><strong>${fmt(noOdds, 2)}</strong></div>
    </div>
    <p class="muted">${esc(reliability)}. Jogos considerados: ${p.homeSample} em casa e ${p.awaySample} fora.</p>
    <p class="muted">Modelo inicial de Poisson ajustado às médias da competição. Assume independência entre os golos das equipas e ainda não foi validado retrospetivamente. Não considera xG, onzes, lesões ou força individual dos adversários.</p>
  `;
}

function estimateMatch(home, away) {
  const hHome = teamStats(home, "home", 10);
  const aAway = teamStats(away, "away", 10);

  const homeGoals = average([hHome.goalsFor, aAway.goalsAgainst]);
  const awayGoals = average([aAway.goalsFor, hHome.goalsAgainst]);
  const homeCorners = average([hHome.cornersFor, aAway.cornersAgainst]);
  const awayCorners = average([aAway.cornersFor, hHome.cornersAgainst]);

  const sample = [
    ...recentTeamGames(home, "home", 10),
    ...recentTeamGames(away, "away", 10)
  ].filter(m => m.homeCorners !== null && m.awayCorners !== null);

  const totals = sample.map(m => m.homeCorners + m.awayCorners);

  const btts = expectedGoalsForMatch(home, away);

  return {
    homeGoals,
    awayGoals,
    totalGoals: homeGoals !== null && awayGoals !== null
      ? homeGoals + awayGoals : null,
    totalCorners: homeCorners !== null && awayCorners !== null
      ? homeCorners + awayCorners : null,
    over95: percent(totals, n => n >= 10),
    over105: percent(totals, n => n >= 11),
    cornerSample: totals.length,
    btts
  };
}

function renderFixtures() {
  const container = $("fixtures");
  const status = $("fixtureStatus");
  const filter = $("fixtureFilter").value;

  if (!fixturesData.length) {
    container.innerHTML = "";
    status.textContent =
      "Não foram encontrados jogos futuros no calendário disponível.";
    return;
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  let list = fixturesData.filter(m => {
    const d = dateValue(m.date);
    if (!d) return false;

    d.setHours(0, 0, 0, 0);

    if (d < now) return false;
    if (filter === "all") return true;

    const limit = new Date(now);
    limit.setDate(limit.getDate() + Number(filter));
    return d <= limit;
  });

  list.sort((a, b) =>
    (dateValue(a.date)?.getTime() || 0) -
    (dateValue(b.date)?.getTime() || 0)
  );

  if (!list.length) {
    container.innerHTML = "";
    status.textContent =
      "Não há jogos com datas válidas dentro do período selecionado.";
    return;
  }

  status.textContent = `${list.length} jogo(s) encontrado(s).`;

  container.innerHTML = list.map(m => {
    const p = estimateMatch(m.home, m.away);
    const b = p.btts;

    return `<article class="matchcard">
      <span class="pill">${esc(m.date || "Data por confirmar")} ${esc(m.time || "")}</span>
      <div class="teams">${esc(m.home)}<br>vs.<br>${esc(m.away)}</div>

      <div class="predgrid">
        <div class="pred"><span>Golos — casa</span><strong>${fmt(p.homeGoals)}</strong></div>
        <div class="pred"><span>Golos — fora</span><strong>${fmt(p.awayGoals)}</strong></div>
        <div class="pred"><span>Total estimado de golos</span><strong>${fmt(p.totalGoals)}</strong></div>
        <div class="pred"><span>Total estimado de cantos</span><strong>${fmt(p.totalCorners)}</strong></div>
        <div class="pred"><span>Histórico Over 9,5 cantos</span><strong>${p.over95 === null ? "N/D" : fmt(p.over95) + "%"}</strong></div>
        <div class="pred"><span>Histórico Over 10,5 cantos</span><strong>${p.over105 === null ? "N/D" : fmt(p.over105) + "%"}</strong></div>
        <div class="pred"><span>Ambas Marcam — Sim</span><strong>${b ? fmt(b.bttsYes * 100) + "%" : "N/D"}</strong></div>
        <div class="pred"><span>Ambas Marcam — Não</span><strong>${b ? fmt(b.bttsNo * 100) + "%" : "N/D"}</strong></div>
      </div>

      <p class="muted">Amostra de cantos: ${p.cornerSample} jogos. A previsão BTTS usa até 10 jogos em casa da equipa da casa e 10 fora da visitante. São estimativas iniciais, ainda sem validação retrospetiva.</p>
      <p><button type="button" class="analyseFixture">Analisar este confronto</button></p>
    </article>`;
  }).join("");

  // Liga cada botão ao painel de análise do confronto correspondente.
  const buttons = container.querySelectorAll(".analyseFixture");
  buttons.forEach((button, index) => {
    button.addEventListener("click", () => {
      const match = list[index];
      if (!match) return;

      const homeSelect = $("bttsHome");
      const awaySelect = $("bttsAway");

      if (!homeSelect || !awaySelect) {
        status.textContent = "Erro: não foi encontrado o painel BTTS.";
        return;
      }

      homeSelect.value = match.home;
      awaySelect.value = match.away;
      renderBttsAnalysis();

      $("bttsResult").scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  });
}

function populateTeamSelectors(teams) {
  const teamSelect = $("team");
  const homeSelect = $("bttsHome");
  const awaySelect = $("bttsAway");
  const analyseButton = $("analyseBtts");

  if (!teamSelect || !homeSelect || !awaySelect || !analyseButton) {
    throw new Error(
      "Falta um elemento HTML: confirma os IDs team, bttsHome, bttsAway e analyseBtts."
    );
  }

  const options = teams.map(t =>
    `<option value="${esc(t)}">${esc(t)}</option>`
  ).join("");

  teamSelect.innerHTML = options;
  homeSelect.innerHTML = options;
  awaySelect.innerHTML = options;

  if (teams.length > 1) {
    awaySelect.selectedIndex = 1;
  }

  homeSelect.disabled = teams.length < 2;
  awaySelect.disabled = teams.length < 2;
  analyseButton.disabled = teams.length < 2;
}

async function loadGames() {
  const league = $("league").value;
  const season = $("season").value;
  const button = $("load");

  button.disabled = true;
  $("status").textContent = "A carregar resultados históricos...";
  $("fixtureStatus").textContent = "A procurar o calendário...";
  $("fixtures").innerHTML = "";
  $("stats").innerHTML = "";
  $("bttsResult").innerHTML = "<p>A preparar análise...</p>";
  matches = [];
  fixturesData = [];

  const base =
    `https://raw.githubusercontent.com/oladeeayo/open-matchday/master/data/${league}/`;

  try {
    const response = await fetch(`${base}results_${season}.csv`);

    if (!response.ok) {
      throw new Error(
        `Não foi possível obter os resultados (HTTP ${response.status}).`
      );
    }

    const csv = await response.text();
    matches = parseCSV(csv).map(normalizeResult).filter(Boolean);

    if (!matches.length) {
      throw new Error(
        "O ficheiro foi carregado, mas não foram reconhecidos resultados válidos."
      );
    }

    const teams = [...new Set(matches.flatMap(m => [m.home, m.away]))]
      .sort((a, b) => a.localeCompare(b));

    populateTeamSelectors(teams);

    $("status").textContent =
      `${matches.length} resultados carregados; ${teams.length} equipas encontradas.`;

    try {
      const fixtureResponse =
        await fetch(`${base}fixtures_${season}.csv`);

      if (fixtureResponse.ok) {
        const fixtureCSV = await fixtureResponse.text();

        fixturesData = parseCSV(fixtureCSV)
          .map(normalizeFixture)
          .filter(Boolean);

        // Evita repetir jogos que já estejam nos resultados históricos.
        const playedKeys = new Set(matches.map(m =>
          `${m.home.toLowerCase()}|${m.away.toLowerCase()}`
        ));

        fixturesData = fixturesData.filter(m =>
          !playedKeys.has(`${m.home.toLowerCase()}|${m.away.toLowerCase()}`)
        );
      }
    } catch (e) {
      console.warn("Calendário indisponível:", e);
    }

    renderStats($("team").value);
    renderFixtures();

    if (teams.length > 1) {
      renderBttsAnalysis();
    }

  } catch (error) {
    console.error(error);
    $("status").textContent = `Erro: ${error.message}`;
    $("fixtureStatus").textContent =
      "Não foi possível carregar os dados.";

    $("stats").innerHTML = "";
    $("venueStats").innerHTML =
      '<tr><td colspan="6">Sem dados disponíveis.</td></tr>';
    $("recent").innerHTML =
      '<tr><td colspan="6">Sem dados disponíveis.</td></tr>';
    $("fixtures").innerHTML = "";
    $("bttsResult").innerHTML =
      `<p>${esc(error.message)}</p>`;

    $("bttsHome").disabled = true;
    $("bttsAway").disabled = true;
    $("analyseBtts").disabled = true;

  } finally {
    button.disabled = false;
  }
}

// Verifica os elementos principais antes de ativar os eventos.
const requiredIds = [
  "league", "season", "team", "period", "load",
  "status", "fixtureFilter", "fixtureStatus", "fixtures",
  "stats", "teamTitle", "venueStats", "recent",
  "bttsHome", "bttsAway", "analyseBtts", "bttsResult",\n  "x12Home", "x12Away", "analyseX12", "x12Result", "x12OddsHome", "x12OddsDraw", "x12OddsAway"
];

const missingIds = requiredIds.filter(id => !$(id));

if (missingIds.length) {
  console.error("Elementos HTML em falta:", missingIds);
  $("status").textContent =
    "Erro no HTML: faltam os elementos " + missingIds.join(", ");
} else {
  $("load").addEventListener("click", loadGames);

  $("team").addEventListener("change", () => {
    if (matches.length) renderStats($("team").value);
  });

  $("period").addEventListener("change", () => {
    if (matches.length) renderStats($("team").value);
  });

  $("fixtureFilter").addEventListener("change", renderFixtures);
  $("analyseBtts").addEventListener("click", renderBttsAnalysis);\n  $("analyseX12").addEventListener("click", renderX12Analysis);\n  $("x12Home").addEventListener("change", () => {\n    if ($("x12Home").value === $("x12Away").value) {\n      const alt = [...$("x12Away").options].find(o => o.value !== $("x12Home").value);\n      if (alt) $("x12Away").value = alt.value;\n    }\n  });\n  $("x12Away").addEventListener("change", () => {\n    if ($("x12Away").value === $("x12Home").value) {\n      const alt = [...$("x12Home").options].find(o => o.value !== $("x12Away").value);\n      if (alt) $("x12Home").value = alt.value;\n    }\n  });

  $("bttsHome").addEventListener("change", () => {
    if ($("bttsHome").value === $("bttsAway").value) {
      const alternative = [...$("bttsAway").options].find(
        option => option.value !== $("bttsHome").value
      );
      if (alternative) $("bttsAway").value = alternative.value;
    }
  });

  $("bttsAway").addEventListener("change", () => {
    if ($("bttsAway").value === $("bttsHome").value) {
      const alternative = [...$("bttsHome").options].find(
        option => option.value !== $("bttsAway").value
      );
      if (alternative) $("bttsHome").value = alternative.value;
    }
  });

  loadGames();
}
