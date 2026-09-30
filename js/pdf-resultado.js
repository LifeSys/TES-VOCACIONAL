// PDF con el resultado de un participante (lo usan la pantalla final del test y el panel admin).
// Requiere jsPDF (window.jspdf), CHASIDE_DATA y Chaside (js/chaside.js).
const ResultadoPDF = (function () {
  "use strict";

  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function fmtFecha(d) {
    return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear() + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  // r = { codigo, fecha: Date, clave: {C:..}, modelo: {C:p,..., v:"1.0"} | null, explicacion: [ids] }
  function generar(r) {
    if (!window.jspdf) { alert("No se pudo generar el PDF (revisa tu conexión a internet y vuelve a intentarlo)."); return; }
    var doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
    var W = 210, M = 16, y;
    var INK = [17, 24, 39], MUTED = [100, 110, 130], LINE = [225, 229, 236];
    var MINT = [16, 163, 116], BLUE = [77, 142, 240], TRACK = [236, 240, 245], NAVY = [18, 26, 48];
    var NOM = Chaside.nombres;

    function ink(c) { doc.setTextColor(c[0], c[1], c[2]); }
    function font(estilo, tam, color) { doc.setFont("helvetica", estilo); doc.setFontSize(tam); ink(color); }
    function espacio(h) { if (y + h > 280) { doc.addPage(); y = 20; } }
    function titulo(t) {
      espacio(14);
      font("bold", 12, INK); doc.text(t, M, y);
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.3); doc.line(M, y + 2.5, W - M, y + 2.5);
      y += 9;
    }
    function barra(x, yy, w, frac, color) {
      doc.setFillColor(TRACK[0], TRACK[1], TRACK[2]); doc.roundedRect(x, yy, w, 3, 1.5, 1.5, "F");
      if (frac > 0) { doc.setFillColor(color[0], color[1], color[2]); doc.roundedRect(x, yy, Math.max(3, w * Math.min(frac, 1)), 3, 1.5, 1.5, "F"); }
    }
    function parrafo(texto, tam, color, ancho, x) {
      font("normal", tam, color);
      var lineas = doc.splitTextToSize(texto, ancho || W - 2 * M);
      espacio(lineas.length * tam * 0.45);
      doc.text(lineas, x || M, y);
      y += lineas.length * tam * 0.45 + 2;
    }

    // encabezado
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]); doc.rect(0, 0, W, 34, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text("OrientaIA", M, 16);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.text("Resultado del Test de Orientación Vocacional CHASIDE", M, 25);

    y = 46;
    font("normal", 9, MUTED); doc.text("CÓDIGO DE ACCESO", M, y); doc.text("FECHA Y HORA", 90, y);
    y += 6;
    font("bold", 12, INK); doc.text(String(r.codigo), M, y); doc.text(fmtFecha(r.fecha), 90, y);
    y += 12;

    var probs = null;
    if (r.modelo) {
      probs = {};
      Object.keys(r.modelo).forEach(function (k) { if (k !== "v") probs[k] = r.modelo[k]; });
    }

    if (probs) {
      titulo("Áreas más afines según el modelo de inteligencia artificial");
      parrafo("Probabilidad calculada por un modelo de aprendizaje automático (regresión logística, versión " + r.modelo.v + ") a partir de tus 98 respuestas.", 8.5, MUTED);
      y += 2;
      Object.keys(probs).sort(function (a, b) { return probs[b] - probs[a]; }).slice(0, 3).forEach(function (a, i) {
        espacio(20);
        font("bold", 11, INK); doc.text((i + 1) + ". " + NOM[a], M, y);
        barra(120, y - 2.6, 50, probs[a], MINT);
        font("bold", 10, INK); doc.text(Math.round(probs[a] * 100) + "%", W - M, y, { align: "right" });
        y += 5.5;
        parrafo("Carreras: " + Chaside.carrerasDeArea(a).join(", ") + ".", 8.5, MUTED, W - 2 * M - 6, M + 5);
        y += 2;
      });
      if (r.explicacion && r.explicacion.length) {
        y += 2;
        titulo("Preguntas que más pesaron en tu resultado");
        r.explicacion.forEach(function (id) {
          var q = Chaside.pregunta(id);
          if (q) parrafo("• " + q.text + "  (respondiste Sí)", 9.5, INK);
        });
        y += 3;
      }
    }

    titulo("Puntaje clásico por área (clave CHASIDE, máximo " + Chaside.MAX_POR_AREA + ")");
    var top = Chaside.topClave(r.clave, 2);
    Chaside.rankingClave(r.clave).forEach(function (row) {
      espacio(8);
      var destacado = top.indexOf(row.area) !== -1;
      font(destacado ? "bold" : "normal", 10, INK);
      doc.text(NOM[row.area], M, y);
      barra(100, y - 2.6, 62, row.puntaje / Chaside.MAX_POR_AREA, destacado ? MINT : BLUE);
      doc.text(row.puntaje + "/" + Chaside.MAX_POR_AREA, W - M, y, { align: "right" });
      y += 7.5;
    });
    y += 5;

    var aviso = doc.splitTextToSize("Este resultado es una sugerencia orientativa y no reemplaza una evaluación vocacional profesional. Coméntalo con tu psicólogo o tutor escolar para tomar una decisión informada.", W - 2 * M - 10);
    var alto = aviso.length * 4.5 + 8;
    espacio(alto);
    doc.setFillColor(246, 248, 251); doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.roundedRect(M, y, W - 2 * M, alto, 2, 2, "FD");
    font("normal", 9, MUTED); doc.text(aviso, M + 5, y + 6.5);

    var paginas = doc.getNumberOfPages();
    for (var p = 1; p <= paginas; p++) {
      doc.setPage(p);
      font("normal", 8, MUTED);
      doc.text("OrientaIA · Test CHASIDE · Código " + r.codigo + " · " + fmtFecha(r.fecha), M, 290);
      doc.text("Página " + p + " de " + paginas, W - M, 290, { align: "right" });
    }
    doc.save("resultado-chaside-" + String(r.codigo).replace(/[^A-Za-z0-9_-]+/g, "_") + ".pdf");
  }

  return { generar: generar, fmtFecha: fmtFecha };
})();
