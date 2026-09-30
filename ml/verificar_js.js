// Comprueba que el navegador (js/ml-engine.js) calcula las mismas probabilidades que Python
// (ml/entrenar_modelo.py) para los casos de ml/reportes/casos_verificacion.json.
// Uso:  node ml/verificar_js.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const raiz = path.join(__dirname, "..");
const ChasideML = vm.runInNewContext(fs.readFileSync(path.join(raiz, "js", "ml-engine.js"), "utf8") + "\n;ChasideML", {
  fetch: () => Promise.resolve({ ok: true, json: () => JSON.parse(fs.readFileSync(path.join(raiz, "modelo.json"), "utf8")) }),
  console
});
const casos = JSON.parse(fs.readFileSync(path.join(__dirname, "reportes", "casos_verificacion.json"), "utf8"));

ChasideML.cargar("modelo.json").then((m) => {
  if (!m) { console.log("No se pudo cargar modelo.json"); process.exit(1); }
  let peor = 0;
  casos.forEach((c) => {
    const pred = ChasideML.predecir(c.respuestas);
    Object.keys(c.probs).forEach((a) => { peor = Math.max(peor, Math.abs(pred.probs[a] - c.probs[a])); });
  });
  const ok = peor < 1e-4;
  console.log(`Modelo ${m.version} · casos: ${casos.length} · diferencia máxima JS vs Python: ${peor.toExponential(2)} -> ${ok ? "COINCIDEN" : "DIFIEREN"}`);
  process.exit(ok ? 0 : 1);
});
