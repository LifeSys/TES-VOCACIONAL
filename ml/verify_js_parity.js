// Comprueba que la inferencia en JavaScript (js/ml-engine.js) da EXACTAMENTE los mismos
// rankings que la implementacion de Python (ml/train_model.py) sobre los casos de
// ml/reports/parity_cases.json. Uso:  node ml/verify_js_parity.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const code =
  fs.readFileSync(path.join(root, "js", "ml-model.js"), "utf8") + "\n" +
  fs.readFileSync(path.join(root, "js", "ml-engine.js"), "utf8") + "\n;ChasideML";
const ChasideML = vm.runInNewContext(code);

const cases = JSON.parse(fs.readFileSync(path.join(__dirname, "reports", "parity_cases.json"), "utf8"));
let bad = 0;
cases.forEach((c, i) => {
  const got = ChasideML.rankIndices(c.scores).ranking.slice(0, c.ranking.length);
  if (JSON.stringify(got) !== JSON.stringify(c.ranking)) {
    bad++;
    if (bad <= 5) console.log("DIFERENCIA en caso", i, c.scores, "\n  python:", c.ranking, "\n  js:    ", got);
  }
});
console.log(`Casos: ${cases.length} | coinciden: ${cases.length - bad} | difieren: ${bad}`);
process.exit(bad ? 1 : 0);
