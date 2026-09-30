// Aplicación del participante: un solo sistema con cuatro modos según el código de acceso
// (UNI-, EGR-, EXP-, CTL-) más el modo DEMO. Ver "Requerimientos del sistema".
(function () {
  "use strict";

  var CFG = ORIENTA_CONFIG;
  var INS = INSTRUMENTOS;
  var ESC = INS.escalas;
  var QUESTIONS = CHASIDE_DATA.questions;           // orden en que se muestran
  var ORDEN_IDS = QUESTIONS.map(function (q) { return q.id; });
  var N_ITEMS = QUESTIONS.length;                   // 98
  var NOM = Chaside.nombres;
  var CLAVE_SESION = "orientaia_sesion_v2";

  // Pantallas de cada modo (tabla "Usuarios y modos").
  var FLUJOS = {
    UNI: ["consentimiento", "datos", "satisfaccion", "instrucciones", "chaside", "gracias"],
    EGR: ["consentimiento", "datos", "satisfaccion", "instrucciones", "chaside", "gracias"],
    EXP: ["consentimiento", "pretest", "instrucciones", "chaside", "resultado", "postest", "adecuacion", "tam", "sus", "gracias"],
    CTL: ["consentimiento", "pretest", "papel", "postest", "adecuacion", "gracias"],
    DEMO: ["consentimiento", "pretest", "instrucciones", "chaside", "resultado", "postest", "adecuacion", "tam", "sus", "gracias"]
  };
  // Escala Likert que corresponde a cada pantalla de cuestionario.
  var ESCALA_DE_PASO = { pretest: "claridad", postest: "claridad", adecuacion: "adecuacion", tam: "tam", sus: "sus" };

  function estadoInicial() {
    return {
      pantalla: "bienvenida",   // bienvenida | (paso del flujo)
      codigo: "",
      codigoError: "",
      registrando: false,
      intentoRegistro: false,   // ya se envió el registro una vez (por si se recarga la página)
      acepto: false,
      modo: null,
      paso: 0,
      escalas: {},              // pretest, postest, satisfaccion, adecuacion, tam, sus -> [1..5]
      datos: {},                // carrera, ciclo, anosEgresado, trabajaEnArea
      respuestas: [],           // 98 valores 0/1 (posición = ítem - 1)
      tiemposMs: [],
      qIndex: 0,
      inicio: null,             // ISO string
      fin: null,
      resultado: null,          // { clave, modelo, explicacion }
      guardado: {},             // campos ya enviados a Firestore (no se reenvían)
      error: ""
    };
  }

  var state = estadoInicial();
  var app = document.getElementById("app");
  var qMostradaEn = 0;
  var finalizando = false;  // evita que un doble toque en la última pregunta avance dos veces

  // ---------- sesión local (reanudar si se recarga la página, RNF05) ----------
  function guardarSesion() {
    try { localStorage.setItem(CLAVE_SESION, JSON.stringify(state)); } catch (e) { /* sin almacenamiento */ }
  }
  function leerSesion() {
    try { var s = JSON.parse(localStorage.getItem(CLAVE_SESION) || "null"); return s && s.modo ? s : null; } catch (e) { return null; }
  }
  function borrarSesion() {
    try { localStorage.removeItem(CLAVE_SESION); } catch (e) { /* nada */ }
  }

  // ---------- Firestore ----------
  var _db = null;
  function db() {
    if (_db) return _db;
    try {
      if (typeof firebase === "undefined" || !firebase.apps.length) return null;
      _db = firebase.firestore();
      // cola de escritura persistente: si el internet falla un momento, se envía al volver (RNF05)
      _db.enablePersistence({ synchronizeTabs: true }).catch(function () { /* navegador sin IndexedDB */ });
      return _db;
    } catch (e) { return null; }
  }

  function coleccion() { return state.modo === "UNI" || state.modo === "EGR" ? "entrenamiento" : "participantes"; }
  function esDemo() { return state.modo === "DEMO"; }

  // RF01: el ID del documento es el código. Crear un código ya usado es rechazado por las reglas.
  function registrarCodigo() {
    if (esDemo()) return Promise.resolve();
    var base = db();
    if (!base) return Promise.reject({ code: "sin-firebase" });
    var ahora = new Date();
    var doc = state.modo === "UNI" || state.modo === "EGR"
      ? { tipo: state.modo, consentimiento: { acepto: true, fecha: ahora } }
      : { grupo: state.modo, asentimiento: { acepto: true, fecha: ahora } };
    var escritura = base.collection(coleccion()).doc(state.codigo).set(doc);
    var espera = new Promise(function (_, rechazar) { setTimeout(function () { rechazar({ code: "timeout" }); }, CFG.timeoutRegistroMs); });
    return Promise.race([escritura, espera]);
  }

  // Guardado por etapas: cada campo se escribe una sola vez (las reglas no dejan sobrescribir).
  function guardar(campos) {
    if (esDemo()) return;
    var nuevos = {}, hay = false;
    Object.keys(campos).forEach(function (k) {
      if (!state.guardado[k]) { nuevos[k] = campos[k]; state.guardado[k] = true; hay = true; }
    });
    if (!hay) return;
    guardarSesion();
    var base = db();
    if (!base) return;
    base.collection(coleccion()).doc(state.codigo).update(nuevos)
      .catch(function (err) { console.warn("No se pudo guardar " + Object.keys(nuevos).join(", ") + ":", err); });
  }

  // ---------- utilidades ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function pasoActual() { return state.modo ? FLUJOS[state.modo][state.paso] : null; }
  function esAdulto() { return state.modo === "UNI" || state.modo === "EGR"; }

  function icon(name) {
    switch (name) {
      case "check": return '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      case "x": return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      case "back": return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
      case "arrow": return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
      case "download": return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
      case "thanks": return '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="8 12.5 10.8 15.3 16 9.3"></polyline></svg>';
      default: return "";
    }
  }

  // ---------- encabezado, progreso y pie ----------
  function renderTopRow() {
    var right = "";
    if (pasoActual() === "chaside") {
      var backBtn = state.qIndex > 0
        ? '<button class="icon-btn" data-action="back" aria-label="Pregunta anterior">' + icon("back") + "</button>"
        : '<div class="icon-btn-spacer"></div>';
      right = '<div class="top-row-right">' + backBtn + '<div class="q-counter">Pregunta ' + (state.qIndex + 1) + " / " + N_ITEMS + "</div></div>";
    } else if (state.modo) {
      right = '<div class="top-row-right"><span class="q-tag">' + esc(state.modo === "DEMO" ? "Demo · no se guarda" : state.codigo) + "</span></div>";
    }
    return '<div class="top-row"><img class="brand-mark-img" src="img/logo.svg" width="34" height="34" alt="OrientaIA"><div class="brand-name">OrientaIA</div>' + right + "</div>";
  }

  function renderProgress() {
    if (pasoActual() !== "chaside") return "";
    var pct = Math.round(((state.qIndex + 1) / N_ITEMS) * 100);
    return '<div class="progress-track" role="progressbar" aria-valuenow="' + (state.qIndex + 1) + '" aria-valuemin="1" aria-valuemax="' + N_ITEMS + '"><div class="progress-fill" style="width:' + pct + '%"></div></div>';
  }

  function renderFooter() {
    return (
      '<div class="footer-divider"></div><footer class="site-footer"><div class="footer-bottom">' +
      '<p>&copy; 2026 <b>OrientaIA</b> &mdash; Héctor Medina y Johann Guevara. Todos los derechos reservados. Queda prohibida la reproducción total o parcial de este sitio, su diseño y sus contenidos sin autorización previa.</p>' +
      '<p>Tus respuestas se guardan de forma anónima solo para fines de investigación. <a href="privacidad.html" target="_blank" rel="noopener">Ver política de privacidad</a></p>' +
      "</div></footer>"
    );
  }

  // ---------- pantallas ----------
  function renderBienvenida() {
    var pendiente = leerSesion();
    var reanudar = pendiente && pendiente.pantalla !== "bienvenida" && FLUJOS[pendiente.modo][pendiente.paso] !== "gracias"
      ? '<div class="notice-box"><p>Tienes un test sin terminar con el código <b>' + esc(pendiente.codigo || "DEMO") + '</b>.</p><button class="btn-secondary" data-action="reanudar">Continuar donde me quedé</button></div>'
      : "";
    return (
      '<div class="card">' +
      '<p class="eyebrow">Orientación vocacional · Test CHASIDE</p>' +
      '<h1 class="title">Descubre tus áreas vocacionales</h1>' +
      '<p class="subtitle">Ingresa el código de acceso que te entregaron. El sistema te guiará paso a paso según tu grupo.</p>' +
      reanudar +
      '<div class="field-block" style="margin-top:28px">' +
      '<label class="field-label" for="access-code-input">Código de acceso</label>' +
      '<input id="access-code-input" class="text-input' + (state.codigoError ? " input-error" : "") + '" type="text" autocomplete="off" autocapitalize="characters" placeholder="Ej. EXP-001" value="' + esc(state.codigo) + '" data-bind="codigo" />' +
      (state.codigoError ? '<div class="field-error" role="alert">' + esc(state.codigoError) + "</div>" : "") +
      "</div>" +
      '<p class="privacy-note">No se te pedirá tu nombre, DNI, correo ni ningún dato personal. Tus respuestas se identifican solo con tu código.</p>' +
      '<button class="btn-primary" style="margin-top:26px" data-action="ingresar">Ingresar ' + icon("arrow") + "</button>" +
      "</div>"
    );
  }

  function renderConsentimiento() {
    var t = esAdulto() ? INS.consentimiento : INS.asentimiento;
    return (
      '<div class="card">' +
      '<h1 class="title" style="font-size:24px">' + esc(t.titulo) + "</h1>" +
      '<div class="consent-text">' + t.parrafos.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") +
      '<p>Más detalles en la <a href="privacidad.html" target="_blank" rel="noopener">política de privacidad</a>.</p></div>' +
      '<label class="check-row"><input type="checkbox" id="acepto" data-bind="acepto"' + (state.acepto ? " checked" : "") + "> <span>" + esc(t.acepto) + "</span></label>" +
      (state.error ? '<div class="field-error" role="alert" style="margin-top:12px">' + esc(state.error) + "</div>" : "") +
      '<button class="btn-primary" style="margin-top:22px" data-action="aceptar"' + (state.acepto && !state.registrando ? "" : " disabled") + ">" + (state.registrando ? "Registrando…" : "Continuar " + icon("arrow")) + "</button>" +
      '<button class="btn-secondary" style="margin-top:12px" data-action="salir">No deseo participar</button>' +
      "</div>"
    );
  }

  function opcionesCarrera(seleccionada) {
    return '<option value="">Elige tu carrera…</option>' + Chaside.areas.map(function (a) {
      return '<optgroup label="' + esc(NOM[a]) + '">' + Chaside.carrerasDeArea(a).map(function (n) {
        return '<option value="' + esc(n) + '"' + (n === seleccionada ? " selected" : "") + ">" + esc(n) + "</option>";
      }).join("") + "</optgroup>";
    }).join("");
  }

  function renderDatos() {
    var d = state.datos, campos;
    if (state.modo === "UNI") {
      var ciclos = "";
      for (var c = 3; c <= 14; c++) ciclos += '<option value="' + c + '"' + (d.ciclo === c ? " selected" : "") + ">" + c + ".° ciclo</option>";
      campos =
        '<div class="form-row"><label class="form-label" for="f-carrera">¿Qué carrera estudias?</label><select id="f-carrera" class="select-input" data-bind="carrera">' + opcionesCarrera(d.carrera) + "</select></div>" +
        '<div class="form-row"><label class="form-label" for="f-ciclo">¿En qué ciclo estás?</label><select id="f-ciclo" class="select-input" data-bind="ciclo"><option value="">Elige tu ciclo…</option>' + ciclos + "</select></div>";
    } else {
      campos =
        '<div class="form-row"><label class="form-label" for="f-carrera">¿Qué carrera estudiaste?</label><select id="f-carrera" class="select-input" data-bind="carrera">' + opcionesCarrera(d.carrera) + "</select></div>" +
        '<div class="form-row"><label class="form-label" for="f-anos">¿Cuántos años tienes de egresado?</label><input id="f-anos" class="text-input text-left" type="number" min="0" max="50" inputmode="numeric" data-bind="anosEgresado" value="' + (d.anosEgresado == null ? "" : d.anosEgresado) + '"></div>' +
        '<div class="form-row"><span class="form-label">¿Trabajas actualmente en el área de tu carrera?</span><div class="yesno-inline">' +
        '<button class="likert-pill wide' + (d.trabajaEnArea === true ? " likert-pill-selected" : "") + '" data-action="dato-bool" data-campo="trabajaEnArea" data-valor="1">Sí</button>' +
        '<button class="likert-pill wide' + (d.trabajaEnArea === false ? " likert-pill-selected" : "") + '" data-action="dato-bool" data-campo="trabajaEnArea" data-valor="0">No</button></div></div>';
    }
    var nota = '<p class="section-note" style="margin:6px 0 0">Si tu carrera no aparece, elige la más parecida.</p>';
    return (
      '<div class="card">' +
      '<h1 class="title" style="font-size:24px">' + (state.modo === "UNI" ? "Sobre tu carrera" : "Sobre tu profesión") + "</h1>" +
      '<div class="form-block">' + campos + nota + "</div>" +
      '<button class="btn-primary" style="margin-top:24px" data-action="datos-listo"' + (datosCompletos() ? "" : " disabled") + ">Continuar " + icon("arrow") + "</button>" +
      "</div>"
    );
  }

  function datosCompletos() {
    var d = state.datos;
    if (!d.carrera) return false;
    if (state.modo === "UNI") return !!d.ciclo;
    return d.anosEgresado != null && d.anosEgresado !== "" && d.anosEgresado >= 0 && typeof d.trabajaEnArea === "boolean";
  }

  function escalaDelPaso(paso) {
    if (paso === "satisfaccion") return state.modo === "UNI" ? "satisfaccionCarrera" : "satisfaccionProfesion";
    return ESCALA_DE_PASO[paso];
  }

  function renderEscala(paso) {
    var e = ESC[escalaDelPaso(paso)];
    var resp = state.escalas[paso] || [];
    var respondidas = resp.filter(Boolean).length;
    var items = e.items.map(function (texto, i) {
      var seccion = e.secciones && e.secciones[i] ? '<div class="tam-section-title">' + esc(e.secciones[i]) + "</div>" : "";
      var pills = INS.likert.map(function (etq, idx) {
        var v = idx + 1, sel = resp[i] === v;
        return '<button class="likert-pill' + (sel ? " likert-pill-selected" : "") + '" title="' + esc(etq) + '" aria-label="' + v + " · " + esc(etq) + '" data-action="likert" data-paso="' + paso + '" data-i="' + i + '" data-v="' + v + '" aria-pressed="' + sel + '">' + v + "</button>";
      }).join("");
      return seccion + '<div class="tam-item"><p class="tam-text"><span class="item-n">' + (i + 1) + ".</span> " + esc(texto) + '</p><div class="likert-row-compact">' + pills + "</div></div>";
    }).join("");
    var completa = respondidas === e.items.length;
    var etiqueta = paso === "pretest" ? "Antes de empezar" : paso === "postest" ? "Para terminar" : "";
    return (
      '<div class="card">' +
      (etiqueta ? '<p class="eyebrow">' + etiqueta + "</p>" : "") +
      '<h1 class="title" style="font-size:24px">' + esc(e.titulo) + "</h1>" +
      '<p class="subtitle">' + esc(e.instruccion) + "</p>" +
      '<p class="tam-legend">1 = ' + esc(INS.likert[0]) + " · 5 = " + esc(INS.likert[4]) + "</p>" +
      '<div class="tam-list">' + items + "</div>" +
      '<button class="btn-primary" style="margin-top:26px" data-action="escala-lista"' + (completa ? "" : " disabled") + ">Continuar " + icon("arrow") + "</button>" +
      (completa ? "" : '<p class="tam-progress-note">Has respondido ' + respondidas + " de " + e.items.length + ".</p>") +
      "</div>"
    );
  }

  function renderInstrucciones() {
    var adultos = esAdulto()
      ? '<div class="notice-box"><p><b>Importante:</b> responde pensando en tus gustos e intereses <b>de siempre</b>, no solo en lo que haces hoy en tu carrera o tu trabajo.</p></div>'
      : "";
    return (
      '<div class="card">' +
      '<p class="eyebrow">Test CHASIDE</p>' +
      '<h1 class="title" style="font-size:26px">98 preguntas de Sí o No</h1>' +
      '<div class="stats-row"><div class="stat"><div class="stat-value">98</div><div class="stat-label">Preguntas</div></div><div class="stat"><div class="stat-value">~15</div><div class="stat-label">Minutos</div></div><div class="stat"><div class="stat-value">7</div><div class="stat-label">Áreas</div></div></div>' +
      adultos +
      '<div class="bullet-list" style="margin-top:22px">' +
      '<div class="bullet-item"><span class="bullet-dot"></span><span><b>Responde con sinceridad:</b> no hay respuesta correcta ni incorrecta, solo la que más se parece a ti.</span></div>' +
      '<div class="bullet-item"><span class="bullet-dot"></span><span><b>Lee cada pregunta con calma:</b> si dudas, elige la opción que más veces elegirías en tu día a día.</span></div>' +
      '<div class="bullet-item"><span class="bullet-dot"></span><span><b>Puedes volver atrás</b> con la flecha si te equivocaste.</span></div>' +
      "</div>" +
      '<button class="btn-primary" data-action="empezar-chaside">Comenzar el test ' + icon("arrow") + "</button>" +
      "</div>"
    );
  }

  function renderChaside() {
    var q = QUESTIONS[state.qIndex];
    var actual = state.respuestas[q.id - 1];
    var ultima = state.qIndex === N_ITEMS - 1;
    return (
      '<div class="card">' +
      '<div class="q-head"><p class="q-eyebrow">Test vocacional CHASIDE</p><span class="q-tag">' + (ultima ? "última pregunta" : "avanza automático") + "</span></div>" +
      '<p class="q-text">' + esc(q.text) + "</p>" +
      '<div class="yesno-grid">' +
      '<button class="yesno-btn' + (actual === 1 ? " yesno-btn-selected" : "") + '" data-action="responder" data-v="1" aria-pressed="' + (actual === 1) + '">' + icon("check") + "Sí</button>" +
      '<button class="yesno-btn' + (actual === 0 ? " yesno-btn-selected" : "") + '" data-action="responder" data-v="0" aria-pressed="' + (actual === 0) + '">' + icon("x") + "No</button>" +
      "</div></div>"
    );
  }

  function renderResultado() {
    var r = state.resultado;
    var probs = r.modelo ? probsDe(r.modelo) : null;
    var bloqueArea, nota;
    if (probs) {
      var top3 = Object.keys(probs).sort(function (a, b) { return probs[b] - probs[a]; }).slice(0, 3);
      bloqueArea = top3.map(function (a, i) {
        var pct = Math.round(probs[a] * 100);
        return '<div class="ml-area' + (i === 0 ? " is-first" : "") + '"><div class="ml-area-head"><span class="ml-rank">' + (i + 1) + '</span><span class="ml-name">' + esc(NOM[a]) + '</span><span class="ml-pct">' + pct + "%</span></div>" +
          '<div class="score-track"><div class="score-fill is-top" style="width:' + pct + '%"></div></div>' +
          '<div class="chip-row">' + Chaside.carrerasDeArea(a).map(function (n) { return '<span class="chip">' + esc(n) + "</span>"; }).join("") + "</div></div>";
      }).join("");
      nota = '<p class="section-note">Probabilidad calculada por un modelo de aprendizaje automático (regresión logística, versión ' + esc(r.modelo.v) + ") a partir de tus 98 respuestas.</p>";
    } else {
      var top = Chaside.topClave(r.clave, 3);
      bloqueArea = top.map(function (a, i) {
        return '<div class="ml-area' + (i === 0 ? " is-first" : "") + '"><div class="ml-area-head"><span class="ml-name">' + esc(NOM[a]) + '</span><span class="ml-pct">' + r.clave[a] + "/" + Chaside.MAX_POR_AREA + "</span></div>" +
          '<div class="chip-row">' + Chaside.carrerasDeArea(a).map(function (n) { return '<span class="chip">' + esc(n) + "</span>"; }).join("") + "</div></div>";
      }).join("");
      nota = '<p class="section-note">El modelo de inteligencia artificial no está disponible en este momento; se muestran tus áreas con mayor puntaje clásico.</p>';
    }

    var explicacion = "";
    if (probs && r.explicacion && r.explicacion.length) {
      explicacion = '<h2 class="section-title" style="margin-top:28px">¿Por qué este resultado?</h2>' +
        '<p class="section-note">Estas son las preguntas a las que respondiste <b>Sí</b> que más pesaron para recomendarte ' + esc(NOM[Object.keys(probs).sort(function (a, b) { return probs[b] - probs[a]; })[0]]) + ":</p>" +
        '<div class="why-list">' + r.explicacion.map(function (id) {
          var q = Chaside.pregunta(id);
          return q ? '<div class="why-item">' + esc(q.text) + "</div>" : "";
        }).join("") + "</div>";
    }

    var topClave = Chaside.topClave(r.clave, 2);
    var ranking = Chaside.rankingClave(r.clave);
    var puntajes = ranking.map(function (row, i) {
      var empate = ranking.some(function (o, j) { return j !== i && o.puntaje === row.puntaje; });
      var destacado = topClave.indexOf(row.area) !== -1;
      return '<div class="score-row"><div class="score-row-top"><span class="score-name' + (destacado ? " is-top" : "") + '">' + esc(NOM[row.area]) + (empate ? ' <span class="tie">empate</span>' : "") + "</span>" +
        '<span class="score-value">' + row.puntaje + "/" + Chaside.MAX_POR_AREA + "</span></div>" +
        '<div class="score-track"><div class="score-fill' + (destacado ? " is-top" : "") + '" style="width:' + Math.round(row.puntaje / Chaside.MAX_POR_AREA * 100) + '%"></div></div></div>';
    }).join("");

    return (
      '<div class="card">' +
      '<h1 class="title">Tu perfil vocacional</h1>' +
      '<p class="subtitle">Basado en tus respuestas al test CHASIDE.</p>' +
      '<div class="result-grid">' +
      "<div><h2 class=\"section-title\">Tus 3 áreas más afines</h2>" + nota + '<div class="ml-list">' + bloqueArea + "</div>" + explicacion + "</div>" +
      '<div><h2 class="section-title">Puntaje clásico por área</h2><p class="section-note">Cantidad de respuestas Sí en cada área (clave CHASIDE).</p><div class="scores-block">' + puntajes + "</div></div>" +
      "</div>" +
      '<div class="disclaimer-box"><p>Este resultado es una sugerencia orientativa. Coméntalo con tu psicólogo o tutor escolar para tomar una decisión informada. Al terminar podrás descargarlo en PDF.</p></div>' +
      '<button class="btn-primary" style="margin-top:26px" data-action="siguiente">Continuar ' + icon("arrow") + "</button>" +
      "</div>"
    );
  }

  function renderPapel() {
    var cuerpo;
    if (!state.inicio) {
      cuerpo = '<p class="subtitle">Tu profesor te entregará el test CHASIDE impreso. Cuando lo tengas en la mano y vayas a empezar a responderlo, presiona el botón.</p>' +
        '<button class="btn-primary" style="margin-top:26px" data-action="papel-inicio">Empecé el test en papel</button>';
    } else if (!state.fin) {
      cuerpo = '<p class="subtitle">Responde el test en papel. Cuando termines y tengas tu resultado, presiona el botón.</p>' +
        '<div class="notice-box"><p>Empezaste a las <b>' + esc(horaDe(state.inicio)) + "</b>. No cierres esta página.</p></div>" +
        '<button class="btn-primary" style="margin-top:22px" data-action="papel-fin">Terminé el test en papel</button>';
    } else {
      cuerpo = '<div class="notice-box"><p>Registramos tu tiempo: de <b>' + esc(horaDe(state.inicio)) + "</b> a <b>" + esc(horaDe(state.fin)) + "</b>.</p></div>" +
        '<button class="btn-primary" style="margin-top:22px" data-action="siguiente">Continuar ' + icon("arrow") + "</button>";
    }
    return '<div class="card"><p class="eyebrow">Test en papel</p><h1 class="title" style="font-size:24px">Test CHASIDE impreso</h1>' + cuerpo + "</div>";
  }

  function renderGracias() {
    var conPdf = state.resultado && (state.modo === "EXP" || state.modo === "DEMO");
    var texto = esAdulto()
      ? "Tus respuestas ayudarán a entrenar el modelo que orientará a estudiantes de secundaria. Ya puedes cerrar esta ventana."
      : conPdf
        ? "Descarga el PDF con tus resultados y entrégalo a tu institución o a tu psicólogo escolar para que te acompañe en tu decisión."
        : "Ya puedes cerrar esta ventana. Entrega tu test en papel a tu profesor.";
    return (
      '<div class="card thanks-center">' +
      '<div class="thanks-icon">' + icon("thanks") + "</div>" +
      '<h1 class="title">¡Gracias por participar!</h1>' +
      '<p class="subtitle">' + esc(texto) + "</p>" +
      (esDemo() ? '<p class="privacy-note">Modo demostración: no se guardó ningún dato.</p>' : "") +
      (conPdf ? '<button class="btn-primary" style="margin-top:22px" data-action="pdf">' + icon("download") + " Descargar mis resultados (PDF)</button>" : "") +
      '<button class="btn-secondary" style="margin-top:12px" data-action="terminar">Volver al inicio</button>' +
      "</div>"
    );
  }

  function probsDe(modeloGuardado) {
    var p = {};
    Object.keys(modeloGuardado).forEach(function (k) { if (k !== "v") p[k] = modeloGuardado[k]; });
    return p;
  }
  function horaDe(iso) {
    var d = new Date(iso);
    return (d.getHours() < 10 ? "0" : "") + d.getHours() + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes();
  }

  // ---------- render ----------
  function render() {
    var paso = pasoActual(), body;
    if (state.pantalla === "bienvenida" || !paso) body = renderBienvenida();
    else if (paso === "consentimiento") body = renderConsentimiento();
    else if (paso === "datos") body = renderDatos();
    else if (paso === "instrucciones") body = renderInstrucciones();
    else if (paso === "chaside") body = renderChaside();
    else if (paso === "resultado") body = renderResultado();
    else if (paso === "papel") body = renderPapel();
    else if (paso === "gracias") body = renderGracias();
    else body = renderEscala(paso);
    app.innerHTML = '<div class="page">' + renderTopRow() + renderProgress() + body + "</div>" + renderFooter();
    if (paso === "chaside") qMostradaEn = performance.now();
  }

  function irA(paso) {
    state.paso = paso;
    state.error = "";
    guardarSesion();
    render();
    window.scrollTo(0, 0);
  }
  function siguiente() { irA(state.paso + 1); }

  // ---------- acciones ----------
  function ingresar() {
    var codigo = (state.codigo || "").trim().toUpperCase();
    state.codigo = codigo;
    if (codigo === CFG.codigoDemo) {
      empezarModo("DEMO");
      return;
    }
    if (!CFG.formatoCodigo.test(codigo)) {
      state.codigoError = "El código debe tener el formato UNI-001, EGR-001, EXP-001 o CTL-001.";
      render();
      return;
    }
    var modo = codigo.slice(0, 3);
    if ((modo === "UNI" || modo === "EGR") && !CFG.recoleccionEntrenamientoAbierta) {
      state.codigoError = "La recolección de datos con códigos " + modo + "- ya terminó. Gracias por tu interés.";
      render();
      return;
    }
    var pendiente = leerSesion();
    if (pendiente && pendiente.codigo === codigo) { state = pendiente; render(); return; }
    empezarModo(modo);
  }

  function empezarModo(modo) {
    var codigo = state.codigo;
    state = estadoInicial();
    state.codigo = codigo;
    state.modo = modo;
    state.pantalla = "flujo";
    state.respuestas = new Array(N_ITEMS).fill(null);
    state.tiemposMs = new Array(N_ITEMS).fill(0);
    irA(0);
  }

  function aceptar() {
    if (!state.acepto || state.registrando) return;
    var reintento = state.intentoRegistro;
    state.registrando = true;
    state.intentoRegistro = true;
    state.error = "";
    guardarSesion();
    render();
    registrarCodigo().catch(function (err) {
      // Si la página se recargó justo después de registrar, el código ya existe pero es de esta
      // misma persona: se continúa en lugar de rechazarlo.
      if (reintento && err && err.code === "permission-denied") return;
      throw err;
    }).then(function () {
      state.registrando = false;
      state.guardado.registro = true;
      siguiente();
    }).catch(function (err) {
      state.registrando = false;
      var code = err && err.code;
      if (code === "permission-denied") state.error = "Este código ya fue usado. Revisa el código que te entregaron o pide uno nuevo.";
      else if (code === "timeout" || code === "unavailable") state.error = "No hay conexión a internet. Conéctate y vuelve a intentarlo.";
      else if (code === "sin-firebase") state.error = "No se pudo conectar con la base de datos. Recarga la página.";
      else state.error = "No se pudo registrar tu código (" + (code || "error") + "). Vuelve a intentarlo.";
      render();
    });
  }

  function datosListo() {
    if (!datosCompletos()) return;
    var d = state.datos;
    var campos = { carrera: d.carrera, area: Chaside.areaDeCarrera(d.carrera) };
    if (state.modo === "UNI") campos.ciclo = Number(d.ciclo);
    else { campos.anosEgresado = Number(d.anosEgresado); campos.trabajaEnArea = d.trabajaEnArea; }
    guardar(campos);
    siguiente();
  }

  function escalaLista() {
    var paso = pasoActual();
    var e = ESC[escalaDelPaso(paso)];
    var resp = state.escalas[paso] || [];
    if (resp.filter(Boolean).length !== e.items.length) return;
    var datos = {};
    datos[paso] = resp.slice(0, e.items.length);
    if (paso === "sus" || (paso === "adecuacion" && state.modo === "CTL")) datos.completado = new Date();
    guardar(datos);
    siguiente();
  }

  function empezarChaside() {
    if (!state.inicio) state.inicio = new Date().toISOString();
    if (state.modo === "EXP") guardar({ inicio: new Date(state.inicio) });
    siguiente();
  }

  function responder(v) {
    if (finalizando || pasoActual() !== "chaside") return;
    var q = QUESTIONS[state.qIndex];
    state.tiemposMs[q.id - 1] += Math.round(performance.now() - qMostradaEn);
    state.respuestas[q.id - 1] = v;
    if (state.qIndex < N_ITEMS - 1) {
      state.qIndex += 1;
      guardarSesion();
      render();
      return;
    }
    terminarChaside();
  }

  function terminarChaside() {
    var faltan = state.respuestas.some(function (v) { return v !== 0 && v !== 1; });
    if (faltan) {
      state.qIndex = Math.max(0, QUESTIONS.findIndex(function (q) { return state.respuestas[q.id - 1] == null; }));
      render();
      return;
    }
    finalizando = true;
    state.fin = new Date().toISOString();
    var calidad = Chaside.calidad(state.respuestas, state.tiemposMs, ORDEN_IDS, CFG.calidad);
    var chaside = { respuestas: state.respuestas.slice(), tiemposMs: state.tiemposMs.slice() };
    if (esAdulto()) {
      guardar({ chaside: chaside, calidad: calidad, completado: new Date() });
      finalizando = false;
      siguiente();
      return;
    }
    var clave = Chaside.clave(state.respuestas);
    ChasideML.cargar(CFG.modeloUrl).then(function () {
      var pred = ChasideML.predecir(state.respuestas);
      var modelo = null;
      if (pred) {
        modelo = { v: pred.version };
        Object.keys(pred.probs).forEach(function (a) { modelo[a] = Math.round(pred.probs[a] * 10000) / 10000; });
      }
      state.resultado = { clave: clave, modelo: modelo, explicacion: pred ? pred.explicacion : [] };
      guardar({ chaside: chaside, fin: new Date(state.fin), resultado: state.resultado, calidad: calidad });
      finalizando = false;
      siguiente();
    });
  }

  function back() {
    if (!finalizando && state.qIndex > 0) {
      var q = QUESTIONS[state.qIndex];
      state.tiemposMs[q.id - 1] += Math.round(performance.now() - qMostradaEn);
      state.qIndex -= 1;
      guardarSesion();
      render();
    }
  }

  function papelInicio() {
    state.inicio = new Date().toISOString();
    guardar({ inicio: new Date(state.inicio) });
    render();
  }
  function papelFin() {
    state.fin = new Date().toISOString();
    guardar({ fin: new Date(state.fin) });
    render();
  }

  function descargarPdf() {
    if (!state.resultado) return;
    ResultadoPDF.generar({
      codigo: esDemo() ? "DEMO" : state.codigo,
      fecha: new Date(state.fin || Date.now()),
      clave: state.resultado.clave,
      modelo: state.resultado.modelo,
      explicacion: state.resultado.explicacion
    });
  }

  function terminar() {
    borrarSesion();
    state = estadoInicial();
    render();
    window.scrollTo(0, 0);
  }

  // ---------- eventos ----------
  app.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el || el.disabled) return;
    var a = el.getAttribute("data-action");
    if (a === "ingresar") ingresar();
    else if (a === "reanudar") { var s = leerSesion(); if (s) { state = s; render(); } }
    else if (a === "aceptar") aceptar();
    else if (a === "salir") terminar();
    else if (a === "dato-bool") { state.datos[el.getAttribute("data-campo")] = el.getAttribute("data-valor") === "1"; guardarSesion(); render(); }
    else if (a === "datos-listo") datosListo();
    else if (a === "likert") {
      var paso = el.getAttribute("data-paso");
      state.escalas[paso] = state.escalas[paso] || [];
      state.escalas[paso][Number(el.getAttribute("data-i"))] = Number(el.getAttribute("data-v"));
      guardarSesion();
      var y = window.scrollY;
      render();
      window.scrollTo(0, y);
    }
    else if (a === "escala-lista") escalaLista();
    else if (a === "empezar-chaside") empezarChaside();
    else if (a === "responder") responder(Number(el.getAttribute("data-v")));
    else if (a === "back") back();
    else if (a === "papel-inicio") papelInicio();
    else if (a === "papel-fin") papelFin();
    else if (a === "siguiente") siguiente();
    else if (a === "pdf") descargarPdf();
    else if (a === "terminar") terminar();
  });

  app.addEventListener("input", function (e) {
    var campo = e.target.getAttribute("data-bind");
    if (campo === "codigo") { state.codigo = e.target.value; state.codigoError = ""; }
    else if (campo === "anosEgresado") { state.datos.anosEgresado = e.target.value === "" ? null : Number(e.target.value); guardarSesion(); actualizarBotonDatos(); }
  });

  app.addEventListener("change", function (e) {
    var campo = e.target.getAttribute("data-bind");
    if (campo === "acepto") { state.acepto = e.target.checked; render(); }
    else if (campo === "carrera") { state.datos.carrera = e.target.value; guardarSesion(); actualizarBotonDatos(); }
    else if (campo === "ciclo") { state.datos.ciclo = e.target.value ? Number(e.target.value) : null; guardarSesion(); actualizarBotonDatos(); }
  });

  app.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.getAttribute("data-bind") === "codigo") ingresar();
  });

  function actualizarBotonDatos() {
    var btn = app.querySelector('[data-action="datos-listo"]');
    if (btn) btn.disabled = !datosCompletos();
  }

  ChasideML.cargar(CFG.modeloUrl);  // se descarga en segundo plano (RNF04: la predicción es local e instantánea)
  render();
})();
