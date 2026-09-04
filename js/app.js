(function () {
  "use strict";

  var LIKERT_LABELS = ["Totalmente en desacuerdo", "En desacuerdo", "Neutral", "De acuerdo", "Totalmente de acuerdo"];
  var TAM_QUESTIONS = [
    { id: 1, section: "Utilidad percibida", text: "El sistema me ayudó a conocer mejor mis intereses vocacionales." },
    { id: 2, section: null, text: "Las recomendaciones que me dio el sistema son útiles para elegir una carrera." },
    { id: 3, section: null, text: "Usar el sistema mejoró mi comprensión sobre las carreras que podrían ser adecuadas para mí." },
    { id: 4, section: null, text: "En general, el sistema es útil para el proceso de orientación vocacional." },
    { id: 5, section: "Facilidad de uso", text: "Fue fácil aprender a usar el sistema." },
    { id: 6, section: null, text: "Pude completar el test sin necesitar ayuda de otra persona." },
    { id: 7, section: null, text: "Las instrucciones y preguntas del sistema fueron claras y fáciles de entender." },
    { id: 8, section: null, text: "Navegar y responder en el sistema fue sencillo." },
    { id: 9, section: "Actitud hacia el uso", text: "Me pareció una buena idea usar este tipo de sistema para orientación vocacional." },
    { id: 10, section: null, text: "Disfruté usar el sistema." },
    { id: 11, section: null, text: "Me sentí cómodo/a usando el sistema." },
    { id: 12, section: "Intención de uso futuro", text: "Si pudiera, volvería a usar este sistema en el futuro." },
    { id: 13, section: null, text: "Recomendaría este sistema a otros estudiantes." },
    { id: 14, section: null, text: "Confío en los resultados que me mostró el sistema." }
  ];

  var QUESTIONS = CHASIDE_DATA.questions;
  var AREA_ORDER = CHASIDE_DATA.areaOrder;
  var AREA_NAMES = CHASIDE_DATA.areaNames;
  var CAREERS = CHASIDE_DATA.careers;
  var MAX_PER_AREA = 14; // 10 interes + 4 aptitud

  var state = {
    screen: "welcome", // welcome | test | result | tam | thanks | print
    code: "",
    codeError: false,
    qIndex: 0,
    answers: {},
    tamAnswers: {}
  };

  var app = document.getElementById("app");

  // ---------- icons ----------
  function icon(name) {
    switch (name) {
      case "check": return '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      case "x": return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      case "back": return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
      case "arrow": return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
      case "printer": return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>';
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
      '<p><b>Confidencialidad:</b> este sitio no envía ni guarda tus respuestas en ningún servidor — todo el proceso ocurre en tu navegador y se pierde al cerrar o recargar la página. Tus respuestas se identifican solo con tu código de acceso, nunca con tu nombre. Este test es una herramienta de orientación y no reemplaza una evaluación vocacional profesional certificada.</p>' +
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

    var careers = CAREERS.filter(function (c) { return topTwo.indexOf(c.area) !== -1; });
    var topAreaPills = topTwo.map(function (a) { return AREA_NAMES[a]; });

    return { scoresList: scoresList, careers: careers, topAreaPills: topAreaPills };
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
      return '<div class="career-card"><span class="career-name">' + esc(c.name) + '</span><span class="career-area">' + esc(AREA_NAMES[c.area]) + "</span></div>";
    }).join("");

    return (
      '<div class="card">' +
      '<h1 class="title">Tu perfil vocacional</h1>' +
      '<p class="subtitle">Basado en tus respuestas al test CHASIDE, estas son tus áreas más representativas</p>' +
      '<div class="top-areas-row">' + pills + "</div>" +
      '<div class="result-grid">' +
      '<div><h2 class="section-title">Tus áreas de interés</h2><div class="scores-block">' + scores + "</div></div>" +
      '<div><h2 class="section-title">Carreras afines a tu perfil</h2><div class="career-list">' + careers + "</div></div>" +
      "</div>" +
      '<div class="disclaimer-box"><p>Este resultado es una sugerencia orientativa. Coméntalo con tu psicólogo o tutor escolar para tomar una decisión informada.</p></div>' +
      '<button class="btn-primary" style="margin-top:26px" data-action="continue-tam">Continuar ' + icon("arrow") + "</button>" +
      "</div>"
    );
  }

  function renderTam() {
    var answeredCount = TAM_QUESTIONS.filter(function (t) { return !!state.tamAnswers[t.id]; }).length;
    var allAnswered = answeredCount === TAM_QUESTIONS.length;

    var items = TAM_QUESTIONS.map(function (t) {
      var section = t.section ? '<div class="tam-section-title">' + esc(t.section) + "</div>" : "";
      var pills = LIKERT_LABELS.map(function (label, idx) {
        var val = idx + 1;
        var selected = state.tamAnswers[t.id] === val;
        return '<button class="likert-pill' + (selected ? " likert-pill-selected" : "") + '" data-action="tam-answer" data-qid="' + t.id + '" data-value="' + val + '" aria-pressed="' + (selected ? "true" : "false") + '">' + val + "</button>";
      }).join("");
      return section + '<div class="tam-item"><p class="tam-text">' + esc(t.text) + '</p><div class="likert-row-compact">' + pills + "</div></div>";
    }).join("");

    var note = allAnswered ? "" : '<p class="tam-progress-note">Has respondido ' + answeredCount + " de " + TAM_QUESTIONS.length + ". Completa todas las afirmaciones para continuar.</p>";

    return (
      '<div class="card">' +
      '<h1 class="title">Cuéntanos qué te pareció</h1>' +
      '<p class="subtitle">Tus respuestas nos ayudan a mejorar el sistema.</p>' +
      '<p class="tam-legend">Marca del 1 (totalmente en desacuerdo) al 5 (totalmente de acuerdo).</p>' +
      '<div class="tam-list">' + items + "</div>" +
      '<button class="btn-primary" style="margin-top:26px" data-action="submit-tam"' + (allAnswered ? "" : " disabled") + ">Enviar</button>" +
      note +
      "</div>"
    );
  }

  function renderThanks() {
    return (
      '<div class="card thanks-center">' +
      '<div class="thanks-icon">' + icon("thanks") + "</div>" +
      '<h1 class="title">¡Gracias por participar!</h1>' +
      '<p class="subtitle">Ya puedes cerrar esta ventana. Tu psicólogo escolar recibirá tus resultados para acompañarte en tu decisión.</p>' +
      '<button class="btn-secondary" style="margin-top:22px" data-action="restart">Volver a probar la demo</button>' +
      "</div>"
    );
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
    else if (state.screen === "tam") body = renderTam();
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
    }
    render();
  }

  function back() {
    if (state.qIndex > 0) {
      state.qIndex -= 1;
      render();
    }
  }

  function tamAnswer(qid, value) {
    state.tamAnswers[qid] = value;
    render();
  }

  function submitTam() {
    var allAnswered = TAM_QUESTIONS.every(function (t) { return !!state.tamAnswers[t.id]; });
    if (!allAnswered) return;
    state.screen = "thanks";
    render();
  }

  function restart() {
    state = { screen: "welcome", code: "", codeError: false, qIndex: 0, answers: {}, tamAnswers: {} };
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
    else if (action === "continue-tam") { state.screen = "tam"; render(); }
    else if (action === "tam-answer") tamAnswer(Number(el.getAttribute("data-qid")), Number(el.getAttribute("data-value")));
    else if (action === "submit-tam") submitTam();
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
