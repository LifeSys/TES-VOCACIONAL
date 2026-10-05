# -*- coding: utf-8 -*-
"""
Entrenamiento del modelo de ML del sistema (sección "Módulo de machine learning").

  Entrada (X): las 98 respuestas del CHASIDE (1 = Sí, 0 = No)  -> columnas r_1 .. r_98
  Etiqueta (y): área CHASIDE de la carrera (C, H, A, S, I, D, E) -> columna area
  Casos que entran: universitarios de 3.er ciclo a más con satisfacción promedio >= 4;
                    profesionales con satisfacción >= 4 y que trabajan en su área; en ambos casos
                    test no sospechoso y no excluido en el panel.
  Mínimo: 50 casos por área; un área con menos queda fuera del modelo (solo clave clásica).
  Modelos comparados: clave CHASIDE (línea base), regresión logística, Naive Bayes,
                      Random Forest, SVM. Validación: 5 pliegues estratificados, exactitud top-3
                      (y top-1) y F1 macro.
  Modelo desplegado: regresión logística -> modelo.json (la web lo lee con js/ml-engine.js).

Uso (Google Colab o local, con pandas, numpy y scikit-learn):
  python entrenar_modelo.py adultos-chaside-AAAA-MM-DD.csv --version 1.0
      CSV de adultos exportado del panel (pestaña Adultos). Escribe modelo.json y el reporte.
  python entrenar_modelo.py --sintetico --version 0.1-sintetico
      Genera datos SINTÉTICOS solo para probar el sistema (modo Demo). No sirve para la tesis.

Los escolares (EXP y CTL) nunca se usan para entrenar.
"""
import argparse
import datetime as dt
import json
import os
import re
import sys

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score
from sklearn.model_selection import StratifiedKFold
from sklearn.naive_bayes import BernoulliNB
from sklearn.svm import SVC

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, ".."))
AREAS = ["C", "H", "A", "S", "I", "D", "E"]
N_ITEMS = 98
SEMILLA = 2026
COLS = [f"r_{i}" for i in range(1, N_ITEMS + 1)]


def cargar_banco():
    """Área de cada ítem (1..98) según la clave CHASIDE de js/data.js, si está disponible."""
    ruta = os.path.join(RAIZ, "js", "data.js")
    if os.path.exists(ruta):
        raw = open(ruta, encoding="utf-8").read()
        data = json.loads(raw[raw.index("{"): raw.rindex("}") + 1])
        return {q["id"]: q["area"] for q in data["questions"]}
    # Clave CHASIDE estándar (para usar el script solo, p. ej. en Colab sin el repositorio)
    clave = {
        "C": [1, 12, 20, 53, 64, 71, 78, 85, 91, 98, 2, 15, 46, 51],
        "H": [9, 25, 34, 41, 56, 67, 74, 80, 89, 95, 30, 63, 72, 86],
        "A": [3, 11, 21, 28, 36, 45, 50, 57, 81, 96, 22, 39, 76, 82],
        "S": [8, 16, 23, 33, 44, 52, 62, 70, 87, 92, 4, 29, 40, 69],
        "I": [6, 19, 27, 38, 47, 54, 60, 75, 83, 97, 10, 26, 59, 90],
        "D": [5, 14, 24, 31, 37, 48, 58, 65, 73, 84, 13, 18, 43, 66],
        "E": [17, 32, 35, 42, 49, 61, 68, 77, 88, 93, 7, 55, 79, 94],
    }
    return {i: a for a, items in clave.items() for i in items}


def es_si(col):
    """1 / 1.0 / True / "true" -> True (Excel y pandas pueden cambiar el formato al guardar)."""
    num = pd.to_numeric(col, errors="coerce")
    return (num == 1) | col.astype(str).str.strip().str.lower().isin(["true", "si", "sí"])


