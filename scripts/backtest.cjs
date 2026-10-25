#!/usr/bin/env node
"use strict";

// Chronological walk-forward backtest for open-matchday results CSV.
// Usage: node scripts/backtest.cjs path/to/results.csv|https://.../results.csv [--min-history=30]
const fs = require("node:fs");

function parseCSV(text) {
  const rows = []; let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift().map(x => x.trim().replace(/^\uFEFF/, ""));
  return rows.filter(r => r.some(v => v.trim())).map(r => Object.fromEntries(headers.map((h,i)=>[h,(r[i]||"").trim()])));
}
function val(row, names) {
  for (const name of names) {
    const key = Object.keys(row).find(k => k.toLowerCase() === name.toLowerCase());
    if (key && row[key] !== "") return row[key];
  }
  return "";
}
function num(row, names) {
  const raw = String(val(row,names)).trim().replace(/\s/g,"").replace(",",".");
  if (!raw) return null;
  const n = Number(raw); return Number.isFinite(n) ? n : null;
}
function dateKey(raw) {
  const s=String(raw||"").trim();
  let m=s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if(m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  m=s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if(m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  const d=new Date(s); return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0,10);
}
function poisson(lambda,k) {
  if (lambda < 0 || k < 0) return 0;
  let p=Math.exp(-lambda); for(let i=1;i<=k;i++) p*=lambda/i; return p;
}
function probs(lambdaH,lambdaA) {
  let h=0,d=0,a=0,total=0;
  for(let i=0;i<=10;i++) for(let j=0;j<=10;j++) {
    const p=poisson(lambdaH,i)*poisson(lambdaA,j); total+=p;
    if(i>j) h+=p; else if(i===j) d+=p; else a+=p;
  }
  return [h/total,d/total,a/total];
}
function avg(xs) { return xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null; }
function shrink(x,n,base,prior=5) { return (x*n+base*prior)/(n+prior); }
function predict(history, match) {
  const home=history.filter(m=>m.home===match.home).slice(-10);
  const away=history.filter(m=>m.away===match.away).slice(-10);
  const allHome=history.map(m=>m.hg), allAway=history.map(m=>m.ag);
  const baseH=avg(allHome), baseA=avg(allAway);
  if(!home.length || !away.length || baseH===null || baseA===null) return null;
  const hAtt=shrink(avg(home.map(m=>m.hg)),home.length,baseH);
  const hDef=shrink(avg(home.map(m=>m.ag)),home.length,baseA);
  const aAtt=shrink(avg(away.map(m=>m.ag)),away.length,baseA);
  const aDef=shrink(avg(away.map(m=>m.hg)),away.length,baseH);
  const lh=Math.max(.05,Math.min(5,hAtt*aDef/(baseH||1)));
  const la=Math.max(.05,Math.min(5,aAtt*hDef/(baseA||1)));
  return {lh,la,p:probs(lh,la)};
}
async function main() {
const file=process.argv[2];
const minArg=process.argv.find(x=>x.startsWith("--min-history="));
const minHistory=minArg ? Math.max(2,Number(minArg.split("=")[1])||30) : 30;
if(!file) {
  console.error("Uso: node scripts/backtest.cjs <results.csv|URL> [--min-history=30]");
  process.exit(2);
}
let csvText;
if (file.toLowerCase().startsWith("http://") || file.toLowerCase().startsWith("https://")) {
  const response = await fetch(file);
  if (!response.ok) throw new Error(`Falha ao obter CSV: HTTP ${response.status}`);
  csvText = await response.text();
} else {
  csvText = fs.readFileSync(file,"utf8");
}
const rows=parseCSV(csvText);
const games=rows.map(r=>({
 date:dateKey(val(r,["date","match_date","Date"])),
 home:val(r,["home","home_team","HomeTeam"]),
 away:val(r,["away","away_team","AwayTeam"]),
 hg:num(r,["ft_home","home_score","home_goals","FTHG"]),
 ag:num(r,["ft_away","away_score","away_goals","FTAG"]),
 hc:num(r,["home_corners","HomeCorners","HC","home_corner"]),
 ac:num(r,["away_corners","AwayCorners","AC","away_corner"])
})).filter(m=>m.date && m.home && m.away && m.hg!==null && m.ag!==null)
.sort((a,b)=>a.date.localeCompare(b.date));
if(games.length < minHistory+1) {
 console.error(`Só ${games.length} jogos válidos; são necessários pelo menos ${minHistory+1} para este backtest.`);
 process.exit(2);
}
const history=[];
const goalErrors=[], briers=[], outcomes=[];
const baselineGoalErrors=[], baselineBriers=[], baselineOutcomes=[];
const cornerErrors=[], homeCornerErrors=[], awayCornerErrors=[];
const baselineCornerErrors=[];
const cornerLines = [8.5, 9.5, 10.5];
const cornerAccuracy = Object.fromEntries(cornerLines.map(line => [line, []]));
const baselineCornerAccuracy = Object.fromEntries(cornerLines.map(line => [line, []]));
let index = 0;
while (index < games.length) {
  // All matches on the same date are predicted from the same pre-date history.
  const date = games[index].date;
  let end = index + 1;
  while (end < games.length && games[end].date === date) end++;
  const dayGames = games.slice(index, end);

  if (history.length >= minHistory) {
    const baseH = avg(history.map(m => m.hg));
    const baseA = avg(history.map(m => m.ag));
    const outcomesHistory = history.map(m => m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2);
    const baseP = [0, 1, 2].map(k => outcomesHistory.filter(x => x === k).length / outcomesHistory.length);
    const cornerHistory = history.filter(m => m.hc !== null && m.ac !== null).map(m => m.hc + m.ac);
    const baseCorners = avg(cornerHistory);

    for (const g of dayGames) {
      const pred = predict(history, g);
      const actual = g.hg > g.ag ? 0 : g.hg === g.ag ? 1 : 2;
      // Compare model and baseline on the exact same match sample.
      if (pred && baseH !== null && baseA !== null) {
        goalErrors.push(Math.abs(pred.lh-g.hg), Math.abs(pred.la-g.ag));
        briers.push(pred.p.reduce((sum,p,i) => sum + (p-(i===actual?1:0))**2, 0));
        outcomes.push(pred.p.indexOf(Math.max(...pred.p)) === actual);
        baselineGoalErrors.push(Math.abs(baseH-g.hg), Math.abs(baseA-g.ag));
        baselineBriers.push(baseP.reduce((sum,p,i) => sum + (p-(i===actual?1:0))**2, 0));
        baselineOutcomes.push(baseP.indexOf(Math.max(...baseP)) === actual);
      }

      if (g.hc !== null && g.ac !== null) {
        const hs = history.filter(m => m.hc !== null && m.ac !== null);
        const home = hs.filter(m => m.home === g.home).slice(-10);
        const away = hs.filter(m => m.away === g.away).slice(-10);
        const actualTotal = g.hc + g.ac;
        if (home.length >= 3 && away.length >= 3) {
          const expectedHome = avg(home.map(m => m.hc));
          const expectedAway = avg(away.map(m => m.ac));
          const expectedTotal = expectedHome + expectedAway;
          cornerErrors.push(Math.abs(expectedTotal-actualTotal));
          homeCornerErrors.push(Math.abs(expectedHome-g.hc));
          awayCornerErrors.push(Math.abs(expectedAway-g.ac));
          // Threshold accuracy is evaluated only where the team-specific model has enough history.
          if (baseCorners !== null) {
            for (const line of cornerLines) {
              cornerAccuracy[line].push((expectedTotal > line) === (actualTotal > line));
              const rate = cornerHistory.filter(total => total > line).length / cornerHistory.length;
              baselineCornerAccuracy[line].push((rate >= 0.5) === (actualTotal > line));
            }
            baselineCornerErrors.push(Math.abs(baseCorners-actualTotal));
          }
        }
      }
    }
  }
  history.push(...dayGames);
  index = end;
}
function metric(label,x,dp=3){return x.length ? `${label}: ${avg(x).toFixed(dp)} (n=${x.length})` : `${label}: sem amostra suficiente`;}
console.log("BACKTEST CRONOLÓGICO — sem informação futura");
console.log(`Jogos válidos: ${games.length}; histórico mínimo: ${minHistory}; datas: ${games[0].date} a ${games.at(-1).date}`);
console.log("\nMODELO por equipa/forma recente:");
console.log(metric("MAE golos por equipa",goalErrors));
console.log(metric("Brier 1X2 (menor é melhor)",briers));
console.log(metric("Acerto do resultado mais provável",outcomes.map(x=>x?1:0),1));
console.log(metric("MAE cantos equipa da casa",homeCornerErrors));
console.log(metric("MAE cantos equipa visitante",awayCornerErrors));
console.log(metric("MAE total de cantos",cornerErrors));
for (const line of cornerLines) console.log(metric(`Acerto Over ${line.toFixed(1)} cantos`,cornerAccuracy[line].map(x=>x?1:0),1));
console.log("\nBASELINE simples (médias/frequências históricas da liga; mesma amostra):");
console.log(metric("MAE golos por equipa",baselineGoalErrors));
console.log(metric("Brier 1X2 (menor é melhor)",baselineBriers));
console.log(metric("Acerto do resultado mais provável",baselineOutcomes.map(x=>x?1:0),1));
console.log(metric("MAE total de cantos (média da liga)",baselineCornerErrors));
for (const line of cornerLines) console.log(metric(`Acerto Over ${line.toFixed(1)} cantos (frequência histórica >= 50%)`,baselineCornerAccuracy[line].map(x=>x?1:0),1));
console.log("\nInterpretação: MAE e Brier menores são melhores; acerto maior é melhor. O baseline de cantos usa a frequência histórica da linha, não odds de mercado.");
console.log("Limitações: o modelo de cantos é uma referência simples, não o modelo completo do site; sem odds não se mede ROI nem valor esperado. Resultados de uma época curta são instáveis.");

}
main().catch(error => { console.error(error.message || error); process.exit(1); });
