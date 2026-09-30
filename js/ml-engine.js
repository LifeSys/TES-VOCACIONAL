// Motor de inferencia del modelo de ML (RF11, RF12). Corre 100% en el navegador (RNF02, RNF04).
//
// Modelo: regresión logística multinomial entrenada con ml/entrenar_modelo.py (Google Colab) y
// publicada como modelo.json (RNF06: cambiar el modelo = reemplazar ese archivo).
//   Entrada: las 98 respuestas del CHASIDE (1 = Sí, 0 = No), en orden de ítem 1..98.
//   Salida:  probabilidad de cada área, ranking y los 3 ítems que más pesaron en el área top.
const ChasideML = (function () {
  "use strict";
  var modelo = null;
  var cargando = null;

  function cargar(url) {
    if (cargando) return cargando;
    cargando = fetch(url, { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (m) { validar(m); modelo = m; return m; })
      .catch(function (err) { console.warn("No se pudo cargar el modelo de ML:", err); modelo = null; return null; });
    return cargando;
  }

  function validar(m) {
    if (!m || !m.areas || !m.coef || !m.intercept || !m.items) throw new Error("modelo.json incompleto");
    if (m.coef.length !== m.areas.length || m.intercept.length !== m.areas.length) throw new Error("dimensiones de modelo.json");
    m.coef.forEach(function (fila) { if (fila.length !== m.items.length) throw new Error("dimensiones de coef"); });
  }

  // respuestas: arreglo de 98 valores 0/1, posición i = ítem i+1
  function predecir(respuestas) {
    if (!modelo) return null;
    var x = modelo.items.map(function (id) { return respuestas[id - 1] ? 1 : 0; });
    var K = modelo.areas.length, logits = new Array(K), maxL = -Infinity;
    for (var k = 0; k < K; k++) {
      var z = modelo.intercept[k], w = modelo.coef[k];
      for (var j = 0; j < x.length; j++) if (x[j]) z += w[j];
      logits[k] = z;
      if (z > maxL) maxL = z;
    }
    var suma = 0, exps = logits.map(function (z) { var e = Math.exp(z - maxL); suma += e; return e; });
    var probs = {};
    modelo.areas.forEach(function (a, k) { probs[a] = exps[k] / suma; });
    var ranking = modelo.areas.slice().sort(function (a, b) { return probs[b] - probs[a]; });

    // Explicación: ítems respondidos "Sí" que más empujan hacia el área top frente al promedio
    // de las demás áreas (coeficiente relativo). Son los que "más pesaron" en la recomendación.
    var kTop = modelo.areas.indexOf(ranking[0]);
    var aportes = [];
    for (var jj = 0; jj < x.length; jj++) {
      if (!x[jj]) continue;
      var media = 0;
      for (var m = 0; m < K; m++) media += modelo.coef[m][jj];
      media /= K;
      var aporte = modelo.coef[kTop][jj] - media;
      if (aporte > 0) aportes.push({ item: modelo.items[jj], aporte: aporte });
    }
    aportes.sort(function (a, b) { return b.aporte - a.aporte; });

    return {
      version: modelo.version,
      probs: probs,
      ranking: ranking,
      explicacion: aportes.slice(0, 3).map(function (a) { return a.item; })
    };
  }

  return {
    cargar: cargar,
    predecir: predecir,
    modelo: function () { return modelo; }
  };
})();
