# -*- coding: utf-8 -*-
"""
Entrenamiento del modelo de ML del sistema (sección "Módulo de machine learning").

  Entrada (X): las 98 respuestas del CHASIDE (1 = Sí, 0 = No)  -> columnas r_1 .. r_98
  Etiqueta (y): área CHASIDE de la carrera (C, H, A, S, I, D, E) -> columna area
  Casos que entran: universitarios de 3.er ciclo a más con satisfacción promedio >= 4;
                    profesionales con satisfacción >= 4 y que trabajan en su área; en ambos casos
                    test no sospechoso y no excluido en el panel.
  Mínimo: 15 casos por área; un área con menos queda fuera del modelo (solo clave clásica).
  Modelos comparados: clave CHASIDE (línea base), regresión logística, Naive Bayes,
                      Random Forest, SVM, todos con ponderación de clases (clases balanceadas).
  Validación: cruzada ANIDADA. 5 pliegues externos estratificados miden el desempeño; dentro de
              cada uno, 3 pliegues internos eligen los hiperparámetros (p. ej. C de la regresión)
              sin ver los datos de prueba. Métricas: exactitud top-3 (y top-1) y F1 macro.
  Referencias: azar (k / número de áreas: 42,9 % en top-3 con 7 áreas) y prueba de McNemar
               entre el modelo desplegado y la clave sobre los mismos casos.
  Clave CHASIDE: las áreas empatadas comparten puesto (como en la web); un acierto top-k es que
                 el área real tenga puesto <= k. No se desempata al azar.
  Modelo desplegado: regresión logística -> modelo.json, con su huella SHA-256 y la fecha.

Uso (Google Colab o local, con pandas, numpy y scikit-learn):
  python entrenar_modelo.py adultos-chaside-AAAA-MM-DD.csv --version 1.0
      CSV de adultos exportado del panel (pestaña Adultos). Escribe modelo.json y el reporte.
  python entrenar_modelo.py --sintetico --version 0.2-sintetico
      Genera datos SINTÉTICOS solo para probar el sistema (modo Demo). No sirve para la tesis.

Los escolares (EXP y CTL) nunca se usan para entrenar.
"""
import argparse
import datetime as dt
import hashlib
import json
import math
import os
import sys

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, make_scorer, top_k_accuracy_score
from sklearn.model_selection import GridSearchCV, StratifiedKFold
from sklearn.naive_bayes import BernoulliNB
from sklearn.svm import SVC

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, ".."))
AREAS = ["C", "H", "A", "S", "I", "D", "E"]
N_ITEMS = 98
SEMILLA = 2026
COLS = [f"r_{i}" for i in range(1, N_ITEMS + 1)]
PLIEGUES_EXTERNOS = 5
PLIEGUES_INTERNOS = 3
MODELO_DESPLEGADO = "Regresión logística"
CLAVE = "Clave CHASIDE (línea base)"
AZAR = "Azar (referencia)"


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


def sha256_archivo(ruta):
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for bloque in iter(lambda: f.read(1 << 16), b""):
            h.update(bloque)
    return h.hexdigest()


