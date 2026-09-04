(function () {
  "use strict";

  var root = document.getElementById("admin-app");
  var expanded = {}; // docId -> bool
  var results = [];
  var loading = false;
  var loginError = "";

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function fmtDate(ts) {
    if (!ts || !ts.toDate) return "—";
    var d = ts.toDate();
    return d.toLocaleDateString("es-PE") + " " + d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  }

  function auth() { return firebase.auth(); }
  function db() { return firebase.firestore(); }

  // ---------- login screen ----------
  function renderLogin() {
    root.innerHTML =
      '<div class="page">' +
      '<div class="top-row"><img class="brand-mark-img" src="img/logo.png" width="34" height="34" alt="Logo"><div class="brand-name">Panel Admin</div></div>' +
      '<div class="divider"></div>' +
      '<div class="card card-narrow">' +
      '<h1 class="title" style="font-size:22px">Acceso administrador</h1>' +
      '<p class="subtitle">Ingresa con tu cuenta autorizada para ver los resultados registrados.</p>' +
      '<div class="field-block" style="margin-top:22px">' +
      '<label class="field-label">Correo</label>' +
      '<input id="admin-email" class="text-input" type="email" placeholder="tu@correo.com" autocomplete="username" />' +
      '</div>' +
      '<div class="field-block" style="margin-top:14px">' +
      '<label class="field-label">Contraseña</label>' +
      '<input id="admin-pass" class="text-input" type="password" placeholder="••••••••" autocomplete="current-password" />' +
      '</div>' +
      (loginError ? '<div class="field-error" role="alert" style="margin-top:10px">' + esc(loginError) + "</div>" : "") +
      '<button class="btn-primary" id="admin-login-btn" style="margin-top:20px">Ingresar</button>' +
      "</div>" +
      "</div>";

    document.getElementById("admin-login-btn").addEventListener("click", doLogin);
    document.getElementById("admin-pass").addEventListener("keydown", function (e) { if (e.key === "Enter") doLogin(); });
  }

  var LOGIN_ERROR_MESSAGES = {
    "auth/unauthorized-domain": "Este dominio no está autorizado en Firebase (Authentication → Settings → Authorized domains).",
    "auth/invalid-api-key": "La clave de Firebase (js/firebase-config.js) es inválida o no corresponde a este proyecto.",
    "auth/operation-not-allowed": "El método Correo/Contraseña no está habilitado (Authentication → Sign-in method).",
    "auth/user-not-found": "No existe un usuario con ese correo.",
    "auth/wrong-password": "Contraseña incorrecta.",
    "auth/invalid-email": "El correo no tiene un formato válido.",
    "auth/too-many-requests": "Demasiados intentos fallidos. Espera un momento y vuelve a intentar.",
    "auth/network-request-failed": "Sin conexión a internet o Firebase no responde."
  };

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

  // ---------- dashboard ----------
  function renderDashboard() {
    var rows = results.map(renderRow).join("");
    root.innerHTML =
      '<div class="page">' +
      '<div class="top-row">' +
      '<img class="brand-mark-img" src="img/logo.png" width="34" height="34" alt="Logo">' +
      '<div class="brand-name">Vocacional Life IA</div>' +
      '<div class="top-row-right"><span class="q-tag">PANEL ADMIN</span></div>' +
      "</div>" +
      '<div class="divider"></div>' +
      '<div class="admin-head">' +
      '<div><p class="eyebrow" style="text-align:left">Panel del administrador</p><h1 class="title" style="text-align:left;font-size:26px">Resultados registrados</h1></div>' +
      '<button class="btn-secondary" style="width:auto;padding:0 20px" id="admin-logout">Cerrar sesión</button>' +
      "</div>" +
      '<div class="admin-toolbar">' +
      "<span>" + results.length + " resultados (últimos 200)</span>" +
      '<button class="footer-link-btn" id="admin-refresh" style="margin-top:0;color:var(--mint)">↻ Actualizar</button>' +
      "</div>" +
      '<div class="admin-table-wrap">' +
      '<table class="admin-table">' +
      "<thead><tr><th>Fecha</th><th>Código</th><th>1ª área</th><th>2ª área</th><th>3ª área</th><th>PDF</th></tr></thead>" +
      "<tbody>" + (rows || '<tr><td colspan="6" class="admin-empty">' + (loading ? "Cargando…" : "Todavía no hay resultados registrados.") + "</td></tr>") + "</tbody>" +
      "</table>" +
      "</div>" +
      "</div>";

    document.getElementById("admin-logout").addEventListener("click", function () { auth().signOut(); });
    document.getElementById("admin-refresh").addEventListener("click", loadResults);
    root.querySelectorAll("[data-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-toggle");
        expanded[id] = !expanded[id];
        renderDashboard();
      });
    });
    root.querySelectorAll("[data-pdf]").forEach(function (btn) {
      btn.addEventListener("click", function () { downloadPdf(btn.getAttribute("data-pdf")); });
    });
  }

  function renderRow(r) {
    var top3 = r.scores.slice().sort(function (a, b) { return b.score - a.score; }).slice(0, 3);
    var cell = function (s) { return s ? esc(s.name) + "<br><span class=\"admin-pct\">" + s.pct + "%</span>" : "—"; };
    var isOpen = !!expanded[r.id];
    var expandRow = "";
    if (isOpen) {
      var pills = r.scores.slice().sort(function (a, b) { return b.score - a.score; }).map(function (s) {
        return '<span class="area-pill">' + esc(s.name) + " · " + s.pct + "%</span>";
      }).join("");
      expandRow = '<tr class="admin-expand-row"><td colspan="6"><div class="area-pill-row">' + pills + "</div></td></tr>";
    }
    return (
      "<tr>" +
      "<td>" + fmtDate(r.createdAt) + "</td>" +
      "<td><b>" + esc(r.code) + "</b></td>" +
      "<td>" + cell(top3[0]) + "</td>" +
      "<td>" + cell(top3[1]) + "</td>" +
      "<td>" + cell(top3[2]) + "</td>" +
      '<td><button class="footer-link-btn" style="margin-top:0" data-pdf="' + r.id + '">Descargar</button></td>' +
      "</tr>" +
      '<tr><td colspan="6" style="padding:0;border:none"><button class="footer-link-btn" style="margin-top:6px;font-size:12px" data-toggle="' + r.id + '">' + (isOpen ? "Ocultar" : "Ver todo") + "</button></td></tr>" +
      expandRow
    );
  }

  function downloadPdf(id) {
    var r = results.filter(function (x) { return x.id === id; })[0];
    if (!r || !window.jspdf) return;
    var doc = new window.jspdf.jsPDF();
    var y = 20;
    doc.setFontSize(16);
    doc.text("Resultado — Test Vocacional CHASIDE", 14, y); y += 8;
    doc.setFontSize(10);
    doc.text("Código: " + r.code, 14, y); y += 6;
    doc.text("Fecha: " + fmtDate(r.createdAt), 14, y); y += 10;
    doc.setFontSize(12);
    doc.text("Áreas (de mayor a menor puntaje):", 14, y); y += 7;
    doc.setFontSize(10);
    r.scores.slice().sort(function (a, b) { return b.score - a.score; }).forEach(function (s) {
      doc.text("- " + s.name + ": " + s.score + "/14 (" + s.pct + "%)", 16, y); y += 6;
    });
    y += 4;
    doc.setFontSize(12);
    doc.text("Carreras afines:", 14, y); y += 7;
    doc.setFontSize(10);
    (r.careers || []).forEach(function (c) {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text("- " + c, 16, y); y += 6;
    });
    doc.save("resultado-" + r.code + ".pdf");
  }

  function loadResults() {
    loading = true;
    renderDashboard();
    db().collection("resultados").orderBy("createdAt", "desc").limit(200).get()
      .then(function (snap) {
        results = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        loading = false;
        renderDashboard();
      })
      .catch(function (err) {
        loading = false;
        root.innerHTML = '<div class="page"><div class="card card-narrow"><p class="field-error">Error al cargar resultados: ' + esc(err.message) + "</p></div></div>";
      });
  }

  // ---------- boot ----------
  root.innerHTML = '<div class="page"><p class="subtitle" style="margin-top:60px">Cargando…</p></div>';
  auth().onAuthStateChanged(function (user) {
    if (user) {
      loadResults();
    } else {
      renderLogin();
    }
  });
})();
