// Cálculos del instrumento CHASIDE compartidos por el test (app.js) y el panel admin (admin.js).
const Chaside = (function () {
  "use strict";
  var D = CHASIDE_DATA;
  var MAX_POR_AREA = 14; // 10 de interés + 4 de aptitud

  // RF10 — puntaje clásico con la clave CHASIDE: cantidad de "Sí" por área.
  // respuestas: arreglo de 98 valores 0/1 (posición i = ítem i+1).
  function clave(respuestas) {
    var tot = {};
    D.areaOrder.forEach(function (a) { tot[a] = 0; });
    D.questions.forEach(function (q) { if (respuestas[q.id - 1] === 1) tot[q.area] += 1; });
    return tot;
  }

  // Ranking por puntaje clásico SIN sesgo de orden: las áreas con el mismo puntaje comparten
  // puesto (empate) en lugar de ganar la que aparece primero en C-H-A-S-I-D-E.
  function rankingClave(tot) {
    var areas = D.areaOrder.slice().sort(function (a, b) { return tot[b] - tot[a]; });
    var puesto = 0, anterior = null;
    return areas.map(function (a, i) {
      if (tot[a] !== anterior) { puesto = i + 1; anterior = tot[a]; }
      return { area: a, puntaje: tot[a], puesto: puesto };
    });
  }

  // Áreas top por clave clásica: las de puesto <= n (puede devolver más de n si hay empate).
  function topClave(tot, n) {
    return rankingClave(tot).filter(function (r) { return r.puesto <= n; }).map(function (r) { return r.area; });
  }

  // RF09 — calidad de datos. tiemposMs en el mismo orden que respuestas; `ordenIds` es el orden
  // en que se mostraron las preguntas (para detectar respuestas rápidas SEGUIDAS).
  function calidad(respuestas, tiemposMs, ordenIds, cfg) {
    var si = respuestas.filter(function (v) { return v === 1; }).length;
    if (si === respuestas.length) return { valido: false, motivo: "todo_si" };
    if (si === 0) return { valido: false, motivo: "todo_no" };
    var racha = 0, maxRacha = 0;
    ordenIds.forEach(function (id) {
      var t = tiemposMs[id - 1];
      racha = (typeof t === "number" && t < cfg.msRapida) ? racha + 1 : 0;
      if (racha > maxRacha) maxRacha = racha;
    });
    if (maxRacha >= cfg.rapidasSeguidas) return { valido: false, motivo: "respuestas_rapidas" };
    return { valido: true, motivo: null };
  }

  function carrerasDeArea(area) {
    return D.careers.filter(function (c) { return c.area === area; }).map(function (c) { return c.name; });
  }

  function areaDeCarrera(nombre) {
    var c = D.careers.filter(function (x) { return x.name === nombre; })[0];
    return c ? c.area : null;
  }

  function pregunta(id) {
    return D.questions.filter(function (q) { return q.id === id; })[0] || null;
  }

  return {
    MAX_POR_AREA: MAX_POR_AREA,
    areas: D.areaOrder,
    nombres: D.areaNames,
    clave: clave,
    rankingClave: rankingClave,
    topClave: topClave,
    calidad: calidad,
    carrerasDeArea: carrerasDeArea,
    areaDeCarrera: areaDeCarrera,
    pregunta: pregunta
  };
})();
