const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const script = path.join(__dirname, "..", "scripts", "data-audit.cjs");

test("data audit reports FT/HT coverage, future fixtures and duplicates", t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "futebol-audit-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const csv = path.join(dir, "data.csv");
  fs.writeFileSync(csv, [
    "date,home,away,ft_home,ft_away,ht_home,ht_away,home_corners,away_corners,ht_home_corners,ht_away_corners",
    "2025-01-01,Porto,Benfica,2,1,1,0,6,4,3,2",
    "2025-01-01,Porto,Benfica,2,1,1,0,6,4,3,2",
    "2025-01-02,Braga,Sporting,1,1,,,,,",
    "2027-01-01,Porto,Braga,,,,,,,,"
  ].join("\n"), "utf8");

  const run = spawnSync(process.execPath, [script, csv, "--as-of=2026-01-01"], {
    encoding: "utf8",
    timeout: 10000
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Linhas de dados: 4/);
  assert.match(run.stdout, /Jogos com resultado FT completo: 3/);
  assert.match(run.stdout, /Jogos com cantos FT completos: 2/);
  assert.match(run.stdout, /Jogos com golos HT completos: 2/);
  assert.match(run.stdout, /Datas posteriores à referência \(possíveis fixtures\): 1/);
  assert.match(run.stdout, /Duplicados .*: 1/);
});

test("data audit rejects missing input with usage message", () => {
  const run = spawnSync(process.execPath, [script], { encoding: "utf8", timeout: 10000 });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /Uso: node scripts\/data-audit\.cjs/);
});
