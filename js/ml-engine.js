// Motor de inferencia k-NN (corre 100% en el navegador, sin servidor).
// Usa el modelo entrenado en Python (js/ml-model.js -> CHASIDE_ML_MODEL).
// La logica es identica a rank_row() de ml/train_model.py; ml/verify_js_parity.js
// comprueba que ambas implementaciones producen los mismos rankings.
//
// Entrada: puntajes CHASIDE del estudiante, un entero 0..14 por area, en el orden
//          del modelo (C, H, A, S, I, D, E).
// Salida:  ranking de carreras [{name, area, score, affinity}], de mayor a menor afinidad.
//          affinity = votos de la carrera / votos de la mejor carrera (la mejor = 1).
const ChasideML = (function () {
  "use strict";
  var M = CHASIDE_ML_MODEL;
  var N = M.X.length;

  function rankIndices(scores) {
    // distancia euclidiana al cuadrado (entera, exacta) contra cada perfil de entrenamiento
    var d2 = new Array(N);
    for (var i = 0; i < N; i++) {
      var row = M.X[i], s = 0;
      for (var j = 0; j < scores.length; j++) {
        var diff = scores[j] - row[j];
        s += diff * diff;
      }
      d2[i] = s;
    }
    // vecinos ordenados por distancia; desempate estable por posicion
    var order = new Array(N);
    for (var t = 0; t < N; t++) order[t] = t;
    order.sort(function (a, b) { return d2[a] - d2[b] || a - b; });

    var nClasses = M.careers.length;
    var kk = Math.min(M.k, N);
    var votes;
    while (true) {
      votes = new Array(nClasses).fill(0);
      for (var n = 0; n < kk; n++) {
        var idx = order[n];
        var w = M.weights === "distance"
          ? 1.0 / (Math.sqrt(d2[idx]) / M.maxScore + M.eps)
          : 1.0;
        votes[M.y[idx]] += w;
      }
      var withVotes = 0;
      for (var c = 0; c < nClasses; c++) if (votes[c] > 0) withVotes++;
      // si hay menos carreras candidatas de las necesarias, se amplia k (vecinos mas lejanos)
      if (withVotes >= M.minCandidates || kk >= N) break;
      kk = Math.min(kk * 2, N);
    }
    var ranking = [];
    for (var r = 0; r < nClasses; r++) ranking.push(r);
    ranking.sort(function (a, b) { return (votes[b] - votes[a]) || (a - b); });
    return { ranking: ranking, votes: votes };
  }

  function recommend(scores, topN) {
    var res = rankIndices(scores);
    var n = topN || M.topN;
    var best = res.votes[res.ranking[0]] || 1;
    return res.ranking.slice(0, n).map(function (c) {
      return {
        name: M.careers[c],
        area: M.careerAreas[c],
        score: res.votes[c],
        affinity: res.votes[c] / best
      };
    });
  }

  return { recommend: recommend, rankIndices: rankIndices, model: M };
})();
