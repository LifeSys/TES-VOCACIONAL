// Panel administrativo (RF14-RF17): login, resultados, exportación CSV, conteo por área,
// cuestionario imprimible con clave de corrección e información del modelo desplegado.
(function () {
  "use strict";

  var CFG = ORIENTA_CONFIG;
  var ESC = INSTRUMENTOS.escalas;
  var AREAS = Chaside.areas;
  var NOM = Chaside.nombres;
  var N_ITEMS = CHASIDE_DATA.questions.length;

  var root = document.getElementById("admin-app");
  var tab = "escolares";
  var escolares = [];
  var entrenamiento = [];
  var modelo = null;
  var cargando = false;
  var errorCarga = "";
  var loginError = "";

  // ---------- utilidades ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function aFecha(ts) {
    if (!ts) return null;
    if (ts.toDate) return ts.toDate();
    var d = new Date(ts);
    return isNaN(d) ? null : d;
  }
  function fmtFecha(ts) { var d = aFecha(ts); return d ? ResultadoPDF.fmtFecha(d) : ""; }
  function arr(v, n) { var a = Array.isArray(v) ? v : []; var out = []; for (var i = 0; i < n; i++) out.push(a[i] == null ? "" : a[i]); return out; }
  function rango(n, pref) { var out = []; for (var i = 1; i <= n; i++) out.push(pref + i); return out; }
  function suma(a) { return a.reduce(function (s, v) { return s + (typeof v === "number" ? v : 0); }, 0); }
  function promedio(a) { var nums = (a || []).filter(function (v) { return typeof v === "number"; }); return nums.length ? suma(nums) / nums.length : null; }
  function fechaDe(r) { return aFecha((r.asentimiento && r.asentimiento.fecha) || (r.consentimiento && r.consentimiento.fecha)); }

  // SUS (Brooke): impares (x-1), pares (5-x), total x 2.5 -> 0..100
  function puntajeSus(sus) {
    if (!Array.isArray(sus) || sus.length !== 10) return null;
    var t = 0;
    sus.forEach(function (v, i) { t += i % 2 === 0 ? v - 1 : 5 - v; });
    return t * 2.5;
  }
  function probsDe(m) {
    if (!m) return null;
    var p = {};
    Object.keys(m).forEach(function (k) { if (k !== "v" && typeof m[k] === "number") p[k] = m[k]; });
    return p;
  }
  function top3Modelo(r) {
    var p = r.resultado && probsDe(r.resultado.modelo);
    if (!p) return [];
    return Object.keys(p).sort(function (a, b) { return p[b] - p[a]; }).slice(0, 3);
  }
  // Criterio de entrada al modelo (sección "Módulo de machine learning")
  function entraAlModelo(r) {
    if (!r.calidad || r.calidad.valido !== true || !r.chaside || !r.area) return false;
    var sat = promedio(r.satisfaccion);
    if (sat == null || sat < CFG.entrenamiento.satisfaccionMinima) return false;
    return r.tipo === "UNI" || (r.tipo === "EGR" && r.trabajaEnArea === true);
  }
  function duracionSeg(r) {
    var a = aFecha(r.inicio), b = aFecha(r.fin);
    return a && b ? Math.round((b - a) / 1000) : "";
  }
  function avance(r) {
    if (r.completado) return '<span class="tag-ok">Completo</span>';
    var pasos = r.grupo === "CTL" ? ["pretest", "inicio", "fin", "postest", "adecuacion"] : ["pretest", "chaside", "postest", "adecuacion", "tam", "sus"];
    var hechos = pasos.filter(function (k) { return r[k] != null; }).length;
    return hechos + "/" + pasos.length;
  }
  function calidadHtml(c) {
    if (!c) return "—";
    return c.valido ? '<span class="tag-ok">Válido</span>' : '<span class="tag-bad">No válido</span><br><span class="admin-pct">' + esc(c.motivo) + "</span>";
  }

  function auth() { return firebase.auth(); }
  function db() { return firebase.firestore(); }

  // ---------- login ----------
  var LOGIN_ERROR_MESSAGES = {
    "auth/unauthorized-domain": "Este dominio no está autorizado en Firebase (Authentication → Settings → Authorized domains).",
    "auth/invalid-api-key": "La clave de Firebase (js/firebase-config.js) es inválida o no corresponde a este proyecto.",
    "auth/operation-not-allowed": "El método Correo/Contraseña no está habilitado (Authentication → Sign-in method).",
    "auth/user-not-found": "No existe un usuario con ese correo.",
    "auth/wrong-password": "Contraseña incorrecta.",
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/invalid-email": "El correo no tiene un formato válido.",
    "auth/too-many-requests": "Demasiados intentos fallidos. Espera un momento y vuelve a intentar.",
    "auth/network-request-failed": "Sin conexión a internet o Firebase no responde."
  };

  function renderLogin() {
    root.innerHTML =
      '<div class="page">' +
      '<div class="top-row"><img class="brand-mark-img" src="img/logo.png" width="34" height="34" alt="Logo"><div class="brand-name">Panel Admin</div></div>' +
      '<div class="divider"></div>' +
      '<div class="card card-narrow">' +
      '<h1 class="title" style="font-size:22px">Acceso administrador</h1>' +
      '<p class="subtitle">Ingresa con tu cuenta autorizada para ver los resultados registrados.</p>' +
      '<div class="field-block" style="margin-top:22px"><label class="field-label" for="admin-email">Correo</label>' +
      '<input id="admin-email" class="text-input" type="email" placeholder="tu@correo.com" autocomplete="username" /></div>' +
      '<div class="field-block" style="margin-top:14px"><label class="field-label" for="admin-pass">Contraseña</label>' +
      '<input id="admin-pass" class="text-input" type="password" placeholder="••••••••" autocomplete="current-password" /></div>' +
      (loginError ? '<div class="field-error" role="alert" style="margin-top:10px">' + esc(loginError) + "</div>" : "") +
      '<button class="btn-primary" id="admin-login-btn" style="margin-top:20px">Ingresar</button>' +
      "</div></div>";
    document.getElementById("admin-login-btn").addEventListener("click", doLogin);
    document.getElementById("admin-pass").addEventListener("keydown", function (e) { if (e.key === "Enter") doLogin(); });
  }

  function doLogin() {
    var email = document.getElementById("admin-email").value.trim();
    var pass = document.getElementById("admin-pass").value;
    loginError = "";
    auth().signInWithEmailAndPassword(email, pass).catch(function (err) {
      var code = err && err.code;
      loginError = (LOGIN_ERROR_MESSAGES[code] || (err && err.message) || "Error desconocido al iniciar sesión.") + " (" + code + ")";
      renderLogin();
    });
  }

  // ---------- pestañas ----------
  function renderEscolares() {
    var filas = escolares.map(function (r) {
      var top = top3Modelo(r), p = r.resultado && probsDe(r.resultado.modelo);
      var topHtml = top.length
        ? top.map(function (a) { return esc(NOM[a]) + ' <span class="admin-pct">' + Math.round(p[a] * 100) + "%</span>"; }).join("<br>")
        : (r.resultado ? "Solo clave clásica" : "—");
      var pdf = r.resultado ? '<button class="footer-link-btn" style="margin-top:0" data-pdf="' + esc(r.id) + '">Descargar</button>' : "—";
      var dur = duracionSeg(r);
      return "<tr><td><b>" + esc(r.id) + "</b></td><td>" + esc(r.grupo) + "</td><td>" + esc(fmtFecha(fechaDe(r))) + "</td><td>" + avance(r) + "</td><td>" + topHtml +
        "</td><td>" + calidadHtml(r.calidad) + "</td><td>" + (dur === "" ? "—" : Math.round(dur / 60) + " min") + "</td><td>" + pdf + "</td></tr>";
    }).join("");
    var nExp = escolares.filter(function (r) { return r.grupo === "EXP"; }).length;
    var nCtl = escolares.filter(function (r) { return r.grupo === "CTL"; }).length;
    return (
      '<div class="admin-toolbar"><span>' + escolares.length + " registros · EXP " + nExp + " · CTL " + nCtl + "</span>" +
      '<button class="admin-btn" data-csv="escolares">⬇ Exportar CSV de escolares</button></div>' +
      tabla(["Código", "Grupo", "Fecha", "Avance", "Top 3 del modelo", "Calidad", "Tiempo", "PDF"], filas)
    );
  }

  function renderEntrenamiento() {
    var filas = entrenamiento.map(function (r) {
      var sat = promedio(r.satisfaccion);
      var extra = r.tipo === "UNI" ? (r.ciclo ? r.ciclo + ".° ciclo" : "") : (r.anosEgresado != null ? r.anosEgresado + " años · " + (r.trabajaEnArea ? "trabaja en su área" : "no trabaja en su área") : "");
      return "<tr><td><b>" + esc(r.id) + "</b></td><td>" + esc(r.tipo) + "</td><td>" + esc(fmtFecha(fechaDe(r))) + "</td><td>" + esc(r.carrera || "—") +
        '<br><span class="admin-pct">' + esc(extra) + "</span></td><td>" + esc(r.area ? r.area + " · " + NOM[r.area] : "—") + "</td><td>" + (sat == null ? "—" : sat.toFixed(2)) +
        "</td><td>" + calidadHtml(r.calidad) + "</td><td>" + (entraAlModelo(r) ? '<span class="tag-ok">Sí</span>' : '<span class="admin-pct">No</span>') + "</td></tr>";
    }).join("");
    return (
      '<div class="admin-toolbar"><span>' + entrenamiento.length + " registros · " + entrenamiento.filter(entraAlModelo).length + " entran al modelo</span>" +
      '<button class="admin-btn" data-csv="entrenamiento">⬇ Exportar CSV de entrenamiento</button></div>' +
      (CFG.recoleccionEntrenamientoAbierta ? "" : '<p class="admin-warn">La recolección de entrenamiento está cerrada (js/config.js): ya no se aceptan códigos UNI- ni EGR-.</p>') +
      tabla(["Código", "Tipo", "Fecha", "Carrera", "Área", "Satisfacción", "Calidad", "Entra al modelo"], filas)
    );
  }

  function renderConteo() {
    var meta = CFG.entrenamiento.minimoPorArea;
    var incluidos = entrenamiento.filter(entraAlModelo);
    var filas = AREAS.map(function (a) {
      var n = incluidos.filter(function (r) { return r.area === a; }).length;
      var pct = Math.min(100, Math.round(n / meta * 100));
      return '<div class="count-row"><span><b>' + a + "</b> · " + esc(NOM[a]) + '</span><div class="score-track"><div class="score-fill' + (n >= meta ? " is-top" : "") + '" style="width:' + pct + '%"></div></div>' +
        '<span class="' + (n >= meta ? "tag-ok" : "") + '" style="text-align:right">' + n + " / " + meta + "</span></div>";
    }).join("");
    var listas = AREAS.filter(function (a) { return incluidos.filter(function (r) { return r.area === a; }).length >= meta; }).length;
    return (
      '<p class="admin-note">Casos de entrenamiento válidos por área (RF16). Cuentan los universitarios con satisfacción promedio ≥ ' + CFG.entrenamiento.satisfaccionMinima +
      " y los egresados con satisfacción ≥ " + CFG.entrenamiento.satisfaccionMinima + " que trabajan en su área, siempre que su test sea válido. Meta: " + meta + " por área.</p>" +
      '<div class="card" style="padding:24px"><div class="count-list">' + filas + "</div>" +
      '<p class="admin-note" style="margin:18px 0 0">' + listas + " de 7 áreas llegaron a la meta · " + incluidos.length + " casos válidos en total · " + entrenamiento.length + " registros recibidos.</p></div>"
    );
  }

  function renderImprimir() {
    var preguntas = CHASIDE_DATA.questions.slice().sort(function (a, b) { return a.id - b.id; });
    var items = preguntas.map(function (q) {
      return '<div class="print-item"><span><span class="n">' + q.id + ".</span>" + esc(q.text) + '</span><span class="print-checks"><span>Sí ☐</span><span>No ☐</span></span></div>';
    }).join("");
    var clave = AREAS.map(function (a) {
      var ints = preguntas.filter(function (q) { return q.area === a && q.scale === "interes"; }).map(function (q) { return q.id; });
      var apts = preguntas.filter(function (q) { return q.area === a && q.scale === "aptitud"; }).map(function (q) { return q.id; });
      return "<tr><td><b>" + a + "</b> · " + esc(NOM[a]) + "</td><td>" + ints.join(", ") + "</td><td>" + apts.join(", ") + "</td><td>" + (ints.length + apts.length) + "</td></tr>";
    }).join("");
    var carreras = AREAS.map(function (a) {
      return "<tr><td><b>" + a + "</b> · " + esc(NOM[a]) + "</td><td>" + esc(Chaside.carrerasDeArea(a).join(", ")) + "</td></tr>";
    }).join("");
    return (
      '<div class="admin-toolbar"><span>Material impreso para el grupo control (RF17)</span><button class="admin-btn" id="admin-print">🖨 Imprimir / Guardar PDF</button></div>' +
      '<div class="print-sheet">' +
      "<h2>Test de Orientación Vocacional CHASIDE</h2>" +
      '<p class="sub">Código: ____________ · Fecha: ____________ · Hora de inicio: ________ · Hora de fin: ________</p>' +
      '<p class="sub">Responde Sí o No marcando la casilla. No hay respuestas correctas ni incorrectas.</p>' +
      items +
      '<div class="page-break"></div>' +
      "<h2>Clave de corrección CHASIDE</h2>" +
      '<p class="sub">Cuenta las respuestas Sí de cada área. Puntaje máximo por área: ' + Chaside.MAX_POR_AREA + " (10 de interés + 4 de aptitud). Las áreas con mayor puntaje son las más representativas; si dos áreas empatan, se reportan ambas.</p>" +
      '<table class="print-table"><thead><tr><th>Área</th><th>Ítems de interés</th><th>Ítems de aptitud</th><th>Máx.</th></tr></thead><tbody>' + clave + "</tbody></table>" +
      "<h3>Hoja de puntaje</h3>" +
      '<table class="print-table"><thead><tr>' + AREAS.map(function (a) { return "<th>" + a + "</th>"; }).join("") + "</tr></thead><tbody><tr>" + AREAS.map(function () { return "<td style=\"height:28px\"></td>"; }).join("") + "</tr></tbody></table>" +
      "<h3>Carreras por área</h3>" +
      '<table class="print-table"><thead><tr><th>Área</th><th>Carreras</th></tr></thead><tbody>' + carreras + "</tbody></table>" +
      "</div>"
    );
  }

  function renderModelo() {
    if (!modelo) return '<p class="admin-warn">No se pudo cargar ' + esc(CFG.modeloUrl) + ". Los escolares del grupo experimental verán solo la clave clásica.</p>";
    var sintetico = /sintetic/i.test(modelo.version) || modelo.datos === "sinteticos";
    var met = modelo.metricas || {};
    var filasMet = Object.keys(met).map(function (k) {
      var m = met[k];
      return "<tr><td>" + esc(k) + "</td><td>" + (m.top3 != null ? (m.top3 * 100).toFixed(1) + "%" : "—") + "</td><td>" + (m.top1 != null ? (m.top1 * 100).toFixed(1) + "%" : "—") + "</td><td>" + (m.f1_macro != null ? m.f1_macro.toFixed(3) : "—") + "</td></tr>";
    }).join("");
    return (
      (sintetico ? '<p class="admin-warn"><b>Modelo provisional entrenado con datos sintéticos.</b> Sirve para el modo Demo y las pruebas. Antes de aplicar el experimento (códigos EXP-) hay que entrenarlo con los datos reales de UNI y EGR y reemplazar modelo.json.</p>' : "") +
      '<div class="card" style="padding:24px">' +
      '<p class="admin-note" style="margin:0">Versión <b>' + esc(modelo.version) + "</b> · " + esc(modelo.algoritmo || "") + " · entrenado el " + esc(modelo.entrenado || "—") +
      " · " + esc(modelo.casos != null ? modelo.casos + " casos" : "") + " · áreas: " + esc(modelo.areas.join(", ")) + "</p>" +
      (filasMet ? '<h2 class="section-title" style="margin-top:20px">Comparación de modelos (validación cruzada de 5 pliegues)</h2>' +
        tabla(["Modelo", "Exactitud top-3", "Exactitud top-1", "F1 macro"], filasMet) : "") +
      "</div>"
    );
  }

  function tabla(cabecera, filas) {
    return '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' + cabecera.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") +
      "</tr></thead><tbody>" + (filas || '<tr><td colspan="' + cabecera.length + '" class="admin-empty">' + (cargando ? "Cargando…" : "Todavía no hay registros.") + "</td></tr>") + "</tbody></table></div>";
  }

  function renderDashboard() {
    var tabs = [["escolares", "Escolares"], ["entrenamiento", "Entrenamiento"], ["conteo", "Conteo por área"], ["imprimir", "Cuestionario impreso"], ["modelo", "Modelo"]];
    var cuerpo = errorCarga ? '<p class="field-error" style="text-align:left">Error al cargar resultados: ' + esc(errorCarga) + "</p>"
      : tab === "escolares" ? renderEscolares()
      : tab === "entrenamiento" ? renderEntrenamiento()
      : tab === "conteo" ? renderConteo()
      : tab === "imprimir" ? renderImprimir()
      : renderModelo();
    root.innerHTML =
      '<div class="page page-wide">' +
      '<div class="top-row"><img class="brand-mark-img" src="img/logo.png" width="34" height="34" alt="Logo"><div class="brand-name">OrientaIA</div><div class="top-row-right"><span class="q-tag">PANEL ADMIN</span></div></div>' +
      '<div class="divider"></div>' +
      '<div class="admin-head"><div><p class="eyebrow" style="text-align:left">Panel del administrador</p><h1 class="title" style="text-align:left;font-size:26px">Resultados registrados</h1></div>' +
      '<div style="display:flex;gap:10px"><button class="admin-btn" id="admin-refresh">↻ Actualizar</button><button class="btn-secondary" style="width:auto;padding:0 20px;height:40px" id="admin-logout">Cerrar sesión</button></div></div>' +
      '<div class="admin-tabs">' + tabs.map(function (t) { return '<button class="admin-tab' + (t[0] === tab ? " is-active" : "") + '" data-tab="' + t[0] + '">' + t[1] + "</button>"; }).join("") + "</div>" +
      cuerpo +
      "</div>";
  }

  // ---------- CSV (RF15) ----------
  function csvCell(v) {
    if (typeof v === "number" && isFinite(v)) return String(v);
    if (typeof v === "boolean") return v ? "1" : "0";
    var s = v == null ? "" : String(v);
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function descargarCsv(nombre, cabecera, filas) {
    var lineas = [cabecera.map(csvCell).join(",")].concat(filas.map(function (f) { return f.map(csvCell).join(","); }));
    var blob = new Blob(["﻿" + lineas.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nombre + "-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function chasideCols(r) {
    var c = r.chaside || {};
    return arr(c.respuestas, N_ITEMS).concat(arr(c.tiemposMs, N_ITEMS));
  }

  function csvEscolares() {
    var nPre = ESC.claridad.items.length, nAd = ESC.adecuacion.items.length, nTam = ESC.tam.items.length, nSus = ESC.sus.items.length;
    var cab = ["codigo", "grupo", "fecha_asentimiento"]
      .concat(rango(nPre, "pre_"), ["pre_total"], rango(nPre, "post_"), ["post_total"])
      .concat(["inicio", "fin", "duracion_seg"])
      .concat(rango(N_ITEMS, "r_"), rango(N_ITEMS, "t_ms_"))
      .concat(AREAS.map(function (a) { return "clave_" + a; }))
      .concat(["modelo_version"], AREAS.map(function (a) { return "prob_" + a; }), ["top1", "top2", "top3", "explicacion_items"])
      .concat(["valido", "motivo"])
      .concat(rango(nAd, "adec_"), rango(nTam, "tam_"), rango(nSus, "sus_"), ["sus_puntaje", "completado"]);
    var filas = escolares.map(function (r) {
      var res = r.resultado || {}, clave = res.clave || {}, p = probsDe(res.modelo) || {}, top = top3Modelo(r);
      var pre = arr(r.pretest, nPre), post = arr(r.postest, nPre);
      return [r.id, r.grupo, fmtFecha(fechaDe(r))]
        .concat(pre, [r.pretest ? suma(r.pretest) : ""], post, [r.postest ? suma(r.postest) : ""])
        .concat([fmtFecha(r.inicio), fmtFecha(r.fin), duracionSeg(r)])
        .concat(chasideCols(r))
        .concat(AREAS.map(function (a) { return clave[a] != null ? clave[a] : ""; }))
        .concat([res.modelo ? res.modelo.v : ""], AREAS.map(function (a) { return p[a] != null ? p[a] : ""; }), [top[0] || "", top[1] || "", top[2] || "", (res.explicacion || []).join("|")])
        .concat([r.calidad ? r.calidad.valido : "", r.calidad ? r.calidad.motivo : ""])
        .concat(arr(r.adecuacion, nAd), arr(r.tam, nTam), arr(r.sus, nSus), [puntajeSus(r.sus) == null ? "" : puntajeSus(r.sus), fmtFecha(r.completado)]);
    });
    descargarCsv("escolares-chaside", cab, filas);
  }

  function csvEntrenamiento() {
    var nSat = ESC.satisfaccionCarrera.items.length;
    var cab = ["codigo", "tipo", "fecha_consentimiento", "carrera", "area", "ciclo", "anos_egresado", "trabaja_en_area"]
      .concat(rango(nSat, "sat_"), ["sat_promedio"])
      .concat(rango(N_ITEMS, "r_"), rango(N_ITEMS, "t_ms_"))
      .concat(["valido", "motivo", "incluido", "completado"]);
    var filas = entrenamiento.map(function (r) {
      var sat = promedio(r.satisfaccion);
      return [r.id, r.tipo, fmtFecha(fechaDe(r)), r.carrera || "", r.area || "", r.ciclo != null ? r.ciclo : "", r.anosEgresado != null ? r.anosEgresado : "", typeof r.trabajaEnArea === "boolean" ? r.trabajaEnArea : ""]
        .concat(arr(r.satisfaccion, nSat), [sat == null ? "" : Math.round(sat * 100) / 100])
        .concat(chasideCols(r))
        .concat([r.calidad ? r.calidad.valido : "", r.calidad ? r.calidad.motivo : "", entraAlModelo(r), fmtFecha(r.completado)]);
    });
    descargarCsv("entrenamiento-chaside", cab, filas);
  }

  function descargarPdf(id) {
    var r = escolares.filter(function (x) { return x.id === id; })[0];
    if (!r || !r.resultado) return;
    ResultadoPDF.generar({
      codigo: r.id,
      fecha: aFecha(r.fin) || fechaDe(r) || new Date(),
      clave: r.resultado.clave || {},
      modelo: r.resultado.modelo || null,
      explicacion: r.resultado.explicacion || []
    });
  }

  // ---------- eventos ----------
  root.addEventListener("click", function (e) {
    var el = e.target.closest("button");
    if (!el) return;
    if (el.id === "admin-logout") auth().signOut();
    else if (el.id === "admin-refresh") cargar();
    else if (el.id === "admin-print") window.print();
    else if (el.getAttribute("data-tab")) { tab = el.getAttribute("data-tab"); renderDashboard(); }
    else if (el.getAttribute("data-csv") === "escolares") csvEscolares();
    else if (el.getAttribute("data-csv") === "entrenamiento") csvEntrenamiento();
    else if (el.getAttribute("data-pdf")) descargarPdf(el.getAttribute("data-pdf"));
  });

  function leer(nombre) {
    return db().collection(nombre).get().then(function (snap) {
      return snap.docs.map(function (d) { return Object.assign({}, d.data(), { id: d.id }); })
        .sort(function (a, b) { return (fechaDe(b) || 0) - (fechaDe(a) || 0); });
    });
  }

  function cargar() {
    cargando = true;
    errorCarga = "";
    renderDashboard();
    Promise.all([
      leer("participantes"),
      leer("entrenamiento"),
      fetch(CFG.modeloUrl, { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).then(function (res) {
      escolares = res[0];
      entrenamiento = res[1];
      modelo = res[2];
      cargando = false;
      renderDashboard();
    }).catch(function (err) {
      cargando = false;
      errorCarga = err.message || String(err);
      renderDashboard();
    });
  }

  // ---------- inicio ----------
  root.innerHTML = '<div class="page"><p class="subtitle" style="margin-top:60px">Cargando…</p></div>';
  auth().onAuthStateChanged(function (user) {
    if (user) cargar();
    else renderLogin();
  });
})();
