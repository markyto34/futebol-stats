
"use strict";

const $ = id => document.getElementById(id);
let matches = [];
let fixturesData = [];
let loadToken = 0;

const DATA_CACHE_TTL_MS = 15 * 60 * 1000;

async function cachedFetchText(url, token) {
  const key = "futebol-stats:csv:" + url;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) {
      const entry = JSON.parse(cached);
      if (entry && typeof entry.text === "string" &&
          Number.isFinite(entry.savedAt) &&
          Date.now() - entry.savedAt < DATA_CACHE_TTL_MS) {
        return { ok: true, status: 200, text: entry.text, fromCache: true };
      }
    }
  } catch (error) {
    console.warn("Não foi possível ler a cache da sessão:", error);
  }

  const response = await fetch(url);
  if (token !== loadToken) return { ok: false, status: 0, text: "", stale: true };
  if (!response.ok) return { ok: false, status: response.status, text: "" };
  const text = await response.text();
  if (token !== loadToken) return { ok: false, status: 0, text: "", stale: true };

  try {
    sessionStorage.setItem(key, JSON.stringify({ text, savedAt: Date.now() }));
  } catch (error) {
    // A cache é opcional: a aplicação continua a funcionar se estiver indisponível/cheia.
    console.warn("Não foi possível guardar a cache da sessão:", error);
  }
  return { ok: true, status: response.status, text, fromCache: false };
}


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
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim().replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
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
    htHomeGoals: numberValue(getValue(row, ["ht_home", "HTHG", "home_ht_goals"])),
    htAwayGoals: numberValue(getValue(row, ["ht_away", "HTAG", "away_ht_goals"])),
    htHomeCorners: numberValue(getValue(row, ["home_corners_1h", "ht_home_corners", "home_ht_corners", "HHC"])),
    htAwayCorners: numberValue(getValue(row, ["away_corners_1h", "ht_away_corners", "away_ht_corners", "AHC"])),
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

function normalizeDateKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let m = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0");
  m = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) {
    // Datas com ano no fim são interpretadas no formato português DD/MM/YYYY.
    const day = Number(m[1]), month = Number(m[2]), year = Number(m[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    }
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw.toLowerCase() : parsed.toISOString().slice(0, 10);
}

function dateValue(value) {
  if (!value) return null;
  const normalized = normalizeDateKey(value);
  const d = new Date(normalized);
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
    // Número real de jogos com dados completos de cantos usados nestas médias.
    cornerSample: n,
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


function poissonOverLine(lambda, line) {
  if (lambda === null || !Number.isFinite(lambda) || lambda < 0) return null;
  const threshold = Math.floor(line) + 1;
  let cumulative = 0;
  for (let k = 0; k < threshold; k++) cumulative += poissonProbability(k, lambda);
  return Math.max(0, Math.min(1, 1 - cumulative));
}

function calculateCornerPrediction(home, away) {
  if (!home || !away || home === away) return null;
  const hs = teamStats(home, "home", 10);
  const aa = teamStats(away, "away", 10);
  const homeCornerMean = average([hs.cornersFor, aa.cornersAgainst]);
  const awayCornerMean = average([aa.cornersFor, hs.cornersAgainst]);
  if (homeCornerMean === null || awayCornerMean === null) return null;
  const total = Math.max(0.1, Math.min(25, homeCornerMean + awayCornerMean));
  // Cada média usa apenas jogos com ambos os campos de cantos disponíveis.
  // Expomos as amostras separadamente para não confundir jogos de golos com jogos de cantos.
  const homeCornerSample = hs.cornerSample;
  const awayCornerSample = aa.cornerSample;
  const cornerGames = homeCornerSample + awayCornerSample;
  // Exigir pelo menos 3 jogos completos por equipa para evitar estimativas extremas com amostras mínimas.
  if (homeCornerSample < 3 || awayCornerSample < 3) {
    return { insufficientSample: true, homeCornerSample, awayCornerSample, cornerGames };
  }
  const lines = [8.5, 9.5, 10.5, 11.5, 12.5];
  return {
    homeCornerMean, awayCornerMean, total,
    homeCornerSample, awayCornerSample, cornerGames,
    probabilities: lines.map(line => ({line, over: poissonOverLine(total, line)}))
  };
}

function renderCornerPrediction() {
  const result = $("cornerResult");
  const home = $("cornerHome")?.value;
  const away = $("cornerAway")?.value;
  if (!result || !home || !away) return;
  if (home === away) { result.innerHTML = "<p>Escolhe duas equipas diferentes.</p>"; return; }
  const p = calculateCornerPrediction(home, away);
  if (!p) { result.innerHTML = "<p>Não existem dados de cantos suficientes para esta previsão.</p>"; return; }
  if (p.insufficientSample) {
    result.innerHTML = `<p>Não vou apresentar uma previsão de cantos com uma amostra tão pequena.</p><p class="muted">Jogos com cantos completos: ${esc(home)} em casa — ${p.homeCornerSample}; ${esc(away)} fora — ${p.awayCornerSample}. São necessários pelo menos 3 jogos válidos por equipa. Os registos em falta não são tratados como zero.</p>`;
    return;
  }
  const oddOver = Number($("cornerOddsOver95")?.value);
  const oddUnder = Number($("cornerOddsUnder95")?.value);
  const over = p.probabilities.find(x => x.line === 9.5).over;
  let market = "<p class=\"muted\">Introduz as odds Over e Under 9,5 para comparar o mercado com o modelo.</p>";
  if (oddOver > 1 && oddUnder > 1) {
    const impliedOver = 1 / oddOver, impliedUnder = 1 / oddUnder;
    const normOver = impliedOver / (impliedOver + impliedUnder);
    const edge = over * oddOver - 1;
    market = `<h3>Comparação Over/Under 9,5</h3><p>Probabilidade de mercado normalizada: ${fmt(normOver*100)}% Over. Modelo: ${fmt(over*100)}%. Odd justa Over: ${fmt(1/over,2)}; odd justa Under: ${fmt(1/(1-over),2)}.</p><p>Diferença matemática modelo × odd: ${fmt(edge*100)}%. Não é garantia de valor real.</p>`;
  }
  result.innerHTML = `<h3>${esc(home)} vs. ${esc(away)}</h3>
  <div class="stats">
    <div class="stat"><span>Cantos esperados — casa</span><strong>${fmt(p.homeCornerMean,2)}</strong></div>
    <div class="stat"><span>Cantos esperados — fora</span><strong>${fmt(p.awayCornerMean,2)}</strong></div>
    <div class="stat"><span>Total esperado</span><strong>${fmt(p.total,2)}</strong></div>
  </div>
  <div class="tablewrap"><table><thead><tr><th>Linha</th><th>Prob. Over estimada</th><th>Odd justa Over</th><th>Prob. Under estimada</th><th>Odd justa Under</th></tr></thead><tbody>
  ${p.probabilities.map(x => `<tr><td>${x.line.toString().replace(".",",")}</td><td>${fmt(x.over*100)}%</td><td>${fmt(1/x.over,2)}</td><td>${fmt((1-x.over)*100)}%</td><td>${fmt(1/(1-x.over),2)}</td></tr>`).join("")}
  </tbody></table></div>${market}
  <p class="muted">Amostra de cantos com dados completos: ${p.homeCornerSample} jogos da equipa da casa (em casa) + ${p.awayCornerSample} jogos da visitante (fora), máximo 10 por equipa; total de registos usados nas médias: ${p.cornerGames}. Os jogos sem dados completos de cantos ficam excluídos destas médias. Modelo Poisson simples; não considera árbitro, onzes, contexto tático ou estado do marcador e não foi validado retrospetivamente.</p>`;
}

function expectedHT1X2(home, away) {
  const rows = matches.filter(m => m.htHomeGoals !== null && m.htAwayGoals !== null);
  const homeRows = recentTeamGames(home, "home", 10).filter(m => m.htHomeGoals !== null && m.htAwayGoals !== null);
  const awayRows = recentTeamGames(away, "away", 10).filter(m => m.htHomeGoals !== null && m.htAwayGoals !== null);
  if (homeRows.length < 2 || awayRows.length < 2 || rows.length === 0) {
    return { available:false, count:rows.length, homeN:homeRows.length, awayN:awayRows.length };
  }

  const avg = arr => arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : null;
  const leagueHome = avg(rows.map(m=>m.htHomeGoals));
  const leagueAway = avg(rows.map(m=>m.htAwayGoals));

  // Aplicar a mesma regularização (prior=5) usada no modelo FT:
  // amostras pequenas aproximam-se da média da competição ao intervalo.
  const homeAttack = shrinkAverage(avg(homeRows.map(m=>m.htHomeGoals)), homeRows.length, leagueHome);
  const homeConcede = shrinkAverage(avg(homeRows.map(m=>m.htAwayGoals)), homeRows.length, leagueAway);
  const awayAttack = shrinkAverage(avg(awayRows.map(m=>m.htAwayGoals)), awayRows.length, leagueAway);
  const awayConcede = shrinkAverage(avg(awayRows.map(m=>m.htHomeGoals)), awayRows.length, leagueHome);

  const lh = Math.max(0.05, (homeAttack + awayConcede) / 2);
  const la = Math.max(0.05, (awayAttack + homeConcede) / 2);
  let h=0,d=0,a=0;
  for(let i=0;i<=8;i++) for(let j=0;j<=8;j++){
    const q=poissonProbability(i,lh)*poissonProbability(j,la);
    if(i>j) h+=q; else if(i===j) d+=q; else a+=q;
  }
  const total=h+d+a;
  return {available:true,home:h/total,draw:d/total,away:a/total,lh,la,homeN:homeRows.length,awayN:awayRows.length,count:rows.length};
}
function renderX12HT() {
 const el=$("x12HtResult"), home=$("x12Home")?.value, away=$("x12Away")?.value;
 if(!el) return;
 if(!home||!away){el.innerHTML="<p>Seleciona as equipas acima para calcular a previsão 1X2 ao intervalo.</p>";return;}
 const p=expectedHT1X2(home,away);
 if(!p.available){el.innerHTML=`<p>Não há dados HT suficientes para esta previsão nesta competição/época.</p><p class="muted">Registos com resultado ao intervalo: ${p.count}. Amostra encontrada: ${esc(home)} (${p.homeN}) e ${esc(away)} (${p.awayN}).</p>`;return;}
 el.innerHTML=`<h3>${esc(home)} vs. ${esc(away)} — ao intervalo</h3><div class="stats">
 <div class="stat"><span>Casa (1 HT)</span><strong>${fmt(p.home*100)}%</strong><span>Odd justa: ${fmt(1/p.home,2)}</span></div>
 <div class="stat"><span>Empate (X HT)</span><strong>${fmt(p.draw*100)}%</strong><span>Odd justa: ${fmt(1/p.draw,2)}</span></div>
 <div class="stat"><span>Visitante (2 HT)</span><strong>${fmt(p.away*100)}%</strong><span>Odd justa: ${fmt(1/p.away,2)}</span></div></div>
 <p>Golos HT esperados: casa ${fmt(p.lh,2)} — visitante ${fmt(p.la,2)}. Amostra: ${p.homeN} jogos em casa e ${p.awayN} fora.</p><p class="muted">Estimativa Poisson com resultados HT históricos disponíveis; não é garantia e não foi validada retrospetivamente.</p>`;
}
function renderCornersHT() {
 const el=$("cornerHtResult"), home=$("cornerHome")?.value, away=$("cornerAway")?.value;
 if(!el) return;
 if(!home||!away){el.innerHTML="<p>Seleciona as equipas acima para calcular a previsão de cantos ao intervalo.</p>";return;}
 const rows=matches.filter(m=>m.htHomeCorners!==null&&m.htAwayCorners!==null);
 const hr=recentTeamGames(home, "home", 10).filter(m=>m.htHomeCorners!==null&&m.htAwayCorners!==null);
 const ar=recentTeamGames(away, "away", 10).filter(m=>m.htHomeCorners!==null&&m.htAwayCorners!==null);
 if(hr.length<3||ar.length<3){el.innerHTML=`<p>Não há dados históricos suficientes de cantos ao intervalo nesta competição/época.</p><p class="muted">A fonte tem ${rows.length} jogos com cantos HT; amostra para ${esc(home)}: ${hr.length}, para ${esc(away)}: ${ar.length}. São necessários pelo menos 3 jogos válidos por equipa. Não será usada a média dos 90 minutos como se fosse dado HT.</p>`;return;}
 const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;
 const h=(avg(hr.map(m=>m.htHomeCorners))+avg(ar.map(m=>m.htHomeCorners)))/2;
 const a=(avg(ar.map(m=>m.htAwayCorners))+avg(hr.map(m=>m.htAwayCorners)))/2;
 const total=Math.max(.1,h+a);
 const lines=[2.5,3.5,4.5,5.5,6.5];
 el.innerHTML=`<h3>${esc(home)} vs. ${esc(away)} — cantos ao intervalo</h3><div class="stats"><div class="stat"><span>Cantos esperados — casa HT</span><strong>${fmt(h,2)}</strong></div><div class="stat"><span>Cantos esperados — visitante HT</span><strong>${fmt(a,2)}</strong></div><div class="stat"><span>Total esperado HT</span><strong>${fmt(total,2)}</strong></div></div>
 <div class="tablewrap"><table><thead><tr><th>Linha</th><th>Over estimado</th><th>Odd justa Over</th><th>Under estimado</th><th>Odd justa Under</th></tr></thead><tbody>${lines.map(line=>{const over=poissonOverLine(total,line);return `<tr><td>${String(line).replace(".",",")}</td><td>${fmt(over*100)}%</td><td>${fmt(1/over,2)}</td><td>${fmt((1-over)*100)}%</td><td>${fmt(1/(1-over),2)}</td></tr>`}).join("")}</tbody></table></div><p class="muted">Amostra HT: ${hr.length} jogos da equipa da casa e ${ar.length} da visitante. Estimativa simples, ainda não validada; amostras abaixo de 5 jogos têm elevada incerteza.</p>`;
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
  let p;
  try {
    p = calculate1X2(home, away);
  } catch (error) {
    console.error("Erro no cálculo 1X2:", error);
    result.innerHTML = `<p>O cálculo 1X2 encontrou um erro: ${esc(error?.message || error)}. Tenta novamente e envia esta mensagem.</p>`;
    return;
  }
  if (!p) {
    const league = leagueGoalAverages();
    const homeGames = recentTeamGames(home, "home", 10);
    const awayGames = recentTeamGames(away, "away", 10);
    result.innerHTML = `<p>Não foi possível calcular a previsão com os dados disponíveis.</p>
      <p class="muted">Diagnóstico: ${esc(home)} — ${homeGames.length} jogos em casa; ${esc(away)} — ${awayGames.length} jogos fora. Média de golos da competição: casa ${fmt(league.home,2)}, visitante ${fmt(league.away,2)}. Confirma se a época selecionada tem resultados suficientes para estas equipas.</p>`;
    return;
  }

  const historical = [p.home, p.draw, p.away];
  const labels = ["Vitória da casa (1)", "Empate (X)", "Vitória visitante (2)"];
  const oddsIds = ["x12OddsHome", "x12OddsDraw", "x12OddsAway"];
  const rawOdds = oddsIds.map(id => String($(id)?.value ?? "").trim());
  const marketOdds = rawOdds.map(numberValue);
  const hasMarket = marketOdds.every(o => o !== null && o > 1);
  let comparisonHtml = "";
  let finalProbs = historical;

  if (hasMarket) {
    const rawImplied = marketOdds.map(o => 1 / o);
    const overround = rawImplied.reduce((sum, value) => sum + value, 0);
    const market = rawImplied.map(value => value / overround);

    // Pool geométrico 50/50: combina mercado e histórico sem deixar
    // as escalas das duas fontes distorcerem a soma final.
    const combined = historical.map((value, i) =>
      Math.sqrt(Math.max(value, 0.000001) * Math.max(market[i], 0.000001))
    );
    const combinedTotal = combined.reduce((sum, value) => sum + value, 0);
    finalProbs = combined.map(value => value / combinedTotal);

    const rows = labels.map((label, i) => {
      const modelEdge = historical[i] * marketOdds[i] - 1;
      const adjustedEdge = finalProbs[i] * marketOdds[i] - 1;
      const difference = (finalProbs[i] - market[i]) * 100;
      const signal = modelEdge > 0.02 ? "Modelo acima da odd de equilíbrio" :
        modelEdge < -0.02 ? "Modelo abaixo da odd de equilíbrio" : "Modelo próximo do equilíbrio";
      return `<tr><td>${label}</td><td>${fmt(marketOdds[i],2)}</td>
        <td>${fmt(historical[i]*100)}%</td><td>${fmt(market[i]*100)}%</td>
        <td><strong>${fmt(finalProbs[i]*100)}%</strong></td>
        <td>${fmt(1/finalProbs[i],2)}</td><td>${difference > 0 ? "+" : ""}${fmt(difference)} p.p.</td>
        <td>${signal}; edge histórico: ${modelEdge > 0 ? "+" : ""}${fmt(modelEdge*100)}%; edge ajustado: ${adjustedEdge > 0 ? "+" : ""}${fmt(adjustedEdge*100)}%</td></tr>`;
    }).join("");

    comparisonHtml = `
      <h3>Fontes e probabilidades finais ajustadas</h3>
      <p>Margem teórica da casa: ${fmt((overround - 1) * 100)}%. A probabilidade de mercado é normalizada para retirar essa margem.</p>
      <p>Combinação: 50% modelo histórico + 50% mercado, através de uma média geométrica normalizada. É uma regra inicial, não uma ponderação validada.</p>
      <div class="tablewrap"><table><thead><tr><th>Resultado</th><th>Odd atual</th><th>Modelo histórico</th><th>Mercado sem margem</th><th>Prob. final ajustada</th><th>Odd justa final</th><th>Final − mercado</th><th>Edge do modelo vs. edge ajustado</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted">O indicador compara a probabilidade final com a odd introduzida. Não garante lucro nem prova que exista vantagem real; isso exige testar o modelo com resultados históricos.</p>`;
  } else {
    comparisonHtml = `<p class="muted">Para mostrar a tabela final, são necessárias três odds decimais válidas, todas superiores a 1. Os valores lidos agora foram: 1 = "${esc(rawOdds[0] || "vazio")}" (${marketOdds[0] === null ? "inválida" : fmt(marketOdds[0], 2)}); X = "${esc(rawOdds[1] || "vazio")}" (${marketOdds[1] === null ? "inválida" : fmt(marketOdds[1], 2)}); 2 = "${esc(rawOdds[2] || "vazio")}" (${marketOdds[2] === null ? "inválida" : fmt(marketOdds[2], 2)}). Usa, por exemplo, 2,10 / 3,30 / 3,60.</p>`;
  }

  result.innerHTML = `
    <h3>${esc(home)} vs. ${esc(away)}</h3>
    <div class="stats">
      <div class="stat"><span>Modelo histórico — 1</span><strong>${fmt(historical[0]*100)}%</strong><span>Odd justa: ${fmt(1/historical[0],2)}</span></div>
      <div class="stat"><span>Modelo histórico — X</span><strong>${fmt(historical[1]*100)}%</strong><span>Odd justa: ${fmt(1/historical[1],2)}</span></div>
      <div class="stat"><span>Modelo histórico — 2</span><strong>${fmt(historical[2]*100)}%</strong><span>Odd justa: ${fmt(1/historical[2],2)}</span></div>
    </div>
    ${comparisonHtml}
    <p>Golos esperados pelo modelo: casa ${fmt(p.lambdaHome,2)} — visitante ${fmt(p.lambdaAway,2)}. Amostra: ${p.homeSample} jogos recentes da equipa da casa em casa e ${p.awaySample} da visitante fora.</p>
    <p class="muted">O modelo histórico usa golos e distribuição de Poisson; não incorpora onzes, lesões, xG ou força individual detalhada. A combinação assume pesos iguais e não foi validada retrospetivamente.</p>
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
  const marketYes = Number($("bttsOddsYes")?.value);
  const marketNo = Number($("bttsOddsNo")?.value);
  let marketHtml = "";
  if (marketYes > 1 && marketNo > 1) {
    const iy = 1 / marketYes, inn = 1 / marketNo;
    const normYes = iy / (iy + inn);
    const edge = p.bttsYes * marketYes - 1;
    marketHtml = `<h3>Comparação com o mercado</h3><p>Probabilidade de mercado normalizada para Sim: ${fmt(normYes*100)}%. Modelo: ${fmt(yesPercent)}%. Diferença matemática modelo × odd Sim: ${fmt(edge*100)}%.</p>`;
  } else {
    marketHtml = "<p class=\"muted\">Introduz as odds Sim e Não para comparar com o mercado.</p>";
  }

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
    ${marketHtml}
    <p class="muted">${esc(reliability)}. Jogos considerados: ${p.homeSample} em casa e ${p.awaySample} fora.</p>
    <p class="muted">Modelo inicial de Poisson ajustado às médias da competição. Assume independência entre os golos das equipas e ainda não foi validado retrospetivamente. Não considera xG, onzes, lesões ou força individual dos adversários.</p>
  `;
}

function estimateMatch(home, away) {
  const hHome = teamStats(home, "home", 10);
  const aAway = teamStats(away, "away", 10);

  const goalModel = expectedGoalsForMatch(home, away);
  const homeGoals = goalModel ? goalModel.lambdaHome : null;
  const awayGoals = goalModel ? goalModel.lambdaAway : null;
  const homeCorners = average([hHome.cornersFor, aAway.cornersAgainst]);
  const awayCorners = average([aAway.cornersFor, hHome.cornersAgainst]);

  const sample = [
    ...recentTeamGames(home, "home", 10),
    ...recentTeamGames(away, "away", 10)
  ].filter(m => m.homeCorners !== null && m.awayCorners !== null);

  const totals = sample.map(m => m.homeCorners + m.awayCorners);

  const btts = goalModel;

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
  const cornerHome = $("cornerHome");
  const cornerAway = $("cornerAway");
  const analyseCorners = $("analyseCorners");
  const goalHome = $("goalHome");
  const goalAway = $("goalAway");
  const analyseGoals = $("analyseGoals");

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
  const x12Home = $("x12Home");
  const x12Away = $("x12Away");
  if (x12Home && x12Away) {
    x12Home.innerHTML = options;
    x12Away.innerHTML = options;
    if (teams.length > 1) x12Away.selectedIndex = 1;
    x12Home.disabled = teams.length < 2;
    x12Away.disabled = teams.length < 2;
    $("analyseX12").disabled = teams.length < 2;
  }

  if (cornerHome && cornerAway) {
    cornerHome.innerHTML = options;
    cornerAway.innerHTML = options;
    if (teams.length > 1) cornerAway.selectedIndex = 1;
    cornerHome.disabled = teams.length < 2;
    cornerAway.disabled = teams.length < 2;
    if (analyseCorners) analyseCorners.disabled = teams.length < 2;
  }

  if (goalHome && goalAway) {
    goalHome.innerHTML = options;
    goalAway.innerHTML = options;
    if (teams.length > 1) goalAway.selectedIndex = 1;
    goalHome.disabled = teams.length < 2;
    goalAway.disabled = teams.length < 2;
    if (analyseGoals) analyseGoals.disabled = teams.length < 2;
  }

  if (teams.length > 1) {
    awaySelect.selectedIndex = 1;
  }

  homeSelect.disabled = teams.length < 2;
  awaySelect.disabled = teams.length < 2;
  analyseButton.disabled = teams.length < 2;
}

async function loadGames() {
  const token = ++loadToken;
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
    const response = await cachedFetchText(`${base}results_${season}.csv`, token);
    if (token !== loadToken || response.stale) return;

    if (!response.ok) {
      throw new Error(
        `Não foi possível obter os resultados (HTTP ${response.status}).`
      );
    }

    // A fonte publica a data da compilação em build_summary.json.
    let sourceUpdateLabel = "A data de atualização da fonte não está disponível.";
    try {
      const summaryResponse = await fetch("https://raw.githubusercontent.com/oladeeayo/open-matchday/master/build_summary.json");
      if (token !== loadToken) return;
      if (summaryResponse.ok) {
        const summary = await summaryResponse.json();
        if (token !== loadToken) return;
        const leagueInfo = Array.isArray(summary.leagues)
          ? summary.leagues.find(item => item.folder === "data/" + league)
          : null;
        const generated = summary.generated_utc ? new Date(summary.generated_utc) : null;
        const generatedLabel = generated && !Number.isNaN(generated.getTime())
          ? generated.toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Lisbon" })
          : null;
        const latestLabel = leagueInfo && leagueInfo.latest
          ? new Date(leagueInfo.latest + "T12:00:00Z").toLocaleDateString("pt-PT", { dateStyle: "short", timeZone: "Europe/Lisbon" })
          : null;
        if (generatedLabel && latestLabel) {
          sourceUpdateLabel = "Última compilação da fonte: " + generatedLabel + " (hora de Portugal). Último jogo registado nesta competição: " + latestLabel + ".";
        } else if (generatedLabel) {
          sourceUpdateLabel = "Última compilação da fonte: " + generatedLabel + " (hora de Portugal); a fonte não indicou a data do último jogo desta competição.";
        }
      }
    } catch (metadataError) {
      console.warn("Não foi possível obter a data da fonte:", metadataError);
    }

    const csv = response.text;
    if (token !== loadToken) return;
    matches = parseCSV(csv).map(normalizeResult).filter(Boolean);

    if (!matches.length) {
      throw new Error(
        "O ficheiro foi carregado, mas não foram reconhecidos resultados válidos."
      );
    }

    const teams = [...new Set(matches.flatMap(m => [m.home, m.away]))]
      .sort((a, b) => a.localeCompare(b));

    populateTeamSelectors(teams);
    renderX12HT();
    renderCornersHT();

    $("status").textContent =
      `${matches.length} resultados carregados; ${teams.length} equipas encontradas. ${sourceUpdateLabel} Já podes escolher as equipas para a análise.`;

    try {
      const fixtureResponse =
        await cachedFetchText(`${base}fixtures_${season}.csv`, token);
      if (token !== loadToken || fixtureResponse.stale) return;

      if (fixtureResponse.ok) {
        const fixtureCSV = fixtureResponse.text;
        if (token !== loadToken) return;

        fixturesData = parseCSV(fixtureCSV)
          .map(normalizeFixture)
          .filter(Boolean);

        // Evita repetir jogos que já estejam nos resultados históricos.
        const fixtureKey = m => [
          normalizeDateKey(m.date),
          String(m.home || "").trim().toLowerCase(),
          String(m.away || "").trim().toLowerCase()
        ].join("|");

        const playedKeys = new Set(matches.map(fixtureKey));
        fixturesData = fixturesData.filter(m => !playedKeys.has(fixtureKey(m)));
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
    if (token !== loadToken) return;
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

    [
      "bttsHome", "bttsAway", "analyseBtts",
      "x12Home", "x12Away", "analyseX12",
      "cornerHome", "cornerAway", "analyseCorners",
      "goalHome", "goalAway", "analyseGoals"
    ].forEach(id => {
      const element = $(id);
      if (element) element.disabled = true;
    });
    const x12Result = $("x12Result");
    if (x12Result) {
      x12Result.innerHTML =
        "<p>Não foi possível ativar a previsão porque os dados não foram carregados. Verifica a mensagem acima e tenta carregar novamente.</p>";
    }

  } finally {
    if (token === loadToken) button.disabled = false;
  }
}

// Verifica os elementos principais antes de ativar os eventos.
const requiredIds = [
  "league", "season", "team", "period", "load",
  "status", "fixtureFilter", "fixtureStatus", "fixtures",
  "stats", "teamTitle", "venueStats", "recent",
  "bttsHome", "bttsAway", "analyseBtts", "bttsResult"
];

const missingIds = requiredIds.filter(id => !$(id));

if (missingIds.length) {
  console.error("Elementos HTML em falta:", missingIds);
  $("status").textContent =
    "Erro no HTML: faltam os elementos " + missingIds.join(", ");
} else {
  $("load").addEventListener("click", loadGames);
  $("league").addEventListener("change", loadGames);
  $("season").addEventListener("change", loadGames);

  $("team").addEventListener("change", () => {
    if (matches.length) renderStats($("team").value);
  });

  $("period").addEventListener("change", () => {
    if (matches.length) renderStats($("team").value);
  });

  $("fixtureFilter").addEventListener("change", renderFixtures);
  $("analyseBtts").addEventListener("click", renderBttsAnalysis);
  if ($("analyseCorners")) $("analyseCorners").addEventListener("click", renderCornerPrediction);
  if ($("analyseX12") && $("x12Home") && $("x12Away")) {
  $("analyseX12").addEventListener("click", renderX12Analysis);
  // Recalcula automaticamente quando qualquer odd é alterada, sem exigir novo clique.
  ["x12OddsHome", "x12OddsDraw", "x12OddsAway"].forEach(id => {
    const field = $(id);
    if (field) {
      field.addEventListener("input", renderX12Analysis);
      field.addEventListener("change", renderX12Analysis);
    }
  });
  $("x12Home").addEventListener("change", () => {
    if ($("x12Home").value === $("x12Away").value) {
      const alt = [...$("x12Away").options].find(o => o.value !== $("x12Home").value);
      if (alt) $("x12Away").value = alt.value;
    }
    renderX12HT();
  });
  $("x12Away").addEventListener("change", () => {
    if ($("x12Away").value === $("x12Home").value) {
      const alt = [...$("x12Home").options].find(o => o.value !== $("x12Away").value);
      if (alt) $("x12Home").value = alt.value;
    }
    renderX12HT();
  });
  }

  $("bttsHome").addEventListener("change", () => {
    if ($("bttsHome").value === $("bttsAway").value) {
      const alternative = [...$("bttsAway").options].find(
        option => option.value !== $("bttsHome").value
      );
      if (alternative) $("bttsAway").value = alternative.value;
    }
  });

  if ($("cornerHome") && $("cornerAway")) {
    $("cornerHome").addEventListener("change", () => { if ($("cornerHome").value === $("cornerAway").value) { const alt = [...$("cornerAway").options].find(o => o.value !== $("cornerHome").value); if (alt) $("cornerAway").value = alt.value; } renderCornersHT(); });
    $("cornerAway").addEventListener("change", () => { if ($("cornerAway").value === $("cornerHome").value) { const alt = [...$("cornerHome").options].find(o => o.value !== $("cornerAway").value); if (alt) $("cornerHome").value = alt.value; } renderCornersHT(); });
  }

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
