// Flujo del participante. Lo usan dos enlaces (atributo data-enlace del <body>):
//   escolar.html?aula=K7Q2  -> escolares; el aula decide si es experimental (EXP) o control (CTL)
//   adultos.html            -> universitarios y profesionales (datos de entrenamiento del modelo)
// Nada se guarda hasta el final: al terminar, una transacción asigna el número correlativo
// (ESC-0001, UNI-0001, PRO-0001) y guarda todo de una vez. Quien abandona no deja registro.
(function () {
  "use strict";

  var CFG = ORIENTA_CONFIG;
  var INS = INSTRUMENTOS;
  var ESC = INS.escalas;
  var QUESTIONS = CHASIDE_DATA.questions;           // orden en que se muestran
  var ORDEN_IDS = QUESTIONS.map(function (q) { return q.id; });
  var N_ITEMS = QUESTIONS.length;                   // 98
  var NOM = Chaside.nombres;
  var ENLACE = document.body.getAttribute("data-enlace");   // "escolar" | "adultos"
  var AULA = (new URLSearchParams(location.search).get("aula") || "").trim().toUpperCase();
  var ES_DEMO = ENLACE === "escolar" && AULA === CFG.aulaDemo;
  var CLAVE_SESION = "orientaia_" + ENLACE + (ENLACE === "escolar" ? "_" + AULA : "");
  var POLITICA = ENLACE === "escolar" ? INS.asentimiento.politica : INS.consentimiento.politica;

  var FLUJOS = {
    EXP: ["politica", "datos", "pretest", "instrucciones", "chaside", "resultado", "postest", "adecuacion", "tam", "sus", "final"],
    CTL: ["politica", "datos", "pretest", "instrucciones", "chaside", "resultado", "postest", "adecuacion", "final"],
    adultos: ["politica", "edad", "tipo", "datos", "satisfaccion", "instrucciones", "chaside", "final"]
  };
  var ESCALA_DE_PASO = { pretest: "claridad", postest: "claridad", adecuacion: "adecuacion", tam: "tam", sus: "sus" };

  function estadoInicial() {
    return {
      pantalla: "cargando",     // cargando | aviso | reanudar | flujo
      aviso: null,              // { titulo, texto }
      flujo: null,              // EXP | CTL | adultos
      aula: null,               // { codigo, colegio, grado, seccion, grupo }
      paso: 0,
      acepto: false,
      tipo: null,               // universitario | profesional
      datos: {},
      escalas: {},
      respuestas: new Array(N_ITEMS).fill(null),
      tiemposMs: new Array(N_ITEMS).fill(0),
      qIndex: 0,
      aceptadoEn: null, inicio: null, fin: null,   // ISO strings
      resultado: null,          // { clave, modelo, explicacion }
      calidad: null,
      guardando: false,
      errorGuardado: "",
      numero: null              // ESC-0001 ... (solo cuando ya se guardó)
    };
  }

  var state = estadoInicial();
  var app = document.getElementById("app");
  var qMostradaEn = 0;
  var finalizando = false;   // evita que un doble toque en la última pregunta avance dos veces

  // ---------- sesión local: si se recarga la página, se continúa en el mismo dispositivo ----------
  function guardarSesion() {
    try { localStorage.setItem(CLAVE_SESION, JSON.stringify(state)); } catch (e) { /* sin almacenamiento */ }
  }
  function leerSesion() {
    try { var s = JSON.parse(localStorage.getItem(CLAVE_SESION) || "null"); return s && s.flujo ? s : null; } catch (e) { return null; }
  }
  function borrarSesion() {
    try { localStorage.removeItem(CLAVE_SESION); } catch (e) { /* nada */ }
  }

  // ---------- Firestore ----------
  function db() {
    try { return typeof firebase !== "undefined" && firebase.apps.length ? firebase.firestore() : null; } catch (e) { return null; }
  }

  function numeroCon(prefijo, n) {
    var s = String(n);
    while (s.length < CFG.digitos) s = "0" + s;
    return prefijo + "-" + s;
  }

  // RF04: el siguiente número correlativo y el registro completo se escriben en UNA transacción.
  // Las reglas solo aceptan el registro si su número es exactamente el contador + 1. Si dos personas
  // terminan a la vez, la que llega segunda es rechazada (permission-denied, porque su número ya se
  // usó): se vuelve a intentar con el contador actualizado, así cada una recibe un número distinto.
  var REINTENTOS = 12;
  function guardarConNumero(coleccion, prefijo, datos) {
    var base = db();
    if (!base) return Promise.reject({ code: "sin-firebase" });
    var refContador = base.collection("contadores").doc(prefijo);
    function intento(n) {
      return base.runTransaction(function (t) {
        return t.get(refContador).then(function (c) {
          var siguiente = (c.exists ? c.data().n : 0) + 1;
          var numero = numeroCon(prefijo, siguiente);
          t.set(refContador, { n: siguiente });
          t.set(base.collection(coleccion).doc(numero), datos);
          return numero;
        });
      }).catch(function (err) {
        var code = err && err.code;
        var choque = code === "permission-denied" || code === "aborted" || code === "failed-precondition";
        if (!choque || n >= REINTENTOS) throw err;
        var espera = 150 + Math.random() * 250 * Math.min(n + 1, 6);   // espera aleatoria creciente
        return new Promise(function (ok) { setTimeout(ok, espera); }).then(function () { return intento(n + 1); });
      });
    }
    return intento(0);
  }

  // ---------- utilidades ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function pasoActual() { return state.flujo ? FLUJOS[state.flujo][state.paso] : null; }
  function esEscolar() { return ENLACE === "escolar"; }
  function conModelo() { return state.flujo === "EXP"; }
  function aFecha(iso) { return iso ? new Date(iso) : null; }
  function hora(iso) {
    var d = new Date(iso);
    return (d.getHours() < 10 ? "0" : "") + d.getHours() + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes();
  }

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
    if (state.pantalla === "flujo" && pasoActual() === "chaside") {
      var backBtn = state.qIndex > 0
        ? '<button class="icon-btn" data-action="back" aria-label="Pregunta anterior">' + icon("back") + "</button>"
        : '<div class="icon-btn-spacer"></div>';
      right = '<div class="top-row-right">' + backBtn + '<div class="q-counter">Pregunta ' + (state.qIndex + 1) + " / " + N_ITEMS + "</div></div>";
    } else if (ES_DEMO) {
      right = '<div class="top-row-right"><span class="q-tag">Demo · no se guarda</span></div>';
    }
    return '<div class="top-row"><img class="brand-mark-img" src="img/logo.svg" width="34" height="34" alt="OrientaIA"><div class="brand-name">OrientaIA</div>' + right + "</div>";
  }

  function renderProgress() {
    if (state.pantalla !== "flujo" || pasoActual() !== "chaside") return "";
    var pct = Math.round(((state.qIndex + 1) / N_ITEMS) * 100);
    return '<div class="progress-track" role="progressbar" aria-valuenow="' + (state.qIndex + 1) + '" aria-valuemin="1" aria-valuemax="' + N_ITEMS + '"><div class="progress-fill" style="width:' + pct + '%"></div></div>';
  }

  function renderFooter() {
    return (
      '<div class="footer-divider"></div><footer class="site-footer"><div class="footer-bottom">' +
      '<p>&copy; 2026 <b>OrientaIA</b> &mdash; Héctor Medina y Johann Guevara. Todos los derechos reservados. Queda prohibida la reproducción total o parcial de este sitio, su diseño y sus contenidos sin autorización previa.</p>' +
      '<p>Tus respuestas se guardan de forma anónima solo para fines de investigación. <a href="' + POLITICA + '" target="_blank" rel="noopener">Ver política de privacidad</a></p>' +
      "</div></footer>"
    );
  }

  // ---------- pantallas ----------
  function renderAviso() {
    return '<div class="card thanks-center"><h1 class="title" style="font-size:24px">' + esc(state.aviso.titulo) + '</h1><p class="subtitle">' + esc(state.aviso.texto) + "</p></div>";
  }

  function renderReanudar() {
    return (
      '<div class="card thanks-center">' +
      '<h1 class="title" style="font-size:24px">Tienes un test sin terminar</h1>' +
      '<p class="subtitle">Puedes continuar donde te quedaste o empezar de nuevo. Lo que respondiste todavía no se guardó.</p>' +
      '<button class="btn-primary" style="margin-top:24px" data-action="reanudar">Continuar donde me quedé</button>' +
      '<button class="btn-secondary" style="margin-top:12px" data-action="nuevo">Empezar de nuevo</button>' +
      "</div>"
    );
  }

  function renderPolitica() {
    var t = esEscolar() ? INS.asentimiento : INS.consentimiento;
    return (
      '<div class="card">' +
      '<p class="eyebrow">Test vocacional CHASIDE</p>' +
      '<h1 class="title" style="font-size:24px">' + esc(t.titulo) + "</h1>" +
      '<div class="consent-text">' + t.parrafos.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") +
      '<p>Antes de aceptar, lee la <a href="' + t.politica + '" target="_blank" rel="noopener">política de privacidad</a>.</p></div>' +
      '<label class="check-row"><input type="checkbox" data-bind="acepto"' + (state.acepto ? " checked" : "") + "> <span>" + esc(t.acepto) + "</span></label>" +
      '<button class="btn-primary" style="margin-top:22px" data-action="aceptar"' + (state.acepto ? "" : " disabled") + ">Continuar " + icon("arrow") + "</button>" +
      "</div>"
    );
  }

  function renderEdad() {
    return (
      '<div class="card thanks-center">' +
      '<h1 class="title" style="font-size:24px">' + esc(INS.consentimiento.mayorDeEdad) + "</h1>" +
      '<p class="subtitle">Este cuestionario es solo para personas mayores de edad.</p>' +
      '<div class="choice-grid">' +
      '<button class="choice-btn" data-action="edad" data-v="1">Sí, tengo 18 años o más</button>' +
      '<button class="choice-btn" data-action="edad" data-v="0">No</button>' +
      "</div></div>"
    );
  }

  function renderTipo() {
    return (
      '<div class="card thanks-center">' +
      '<h1 class="title" style="font-size:24px">¿Cuál es tu situación?</h1>' +
      '<div class="choice-grid">' +
      '<button class="choice-btn" data-action="tipo" data-v="universitario"><b>Universitario</b><span>Estoy estudiando una carrera</span></button>' +
      '<button class="choice-btn" data-action="tipo" data-v="profesional"><b>Profesional</b><span>Ya terminé mi carrera</span></button>' +
      "</div></div>"
    );
  }

  function opcionesCarrera(seleccionada) {
    return '<option value="">Elige tu carrera…</option>' + Chaside.areas.map(function (a) {
      return '<optgroup label="' + esc(NOM[a]) + '">' + Chaside.carrerasDeArea(a).map(function (n) {
        return '<option value="' + esc(n) + '"' + (n === seleccionada ? " selected" : "") + ">" + esc(n) + "</option>";
      }).join("") + "</optgroup>";
    }).join("");
  }

  function pills(campo, opciones, actual) {
    return '<div class="yesno-inline">' + opciones.map(function (o) {
      return '<button class="likert-pill wide' + (actual === o[0] ? " likert-pill-selected" : "") + '" data-action="dato" data-campo="' + campo + '" data-valor="' + esc(o[0]) + '">' + esc(o[1]) + "</button>";
    }).join("") + "</div>";
  }

  function renderDatos() {
    var d = state.datos, campos, titulo, nota = "";
    if (esEscolar()) {
      titulo = "Sobre ti";
      campos =
        '<div class="form-row"><span class="form-label">Grado</span><p class="section-note" style="margin:0">' + esc(state.aula.grado ? state.aula.grado + ".° de secundaria" : "—") + "</p></div>" +
        '<div class="form-row"><span class="form-label">Sexo <span class="admin-pct">(opcional)</span></span>' +
        pills("sexo", [["F", "Mujer"], ["M", "Hombre"], ["N", "Prefiero no decirlo"]], d.sexo) + "</div>";
    } else if (state.tipo === "universitario") {
      titulo = "Sobre tu carrera";
      var ciclos = "";
      for (var c = 1; c <= 14; c++) ciclos += '<option value="' + c + '"' + (d.ciclo === c ? " selected" : "") + ">" + c + ".° ciclo</option>";
      campos =
        '<div class="form-row"><label class="form-label" for="f-carrera">¿Qué carrera estudias?</label><select id="f-carrera" class="select-input" data-bind="carrera">' + opcionesCarrera(d.carrera) + "</select></div>" +
        '<div class="form-row"><label class="form-label" for="f-ciclo">¿En qué ciclo estás?</label><select id="f-ciclo" class="select-input" data-bind="ciclo"><option value="">Elige tu ciclo…</option>' + ciclos + "</select></div>" +
        '<div class="form-row"><span class="form-label">¿En qué universidad?</span>' + pills("universidad", [["UPN", "UPN"], ["Otra", "Otra"]], d.universidad) + "</div>";
      nota = '<p class="section-note" style="margin:6px 0 0">Si tu carrera no aparece, elige la más parecida.</p>';
    } else {
      titulo = "Sobre tu profesión";
      campos =
        '<div class="form-row"><label class="form-label" for="f-carrera">¿Qué carrera estudiaste?</label><select id="f-carrera" class="select-input" data-bind="carrera">' + opcionesCarrera(d.carrera) + "</select></div>" +
        '<div class="form-row"><label class="form-label" for="f-anos">¿Cuántos años de experiencia profesional tienes?</label><input id="f-anos" class="text-input text-left" type="number" min="0" max="60" inputmode="numeric" data-bind="anosExperiencia" value="' + (d.anosExperiencia == null ? "" : d.anosExperiencia) + '"></div>' +
        '<div class="form-row"><span class="form-label">¿Trabajas actualmente en el área de tu carrera?</span>' + pills("trabajaEnArea", [["1", "Sí"], ["0", "No"]], d.trabajaEnArea == null ? null : (d.trabajaEnArea ? "1" : "0")) + "</div>";
      nota = '<p class="section-note" style="margin:6px 0 0">Si tu carrera no aparece, elige la más parecida.</p>';
    }
    return (
      '<div class="card">' +
      '<h1 class="title" style="font-size:24px">' + titulo + "</h1>" +
      '<div class="form-block">' + campos + nota + "</div>" +
      '<button class="btn-primary" style="margin-top:24px" data-action="datos-listo"' + (datosCompletos() ? "" : " disabled") + ">Continuar " + icon("arrow") + "</button>" +
      "</div>"
    );
  }

  function datosCompletos() {
    var d = state.datos;
    if (esEscolar()) return true;   // el sexo es opcional
    if (!d.carrera) return false;
    if (state.tipo === "universitario") return !!d.ciclo && !!d.universidad;
    return d.anosExperiencia != null && d.anosExperiencia >= 0 && typeof d.trabajaEnArea === "boolean";
  }

  function escalaDelPaso(paso) {
    if (paso === "satisfaccion") return state.tipo === "universitario" ? "satisfaccionCarrera" : "satisfaccionProfesion";
    return ESCALA_DE_PASO[paso];
  }

  function renderEscala(paso) {
    var e = ESC[escalaDelPaso(paso)];
    var resp = state.escalas[paso] || [];
    var respondidas = resp.filter(Boolean).length;
    var items = e.items.map(function (texto, i) {
      var seccion = e.secciones && e.secciones[i] ? '<div class="tam-section-title">' + esc(e.secciones[i]) + "</div>" : "";
      var botones = INS.likert.map(function (etq, idx) {
        var v = idx + 1, sel = resp[i] === v;
        return '<button class="likert-pill' + (sel ? " likert-pill-selected" : "") + '" title="' + esc(etq) + '" aria-label="' + v + " · " + esc(etq) + '" data-action="likert" data-paso="' + paso + '" data-i="' + i + '" data-v="' + v + '" aria-pressed="' + sel + '">' + v + "</button>";
      }).join("");
      return seccion + '<div class="tam-item"><p class="tam-text"><span class="item-n">' + (i + 1) + ".</span> " + esc(texto) + '</p><div class="likert-row-compact">' + botones + "</div></div>";
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
    var adultos = esEscolar() ? "" :
      '<div class="notice-box"><p><b>Importante:</b> responde pensando en tus gustos e intereses <b>de siempre</b>, no solo en lo que haces hoy en tu carrera o tu trabajo.</p></div>';
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

  function chips(area) {
    return '<div class="chip-row">' + Chaside.carrerasDeArea(area).map(function (n) { return '<span class="chip">' + esc(n) + "</span>"; }).join("") + "</div>";
  }

  // RF11 (clásico, ambos grupos) y RF12 (modelo, solo aulas EXP)
  function renderResultado() {
    var r = state.resultado;
    var probs = r.modelo ? probsDe(r.modelo) : null;
    var bloque, nota, explicacion = "";
    if (probs) {
      var orden = Object.keys(probs).sort(function (a, b) { return probs[b] - probs[a]; });
      bloque = orden.slice(0, 3).map(function (a, i) {
        var pct = Math.round(probs[a] * 100);
        return '<div class="ml-area' + (i === 0 ? " is-first" : "") + '"><div class="ml-area-head"><span class="ml-rank">' + (i + 1) + '</span><span class="ml-name">' + esc(NOM[a]) + '</span><span class="ml-pct">' + pct + "%</span></div>" +
          '<div class="score-track"><div class="score-fill is-top" style="width:' + pct + '%"></div></div>' + chips(a) + "</div>";
      }).join("");
      nota = '<p class="section-note">Probabilidad calculada por un modelo de aprendizaje automático (regresión logística, versión ' + esc(r.modelo.v) + ") a partir de tus 98 respuestas.</p>";
      if (r.explicacion && r.explicacion.length) {
        explicacion = '<h2 class="section-title" style="margin-top:28px">¿Por qué este resultado?</h2>' +
          '<p class="section-note">Estas son las preguntas a las que respondiste <b>Sí</b> que más pesaron para recomendarte ' + esc(NOM[orden[0]]) + ":</p>" +
          '<div class="why-list">' + r.explicacion.map(function (id) {
            var q = Chaside.pregunta(id);
            return q ? '<div class="why-item">' + esc(q.text) + "</div>" : "";
          }).join("") + "</div>";
      }
    } else {
      bloque = Chaside.topClave(r.clave, 3).map(function (a, i) {
        return '<div class="ml-area' + (i === 0 ? " is-first" : "") + '"><div class="ml-area-head"><span class="ml-name">' + esc(NOM[a]) + '</span><span class="ml-pct">' + r.clave[a] + "/" + Chaside.MAX_POR_AREA + "</span></div>" + chips(a) + "</div>";
      }).join("");
      nota = conModelo()
        ? '<p class="section-note">El modelo de inteligencia artificial no está disponible en este momento; se muestran tus áreas con mayor puntaje.</p>'
        : '<p class="section-note">Tus áreas con mayor puntaje en el test (si dos áreas empatan, se muestran ambas).</p>';
    }

    var top2 = Chaside.topClave(r.clave, 2);
    var ranking = Chaside.rankingClave(r.clave);
    var puntajes = ranking.map(function (row, i) {
      var empate = ranking.some(function (o, j) { return j !== i && o.puntaje === row.puntaje; });
      var destacado = top2.indexOf(row.area) !== -1;
      return '<div class="score-row"><div class="score-row-top"><span class="score-name' + (destacado ? " is-top" : "") + '">' + esc(NOM[row.area]) + (empate ? ' <span class="tie">empate</span>' : "") + "</span>" +
        '<span class="score-value">' + row.puntaje + "/" + Chaside.MAX_POR_AREA + "</span></div>" +
        '<div class="score-track"><div class="score-fill' + (destacado ? " is-top" : "") + '" style="width:' + Math.round(row.puntaje / Chaside.MAX_POR_AREA * 100) + '%"></div></div></div>';
    }).join("");

    return (
      '<div class="card">' +
      '<h1 class="title">Tu perfil vocacional</h1>' +
      '<p class="subtitle">Basado en tus respuestas al test CHASIDE.</p>' +
      '<div class="result-grid">' +
      '<div><h2 class="section-title">' + (probs ? "Tus 3 áreas más afines" : "Tus áreas más representativas") + "</h2>" + nota + '<div class="ml-list">' + bloque + "</div>" + explicacion + "</div>" +
      '<div><h2 class="section-title">Puntaje por área</h2><p class="section-note">Cantidad de respuestas Sí en cada área (clave CHASIDE).</p><div class="scores-block">' + puntajes + "</div></div>" +
      "</div>" +
      '<div class="disclaimer-box"><p>Este resultado es una sugerencia orientativa. Coméntalo con tu psicólogo o tutor escolar para tomar una decisión informada. Al terminar podrás descargarlo en PDF.</p></div>' +
      '<button class="btn-primary" style="margin-top:26px" data-action="siguiente">Continuar ' + icon("arrow") + "</button>" +
      "</div>"
    );
  }

  // RF14: al final se guarda todo y se muestra el número asignado.
  function renderFinal() {
    if (!state.numero) {
      if (state.errorGuardado) {
        return (
          '<div class="card thanks-center">' +
          '<h1 class="title" style="font-size:24px">Falta guardar tus respuestas</h1>' +
          '<p class="subtitle">' + esc(state.errorGuardado) + "</p>" +
          '<button class="btn-primary" style="margin-top:22px" data-action="reintentar">Reintentar</button>' +
          '<p class="privacy-note">Tus respuestas siguen en este dispositivo. No cierres la página hasta que veas tu número.</p>' +
          "</div>"
        );
      }
      return '<div class="card thanks-center"><h1 class="title" style="font-size:24px">Guardando tus respuestas…</h1><p class="subtitle">Esto tarda unos segundos.</p></div>';
    }
    var conPdf = esEscolar() && state.resultado;
    var texto = esEscolar()
      ? "Descarga el PDF con tus resultados y entrégalo a tu institución o a tu psicólogo escolar para que te acompañe en tu decisión."
      : "Tus respuestas ayudarán a entrenar el modelo que orientará a estudiantes de secundaria. Ya puedes cerrar esta ventana.";
    return (
      '<div class="card thanks-center">' +
      '<div class="thanks-icon">' + icon("thanks") + "</div>" +
      '<h1 class="title">¡Gracias por participar!</h1>' +
      '<p class="subtitle">' + esc(texto) + "</p>" +
      '<div class="numero-box"><span>Tu número de registro</span><b>' + esc(state.numero) + "</b>" +
      (ES_DEMO ? "<small>Modo demostración: no se guardó ningún dato.</small>"
        : '<small>Guárdalo: si algún día quieres que borremos tus datos, escríbenos indicando este número (ver la <a href="' + POLITICA + '" target="_blank" rel="noopener">política de privacidad</a>).</small>') +
      "</div>" +
      (conPdf ? '<button class="btn-primary" style="margin-top:22px" data-action="pdf">' + icon("download") + " Descargar mis resultados (PDF)</button>" : "") +
      '<button class="btn-secondary" style="margin-top:12px" data-action="terminar">Terminar</button>' +
      "</div>"
    );
  }

  function probsDe(m) {
    var p = {};
    Object.keys(m).forEach(function (k) { if (k !== "v") p[k] = m[k]; });
    return p;
  }

  // ---------- render ----------
  function render() {
    var body, paso = pasoActual();
    if (state.pantalla === "cargando") body = '<div class="card thanks-center"><p class="subtitle">Cargando…</p></div>';
    else if (state.pantalla === "aviso") body = renderAviso();
    else if (state.pantalla === "reanudar") body = renderReanudar();
    else if (paso === "politica") body = renderPolitica();
    else if (paso === "edad") body = renderEdad();
    else if (paso === "tipo") body = renderTipo();
    else if (paso === "datos") body = renderDatos();
    else if (paso === "instrucciones") body = renderInstrucciones();
    else if (paso === "chaside") body = renderChaside();
    else if (paso === "resultado") body = renderResultado();
    else if (paso === "final") body = renderFinal();
    else body = renderEscala(paso);
    app.innerHTML = '<div class="page">' + renderTopRow() + renderProgress() + body + "</div>" + renderFooter();
    if (paso === "chaside" && state.pantalla === "flujo") qMostradaEn = performance.now();
  }

  function irA(paso) {
    state.paso = paso;
    guardarSesion();
    render();
    window.scrollTo(0, 0);
    if (pasoActual() === "final" && !state.numero) guardarFinal();
  }
  function siguiente() { irA(state.paso + 1); }

  function aviso(titulo, texto) {
    borrarSesion();
    state = estadoInicial();
    state.pantalla = "aviso";
    state.aviso = { titulo: titulo, texto: texto };
    render();
  }

  // ---------- acciones ----------
  function datoSiguiente() {
    if (!datosCompletos()) return;
    siguiente();
  }

  function escalaLista() {
    var paso = pasoActual();
    var e = ESC[escalaDelPaso(paso)];
    var resp = state.escalas[paso] || [];
    if (resp.filter(Boolean).length !== e.items.length) return;
    siguiente();
  }

  function empezarChaside() {
    if (!state.inicio) state.inicio = new Date().toISOString();
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
    var falta = QUESTIONS.findIndex(function (q) { return state.respuestas[q.id - 1] !== 0 && state.respuestas[q.id - 1] !== 1; });
    if (falta !== -1) { state.qIndex = falta; render(); return; }
    finalizando = true;
    state.fin = new Date().toISOString();
    state.calidad = Chaside.calidad(state.respuestas, state.tiemposMs, ORDEN_IDS, CFG.calidad);
    if (!esEscolar()) { finalizando = false; siguiente(); return; }
    var clave = Chaside.clave(state.respuestas);
    var listo = conModelo() ? ChasideML.cargar(CFG.modeloUrl) : Promise.resolve();
    listo.then(function () {
      var pred = conModelo() ? ChasideML.predecir(state.respuestas) : null;
      var modelo = null;
      if (pred) {
        modelo = { v: pred.version };
        Object.keys(pred.probs).forEach(function (a) { modelo[a] = Math.round(pred.probs[a] * 10000) / 10000; });
      }
      state.resultado = { clave: clave, modelo: modelo, explicacion: pred ? pred.explicacion : [] };
      finalizando = false;
      siguiente();
    });
  }

  function back() {
    if (finalizando || state.qIndex === 0) return;
    var q = QUESTIONS[state.qIndex];
    state.tiemposMs[q.id - 1] += Math.round(performance.now() - qMostradaEn);
    state.qIndex -= 1;
    guardarSesion();
    render();
  }

  // Registro completo que se guarda al final (solo lo que necesita una hipótesis o el modelo).
  function registro() {
    var comun = {
      chaside: { respuestas: state.respuestas.slice(), tiemposMs: state.tiemposMs.slice() },
      inicio: aFecha(state.inicio),
      fin: aFecha(state.fin),
      calidad: state.calidad,
      completado: new Date()
    };
    if (esEscolar()) {
      var r = {
        aula: state.aula.codigo, colegio: state.aula.colegio, grado: state.aula.grado, grupo: state.aula.grupo,
        sexo: state.datos.sexo === "F" || state.datos.sexo === "M" ? state.datos.sexo : null,
        asentimiento: { acepto: true, fecha: aFecha(state.aceptadoEn) },
        pretest: state.escalas.pretest, postest: state.escalas.postest, adecuacion: state.escalas.adecuacion,
        resultado: state.resultado
      };
      if (state.flujo === "EXP") { r.tam = state.escalas.tam; r.sus = state.escalas.sus; }
      return Object.assign(r, comun);
    }
    var d = state.datos;
    var a = {
      tipo: state.tipo,
      consentimiento: { acepto: true, fecha: aFecha(state.aceptadoEn) },
      mayorDeEdad: true,
      carrera: d.carrera,
      area: Chaside.areaDeCarrera(d.carrera),
      satisfaccion: state.escalas.satisfaccion
    };
    if (state.tipo === "universitario") { a.ciclo = Number(d.ciclo); a.universidad = d.universidad; }
    else { a.anosExperiencia = Number(d.anosExperiencia); a.trabajaEnArea = d.trabajaEnArea; }
    return Object.assign(a, comun);
  }

  function guardarFinal() {
    if (state.guardando || state.numero) return;
    if (ES_DEMO) { state.numero = "DEMO"; guardarSesion(); render(); return; }
    state.guardando = true;
    state.errorGuardado = "";
    render();
    var coleccion = esEscolar() ? "escolares" : "adultos";
    var prefijo = esEscolar() ? CFG.prefijos.escolar : CFG.prefijos[state.tipo];
    guardarConNumero(coleccion, prefijo, registro()).then(function (numero) {
      state.guardando = false;
      state.numero = numero;
      guardarSesion();
      render();
    }).catch(function (err) {
      console.warn("No se pudo guardar:", err);
      state.guardando = false;
      var code = err && err.code;
      state.errorGuardado = code === "permission-denied"
        ? (esEscolar() ? "El aula se cerró antes de que terminaras. Avísale a tu profesor." : "La recolección de datos ya terminó. Gracias por tu interés.")
        : "No hay conexión a internet o la base de datos no respondió. Revisa tu conexión y presiona Reintentar.";
      guardarSesion();
      render();
    });
  }

  function descargarPdf() {
    if (!state.resultado) return;
    ResultadoPDF.generar({
      codigo: state.numero,
      fecha: new Date(state.fin || Date.now()),
      clave: state.resultado.clave,
      modelo: state.resultado.modelo,
      explicacion: state.resultado.explicacion
    });
  }

  function empezarFlujo() {
    var aula = state.aula, flujo = state.flujo;
    state = estadoInicial();
    state.pantalla = "flujo";
    state.aula = aula;
    state.flujo = flujo;
    irA(0);
  }

  function terminar() {
    borrarSesion();
    empezarFlujo();   // listo para la siguiente persona (p. ej., computadoras compartidas del aula)
  }

  // ---------- eventos ----------
  app.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el || el.disabled) return;
    var a = el.getAttribute("data-action");
    if (a === "reanudar") { var s = leerSesion(); if (s) { state = s; state.guardando = false; state.pantalla = "flujo"; irA(state.paso); } }
    else if (a === "nuevo") { borrarSesion(); empezarFlujo(); }
    else if (a === "aceptar") { if (state.acepto) { state.aceptadoEn = new Date().toISOString(); siguiente(); } }
    else if (a === "edad") {
      if (el.getAttribute("data-v") === "1") siguiente();
      else aviso("Gracias por tu interés", "Este cuestionario es solo para personas de 18 años o más. No se guardó ninguna respuesta.");
    }
    else if (a === "tipo") { state.tipo = el.getAttribute("data-v"); siguiente(); }
    else if (a === "dato") {
      var campo = el.getAttribute("data-campo"), valor = el.getAttribute("data-valor");
      state.datos[campo] = campo === "trabajaEnArea" ? valor === "1" : valor;
      guardarSesion();
      render();
    }
    else if (a === "datos-listo") datoSiguiente();
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
    else if (a === "siguiente") siguiente();
    else if (a === "reintentar") guardarFinal();
    else if (a === "pdf") descargarPdf();
    else if (a === "terminar") terminar();
  });

  app.addEventListener("input", function (e) {
    if (e.target.getAttribute("data-bind") === "anosExperiencia") {
      state.datos.anosExperiencia = e.target.value === "" ? null : Number(e.target.value);
      guardarSesion();
      actualizarBotonDatos();
    }
  });

  app.addEventListener("change", function (e) {
    var campo = e.target.getAttribute("data-bind");
    if (campo === "acepto") { state.acepto = e.target.checked; render(); }
    else if (campo === "carrera") { state.datos.carrera = e.target.value; guardarSesion(); actualizarBotonDatos(); }
    else if (campo === "ciclo") { state.datos.ciclo = e.target.value ? Number(e.target.value) : null; guardarSesion(); actualizarBotonDatos(); }
  });

  function actualizarBotonDatos() {
    var btn = app.querySelector('[data-action="datos-listo"]');
    if (btn) btn.disabled = !datosCompletos();
  }

  // ---------- inicio ----------
  function arrancar(aula, flujo) {
    state.aula = aula;
    state.flujo = flujo;
    var pendiente = leerSesion();
    if (pendiente && pendiente.flujo === flujo && (pendiente.paso > 0 || pendiente.acepto)) {
      if (pendiente.numero) { borrarSesion(); empezarFlujo(); return; }       // ya terminó y se guardó
      if (FLUJOS[flujo][pendiente.paso] === "final") {                          // terminó pero falta guardar
        state = pendiente; state.guardando = false; state.pantalla = "flujo"; irA(state.paso); return;
      }
      state.pantalla = "reanudar";
      render();
      return;
    }
    empezarFlujo();
  }

  render();
  if (ENLACE === "escolar") {
    if (ES_DEMO) {
      ChasideML.cargar(CFG.modeloUrl);
      arrancar({ codigo: CFG.aulaDemo, colegio: "DEMO", grado: 5, grupo: "EXP" }, "EXP");
    } else if (!AULA) {
      aviso("Falta el código del aula", "Abre el enlace completo que te compartió tu profesor (termina en ?aula=…).");
    } else {
      var base = db();
      if (!base) { aviso("Sin conexión", "No se pudo conectar con la base de datos. Revisa tu internet y recarga la página."); return; }
      // RF01: solo se abre con un aula activa
      base.collection("aulas").doc(AULA).get().then(function (snap) {
        var a = snap.exists ? snap.data() : null;
        if (!a || a.activa !== true) {
          aviso("Este enlace no está activo", "El aula " + AULA + " no existe o ya se cerró. Pide a tu profesor el enlace correcto.");
          return;
        }
        if (a.grupo === "EXP") ChasideML.cargar(CFG.modeloUrl);
        arrancar({ codigo: AULA, colegio: a.colegio, grado: a.grado, grupo: a.grupo }, a.grupo === "EXP" ? "EXP" : "CTL");
      }).catch(function (err) {
        console.warn(err);
        aviso("Sin conexión", "No se pudo verificar el aula. Revisa tu internet y recarga la página.");
      });
    }
  } else {
    var b = db();
    if (!b) { aviso("Sin conexión", "No se pudo conectar con la base de datos. Revisa tu internet y recarga la página."); return; }
    b.collection("contadores").doc("estado").get().then(function (snap) {
      if (snap.exists && snap.data().adultosAbierto === false) {
        aviso("La recolección terminó", "Ya no estamos recibiendo respuestas en este cuestionario. Gracias por tu interés.");
        return;
      }
      arrancar(null, "adultos");
    }).catch(function (err) {
      console.warn(err);
      aviso("Sin conexión", "No se pudo conectar con la base de datos. Revisa tu internet y recarga la página.");
    });
  }
})();