def huella_modelo(modelo):
    """SHA-256 de lo que determina las predicciones: versión, áreas, ítems, coeficientes e interceptos."""
    nucleo = {k: modelo[k] for k in ("version", "areas", "items", "coef", "intercept")}
    texto = json.dumps(nucleo, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


# ---------- clave CHASIDE con empates ----------
def puestos_clave(X, area_item, clases):
    """Puesto de cada área por puntaje clásico; las empatadas comparten puesto (1 + áreas con más puntaje)."""
    idx = {a: [i - 1 for i in range(1, N_ITEMS + 1) if area_item[i] == a] for a in clases}
    puntajes = np.stack([X[:, idx[a]].sum(axis=1) for a in clases], axis=1)
    return 1 + (puntajes[:, None, :] > puntajes[:, :, None]).sum(axis=2)


def evaluar_clave(X, y_idx, area_item, clases):
    puestos = puestos_clave(X, area_item, clases)
    filas = np.arange(len(y_idx))
    puesto_real = puestos[filas, y_idx]
    aciertos = {k: puesto_real <= k for k in (1, 3)}
    # F1 necesita UNA etiqueta: si el área real está entre las empatadas en el primer puesto cuenta
    # como acierto; si no, la predicción es la primera área de puesto 1 (siempre es un error).
    primera = np.argmax(puestos == 1, axis=1)
    pred = np.where(aciertos[1], y_idx, primera)
    tam = {k: float(np.mean((puestos <= k).sum(axis=1))) for k in (1, 3)}
    return aciertos, pred, tam


# ---------- modelos de ML ----------
def top3_scorer(n_clases):
    return make_scorer(top_k_accuracy_score, k=min(3, n_clases - 1), labels=np.arange(n_clases),
                       response_method="predict_proba")


def modelos():
    """(estimador, rejilla de hiperparámetros). Todos ponderan las clases para que pesen igual."""
    return {
        MODELO_DESPLEGADO: (LogisticRegression(max_iter=5000, class_weight="balanced"),
                            {"C": [0.01, 0.05, 0.1, 0.5, 1.0, 5.0]}),
        # Naive Bayes no acepta class_weight: fit_prior=False usa probabilidades a priori iguales.
        "Naive Bayes": (BernoulliNB(fit_prior=False), {"alpha": [0.1, 0.5, 1.0, 2.0]}),
        "Random Forest": (RandomForestClassifier(n_estimators=300, class_weight="balanced", random_state=SEMILLA),
                          {"max_depth": [None, 10], "min_samples_leaf": [1, 3]}),
        # SVM con probabilidades calibradas (necesarias para ordenar las áreas y medir top-3)
        "SVM": (CalibratedClassifierCV(SVC(kernel="rbf", class_weight="balanced"), ensemble=False),
                {"estimator__C": [0.5, 1.0, 5.0], "estimator__gamma": ["scale", 0.01]}),
    }


def busqueda(estimador, rejilla, n_clases):
    interno = StratifiedKFold(n_splits=PLIEGUES_INTERNOS, shuffle=True, random_state=SEMILLA)
    return GridSearchCV(clone(estimador), rejilla, cv=interno, scoring=top3_scorer(n_clases), n_jobs=-1)


def mcnemar(acierta_a, acierta_b):
    """McNemar exacta (binomial bilateral) y chi-cuadrado con corrección de continuidad."""
    b = int(np.sum(acierta_a & ~acierta_b))
    c = int(np.sum(~acierta_a & acierta_b))
    n = b + c
    if n == 0:
        return {"b": b, "c": c, "chi2": 0.0, "p_exacta": 1.0}
    p = min(1.0, 2 * sum(math.comb(n, i) for i in range(min(b, c) + 1)) / 2 ** n)
    chi2 = (abs(b - c) - 1) ** 2 / n
    return {"b": b, "c": c, "chi2": round(chi2, 4), "p_exacta": p}


def comparar(X, y, clases, area_item):
    K = len(clases)
    y_idx = np.array([clases.index(v) for v in y])
    externo = StratifiedKFold(n_splits=PLIEGUES_EXTERNOS, shuffle=True, random_state=SEMILLA)
    pliegues = list(externo.split(X, y_idx))

    metricas, aciertos, elegidos = {}, {}, {}
    # La clave no se entrena: se evalúa en los mismos pliegues para promediar igual que los modelos.
    ac_clave, pred_clave, tam_clave = evaluar_clave(X, y_idx, area_item, clases)
    metricas[CLAVE] = {
        "top3": float(np.mean([ac_clave[3][te].mean() for _, te in pliegues])),
        "top1": float(np.mean([ac_clave[1][te].mean() for _, te in pliegues])),
        "f1_macro": float(np.mean([f1_score(y_idx[te], pred_clave[te], average="macro", labels=np.arange(K)) for _, te in pliegues])),
        "areas_en_top3": round(tam_clave[3], 2), "areas_en_top1": round(tam_clave[1], 2),
    }
    aciertos[CLAVE] = ac_clave

    for nombre, (estimador, rejilla) in modelos().items():
        orden = np.zeros((len(y_idx), K), dtype=int)
        vals, params = [], []
        for tr, te in pliegues:
            gs = busqueda(estimador, rejilla, K).fit(X[tr], y_idx[tr])
            o = np.argsort(-gs.predict_proba(X[te]), axis=1)
            orden[te] = o
            vals.append(((o[:, :3] == y_idx[te, None]).any(axis=1).mean(), (o[:, 0] == y_idx[te]).mean(),
                         f1_score(y_idx[te], o[:, 0], average="macro", labels=np.arange(K))))
            params.append(gs.best_params_)
        metricas[nombre] = {"top3": float(np.mean([v[0] for v in vals])), "top1": float(np.mean([v[1] for v in vals])),
                            "f1_macro": float(np.mean([v[2] for v in vals]))}
        aciertos[nombre] = {3: (orden[:, :3] == y_idx[:, None]).any(axis=1), 1: orden[:, 0] == y_idx}
        elegidos[nombre] = params

    metricas[AZAR] = {"top3": min(3, K) / K, "top1": 1 / K, "f1_macro": None}
    prueba = {f"top{k}": mcnemar(aciertos[MODELO_DESPLEGADO][k], aciertos[CLAVE][k]) for k in (3, 1)}
    return metricas, prueba, elegidos


def pct(v):
    return "—" if v is None else f"{v * 100:.1f}%"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv", nargs="?", help="CSV de adultos exportado del panel")
    ap.add_argument("--sintetico", action="store_true", help="usar datos sintéticos (solo pruebas / demo)")
    ap.add_argument("--version", required=True, help='versión del modelo, p. ej. "1.0"')
    ap.add_argument("--minimo", type=int, default=15, help="casos mínimos por área (defecto 15)")
    ap.add_argument("--satisfaccion", type=float, default=4.0, help="satisfacción promedio mínima (defecto 4)")
    ap.add_argument("--ciclo", type=int, default=3, help="ciclo mínimo de los universitarios (defecto 3)")
    ap.add_argument("--salida", default=os.path.join(RAIZ, "modelo.json"), help="ruta de modelo.json")
    args = ap.parse_args()
    if not args.csv and not args.sintetico:
        ap.error("indica el CSV de entrenamiento o --sintetico")

    area_item = cargar_banco()
    datos_hash = None
    if args.sintetico:
        X, y = datos_sinteticos(area_item)
        origen = "sinteticos"
    else:
        X, y = datos_reales(args.csv, args.satisfaccion, args.ciclo)
        origen = "reales"
        datos_hash = sha256_archivo(args.csv)

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
    y_idx = np.array([clases.index(v) for v in y])

    print(f"\nComparando modelos con validación cruzada anidada ({PLIEGUES_EXTERNOS} pliegues externos, "
          f"{PLIEGUES_INTERNOS} internos)...")
    metricas, prueba, elegidos = comparar(X, y, clases, area_item)
    filas = [f"| {n} | {pct(m['top3'])} | {pct(m['top1'])} | {'—' if m['f1_macro'] is None else format(m['f1_macro'], '.3f')} |"
             for n, m in metricas.items()]
    tabla = "| Modelo | Exactitud top-3 | Exactitud top-1 | F1 macro |\n|---|---|---|---|\n" + "\n".join(filas)
    print(tabla)

    # Modelo final: los hiperparámetros se eligen con validación cruzada sobre todos los casos.
    estimador, rejilla = modelos()[MODELO_DESPLEGADO]
    gs = busqueda(estimador, rejilla, len(clases)).fit(X, y_idx)
    final = gs.best_estimator_
    ahora = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    modelo = {
        "version": args.version,
        "algoritmo": "Regresión logística multinomial",
        "datos": origen,
        "entrenado": ahora.date().isoformat(),
        "entrenadoEn": ahora.isoformat(),
        "casos": int(len(y)),
        "casosPorArea": {a: conteo[a] for a in clases},
        "areasSinModelo": fuera,
        "criterios": {"satisfaccionMinima": args.satisfaccion, "minimoPorArea": args.minimo, "cicloMinimo": args.ciclo},
        "hiperparametros": {"C": gs.best_params_["C"], "class_weight": "balanced"},
        "areas": clases,
        "items": list(range(1, N_ITEMS + 1)),
        "coef": [[round(float(v), 6) for v in fila] for fila in final.coef_],
        "intercept": [round(float(v), 6) for v in final.intercept_],
        "metricas": metricas,
        "mcnemar": prueba,
    }
    if datos_hash:
        modelo["datosHash"] = datos_hash
    modelo["hash"] = huella_modelo(modelo)
    with open(args.salida, "w", encoding="utf-8") as f:
        json.dump(modelo, f, ensure_ascii=False, separators=(",", ":"))

    # Casos de verificación para comprobar que el navegador calcula lo mismo (ml/verificar_js.js).
    # Se calculan con los coeficientes redondeados que quedan en modelo.json.
    rng = np.random.default_rng(SEMILLA)
    muestra = X[rng.choice(len(X), size=min(40, len(X)), replace=False)]
    W, b = np.array(modelo["coef"]), np.array(modelo["intercept"])
    z = muestra @ W.T + b
    proba = np.exp(z - z.max(axis=1, keepdims=True))
    proba /= proba.sum(axis=1, keepdims=True)
    casos = [{"respuestas": [int(v) for v in fila], "probs": {clases[k]: float(p[k]) for k in range(len(clases))}} for fila, p in zip(muestra, proba)]
    os.makedirs(os.path.join(AQUI, "reportes"), exist_ok=True)
    with open(os.path.join(AQUI, "reportes", "casos_verificacion.json"), "w", encoding="utf-8") as f:
        json.dump(casos, f)

    def linea_mcnemar(k):
        m = prueba[f"top{k}"]
        return (f"- **Top-{k}**: el modelo acierta y la clave no en **{m['b']}** casos; la clave acierta y el modelo no "
                f"en **{m['c']}**. χ² (con corrección de continuidad) = {m['chi2']}, p exacta = {m['p_exacta']:.4g}.")

    params = "\n".join(f"- {n}: " + "; ".join(json.dumps(p, ensure_ascii=False) for p in ps) for n, ps in elegidos.items())
    mc = metricas[CLAVE]
    reporte = (
        f"# Modelo {args.version}\n\n"
        f"- Datos: **{origen}** · {len(y)} casos · entrenado el {modelo['entrenadoEn']}\n"
        f"- Huella SHA-256 del modelo: `{modelo['hash']}`\n"
        + (f"- Huella SHA-256 del CSV de entrenamiento: `{datos_hash}`\n" if datos_hash else "")
        + f"- Criterios: satisfacción promedio ≥ {args.satisfaccion}, ciclo ≥ {args.ciclo}, mínimo {args.minimo} casos por área\n"
        f"- Casos por área: {conteo}\n"
        f"- Áreas fuera del modelo (menos de {args.minimo} casos): {fuera or 'ninguna'}\n\n"
        f"## Comparación de modelos (validación cruzada anidada)\n\n"
        f"{PLIEGUES_EXTERNOS} pliegues externos estratificados para medir; dentro de cada uno, {PLIEGUES_INTERNOS} pliegues "
        f"internos eligen los hiperparámetros (criterio: exactitud top-3). Todos los modelos ponderan las clases "
        f"(`class_weight=\"balanced\"`; en Naive Bayes, probabilidades a priori iguales).\n\n{tabla}\n\n"
        f"La fila **{AZAR}** es lo que se acierta eligiendo áreas al azar: {min(3, len(clases))} de {len(clases)} áreas en top-3.\n\n"
        f"En la **clave CHASIDE** las áreas empatadas comparten puesto, sin desempate al azar: hay acierto top-k si el área real "
        f"tiene puesto ≤ k. Por los empates, la clave muestra en promedio {mc['areas_en_top3']} áreas en su top-3 y "
        f"{mc['areas_en_top1']} en su top-1. Para el F1, si el área real no está en el primer puesto se toma como predicción "
        f"la primera área del primer puesto.\n\n"
        f"## Prueba de McNemar: {MODELO_DESPLEGADO.lower()} frente a la clave CHASIDE\n\n"
        f"Sobre los mismos {len(y)} casos (predicciones fuera de pliegue del modelo):\n\n"
        f"{linea_mcnemar(3)}\n{linea_mcnemar(1)}\n\n"
        f"## Hiperparámetros elegidos en cada pliegue externo\n\n{params}\n\n"
        f"Modelo desplegado: regresión logística con C = {gs.best_params_['C']} elegido por validación cruzada sobre "
        f"todos los casos (permite explicar el resultado con los ítems que más pesan).\n"
    )
    if origen == "sinteticos":
        reporte += "\n> **Datos sintéticos**: este modelo solo sirve para probar el sistema (modo Demo). No usar para la tesis.\n"
    with open(os.path.join(AQUI, "reportes", "comparacion_modelos.md"), "w", encoding="utf-8") as f:
        f.write(reporte)
    print(f"\nMcNemar top-3: {prueba['top3']} · top-1: {prueba['top1']}")
    print(f"Listo: {args.salida} (versión {args.version}, hash {modelo['hash'][:12]}…) y ml/reportes/comparacion_modelos.md")


if __name__ == "__main__":
    main()