def datos_reales(csv, minimo_sat, ciclo_minimo):
    df = pd.read_csv(csv, encoding="utf-8-sig")
    necesarias = COLS + ["tipo", "area", "sospechoso", "excluido", "sat_promedio", "ciclo", "trabaja_en_area"]
    faltan = [c for c in necesarias if c not in df.columns]
    if faltan:
        sys.exit(f"Al CSV le faltan columnas: {faltan[:6]}... ¿Es el CSV de la pestaña Adultos del panel?")
    df = df[df["area"].isin(AREAS)]
    limpio = ~es_si(df["sospechoso"]) & ~es_si(df["excluido"])
    sat_ok = pd.to_numeric(df["sat_promedio"], errors="coerce") >= minimo_sat
    univ = (df["tipo"] == "universitario") & (pd.to_numeric(df["ciclo"], errors="coerce") >= ciclo_minimo)
    prof = (df["tipo"] == "profesional") & es_si(df["trabaja_en_area"])
    df = df[limpio & sat_ok & (univ | prof)].dropna(subset=COLS)
    X = df[COLS].astype(int).to_numpy()
    y = df["area"].to_numpy()
    print(f"Registros del CSV que cumplen los criterios de entrada: {len(df)} "
          f"(universitarios {int((df['tipo'] == 'universitario').sum())}, profesionales {int((df['tipo'] == 'profesional').sum())})")
    return X, y


def datos_sinteticos(area_item, por_area=60):
    """Estudiantes simulados: responden Sí con más probabilidad a los ítems de su área."""
    rng = np.random.default_rng(SEMILLA)
    areas_item = np.array([area_item[i] for i in range(1, N_ITEMS + 1)])
    X, y = [], []
    for a in AREAS:
        for _ in range(por_area):
            secundaria = rng.choice([b for b in AREAS if b != a])
            base = rng.normal(0.30, 0.06)
            p = np.full(N_ITEMS, base)
            p[areas_item == secundaria] = base + 0.20
            p[areas_item == a] = base + 0.42
            p = np.clip(p + rng.normal(0, 0.08, N_ITEMS), 0.03, 0.97)
            X.append((rng.random(N_ITEMS) < p).astype(int))
            y.append(a)
    return np.array(X), np.array(y)


def ranking_clave(X, area_item, clases, rng):
    """Línea base: ordenar las áreas por puntaje clásico (empates al azar, sin sesgo de orden)."""
    idx = {a: [i - 1 for i in range(1, N_ITEMS + 1) if area_item[i] == a] for a in clases}
    puntajes = np.stack([X[:, idx[a]].sum(axis=1) for a in clases], axis=1).astype(float)
    puntajes += rng.random(puntajes.shape) * 1e-3
    return np.argsort(-puntajes, axis=1)


def topk(orden, y_idx, k):
    return float(np.mean([y_idx[i] in orden[i, :k] for i in range(len(y_idx))]))


def modelos():
    return {
        "Regresión logística": lambda: LogisticRegression(C=0.5, max_iter=3000),
        "Naive Bayes": lambda: BernoulliNB(),
        "Random Forest": lambda: RandomForestClassifier(n_estimators=300, random_state=SEMILLA),
        # SVM con probabilidades calibradas (necesarias para ordenar las áreas y medir top-3)
        "SVM": lambda: CalibratedClassifierCV(SVC(kernel="rbf", C=1.0), ensemble=False),
    }


