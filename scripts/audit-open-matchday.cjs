#!/usr/bin/env node
"use strict";
// Audita os CSV de resultados publicados por oladeeayo/open-matchday.
// Uso: node scripts/audit-open-matchday.cjs [ficheiro-saida.csv]
const fs = require("node:fs");
const ROOT = "https://raw.githubusercontent.com/oladeeayo/open-matchday/master/";

function csvRows(s) {
  const rows = []; let row = [], v = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { v += '"'; i++; }
      else if (c === '"') q = false;
      else v += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(v); v = ""; }
    else if (c === "\n") { row.push(v); rows.push(row); row = []; v = ""; }
    else if (c !== "\r") v += c;
  }
  if (v || row.length) { row.push(v); rows.push(row); }
  return rows;
}
function date(s) {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : "";
}
function n(x) {
  if (x === undefined || String(x).trim() === "") return null;
  const v = Number(String(x).replace(",", "."));
  return Number.isFinite(v) && v >= 0 ? v : null;
}
function pct(a, b) { return b ? (100 * a / b).toFixed(1) : ""; }
async function main() {
  const out = process.argv[2] || "data-coverage-report.csv";
  const treeRes = await fetch("https://api.github.com/repos/oladeeayo/open-matchday/git/trees/master?recursive=1");
  if (!treeRes.ok) throw Error("Não foi possível obter o índice da fonte: HTTP " + treeRes.status);
  const tree = await treeRes.json();
  const paths = tree.tree.filter(x => x.type === "blob" && /^data\/[^/]+\/results_.*\.csv$/.test(x.path));
  const results = []; let cursor = 0;
  async function worker() {
    while (cursor < paths.length) {
      const item = paths[cursor++];
      try {
        const r = await fetch(ROOT + item.path);
        if (!r.ok) throw Error("HTTP " + r.status);
        const rows = csvRows(await r.text());
        if (!rows.length) throw Error("CSV vazio");
        const h = rows.shift().map(x => x.trim().toLowerCase());
        const ix = name => h.indexOf(name);
        const di=ix("date"), hi=ix("home"), ai=ix("away"), fhi=ix("ft_home"), fai=ix("ft_away");
        const hti=ix("ht_home"), hai=ix("ht_away"), hci=ix("home_corners"), aci=ix("away_corners");
        const hc1=ix("home_corners_1h"), ac1=ix("away_corners_1h");
        const hc2=ix("home_corners_2h"), ac2=ix("away_corners_2h");
        const games = rows.filter(r => r.some(v => String(v || "").trim()));
        const get = (r, i) => i < 0 ? "" : (r[i] || "");
        const validTeams = games.filter(r => get(r,hi).trim() && get(r,ai).trim());
        const complete = (a,b,list=validTeams) => list.filter(r => n(get(r,a)) !== null && n(get(r,b)) !== null);
        const dates = games.map(r => date(get(r,di))).filter(Boolean).sort();
        const teams = new Set(validTeams.flatMap(r => [get(r,hi).trim(), get(r,ai).trim()]));
        const keys = validTeams.map(r => date(get(r,di)) + "|" + get(r,hi).trim().toLowerCase() + "|" + get(r,ai).trim().toLowerCase());
        const resultFT=complete(fhi,fai).length, goalsHT=complete(hti,hai).length;
        const cornersFT=complete(hci,aci).length, cornersHT=complete(hc1,ac1).length;
        const corners2H=complete(hc2,ac2).length;
        results.push({
          league:item.path.split("/")[1], file:item.path.split("/").pop(), status:"OK",
          rows:games.length, teams:teams.size, matches_with_teams:validTeams.length,
          result_ft:resultFT, result_pct:pct(resultFT,validTeams.length),
          goals_ht:goalsHT, goals_ht_pct:pct(goalsHT,validTeams.length),
          corners_ft:cornersFT, corners_ft_pct:pct(cornersFT,validTeams.length),
          corners_ht:cornersHT, corners_ht_pct:pct(cornersHT,validTeams.length),
          corners_2h:corners2H, corners_2h_pct:pct(corners2H,validTeams.length),
          first_date:dates[0]||"", last_date:dates.at(-1)||"",
          future_dates:dates.filter(d=>d>new Date().toISOString().slice(0,10)).length,
          duplicates:keys.length-new Set(keys).size, error:""
        });
      } catch(e) {
        results.push({league:item.path.split("/")[1],file:item.path.split("/").pop(),status:"ERRO",error:e.message});
      }
    }
  }
  await Promise.all(Array.from({length:8},worker));
  results.sort((a,b)=>a.league.localeCompare(b.league));
  const cols=["league","file","status","rows","teams","matches_with_teams","result_ft","result_pct","goals_ht","goals_ht_pct","corners_ft","corners_ft_pct","corners_ht","corners_ht_pct","corners_2h","corners_2h_pct","first_date","last_date","future_dates","duplicates","error"];
  const esc=v=>{const s=String(v??"");return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
  fs.writeFileSync(out,[cols.join(","),...results.map(r=>cols.map(c=>esc(r[c])).join(","))].join("\n")+"\n","utf8");
  const ok=results.filter(r=>r.status==="OK");
  console.log("CSV de cobertura criado: "+out);
  console.log("Ficheiros encontrados: "+paths.length+"; analisados: "+results.length+"; erros: "+results.filter(r=>r.status!=="OK").length);
  console.log("Ficheiros com cantos FT completos (100%): "+ok.filter(r=>r.corners_ft_pct==="100.0").length);
  console.log("Ficheiros com alguma cobertura de cantos FT: "+ok.filter(r=>Number(r.corners_ft)>0).length);
  console.log("Ficheiros sem qualquer dado de cantos FT: "+ok.filter(r=>Number(r.corners_ft)===0).length);
  console.log("Nota: 'teams' é o número de nomes de equipas únicos; 'matches_with_teams' é o número de jogos com casa e visitante identificados.");
  console.log("A auditoria analisa os ficheiros publicados pela fonte; não garante que a própria fonte contenha todos os jogos.");
}
main().catch(e=>{console.error(e.message);process.exit(1);});
