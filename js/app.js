(function () {
  "use strict";

  var QUESTIONS = CHASIDE_DATA.questions;
  var AREA_ORDER = CHASIDE_DATA.areaOrder;
  var AREA_NAMES = CHASIDE_DATA.areaNames;
  var CAREERS = CHASIDE_DATA.careers;
  var MAX_PER_AREA = 14; // 10 interes + 4 aptitud

  var state = {
    screen: "welcome", // welcome | test | result | thanks | print
    code: "",
    codeError: false,
    qIndex: 0,
    answers: {},
    finishedAt: null
  };

  // ---------- Firestore (results storage for the admin panel) ----------
  // Fails silently if Firebase isn't configured yet (js/firebase-config.js
  // still has placeholder keys) or the visitor is offline — saving results
  // is a bonus for the admin panel, it must never block the student's flow.
  function db() {
    try {
      if (typeof firebase === "undefined" || !firebase.apps.length) return null;
      return firebase.firestore();
    } catch (e) {
      return null;
    }
  }

  function saveResultToFirestore(scoresList, careers, engine) {
    var database = db();
    if (!database) return;
    var payload = {
      code: state.code.trim(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      scores: scoresList.map(function (s) { return { area: s.area, name: s.name, score: s.score, pct: s.pct, top: s.top }; }),
      careers: careers.map(function (c) { return c.name; }),
      // trazabilidad del modelo: que version recomendo y con que afinidad relativa
      modelo: engine,
      recomendaciones: careers.map(function (c) {
        return { name: c.name, area: c.area, afinidad: c.affinity == null ? null : Math.round(c.affinity * 1000) / 1000 };
      })
    };
    database.collection("resultados").add(payload)
      .catch(function (err) { console.warn("No se pudo guardar el resultado:", err); });
  }

  var app = document.getElementById("app");

  // ---------- icons ----------
  function icon(name) {
    switch (name) {
      case "check": return '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      case "x": return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      case "back": return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
      case "arrow": return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
      case "printer": return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>';
      case "download": return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
      case "thanks": return '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="8 12.5 10.8 15.3 16 9.3"></polyline></svg>';
      default: return "";
    }
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ---------- header shared across app screens (not shown on print view) ----------
  function renderTopRow() {
    var right = "";
    if (state.screen === "test") {
      var backBtn = state.qIndex > 0
        ? '<button class="icon-btn" data-action="back" aria-label="Pregunta anterior">' + icon("back") + "</button>"
        : '<div class="icon-btn-spacer"></div>';
      right = '<div class="top-row-right">' + backBtn + '<div class="q-counter">Pregunta ' + (state.qIndex + 1) + " / " + QUESTIONS.length + "</div></div>";
    }
    return (
      '<div class="top-row">' +
      '<img class="brand-mark-img" src="img/logo.svg" width="34" height="34" alt="OrientaIA">' +
      '<div class="brand-name">OrientaIA</div>' +
      right +
      "</div>"
    );
  }

  function renderFooter() {
    return (
      '<div class="footer-divider"></div>' +
      '<footer class="site-footer">' +
      '<div class="footer-inner">' +
      '<div class="footer-col footer-brand">' +
      '<div class="footer-brand-name">Orienta<span>IA</span></div>' +
      '<p class="footer-tagline">Test de orientación vocacional con inteligencia artificial para estudiantes de secundaria.</p>' +
      "</div>" +
      '<div class="footer-col">' +
      '<div class="footer-col-title">Contacto</div>' +
      '<div class="footer-line-label">Tel. / WhatsApp</div>' +
      '<div class="footer-line-value">906 127 991</div>' +
      '<div class="footer-line-value">942 906 165</div>' +
      '<div class="footer-line-label" style="margin-top:12px">Email</div>' +
      '<a class="footer-line-value footer-link" href="mailto:testvocacional.app@gmail.com">testvocacional.app@gmail.com</a>' +
      "</div>" +
      '<div class="footer-col">' +
      '<div class="footer-col-title">Enlaces</div>' +
      '<button class="footer-link footer-link-btn" data-action="restart">Hacer el test</button>' +
      '<button class="footer-link footer-link-btn" data-action="show-print">Cuestionario imprimible</button>' +
      "</div>" +
      "</div>" +
      '<div class="footer-bottom">' +
      '<p>&copy; 2026 <b>OrientaIA</b> &mdash; Héctor Medina y Johann Guevara. Todos los derechos reservados. Queda prohibida la reproducción total o parcial de este sitio, su diseño y sus contenidos sin autorización previa.</p>' +
      '<p><b>Confidencialidad:</b> al terminar el test, tus resultados (puntaje por área y carreras recomendadas) se guardan en una base de datos protegida para que el equipo responsable de tu institución pueda acompañarte. Se identifican solo con tu código de acceso, nunca con tu nombre, y solo los puede ver personal autorizado. Este test es una herramienta de orientación y no reemplaza una evaluación vocacional profesional certificada.</p>' +
      "</div>" +
      "</div>" +
      "</footer>"
    );
  }

  function renderProgress() {
    if (state.screen !== "test") return "";
    var pct = Math.round(((state.qIndex + 1) / QUESTIONS.length) * 100);
    return '<div class="progress-track" role="progressbar" aria-valuenow="' + (state.qIndex + 1) + '" aria-valuemin="1" aria-valuemax="' + QUESTIONS.length + '"><div class="progress-fill" style="width:' + pct + '%"></div></div>';
  }

  // ---------- screens ----------
  function renderWelcome() {
    var inputClass = state.codeError ? "text-input input-error" : "text-input";
    return (
      '<div class="card">' +
      '<p class="eyebrow">Orientación vocacional · 4to y 5to de secundaria</p>' +
      '<h1 class="title">Descubre la carrera ideal para ti</h1>' +
      '<p class="subtitle">Responde 98 preguntas sencillas de Sí o No sobre tus intereses y comportamientos cotidianos. Al final vas a ver tus áreas vocacionales más representativas, con carreras concretas para cada una.</p>' +
      '<div class="stats-row">' +
      '<div class="stat"><div class="stat-value">98</div><div class="stat-label">Preguntas</div></div>' +
      '<div class="stat"><div class="stat-value">~15</div><div class="stat-label">Minutos</div></div>' +
      '<div class="stat"><div class="stat-value">7</div><div class="stat-label">Áreas posibles</div></div>' +
      "</div>" +
      '<div class="field-block">' +
      '<label class="field-label" for="access-code-input">Código de acceso</label>' +
      '<input id="access-code-input" class="' + inputClass + '" type="text" placeholder="Ej. EST-07" value="' + esc(state.code) + '" data-bind="code" />' +
      (state.codeError ? '<div class="field-error" role="alert">Ingresa el código que te entregaron para continuar.</div>' : "") +
      "</div>" +
      '<p class="privacy-note">Tus respuestas son confidenciales y se identifican solo con tu código de acceso. No se te pedirá tu nombre, correo ni ningún dato personal dentro de este sistema.</p>' +
      '<hr class="section-divider">' +
      '<div class="bullet-list">' +
      '<div class="bullet-item"><span class="bullet-dot"></span><span><b>Responde con sinceridad:</b> no hay respuesta correcta ni incorrecta, solo la que más se parece a ti.</span></div>' +
      '<div class="bullet-item"><span class="bullet-dot"></span><span><b>Es Sí o No:</b> si dudas, elige la opción que más veces elegirías en tu día a día.</span></div>' +
      '<div class="bullet-item"><span class="bullet-dot"></span><span><b>Es orientación, no destino:</b> el resultado te da pistas para investigar, no una sentencia.</span></div>' +
      "</div>" +
      '<button class="btn-primary" data-action="start">Comenzar el test ' + icon("arrow") + "</button>" +
      '<button class="print-link" data-action="show-print">' + icon("printer") + " Imprimir cuestionario en blanco (PDF)</button>" +
      "</div>"
    );
  }

  function renderTest() {
    var q = QUESTIONS[state.qIndex];
    var current = state.answers[q.id];
    var isLast = state.qIndex === QUESTIONS.length - 1;
    var yesClass = "yesno-btn" + (current === "si" ? " yesno-btn-selected" : "");
    var noClass = "yesno-btn" + (current === "no" ? " yesno-btn-selected" : "");
    return (
      '<div class="card">' +
      '<div class="q-head"><p class="q-eyebrow">Test vocacional CHASIDE</p><span class="q-tag">' + (isLast ? "última pregunta" : "avanza automático") + "</span></div>" +
      '<p class="q-text">' + esc(q.text) + "</p>" +
      '<div class="yesno-grid">' +
      '<button class="' + yesClass + '" data-action="answer" data-qid="' + q.id + '" data-value="si" aria-pressed="' + (current === "si" ? "true" : "false") + '">' + icon("check") + "Sí</button>" +
      '<button class="' + noClass + '" data-action="answer" data-qid="' + q.id + '" data-value="no" aria-pressed="' + (current === "no" ? "true" : "false") + '">' + icon("x") + "No</button>" +
      "</div>" +
      "</div>"
    );
  }

  function computeResults() {
    var totals = {};
    AREA_ORDER.forEach(function (a) { totals[a] = 0; });
    QUESTIONS.forEach(function (q) {
      if (state.answers[q.id] === "si") totals[q.area] += 1;
    });
    var sorted = AREA_ORDER.slice().sort(function (a, b) { return totals[b] - totals[a]; });
    var topTwo = sorted.slice(0, 2);

    var scoresList = AREA_ORDER.map(function (a) {
      var top = topTwo.indexOf(a) !== -1;
      return {
        area: a,
        name: AREA_NAMES[a],
        score: totals[a],
        pct: Math.round((totals[a] / MAX_PER_AREA) * 100),
        top: top
      };
    });
    scoresList.sort(function (a, b) { return b.score - a.score; });

    // Recomendacion de carreras: modelo k-NN entrenado (js/ml-model.js + js/ml-engine.js).
    // Entrada = los 7 puntajes CHASIDE (0..14) en el orden del modelo. Si por algun motivo
    // el modelo no cargo, se usa la regla anterior (carreras de las 2 areas con mayor puntaje).
    var careers, engine = "regla";
    if (typeof ChasideML !== "undefined" && ChasideML.model.areas.join() === AREA_ORDER.join()) {
      var vector = AREA_ORDER.map(function (a) { return totals[a]; });
      careers = ChasideML.recommend(vector);
      engine = ChasideML.model.version;
    } else {
      careers = CAREERS.filter(function (c) { return topTwo.indexOf(c.area) !== -1; })
        .map(function (c) { return { name: c.name, area: c.area, affinity: null }; });
    }
    var topAreaPills = topTwo.map(function (a) { return AREA_NAMES[a]; });

    return { scoresList: scoresList, careers: careers, topAreaPills: topAreaPills, engine: engine };
  }

  function renderResult() {
    var r = computeResults();
    var pills = r.topAreaPills.map(function (n) { return '<div class="top-area-pill">' + esc(n) + "</div>"; }).join("");
    var scores = r.scoresList.map(function (s) {
      return (
        '<div class="score-row"><div class="score-row-top">' +
        '<span class="score-name' + (s.top ? " is-top" : "") + '">' + esc(s.name) + "</span>" +
        '<span class="score-value">' + s.score + "/" + MAX_PER_AREA + "</span></div>" +
        '<div class="score-track"><div class="score-fill' + (s.top ? " is-top" : "") + '" style="width:' + s.pct + '%"></div></div></div>'
      );
    }).join("");
    var careers = r.careers.map(function (c) {
      var aff = c.affinity == null ? "" :
        '<div class="affinity"><div class="affinity-track"><div class="affinity-fill" style="width:' + Math.round(c.affinity * 100) + '%"></div></div>' +
        '<span class="affinity-label">' + Math.round(c.affinity * 100) + "%</span></div>";
      return '<div class="career-card"><div class="career-main"><span class="career-name">' + esc(c.name) + "</span>" + aff + "</div>" +
        '<span class="career-area">' + esc(AREA_NAMES[c.area]) + "</span></div>";
    }).join("");
    var careersNote = r.engine === "regla" ? "" :
      '<p class="section-note">Ordenadas por un modelo de aprendizaje automático (k-NN) a partir de tus 7 puntajes. La barra indica la afinidad relativa: la primera carrera = 100%.</p>';

    return (
      '<div class="card">' +
      '<h1 class="title">Tu perfil vocacional</h1>' +
      '<p class="subtitle">Basado en tus respuestas al test CHASIDE, estas son tus áreas más representativas</p>' +
      '<div class="top-areas-row">' + pills + "</div>" +
      '<div class="result-grid">' +
      '<div><h2 class="section-title">Tus áreas de interés</h2><div class="scores-block">' + scores + "</div></div>" +
      '<div><h2 class="section-title">Carreras recomendadas para tu perfil</h2>' + careersNote + '<div class="career-list">' + careers + "</div></div>" +
      "</div>" +
      '<div class="disclaimer-box"><p>Este resultado es una sugerencia orientativa. Coméntalo con tu psicólogo o tutor escolar para tomar una decisión informada.</p></div>' +
      '<button class="btn-primary" style="margin-top:26px" data-action="finish">Finalizar ' + icon("arrow") + "</button>" +
      "</div>"
    );
  }

  function renderThanks() {
    return (
      '<div class="card thanks-center">' +
      '<div class="thanks-icon">' + icon("thanks") + "</div>" +
      '<h1 class="title">¡Gracias por participar!</h1>' +
      '<p class="subtitle">Descarga el PDF con tus resultados y entrégalo a tu institución o a tu psicólogo escolar para que te acompañe en tu decisión.</p>' +
      '<button class="btn-primary" style="margin-top:22px" data-action="download-pdf">' + icon("download") + " Descargar mis resultados (PDF)</button>" +
      '<button class="btn-secondary" style="margin-top:12px" data-action="restart">Volver al inicio</button>' +
      "</div>"
    );
  }

  // ---------- PDF de resultados (lo que el estudiante entrega a su institucion) ----------
  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function fmtDateTime(d) {
    return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear() + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  function downloadResultsPdf() {
    if (!window.jspdf) {
      alert("No se pudo generar el PDF (revisa tu conexión a internet y vuelve a intentarlo).");
      return;
    }
    var r = computeResults();
    var when = state.finishedAt || new Date();
    var code = state.code.trim();
    var doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
    var W = 210, M = 16, y;

    var INK = [17, 24, 39], MUTED = [100, 110, 130], LINE = [225, 229, 236];
    var MINT = [16, 163, 116], BLUE = [77, 142, 240], TRACK = [236, 240, 245], NAVY = [18, 26, 48];

    function text(str, x, yy, opts) { doc.text(str, x, yy, opts || {}); }
    function ink(c) { doc.setTextColor(c[0], c[1], c[2]); }
    function ensureSpace(h) { if (y + h > 280) { doc.addPage(); y = 20; } }
    function sectionTitle(t) {
      ensureSpace(14);
      doc.setFont("helvetica", "bold"); doc.setFontSize(12); ink(INK);
      text(t, M, y);
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.3);
      doc.line(M, y + 2.5, W - M, y + 2.5);
      y += 9;
    }
    function bar(x, yy, w, frac, color) {
      doc.setFillColor(TRACK[0], TRACK[1], TRACK[2]); doc.roundedRect(x, yy, w, 3, 1.5, 1.5, "F");
      if (frac > 0) { doc.setFillColor(color[0], color[1], color[2]); doc.roundedRect(x, yy, Math.max(3, w * Math.min(frac, 1)), 3, 1.5, 1.5, "F"); }
    }

    // encabezado
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]); doc.rect(0, 0, W, 34, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(20);
    text("OrientaIA", M, 16);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    text("Resultado del Test de Orientación Vocacional CHASIDE", M, 25);

    // datos del registro
    y = 46;
    ink(MUTED); doc.setFontSize(9);
    text("CÓDIGO DE ACCESO", M, y); text("FECHA Y HORA", 90, y); text("PREGUNTAS RESPONDIDAS", 150, y);
    y += 6;
    ink(INK); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    text(code, M, y); text(fmtDateTime(when), 90, y); text(Object.keys(state.answers).length + " / " + QUESTIONS.length, 150, y);
    y += 12;

    // areas destacadas
    sectionTitle("Áreas vocacionales más representativas");
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); ink(MINT);
    text(r.topAreaPills.join("   ·   "), M, y);
    y += 12;

    // puntaje por area
    sectionTitle("Puntaje por área (máximo " + MAX_PER_AREA + " por área)");
    r.scoresList.forEach(function (s) {
      ensureSpace(8);
      doc.setFont("helvetica", s.top ? "bold" : "normal"); doc.setFontSize(10); ink(INK);
      text(s.name, M, y);
      bar(100, y - 2.6, 62, s.score / MAX_PER_AREA, s.top ? MINT : BLUE);
      text(s.score + "/" + MAX_PER_AREA + "  (" + s.pct + "%)", W - M, y, { align: "right" });
      y += 7.5;
    });
    y += 5;

    // carreras recomendadas
    sectionTitle("Carreras recomendadas para tu perfil");
    if (r.engine !== "regla") {
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); ink(MUTED);
      var note = doc.splitTextToSize("Ordenadas por un modelo de aprendizaje automático (k-NN, versión " + r.engine + ") a partir de tus 7 puntajes. La afinidad es relativa: la primera carrera = 100%.", W - 2 * M);
      text(note, M, y);
      y += note.length * 4 + 4;
    }
    r.careers.forEach(function (c, i) {
      ensureSpace(8);
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); ink(INK);
      text((i + 1) + ". " + c.name, M, y);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); ink(MUTED);
      text(AREA_NAMES[c.area] || "", 100, y);
      if (c.affinity != null) {
        bar(150, y - 2.6, 26, c.affinity, MINT);
        doc.setFontSize(9.5); ink(INK);
        text(Math.round(c.affinity * 100) + "%", W - M, y, { align: "right" });
      }
      y += 7.5;
    });
    y += 6;

    // nota final
    var disclaimer = doc.splitTextToSize("Este resultado es una sugerencia orientativa y no reemplaza una evaluación vocacional profesional. Coméntalo con tu psicólogo o tutor escolar para tomar una decisión informada.", W - 2 * M - 10);
    var boxH = disclaimer.length * 4.5 + 8;
    ensureSpace(boxH);
    doc.setFillColor(246, 248, 251); doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.roundedRect(M, y, W - 2 * M, boxH, 2, 2, "FD");
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); ink(MUTED);
    text(disclaimer, M + 5, y + 6.5);

    // pie en cada pagina
    var pages = doc.getNumberOfPages();
    for (var p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); ink(MUTED);
      text("OrientaIA · Test CHASIDE · Código " + code + " · Generado el " + fmtDateTime(when), M, 290);
      text("Página " + p + " de " + pages, W - M, 290, { align: "right" });
    }

    var safeCode = code.replace(/[^A-Za-z0-9_-]+/g, "_") || "resultado";
    doc.save("resultado-chaside-" + safeCode + ".pdf");
  }

  function renderPrint() {
    var rows = QUESTIONS.slice().sort(function (a, b) { return a.id - b.id; }).map(function (q) {
      return (
        '<div class="print-item"><span><span class="n">' + q.id + ".</span>" + esc(q.text) + "</span>" +
        '<span class="print-checks"><span>Sí ☐</span><span>No ☐</span></span></div>'
      );
    }).join("");
    return (
      '<div class="card print-view">' +
      '<div class="print-toolbar">' +
      '<button class="btn-secondary" style="width:auto;padding:0 18px" data-action="hide-print">' + icon("back") + " Volver</button>" +
      '<button class="btn-primary" style="width:auto;padding:0 18px" data-action="trigger-print">' + icon("printer") + " Imprimir / Guardar PDF</button>" +
      "</div>" +
      "<h1>Test de Orientación Vocacional CHASIDE</h1>" +
      '<p class="print-sub">Cuestionario en blanco · 98 preguntas · Responde Sí o No marcando la casilla correspondiente</p>' +
      rows +
      "</div>"
    );
  }

  // ---------- render dispatch ----------
  function render() {
    if (state.screen === "print") {
      app.innerHTML = '<div class="page">' + renderPrint() + "</div>";
      return;
    }
    var body;
    if (state.screen === "welcome") body = renderWelcome();
    else if (state.screen === "test") body = renderTest();
    else if (state.screen === "result") body = renderResult();
    else body = renderThanks();
    var html = renderTopRow() + renderProgress() + body;
    app.innerHTML = '<div class="page">' + html + "</div>" + renderFooter();
  }

  // ---------- actions ----------
  function startTest() {
    if (!state.code || !state.code.trim()) {
      state.codeError = true;
      render();
      return;
    }
    state.screen = "test";
    render();
  }

  function answer(qid, value) {
    state.answers[qid] = value;
    if (state.qIndex < QUESTIONS.length - 1) {
      state.qIndex += 1;
    } else {
      state.screen = "result";
      state.finishedAt = new Date();
      var r = computeResults();
      saveResultToFirestore(r.scoresList, r.careers, r.engine);
    }
    render();
  }

  function back() {
    if (state.qIndex > 0) {
      state.qIndex -= 1;
      render();
    }
  }

  function finish() {
    state.screen = "thanks";
    render();
  }

  function restart() {
    state = { screen: "welcome", code: "", codeError: false, qIndex: 0, answers: {}, finishedAt: null };
    render();
  }

  // ---------- events (delegation) ----------
  app.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el || el.disabled) return;
    var action = el.getAttribute("data-action");
    if (action === "start") startTest();
    else if (action === "answer") answer(Number(el.getAttribute("data-qid")), el.getAttribute("data-value"));
    else if (action === "back") back();
    else if (action === "finish") finish();
    else if (action === "download-pdf") downloadResultsPdf();
    else if (action === "restart") restart();
    else if (action === "show-print") { state.screen = "print"; render(); }
    else if (action === "hide-print") { state.screen = "welcome"; render(); }
    else if (action === "trigger-print") window.print();
  });

  app.addEventListener("input", function (e) {
    if (e.target.getAttribute("data-bind") === "code") {
      state.code = e.target.value;
      state.codeError = false;
    }
  });

  render();
})();
