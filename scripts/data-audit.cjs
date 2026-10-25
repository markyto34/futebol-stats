#!/usr/bin/env node
"use strict";

// Audita cobertura de resultados/cantos num CSV do formato open-matchday.
// Uso: node scripts/data-audit.cjs ficheiro.csv|URL [--as-of=YYYY-MM-DD]
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
  return rows.filter(r => r.some(v => v.trim())).map(r =>
    Object.fromEntries(headers.map((h, i) => [h, (r[i] || "").trim()]))
  );
}
function val(row, names) {
  for (const name of names) {
    const key = Object.keys(row).find(k => k.toLowerCase() === name.toLowerCase());
    if (key && row[key] !== "") return row[key];
  }
  return "";
}
function num(row, names) {
  const raw = String(val(row, names)).trim().replace(/\s/g, "").replace(",", ".");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function dateKey(raw) {
  const s = String(raw || "").trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0,10);
}
function pct(n, total) { return total ? (100*n/total).toFixed(1) + "%" : "N/D"; }
async function main() {
  const file = process.argv[2];
  const asOfArg = process.argv.find(x => x.startsWith("--as-of="));
  const asOf = asOfArg ? dateKey(asOfArg.slice(8)) : new Date().toISOString().slice(0,10);
  if (!file) {
    console.error("Uso: node scripts/data-audit.cjs <ficheiro.csv|URL> [--as-of=YYYY-MM-DD]");
    process.exit(2);
  }
  let csv;
  if (/^https?:\/\//i.test(file)) {
    const response = await fetch(file);
    if (!response.ok) throw new Error(`Falha ao obter CSV: HTTP ${response.status}`);
    csv = await response.text();
  } else csv = fs.readFileSync(file, "utf8");
  const rows = parseCSV(csv);
  if (!rows.length) {
    console.error("CSV vazio ou sem linhas de dados.");
    process.exit(2);
  }
  const games = rows.map(r => ({
    date: dateKey(val(r, ["date","match_date","Date"])),
    home: val(r, ["home","home_team","HomeTeam"]),
    away: val(r, ["away","away_team","AwayTeam"]),
    hg: num(r, ["ft_home","home_score","home_goals","FTHG"]),
    ag: num(r, ["ft_away","away_score","away_goals","FTAG"]),
    hhg: num(r, ["ht_home","HTHG","home_ht_goals"]),
    hag: num(r, ["ht_away","HTAG","away_ht_goals"]),
    hc: num(r, ["home_corners","HomeCorners","HC","home_corner"]),
    ac: num(r, ["away_corners","AwayCorners","AC","away_corner"]),
    hhc: num(r, ["ht_home_corners","home_ht_corners","HHC"]),
    hac: num(r, ["ht_away_corners","away_ht_corners","AHC"])
  }));
  const validTeams = games.filter(g => g.home && g.away);
  const dated = validTeams.filter(g => g.date);
  const completed = validTeams.filter(g => g.hg !== null && g.ag !== null);
  const playedDated = completed.filter(g => g.date);
  const future = dated.filter(g => g.date > asOf);
  const ftCorners = validTeams.filter(g => g.hc !== null && g.ac !== null);
  const htGoals = validTeams.filter(g => g.hhg !== null && g.hag !== null);
  const htCorners = validTeams.filter(g => g.hhc !== null && g.hac !== null);
  const invalidDate = validTeams.filter(g => !g.date);
  const invalidResult = validTeams.filter(g => g.hg === null || g.ag === null);
  const duplicates = new Set();
  let duplicateCount = 0;
  for (const g of playedDated) {
    const key = [g.date,g.home,g.away].join("|").toLowerCase();
    if (duplicates.has(key)) duplicateCount++;
    duplicates.add(key);
  }
  const min = dated.length ? dated.map(g=>g.date).sort()[0] : "N/D";
  const max = dated.length ? dated.map(g=>g.date).sort().at(-1) : "N/D";
  console.log("AUDITORIA DE COBERTURA CSV");
  console.log(`Ficheiro: ${file}`);
  console.log(`Data de referência: ${asOf}`);
  console.log(`Linhas de dados: ${rows.length}`);
  console.log(`Linhas com equipas identificadas: ${validTeams.length} (${pct(validTeams.length,rows.length)})`);
  console.log(`Intervalo de datas: ${min} a ${max}`);
  console.log(`Jogos com resultado FT completo: ${completed.length} (${pct(completed.length,validTeams.length)})`);
  console.log(`Jogos com cantos FT completos: ${ftCorners.length} (${pct(ftCorners.length,validTeams.length)})`);
  console.log(`Jogos com golos HT completos: ${htGoals.length} (${pct(htGoals.length,validTeams.length)})`);
  console.log(`Jogos com cantos HT completos: ${htCorners.length} (${pct(htCorners.length,validTeams.length)})`);
  console.log(`Linhas com data inválida/ausente: ${invalidDate.length}`);
  console.log(`Jogos sem resultado FT completo: ${invalidResult.length}`);
  console.log(`Datas posteriores à referência (possíveis fixtures): ${future.length}`);
  console.log(`Duplicados por data + equipa da casa + visitante entre resultados: ${duplicateCount}`);
  console.log("Nota: cobertura mede apenas este CSV; não prova que a fonte inclui todos os jogos da competição.");
}
main().catch(error => { console.error(error.message || error); process.exit(1); });
