const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("app.js", "utf8");

function extractFunction(name) {
  const start = source.search(new RegExp("function\\s+" + name + "\\s*\\("));
  assert.notEqual(start, -1, "function " + name + " exists");
  const brace = source.indexOf("{", start);
  let depth = 0, quoted = null, escaped = false, lineComment = false, blockComment = false;
  for (let i = brace; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (lineComment) { if (c === "\n") lineComment = false; continue; }
    if (blockComment) { if (c === "*" && next === "/") { blockComment = false; i++; } continue; }
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\\\") escaped = true;
      else if (c === quoted) quoted = null;
      continue;
    }
    if (c === "/" && next === "/") { lineComment = true; i++; continue; }
    if (c === "/" && next === "*") { blockComment = true; i++; continue; }
    if (c === "'" || c === '"' || c === "`") { quoted = c; continue; }
    if (c === "{") depth++;
    if (c === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error("Could not extract " + name);
}

function loadFunctions(names, extras = "") {
  const context = {};
  vm.createContext(context);
  vm.runInContext(names.map(extractFunction).join("\n") + "\n" + extras, context);
  return context;
}

test("numberValue handles Portuguese decimals and missing values", () => {
  const c = loadFunctions(["numberValue"]);
  assert.equal(c.numberValue("1,85"), 1.85);
  assert.equal(c.numberValue(" 2,5 "), 2.5);
  assert.equal(c.numberValue(""), null);
  assert.equal(c.numberValue("abc"), null);
  assert.equal(c.numberValue(null), null);
});

test("parseCSV handles quoted commas, escaped quotes and blank lines", () => {
  const c = loadFunctions(["parseCSV"]);
  const rows = c.parseCSV('home,away,note\\n"Porto, FC",Benfica,"said ""hello"""\\n\\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].home, "Porto, FC");
  assert.equal(rows[0].note, 'said "hello"');
});

test("normalizeDateKey normalizes ISO and Portuguese date formats", () => {
  const c = loadFunctions(["normalizeDateKey"]);
  assert.equal(c.normalizeDateKey("2026/2/3"), "2026-02-03");
  assert.equal(c.normalizeDateKey("03/02/2026"), "2026-02-03");
  assert.equal(c.normalizeDateKey(""), "");
});

test("shrinkAverage pulls small samples toward baseline", () => {
  const c = loadFunctions(["shrinkAverage"]);
  assert.equal(c.shrinkAverage(4, 5, 2), 3);
  assert.equal(c.shrinkAverage(null, 0, 2), 2);
  assert.equal(c.shrinkAverage(4, 0, null), 4);
});

test("Poisson probabilities are finite and bounded", () => {
  const c = loadFunctions(["poissonProbability", "poissonOverLine"]);
  assert.equal(c.poissonProbability(0, 1), Math.exp(-1));
  assert.equal(c.poissonProbability(-1, 1), 0);
  const p = c.poissonOverLine(2.5, 1.5);
  assert.ok(p > 0 && p < 1);
  assert.equal(c.poissonOverLine(-1, 2), null);
});

test("normalization rejects results without teams or final score", () => {
  const c = loadFunctions(["getValue", "numberValue", "normalizeResult"]);
  assert.equal(c.normalizeResult({home:"Porto", away:"Benfica", ft_home:"2"}), null);
  const valid = c.normalizeResult({home:"Porto", away:"Benfica", ft_home:"2", ft_away:"1"});
  assert.equal(valid.homeGoals, 2);
  assert.equal(valid.awayGoals, 1);
  assert.equal(valid.homeCorners, null);
});
