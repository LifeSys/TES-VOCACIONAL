// Panel del superadministrador (RF15-RF20): aulas, tablas, conteos, exclusión, borrado y CSV.
(function () {
  "use strict";

  var CFG = ORIENTA_CONFIG;
  var ESC = INSTRUMENTOS.escalas;
  var AREAS = Chaside.areas;
  var NOM = Chaside.nombres;
  var N_ITEMS = CHASIDE_DATA.questions.length;

  var root = document.getElementById("admin-app");
  var tab = "aulas";
  var aulas = [], escolares = [], adultos = [];
  var estado = { adultosAbierto: true };
  var modelo = null;
  var cargando = false, errorCarga = "", loginError = "", mensaje = "";

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
  function suma(a) { return (a || []).reduce(function (s, v) { return s + (typeof v === "number" ? v : 0); }, 0); }
  function promedio(a) { var nums = (a || []).filter(function (v) { return typeof v === "number"; }); return nums.length ? suma(nums) / nums.length : null; }
  function fechaDe(r) { return aFecha(r.completado) || aFecha(r.fin); }
  function duracionSeg(r) { var a = aFecha(r.inicio), b = aFecha(r.fin); return a && b ? Math.round((b - a) / 1000) : ""; }
  function sospechoso(r) { return !!(r.calidad && r.calidad.sospechoso); }
  function valido(r) { return !sospechoso(r) && !r.excluido; }

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
  // Casos que entran al modelo (sección "Módulo de machine learning")
  function entraAlModelo(r) {
    if (!valido(r) || !r.chaside || !r.area) return false;
    var sat = promedio(r.satisfaccion);
    if (sat == null || sat < CFG.entrenamiento.satisfaccionMinima) return false;
    if (r.tipo === "universitario") return Number(r.ciclo) >= CFG.entrenamiento.cicloMinimo;
    return r.tipo === "profesional" && r.trabajaEnArea === true;
  }
  function calidadHtml(r) {
    var c = r.calidad;
    var base = !c ? "—" : c.sospechoso ? '<span class="tag-bad">Sospechoso</span><br><span class="admin-pct">' + esc(c.motivo) + "</span>" : '<span class="tag-ok">OK</span>';
    return base + (r.excluido ? '<br><span class="tag-bad">Excluido</span>' : "");
  }
  function botonesRegistro(col, r) {
    return '<button class="footer-link-btn" style="margin-top:0" data-excluir="' + col + "|" + esc(r.id) + '">' + (r.excluido ? "Incluir" : "Excluir") + "</button>" +
      '<button class="footer-link-btn" style="margin-top:6px;color:var(--danger)" data-borrar="' + col + "|" + esc(r.id) + '">Borrar</button>';
  }

  function auth() { return firebase.auth(); }
  function db() { return firebase.firestore(); }

  // ---------- login (RF15) ----------
  var LOGIN_ERROR_MESSAGES = {
    "auth/unauthorized-domain": "Este dominio no está autorizado en Firebase (Authentication → Settings → Authorized domains).",
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
      '<div class="top-row"><img class="brand-mark-img" src="img/logo.svg" width="34" height="34" alt="Logo"><div class="brand-name">Panel del superadministrador</div></div>' +
      '<div class="divider"></div>' +
      '<div class="card card-narrow">' +
      '<h1 class="title" style="font-size:22px">Acceso restringido</h1>' +
      '<p class="subtitle">Solo el correo autorizado puede ver y descargar los datos.</p>' +
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
      loginError = (LOGIN_ERROR_MESSAGES[code] || (err && err.message) || "Error al iniciar sesión.") + " (" + code + ")";
      renderLogin();
    });
  }

  // ---------- pestañas ----------
  function enlaceAula(codigo) {
    return location.href.replace(/admin\.html.*$/, "") + "escolar.html?aula=" + encodeURIComponent(codigo);
  }

  function renderAulas() {
    var porAula = {};
    escolares.forEach(function (r) { porAula[r.aula] = (porAula[r.aula] || 0) + 1; });
    var filas = aulas.map(function (a) {
      var url = enlaceAula(a.id);
      return "<tr><td><b>" + esc(a.id) + "</b></td><td>" + esc(a.colegio) + "</td><td>" + esc(a.grado) + ".° " + esc(a.seccion || "") + "</td><td>" + esc(a.grupo) +
        "</td><td>" + (a.activa ? '<span class="tag-ok">Activa</span>' : '<span class="admin-pct">Cerrada</span>') + "</td><td>" + (porAula[a.id] || 0) +
        '</td><td><span class="link-cell">' + esc(url) + '</span><button class="footer-link-btn" style="margin-top:4px" data-copiar="' + esc(url) + '">Copiar enlace</button></td>' +
        '<td><button class="admin-btn" data-aula-toggle="' + esc(a.id) + '">' + (a.activa ? "Cerrar" : "Reabrir") + "</button></td></tr>";
    }).join("");
    return (
      '<p class="admin-note">Crea un aula por sección antes de la sesión, comparte su enlace en clase y ciérrala al terminar (RF16). Un aula cerrada no deja empezar ni guardar tests. Para la sustentación usa el aula de prueba <b>DEMO</b> (no guarda nada): <span class="link-cell">' + esc(enlaceAula("DEMO")) + "</span></p>" +
      '<div class="card form-inline">' +
      '<label>Colegio (código)<input id="aula-colegio" class="text-input text-left" maxlength="20" placeholder="Ej. C01"></label>' +
      '<label>Grado<select id="aula-grado" class="select-input"><option value="4">4.°</option><option value="5">5.°</option></select></label>' +
      '<label>Sección<input id="aula-seccion" class="text-input text-left" maxlength="5" placeholder="Ej. A"></label>' +
      '<label>Grupo<select id="aula-grupo" class="select-input"><option value="EXP">Experimental (EXP)</option><option value="CTL">Control (CTL)</option></select></label>' +
      '<button class="btn-primary" id="aula-crear">Crear aula</button>' +
      "</div>" +
      (mensaje ? '<p class="admin-note" style="margin-top:12px">' + esc(mensaje) + "</p>" : "") +
      '<div style="margin-top:18px">' + tabla(["Código", "Colegio", "Grado", "Grupo", "Estado", "Tests", "Enlace", ""], filas) + "</div>"
    );
  }

  function renderEscolares() {
    var filas = escolares.map(function (r) {
      var top = top3Modelo(r), p = r.resultado && probsDe(r.resultado.modelo);
      var res = top.length
        ? top.map(function (a) { return esc(NOM[a]) + ' <span class="admin-pct">' + Math.round(p[a] * 100) + "%</span>"; }).join("<br>")
        : (r.resultado && r.resultado.clave ? Chaside.topClave(r.resultado.clave, 2).map(function (a) { return esc(NOM[a]); }).join("<br>") + ' <span class="admin-pct">(clásico)</span>' : "—");
      var dur = duracionSeg(r);
      return "<tr" + (r.excluido ? ' class="row-off"' : "") + "><td><b>" + esc(r.id) + "</b><br><span class=\"admin-pct\">" + esc(fmtFecha(fechaDe(r))) + "</span></td><td>" + esc(r.aula) + "<br><span class=\"admin-pct\">" + esc(r.colegio) + " · " + esc(r.grado) + ".°</span></td><td>" + esc(r.grupo) +
        "</td><td>" + esc(r.sexo || "—") + "</td><td>" + res + "</td><td>" + calidadHtml(r) + "</td><td>" + (dur === "" ? "—" : Math.round(dur / 60) + " min") +
        '</td><td><button class="footer-link-btn" style="margin-top:0" data-pdf="' + esc(r.id) + '">PDF</button></td><td>' + botonesRegistro("escolares", r) + "</td></tr>";
    }).join("");
    var g = function (grupo) { var t = escolares.filter(function (r) { return r.grupo === grupo; }); return t.length + " (" + t.filter(valido).length + " válidos)"; };
    return (
      '<div class="admin-toolbar"><span>EXP ' + g("EXP") + " · CTL " + g("CTL") + "</span>" +
      '<button class="admin-btn" data-csv="escolares">⬇ CSV de escolares (SPSS)</button></div>' +
      tabla(["Número", "Aula", "Grupo", "Sexo", "Resultado", "Calidad", "Tiempo", "PDF", ""], filas)
    );
  }

  function renderAdultos() {
    var filas = adultos.map(function (r) {
      var sat = promedio(r.satisfaccion);
      var extra = r.tipo === "universitario" ? (r.ciclo ? r.ciclo + ".° ciclo · " : "") + (r.universidad || "") : (r.anosExperiencia != null ? r.anosExperiencia + " años · " : "") + (r.trabajaEnArea ? "trabaja en su área" : "no trabaja en su área");
      return "<tr" + (r.excluido ? ' class="row-off"' : "") + "><td><b>" + esc(r.id) + "</b><br><span class=\"admin-pct\">" + esc(fmtFecha(fechaDe(r))) + "</span></td><td>" + esc(r.tipo) + "</td><td>" + esc(r.carrera || "—") +
        '<br><span class="admin-pct">' + esc(extra) + "</span></td><td>" + esc(r.area ? r.area + " · " + NOM[r.area] : "—") + "</td><td>" + (sat == null ? "—" : sat.toFixed(2)) +
        "</td><td>" + calidadHtml(r) + "</td><td>" + (entraAlModelo(r) ? '<span class="tag-ok">Sí</span>' : '<span class="admin-pct">No</span>') + "</td><td>" + botonesRegistro("adultos", r) + "</td></tr>";
    }).join("");
    return (
      '<div class="admin-toolbar"><span>' + adultos.length + " registros · " + adultos.filter(entraAlModelo).length + " entran al modelo</span>" +
      '<span style="display:flex;gap:10px;flex-wrap:wrap"><button class="admin-btn" id="adultos-toggle">' + (estado.adultosAbierto ? "🔓 Enlace abierto · Cerrar" : "🔒 Enlace cerrado · Reabrir") + "</button>" +
      '<button class="admin-btn" data-csv="adultos">⬇ CSV de adultos (entrenamiento)</button></span></div>' +
      '<p class="admin-note">Enlace para universitarios y profesionales (no compartir en colegios): <span class="link-cell">' + esc(location.href.replace(/admin\.html.*$/, "") + "adultos.html") + "</span>. Ciérralo antes de aplicar el experimento para que el modelo no cambie.</p>" +
      tabla(["Número", "Tipo", "Carrera", "Área", "Satisfacción", "Calidad", "Entra al modelo", ""], filas)
    );
  }

  function renderConteos() {
    var meta = CFG.entrenamiento.minimoPorArea;
    var incluidos = adultos.filter(entraAlModelo);
    var filas = AREAS.map(function (a) {
      var n = incluidos.filter(function (r) { return r.area === a; }).length;
      var pct = Math.min(100, Math.round(n / meta * 100));
      return '<div class="count-row"><span><b>' + a + "</b> · " + esc(NOM[a]) + '</span><div class="score-track"><div class="score-fill' + (n >= meta ? " is-top" : "") + '" style="width:' + pct + '%"></div></div>' +
        '<span class="' + (n >= meta ? "tag-ok" : "") + '" style="text-align:right">' + n + " / " + meta + "</span></div>";
    }).join("");
    var listas = AREAS.filter(function (a) { return incluidos.filter(function (r) { return r.area === a; }).length >= meta; }).length;
    var grupo = function (g) {
      var t = escolares.filter(function (r) { return r.grupo === g; });
      return "<tr><td>" + g + "</td><td>" + t.length + "</td><td>" + t.filter(valido).length + "</td><td>" + t.filter(sospechoso).length + "</td><td>" + t.filter(function (r) { return r.excluido; }).length + "</td></tr>";
    };
    return (
      '<h2 class="section-title">Adultos válidos por área (meta ' + meta + ")</h2>" +
      '<p class="admin-note">Cuentan los universitarios de ' + CFG.entrenamiento.cicloMinimo + ".er ciclo a más con satisfacción promedio ≥ " + CFG.entrenamiento.satisfaccionMinima +
      " y los profesionales con satisfacción ≥ " + CFG.entrenamiento.satisfaccionMinima + " que trabajan en su área, con test no sospechoso y no excluido.</p>" +
      '<div class="card" style="padding:24px"><div class="count-list">' + filas + "</div>" +
      '<p class="admin-note" style="margin:18px 0 0">' + listas + " de 7 áreas llegaron a la meta · " + incluidos.length + " casos válidos · " + adultos.length + " registros.</p></div>" +
      '<h2 class="section-title" style="margin-top:28px">Escolares por grupo</h2>' +
      tabla(["Grupo", "Registros", "Válidos", "Sospechosos", "Excluidos"], grupo("EXP") + grupo("CTL"))
    );
  }

  function renderModelo() {
    if (!modelo) return '<p class="admin-warn">No se pudo cargar ' + esc(CFG.modeloUrl) + ". Las aulas EXP verán solo el resultado clásico.</p>";
    var sintetico = /sintetic/i.test(modelo.version) || modelo.datos === "sinteticos";
    var met = modelo.metricas || {};
    var filasMet = Object.keys(met).map(function (k) {
      var m = met[k];
      return "<tr><td>" + esc(k) + "</td><td>" + (m.top3 != null ? (m.top3 * 100).toFixed(1) + "%" : "—") + "</td><td>" + (m.top1 != null ? (m.top1 * 100).toFixed(1) + "%" : "—") + "</td><td>" + (m.f1_macro != null ? m.f1_macro.toFixed(3) : "—") + "</td></tr>";
    }).join("");
    return (
      (sintetico ? '<p class="admin-warn"><b>Modelo provisional entrenado con datos sintéticos.</b> Sirve para el aula DEMO y las pruebas. Antes de abrir aulas EXP hay que entrenarlo con el CSV de adultos y reemplazar modelo.json.</p>' : "") +
      '<div class="card" style="padding:24px">' +
      '<p class="admin-note" style="margin:0">Versión <b>' + esc(modelo.version) + "</b> · " + esc(modelo.algoritmo || "") + " · entrenado el " + esc(modelo.entrenado || "—") +
      " · " + esc(modelo.casos != null ? modelo.casos + " casos" : "") + " · áreas: " + esc((modelo.areas || []).join(", ")) + "</p>" +
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
    var tabs = [["aulas", "Aulas"], ["escolares", "Escolares"], ["adultos", "Adultos"], ["conteos", "Conteos"], ["modelo", "Modelo"]];
    var cuerpo = errorCarga ? '<p class="field-error" style="text-align:left">' + esc(errorCarga) + "</p>"
      : tab === "aulas" ? renderAulas()
      : tab === "escolares" ? renderEscolares()
      : tab === "adultos" ? renderAdultos()
      : tab === "conteos" ? renderConteos()
      : renderModelo();
    root.innerHTML =
      '<div class="page page-wide">' +
      '<div class="top-row"><img class="brand-mark-img" src="img/logo.svg" width="34" height="34" alt="Logo"><div class="brand-name">OrientaIA</div><div class="top-row-right"><span class="q-tag">SUPERADMINISTRADOR</span></div></div>' +
      '<div class="divider"></div>' +
      '<div class="admin-head"><div><p class="eyebrow" style="text-align:left">Panel del superadministrador</p><h1 class="title" style="text-align:left;font-size:26px">Test Vocacional CHASIDE</h1></div>' +
      '<div style="display:flex;gap:10px"><button class="admin-btn" id="admin-refresh">↻ Actualizar</button><button class="btn-secondary" style="width:auto;padding:0 20px;height:40px" id="admin-logout">Cerrar sesión</button></div></div>' +
      '<div class="admin-tabs">' + tabs.map(function (t) { return '<button class="admin-tab' + (t[0] === tab ? " is-active" : "") + '" data-tab="' + t[0] + '">' + t[1] + "</button>"; }).join("") + "</div>" +
      cuerpo +
      "</div>";
  }

  // ---------- acciones ----------
  var ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // sin O/0, I/1 para que no se confundan
  function codigoAleatorio() {
    var s = "";
    var bytes = new Uint32Array(4);
    window.crypto.getRandomValues(bytes);
    for (var i = 0; i < 4; i++) s += ALFABETO[bytes[i] % ALFABETO.length];
    return s;
  }

  function crearAula() {
    var colegio = document.getElementById("aula-colegio").value.trim().toUpperCase();
    var grado = Number(document.getElementById("aula-grado").value);
    var seccion = document.getElementById("aula-seccion").value.trim().toUpperCase();
    var grupo = document.getElementById("aula-grupo").value;
    if (!colegio) { mensaje = "Escribe el código del colegio (no su nombre)."; renderDashboard(); return; }
    var intentar = function (n) {
      var codigo = codigoAleatorio();
      if (codigo === CFG.aulaDemo) return intentar(n);
      var ref = db().collection("aulas").doc(codigo);
      return ref.get().then(function (snap) {
        if (snap.exists) { if (n > 5) throw new Error("No se pudo generar un código libre."); return intentar(n + 1); }
        return ref.set({ colegio: colegio, grado: grado, seccion: seccion, grupo: grupo, activa: true, creada: new Date() }).then(function () { return codigo; });
      });
    };
    intentar(0).then(function (codigo) {
      mensaje = "Aula " + codigo + " creada (" + colegio + ", " + grado + ".° " + seccion + ", " + grupo + "). Copia su enlace de la tabla.";
      cargar();
    }).catch(function (err) { mensaje = "No se pudo crear el aula: " + (err.message || err); renderDashboard(); });
  }

  function toggleAula(codigo) {
    var a = aulas.filter(function (x) { return x.id === codigo; })[0];
    if (!a) return;
    db().collection("aulas").doc(codigo).update({ activa: !a.activa }).then(cargar)
      .catch(function (err) { alert("No se pudo actualizar el aula: " + err.message); });
  }

  function toggleAdultos() {
    var abierto = !estado.adultosAbierto;
    if (!abierto && !confirm("¿Cerrar el enlace de adultos? Ya no se aceptarán nuevas respuestas de universitarios ni profesionales.")) return;
    db().collection("contadores").doc("estado").set({ adultosAbierto: abierto }, { merge: true }).then(cargar)
      .catch(function (err) { alert("No se pudo cambiar el estado: " + err.message); });
  }

  function lista(col) { return col === "escolares" ? escolares : adultos; }

  // RF18: marcar o desmarcar como excluido sin borrar
  function toggleExcluir(col, id) {
    var r = lista(col).filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    db().collection(col).doc(id).update({ excluido: !r.excluido, excluidoEn: new Date() }).then(cargar)
      .catch(function (err) { alert("No se pudo actualizar " + id + ": " + err.message); });
  }

  // RF20: borrar el registro de un número cuando la persona lo pida
  function borrar(col, id) {
    if (prompt("Para borrar definitivamente el registro, escribe su número (" + id + "):") !== id) return;
    db().collection(col).doc(id).delete().then(cargar)
      .catch(function (err) { alert("No se pudo borrar " + id + ": " + err.message); });
  }

  function copiar(texto) {
    if (navigator.clipboard) navigator.clipboard.writeText(texto).then(function () { mensaje = "Enlace copiado: " + texto; renderDashboard(); });
    else prompt("Copia el enlace:", texto);
  }

  // ---------- CSV (RF19) ----------
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
  function chasideCols(r) { var c = r.chaside || {}; return arr(c.respuestas, N_ITEMS).concat(arr(c.tiemposMs, N_ITEMS)); }
  function calidadCols(r) { return [sospechoso(r), r.calidad ? r.calidad.motivo || "" : "", !!r.excluido]; }

  function csvEscolares() {
    var nPre = ESC.claridad.items.length, nAd = ESC.adecuacion.items.length, nTam = ESC.tam.items.length, nSus = ESC.sus.items.length;
    var cab = ["numero", "aula", "colegio", "grado", "grupo", "sexo", "fecha_asentimiento"]
      .concat(rango(nPre, "pre_"), ["pre_total"], rango(nPre, "post_"), ["post_total"])
      .concat(["inicio", "fin", "duracion_seg"], rango(N_ITEMS, "r_"), rango(N_ITEMS, "t_ms_"))
      .concat(AREAS.map(function (a) { return "clave_" + a; }))
      .concat(["modelo_version"], AREAS.map(function (a) { return "prob_" + a; }), ["top1", "top2", "top3", "explicacion_items"])
      .concat(["sospechoso", "motivo", "excluido"])
      .concat(rango(nAd, "adec_"), rango(nTam, "tam_"), rango(nSus, "sus_"), ["sus_puntaje", "completado"]);
    var filas = escolares.map(function (r) {
      var res = r.resultado || {}, clave = res.clave || {}, p = probsDe(res.modelo) || {}, top = top3Modelo(r);
      return [r.id, r.aula, r.colegio, r.grado, r.grupo, r.sexo || "", fmtFecha(r.asentimiento && r.asentimiento.fecha)]
        .concat(arr(r.pretest, nPre), [r.pretest ? suma(r.pretest) : ""], arr(r.postest, nPre), [r.postest ? suma(r.postest) : ""])
        .concat([fmtFecha(r.inicio), fmtFecha(r.fin), duracionSeg(r)], chasideCols(r))
        .concat(AREAS.map(function (a) { return clave[a] != null ? clave[a] : ""; }))
        .concat([res.modelo ? res.modelo.v : ""], AREAS.map(function (a) { return p[a] != null ? p[a] : ""; }), [top[0] || "", top[1] || "", top[2] || "", (res.explicacion || []).join("|")])
        .concat(calidadCols(r))
        .concat(arr(r.adecuacion, nAd), arr(r.tam, nTam), arr(r.sus, nSus), [puntajeSus(r.sus) == null ? "" : puntajeSus(r.sus), fmtFecha(r.completado)]);
    });
    descargarCsv("escolares-chaside", cab, filas);
  }

  function csvAdultos() {
    var nSat = ESC.satisfaccionCarrera.items.length;
    var cab = ["numero", "tipo", "fecha_consentimiento", "carrera", "area", "universidad", "ciclo", "anos_experiencia", "trabaja_en_area"]
      .concat(rango(nSat, "sat_"), ["sat_promedio"])
      .concat(["inicio", "fin", "duracion_seg"], rango(N_ITEMS, "r_"), rango(N_ITEMS, "t_ms_"))
      .concat(["sospechoso", "motivo", "excluido", "incluido", "completado"]);
    var filas = adultos.map(function (r) {
      var sat = promedio(r.satisfaccion);
      return [r.id, r.tipo, fmtFecha(r.consentimiento && r.consentimiento.fecha), r.carrera || "", r.area || "", r.universidad || "", r.ciclo != null ? r.ciclo : "",
        r.anosExperiencia != null ? r.anosExperiencia : "", typeof r.trabajaEnArea === "boolean" ? r.trabajaEnArea : ""]
        .concat(arr(r.satisfaccion, nSat), [sat == null ? "" : Math.round(sat * 100) / 100])
        .concat([fmtFecha(r.inicio), fmtFecha(r.fin), duracionSeg(r)], chasideCols(r))
        .concat(calidadCols(r), [entraAlModelo(r), fmtFecha(r.completado)]);
    });
    descargarCsv("adultos-chaside", cab, filas);
  }

  function descargarPdf(id) {
    var r = escolares.filter(function (x) { return x.id === id; })[0];
    if (!r || !r.resultado) return;
    ResultadoPDF.generar({ codigo: r.id, fecha: aFecha(r.fin) || new Date(), clave: r.resultado.clave || {}, modelo: r.resultado.modelo || null, explicacion: r.resultado.explicacion || [] });
  }

  // ---------- eventos ----------
  root.addEventListener("click", function (e) {
    var el = e.target.closest("button");
    if (!el) return;
    var v;
    if (el.id === "admin-logout") auth().signOut();
    else if (el.id === "admin-refresh") cargar();
    else if (el.id === "aula-crear") crearAula();
    else if (el.id === "adultos-toggle") toggleAdultos();
    else if ((v = el.getAttribute("data-tab"))) { tab = v; mensaje = ""; renderDashboard(); }
    else if ((v = el.getAttribute("data-aula-toggle"))) toggleAula(v);
    else if ((v = el.getAttribute("data-copiar"))) copiar(v);
    else if ((v = el.getAttribute("data-excluir"))) toggleExcluir(v.split("|")[0], v.split("|")[1]);
    else if ((v = el.getAttribute("data-borrar"))) borrar(v.split("|")[0], v.split("|")[1]);
    else if ((v = el.getAttribute("data-pdf"))) descargarPdf(v);
    else if (el.getAttribute("data-csv") === "escolares") csvEscolares();
    else if (el.getAttribute("data-csv") === "adultos") csvAdultos();
  });

  function leer(nombre) {
    return db().collection(nombre).get().then(function (snap) {
      return snap.docs.map(function (d) { return Object.assign({}, d.data(), { id: d.id }); })
        .sort(function (a, b) { return b.id < a.id ? -1 : b.id > a.id ? 1 : 0; });
    });
  }

  function cargar() {
    cargando = true;
    errorCarga = "";
    renderDashboard();
    Promise.all([
      leer("aulas"), leer("escolares"), leer("adultos"),
      db().collection("contadores").doc("estado").get(),
      fetch(CFG.modeloUrl, { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).then(function (res) {
      aulas = res[0].sort(function (a, b) { return (aFecha(b.creada) || 0) - (aFecha(a.creada) || 0); });
      escolares = res[1];
      adultos = res[2];
      estado = res[3].exists ? Object.assign({ adultosAbierto: true }, res[3].data()) : { adultosAbierto: true };
      modelo = res[4];
      cargando = false;
      renderDashboard();
    }).catch(function (err) {
      cargando = false;
      errorCarga = err && err.code === "permission-denied"
        ? "Esta cuenta no tiene permiso para leer los datos. Solo " + CFG.correoAdmin + " está autorizada."
        : "Error al cargar: " + (err.message || err);
      renderDashboard();
    });
  }

  // ---------- inicio ----------
  root.innerHTML = '<div class="page"><p class="subtitle" style="margin-top:60px">Cargando…</p></div>';
  auth().onAuthStateChanged(function (user) {
    if (!user) { renderLogin(); return; }
    if ((user.email || "").toLowerCase() !== CFG.correoAdmin) {
      loginError = "La cuenta " + user.email + " no está autorizada para este panel.";
      auth().signOut();
      return;
    }
    cargar();
  });
})();
