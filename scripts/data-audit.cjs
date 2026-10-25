#!/usr/bin/env node
"use strict";
// CSV coverage audit. Missing/invalid values are never treated as zero.
// Usage: node scripts/data-audit.cjs <file.csv|https://...>
const fs=require("node:fs");
function parseCSV(s){
 const out=[];let row=[],v="",q=false;
 for(let i=0;i<s.length;i++){const c=s[i];
  if(q){if(c==='"'&&s[i+1]==='"'){v+='"';i++;}else if(c==='"')q=false;else v+=c;}
  else if(c==='"')q=true;else if(c===","){row.push(v);v="";}
  else if(c==="\n"){row.push(v);out.push(row);row=[];v="";}
  else if(c!=="\r")v+=c;
 }
 if(v||row.length){row.push(v);out.push(row);}
 if(!out.length)return [];
 const h=out.shift().map(x=>x.trim().replace(/^\uFEFF/,""));
 return out.filter(r=>r.some(x=>x.trim())).map(r=>Object.fromEntries(h.map((k,i)=>[k,(r[i]||"").trim()])));
}
function get(r,names){const k=Object.keys(r).find(k=>names.some(n=>n.toLowerCase()===k.toLowerCase()));return k?r[k]:"";}
function num(r,n){const s=String(get(r,n)).trim().replace(",",".");if(!s)return null;const x=Number(s);return Number.isFinite(x)&&x>=0?x:null;}
function date(s){
 s=String(s||"").trim();let m=s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
 if(m)return m[1]+"-"+m[2].padStart(2,"0")+"-"+m[3].padStart(2,"0");
 m=s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
 if(m)return m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0");
 const d=new Date(s);return Number.isNaN(d.getTime())?"":d.toISOString().slice(0,10);
}
async function main(){
 const input=process.argv[2];if(!input){console.error("Uso: node scripts/data-audit.cjs <ficheiro.csv|URL>");process.exit(2);}
 let raw;if(/^https?:\/\//i.test(input)){const res=await fetch(input);if(!res.ok)throw Error("HTTP "+res.status+" ao obter CSV");raw=await res.text();}else raw=fs.readFileSync(input,"utf8");
 const rows=parseCSV(raw);if(!rows.length){console.error("CSV vazio ou sem linhas de dados.");process.exit(2);}
 const games=rows.map(r=>({d:date(get(r,["date","match_date","Date"])),h:get(r,["home","home_team","HomeTeam"]),a:get(r,["away","away_team","AwayTeam"]),hg:num(r,["ft_home","home_score","home_goals","FTHG"]),ag:num(r,["ft_away","away_score","away_goals","FTAG"]),hc:num(r,["home_corners","HomeCorners","HC","home_corner"]),ac:num(r,["away_corners","AwayCorners","AC","away_corner"]),hh:num(r,["ht_home_corners","home_corners_ht","HTHC","HTHomeCorners"]),ah:num(r,["ht_away_corners","away_corners_ht","HTAC","HTAwayCorners"])}));
 const teams=games.filter(g=>g.h&&g.a),results=teams.filter(g=>g.hg!==null&&g.ag!==null),ft=teams.filter(g=>g.hc!==null&&g.ac!==null),ht=teams.filter(g=>g.hh!==null&&g.ah!==null),dates=games.map(g=>g.d).filter(Boolean).sort();
 const pct=(n,d)=>d?(100*n/d).toFixed(1)+"%":"n/a",line=(label,n,d)=>console.log(label+": "+n+"/"+d+" ("+pct(n,d)+")");
 console.log("AUDITORIA DE COBERTURA CSV\nLinhas de dados: "+rows.length);
 line("Jogos com equipas identificadas",teams.length,rows.length);
 console.log("Datas reconhecidas: "+dates.length+"/"+rows.length+(dates.length?"; intervalo "+dates[0]+" a "+dates[dates.length-1]:""));
 line("Resultados FT completos",results.length,teams.length);line("Cantos FT completos",ft.length,teams.length);line("Cantos HT completos (campos reconhecidos)",ht.length,teams.length);
 console.log("Datas futuras reconhecidas: "+dates.filter(d=>d>new Date().toISOString().slice(0,10)).length);
 console.log("Linhas sem data reconhecida: "+(rows.length-games.filter(g=>g.d).length));
 console.log("Campos vazios, inválidos ou negativos contam como ausentes, nunca como zero.");
 if(teams.length&&results.length/teams.length<.8)console.log("AVISO: cobertura de resultados inferior a 80%.");
 if(teams.length&&ft.length/teams.length<.5)console.log("AVISO: cobertura de cantos FT inferior a 50%.");
}
main().catch(e=>{console.error(e.message);process.exit(1);});
