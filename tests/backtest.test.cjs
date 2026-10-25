const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const script = path.join(__dirname, "..", "scripts", "backtest.cjs");

function fixtureCsv() {
  const rows = ["date,home,away,ft_home,ft_away,home_corners,away_corners"];
  for (let i = 0; i < 48; i++) {
    const date = new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
    const home = i % 2 === 0 ? "Porto" : "Benfica";
    const away = i % 2 === 0 ? "Benfica" : "Porto";
    const hg = i % 3 === 0 ? 2 : i % 3 === 1 ? 1 : 0;
    const ag = i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2;
    const hc = 4 + (i % 5);
    const ac = 3 + (i % 4);
    rows.push([date, home, away, hg, ag, hc, ac].join(","));
  }
  return rows.join("\n") + "\n";
}

test("backtest prints all corner lines and team-specific corner errors", t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "futebol-stats-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const csv = path.join(dir, "results.csv");
  fs.writeFileSync(csv, fixtureCsv(), "utf8");

  const run = spawnSync(process.execPath, [script, csv, "--min-history=10"], {
    encoding: "utf8",
    timeout: 10000
  });

  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Acerto Over 8\.5 cantos/);
  assert.match(run.stdout, /Acerto Over 9\.5 cantos/);
  assert.match(run.stdout, /Acerto Over 10\.5 cantos/);
  assert.match(run.stdout, /MAE cantos equipa da casa/);
  assert.match(run.stdout, /MAE cantos equipa visitante/);
  assert.match(run.stdout, /BASELINE simples/);
});

test("backtest rejects missing input with usage message", () => {
  const run = spawnSync(process.execPath, [script], { encoding: "utf8", timeout: 10000 });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /Uso: node scripts\/backtest\.cjs/);
});