def comparar(X, y, clases, area_item):
    y_idx = np.array([clases.index(v) for v in y])
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEMILLA)
    rng = np.random.default_rng(SEMILLA)
    res = {"Clave CHASIDE (línea base)": []}
    res.update({n: [] for n in modelos()})
    for tr, te in skf.split(X, y_idx):
        orden = ranking_clave(X[te], area_item, clases, rng)
        res["Clave CHASIDE (línea base)"].append((topk(orden, y_idx[te], 3), topk(orden, y_idx[te], 1),
                                                  f1_score(y_idx[te], orden[:, 0], average="macro")))
        for nombre, fabrica in modelos().items():
            m = fabrica().fit(X[tr], y_idx[tr])
            proba = m.predict_proba(X[te])
            orden = np.argsort(-proba, axis=1)
            res[nombre].append((topk(orden, y_idx[te], 3), topk(orden, y_idx[te], 1),
                                f1_score(y_idx[te], orden[:, 0], average="macro")))
    return {n: {"top3": float(np.mean([v[0] for v in vals])), "top1": float(np.mean([v[1] for v in vals])),
                "f1_macro": float(np.mean([v[2] for v in vals]))} for n, vals in res.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv", nargs="?", help="CSV de adultos exportado del panel")
    ap.add_argument("--sintetico", action="store_true", help="usar datos sintéticos (solo pruebas / demo)")
    ap.add_argument("--version", required=True, help='versión del modelo, p. ej. "1.0"')
    ap.add_argument("--minimo", type=int, default=50, help="casos mínimos por área (defecto 50)")
    ap.add_argument("--satisfaccion", type=float, default=4.0, help="satisfacción promedio mínima (defecto 4)")
    ap.add_argument("--ciclo", type=int, default=3, help="ciclo mínimo de los universitarios (defecto 3)")
    ap.add_argument("--salida", default=os.path.join(RAIZ, "modelo.json"), help="ruta de modelo.json")
    args = ap.parse_args()
    if not args.csv and not args.sintetico:
        ap.error("indica el CSV de entrenamiento o --sintetico")

    area_item = cargar_banco()
    if args.sintetico:
        X, y = datos_sinteticos(area_item)
        origen = "sinteticos"
    else:
        X, y = datos_reales(args.csv, args.satisfaccion, args.ciclo)
        origen = "reales"

    conteo = {a: int((y == a).sum()) for a in AREAS}
    clases = [a for a in AREAS if conteo[a] >= args.minimo]
    fuera = [a for a in AREAS if a not in clases]
    print("Casos por área:", conteo)
    if fuera:
        print(f"Áreas con menos de {args.minimo} casos (quedan fuera del modelo, solo clave clásica): {fuera}")
    if len(clases) < 2:
        sys.exit("Se necesitan al menos 2 áreas con el mínimo de casos para entrenar.")
    mask = np.isin(y, clases)
    X, y = X[mask], y[mask]

    print("\nComparando modelos con validación cruzada estratificada de 5 pliegues...")
    metricas = comparar(X, y, clases, area_item)
    filas = [f"| {n} | {m['top3'] * 100:.1f}% | {m['top1'] * 100:.1f}% | {m['f1_macro']:.3f} |" for n, m in metricas.items()]
    tabla = "| Modelo | Exactitud top-3 | Exactitud top-1 | F1 macro |\n|---|---|---|---|\n" + "\n".join(filas)
    print(tabla)

    final = LogisticRegression(C=0.5, max_iter=3000).fit(X, np.array([clases.index(v) for v in y]))
    modelo = {
        "version": args.version,
        "algoritmo": "Regresión logística multinomial",
        "datos": origen,
        "entrenado": dt.date.today().isoformat(),
        "casos": int(len(y)),
        "casosPorArea": {a: conteo[a] for a in clases},
        "areasSinModelo": fuera,
        "areas": clases,
        "items": list(range(1, N_ITEMS + 1)),
        "coef": [[round(float(v), 6) for v in fila] for fila in final.coef_],
        "intercept": [round(float(v), 6) for v in final.intercept_],
        "metricas": metricas,
    }
    with open(args.salida, "w", encoding="utf-8") as f:
        json.dump(modelo, f, ensure_ascii=False, separators=(",", ":"))

    # Casos de verificación para comprobar que el navegador calcula lo mismo (ml/verificar_js.js)
    rng = np.random.default_rng(SEMILLA)
    muestra = X[rng.choice(len(X), size=min(40, len(X)), replace=False)]
    proba = final.predict_proba(muestra)
    casos = [{"respuestas": [int(v) for v in fila], "probs": {clases[k]: float(p[k]) for k in range(len(clases))}} for fila, p in zip(muestra, proba)]
    os.makedirs(os.path.join(AQUI, "reportes"), exist_ok=True)
    with open(os.path.join(AQUI, "reportes", "casos_verificacion.json"), "w", encoding="utf-8") as f:
        json.dump(casos, f)

    reporte = (
        f"# Modelo {args.version}\n\n"
        f"- Datos: **{origen}** · {len(y)} casos · entrenado el {modelo['entrenado']}\n"
        f"- Casos por área: {conteo}\n"
        f"- Áreas fuera del modelo (menos de {args.minimo} casos): {fuera or 'ninguna'}\n\n"
        f"## Comparación de modelos (validación cruzada estratificada de 5 pliegues)\n\n{tabla}\n\n"
        f"Modelo desplegado: regresión logística (permite explicar el resultado con los ítems que más pesan).\n"
    )
    if origen == "sinteticos":
        reporte += "\n> **Datos sintéticos**: este modelo solo sirve para probar el sistema (modo Demo). No usar para la tesis.\n"
    with open(os.path.join(AQUI, "reportes", "comparacion_modelos.md"), "w", encoding="utf-8") as f:
        f.write(reporte)
    print(f"\nListo: {args.salida} (versión {args.version}) y ml/reportes/comparacion_modelos.md")


if __name__ == "__main__":
    main()
