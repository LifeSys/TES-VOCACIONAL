# -*- coding: utf-8 -*-
"""
FASES 2 y 3 - Entrenamiento, validacion y exportacion del modelo k-NN.

Modelo: k-Nearest Neighbors (aprendizaje supervisado) con votacion ponderada por
distancia. Entrada: los 7 puntajes CHASIDE del estudiante (0..14 por area).
Salida: ranking de carreras ordenadas por afinidad.

Pasos:
  1. Particion estratificada entrenamiento (80%) / prueba (20%).
  2. Seleccion de hiperparametros (k, ponderacion) con validacion cruzada 5-fold
     SOLO sobre el conjunto de entrenamiento.
  3. Evaluacion final sobre el conjunto de prueba (datos que el modelo no vio).
  4. Comparacion contra la regla anterior del sistema (filtrar carreras de las 2
     areas con mayor puntaje) y contra una linea base aleatoria.
  5. Reentrenamiento con TODO el dataset y exportacion a js/ml-model.js.

Para que lo que se mide en Python sea exactamente lo que corre en el navegador,
la inferencia esta implementada aqui (rank_all) con la misma logica que
js/ml-engine.js; ml/verify_js_parity.js comprueba que ambas coinciden.

Uso:  python train_model.py
"""
import json
import os

import numpy as np
import pandas as pd
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.neighbors import KNeighborsClassifier

HERE = os.path.dirname(os.path.abspath(__file__))
DATASET = os.environ.get("CHASIDE_DATASET", os.path.join(HERE, "data", "dataset.csv"))
REPORTS = os.path.join(HERE, "reports")
JS_OUT = os.path.join(HERE, "..", "js", "ml-model.js")
os.makedirs(REPORTS, exist_ok=True)

AREAS = ["C", "H", "A", "S", "I", "D", "E"]
MAX_SCORE = 14.0
EPS = 1e-6
MIN_CANDIDATES = 14      # el modelo expande k hasta tener al menos 14 carreras candidatas
TOP_N_SHOWN = 8          # carreras que se muestran al estudiante
SEED = 2026
MODEL_VERSION = "knn-v1"

K_GRID = [5, 10, 15, 20, 30, 40, 60]
WEIGHT_GRID = ["distance", "uniform"]
HIT_LEVELS = [1, 3, 5, 8, 14]


# ---------------------------------------------------------------- inferencia k-NN
def rank_row(d2_row, order, y_tr, k, weights, n_classes):
    """Ranking de carreras para UN estudiante. Misma logica que js/ml-engine.js."""
    kk = min(k, len(order))
    while True:
        idx = order[:kk]
        if weights == "distance":
            w = 1.0 / (np.sqrt(d2_row[idx]) / MAX_SCORE + EPS)
        else:
            w = np.ones(len(idx))
        votes = np.bincount(y_tr[idx], weights=w, minlength=n_classes)
        if (votes > 0).sum() >= MIN_CANDIDATES or kk >= len(order):
            break
        kk = min(kk * 2, len(order))
    ranking = sorted(range(n_classes), key=lambda c: (-votes[c], c))
    return ranking, votes


def rank_all(X_tr, y_tr, X_te, k, weights, n_classes):
    """Rankings de todos los estudiantes de X_te."""
    diff = X_te[:, None, :] - X_tr[None, :, :]
    d2 = (diff * diff).sum(axis=2)                   # distancia^2 entera (exacta)
    out = []
    for i in range(len(X_te)):
        order = np.argsort(d2[i], kind="stable")
        out.append(rank_row(d2[i], order, y_tr, k, weights, n_classes)[0])
    return out


def hit_rates(rankings, y_true, levels=HIT_LEVELS):
    res = {}
    for n in levels:
        res[n] = float(np.mean([y in r[:n] for r, y in zip(rankings, y_true)]))
    return res


# ---------------------------------------------------------------- linea base: regla anterior
def rule_based_list(scores, career_area_idx, area_order=AREAS):
    """Regla que usaba el sistema antes: carreras de las 2 areas con mayor puntaje."""
    order = sorted(range(len(area_order)), key=lambda a: (-scores[a], a))
    top2 = set(order[:2])
    return [c for c, a in enumerate(career_area_idx) if a in top2]


def main():
    df = pd.read_csv(DATASET, encoding="utf-8")
    careers = list(dict.fromkeys(df["carrera"]))            # orden de aparicion (estable)
    c_idx = {c: i for i, c in enumerate(careers)}
    career_area = {c: a for c, a in zip(df["carrera"], df["area_principal"])}
    career_area_idx = [AREAS.index(career_area[c]) for c in careers]
    n_classes = len(careers)

    X = df[AREAS].to_numpy(dtype=np.int64)
    y = df["carrera"].map(c_idx).to_numpy(dtype=np.int64)

    # 1) particion
    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.20, stratify=y, random_state=SEED)
    print(f"Entrenamiento: {len(X_tr)}  |  Prueba: {len(X_te)}  |  Carreras: {n_classes}")

    # 2) seleccion de hiperparametros con CV 5-fold (solo sobre entrenamiento)
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
    cv_rows = []
    for weights in WEIGHT_GRID:
        for k in K_GRID:
            accs = {n: [] for n in HIT_LEVELS}
            for tr, va in skf.split(X_tr, y_tr):
                rk = rank_all(X_tr[tr], y_tr[tr], X_tr[va], k, weights, n_classes)
                hr = hit_rates(rk, y_tr[va])
                for n in HIT_LEVELS:
                    accs[n].append(hr[n])
            row = {"weights": weights, "k": k}
            for n in HIT_LEVELS:
                row[f"top{n}_mean"] = round(float(np.mean(accs[n])), 4)
                row[f"top{n}_std"] = round(float(np.std(accs[n])), 4)
            cv_rows.append(row)
            print(f"  CV  weights={weights:8s} k={k:2d}  top1={row['top1_mean']:.3f}  "
                  f"top5={row['top5_mean']:.3f}  top8={row['top8_mean']:.3f}")
    cv_df = pd.DataFrame(cv_rows)
    cv_df.to_csv(os.path.join(REPORTS, "cv_results.csv"), index=False)
    # criterio de seleccion: mayor exactitud top-8 (lo que ve el estudiante); desempate top-1
    best = cv_df.sort_values(["top8_mean", "top1_mean"], ascending=False).iloc[0]
    best_k, best_w = int(best["k"]), str(best["weights"])
    print(f"\nMejor configuracion (CV): weights={best_w}, k={best_k}")

    # 3) evaluacion final en conjunto de prueba
    rk_te = rank_all(X_tr, y_tr, X_te, best_k, best_w, n_classes)
    test_hits = hit_rates(rk_te, y_te)
    area_acc = float(np.mean([career_area_idx[r[0]] == career_area_idx[y]
                              for r, y in zip(rk_te, y_te)]))
    mrr = float(np.mean([1.0 / (r.index(y) + 1) for r, y in zip(rk_te, y_te)]))

    # verificacion cruzada con scikit-learn (top-1 debe ser muy similar)
    sk = KNeighborsClassifier(n_neighbors=best_k, weights=best_w).fit(X_tr, y_tr)
    sk_top1 = float(np.mean(sk.predict(X_te) == y_te))

    # 4) lineas base
    rule_lists = [rule_based_list(row, career_area_idx) for row in X_te]
    rule_hit = float(np.mean([y in lst for lst, y in zip(rule_lists, y_te)]))
    rule_size = float(np.mean([len(lst) for lst in rule_lists]))
    ml_hit_same_size = float(np.mean(
        [y in r[:int(round(rule_size))] for r, y in zip(rk_te, y_te)]))
    random_hit8 = TOP_N_SHOWN / n_classes
    random_hit_rule_size = round(rule_size) / n_classes

    metrics = {
        "model": MODEL_VERSION,
        "algorithm": "k-Nearest Neighbors (aprendizaje supervisado), votacion ponderada",
        "k": best_k, "weights": best_w,
        "n_total": int(len(X)), "n_train": int(len(X_tr)), "n_test": int(len(X_te)),
        "n_careers": n_classes, "seed": SEED,
        "test_hit_at": {str(n): round(v, 4) for n, v in test_hits.items()},
        "test_area_accuracy_top1": round(area_acc, 4),
        "test_mrr": round(mrr, 4),
        "sklearn_crosscheck_top1": round(sk_top1, 4),
        "baseline_rule_based": {
            "hit_rate": round(rule_hit, 4), "avg_list_size": round(rule_size, 2)},
        "ml_hit_same_list_size": round(ml_hit_same_size, 4),
        "baseline_random_hit8": round(random_hit8, 4),
        "baseline_random_same_size": round(random_hit_rule_size, 4),
        "cv_best": {k_: (float(v) if not isinstance(v, str) else v)
                    for k_, v in best.to_dict().items()},
    }
    with open(os.path.join(REPORTS, "metrics.json"), "w", encoding="utf-8") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2)

    # matriz de confusion (top-1) y exactitud por carrera
    pred_top1 = np.array([r[0] for r in rk_te])
    cm = pd.crosstab(pd.Series([careers[i] for i in y_te], name="real"),
                     pd.Series([careers[i] for i in pred_top1], name="predicha"))
    cm.to_csv(os.path.join(REPORTS, "confusion_matrix_top1.csv"), encoding="utf-8")
    per_career = []
    for c in range(n_classes):
        idxs = [i for i, y_ in enumerate(y_te) if y_ == c]
        per_career.append({
            "carrera": careers[c], "area": career_area[careers[c]], "n_prueba": len(idxs),
            "top1": round(float(np.mean([rk_te[i][0] == c for i in idxs])), 3),
            "top3": round(float(np.mean([c in rk_te[i][:3] for i in idxs])), 3),
            "top8": round(float(np.mean([c in rk_te[i][:8] for i in idxs])), 3),
        })
    pc = pd.DataFrame(per_career).sort_values("top8")
    pc.to_csv(os.path.join(REPORTS, "per_career_accuracy.csv"), index=False, encoding="utf-8")

    write_markdown_report(metrics, cv_df, pc)

    # 5) reentrenar con TODO el dataset y exportar a JS
    export_js(X, y, careers, career_area_idx, best_k, best_w, metrics)
    write_parity_cases(X, y, careers, best_k, best_w, n_classes)

    print("\n=== RESULTADOS (conjunto de prueba, datos no vistos) ===")
    for n in HIT_LEVELS:
        print(f"  El modelo incluye la carrera 'correcta' en su top-{n:<2d}: {test_hits[n]*100:5.1f}%")
    print(f"  Acierto de area (top-1 en la misma area que la real): {area_acc*100:.1f}%")
    print(f"  Regla anterior (2 areas): acierto {rule_hit*100:.1f}% con lista de ~{rule_size:.1f} carreras")
    print(f"  Modelo ML con lista del mismo tamano: acierto {ml_hit_same_size*100:.1f}%")
    print(f"  Aleatorio (lista de {TOP_N_SHOWN}): {random_hit8*100:.1f}%")
    print(f"  Chequeo scikit-learn top-1: {sk_top1*100:.1f}% (propio: {test_hits[1]*100:.1f}%)")


def write_markdown_report(m, cv_df, pc):
    h = m["test_hit_at"]
    lines = [
        "# Reporte de entrenamiento y validación del modelo k-NN",
        "",
        f"- Versión del modelo: `{m['model']}`",
        f"- Algoritmo: {m['algorithm']}",
        f"- Hiperparámetros seleccionados (validación cruzada 5-fold sobre entrenamiento): "
        f"k = **{m['k']}**, ponderación = **{m['weights']}**",
        f"- Dataset: {m['n_total']} estudiantes sintéticos ({m['n_careers']} carreras). "
        f"Entrenamiento: {m['n_train']} · Prueba: {m['n_test']} · semilla: {m['seed']}",
        "",
        "## Resultados en el conjunto de prueba (datos no vistos por el modelo)",
        "",
        "| Métrica | Valor |", "|---|---|",
    ]
    for n in HIT_LEVELS:
        lines.append(f"| La carrera de origen está entre las {n} primeras recomendadas | {h[str(n)]*100:.1f}% |")
    lines += [
        f"| Área de la primera recomendación = área de la carrera de origen | {m['test_area_accuracy_top1']*100:.1f}% |",
        f"| MRR (rango recíproco medio) | {m['test_mrr']:.3f} |",
        "",
        "## Comparación con la regla anterior del sistema",
        "",
        "| Método | Acierto | Tamaño de la lista |", "|---|---|---|",
        f"| Regla anterior (carreras de las 2 áreas con mayor puntaje) | {m['baseline_rule_based']['hit_rate']*100:.1f}% | ~{m['baseline_rule_based']['avg_list_size']} carreras |",
        f"| Modelo k-NN (lista del mismo tamaño) | {m['ml_hit_same_list_size']*100:.1f}% | ~{m['baseline_rule_based']['avg_list_size']} carreras |",
        f"| Modelo k-NN (lo que ve el estudiante: {TOP_N_SHOWN} carreras) | {h['8']*100:.1f}% | {TOP_N_SHOWN} carreras |",
        f"| Azar (lista de {TOP_N_SHOWN}) | {m['baseline_random_hit8']*100:.1f}% | {TOP_N_SHOWN} carreras |",
        "",
        "## Verificación cruzada",
        "",
        f"Exactitud top-1 con `KNeighborsClassifier` de scikit-learn (mismos k y pesos): "
        f"{m['sklearn_crosscheck_top1']*100:.1f}% (implementación propia: {h['1']*100:.1f}%).",
        "",
        "## Validación cruzada (entrenamiento, 5-fold)",
        "",
        cv_df[["weights", "k", "top1_mean", "top3_mean", "top5_mean", "top8_mean"]].to_markdown(index=False),
        "",
        "## Carreras más difíciles de distinguir (menor exactitud top-8)",
        "",
        pc.head(8).to_markdown(index=False),
        "",
        "## Limitaciones (declarar en la tesis)",
        "",
        "1. **El dataset es sintético**: los perfiles CHASIDE típicos de cada carrera los definió el "
        "investigador con criterio experto, apoyándose en los rasgos característicos del manual. "
        "Estas métricas miden qué tan bien el modelo *recupera* esos perfiles, **no** qué tan bien "
        "predice la carrera que un estudiante real terminaría eligiendo o en la que rendiría.",
        "2. Carreras con perfiles muy parecidos (p. ej. Física/Matemática, Ingeniería Electrónica/Mecatrónica) "
        "son difíciles de separar solo con 7 puntajes; por eso el sistema recomienda un *ranking* de "
        "varias carreras y no una sola.",
        "3. La validación real ocurre con el piloto (pretest-postest, 32 estudiantes): comparar las "
        "recomendaciones del modelo con la valoración del psicólogo escolar y con la percepción de "
        "utilidad (TAM).",
    ]
    with open(os.path.join(REPORTS, "metrics.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def export_js(X, y, careers, career_area_idx, k, weights, metrics):
    model = {
        "version": MODEL_VERSION,
        "algorithm": "k-NN ponderado por distancia",
        "k": k, "weights": weights,
        "maxScore": int(MAX_SCORE), "eps": EPS,
        "minCandidates": MIN_CANDIDATES, "topN": TOP_N_SHOWN,
        "areas": AREAS,
        "careers": careers,
        "careerAreas": [AREAS[a] for a in career_area_idx],
        "trainedOn": {"samples": int(len(X)), "source": "perfiles CHASIDE sintéticos por carrera (criterio experto)",
                      "seed": SEED},
        "testMetrics": {"hitAt": metrics["test_hit_at"],
                        "areaAccuracyTop1": metrics["test_area_accuracy_top1"],
                        "ruleBasedHit": metrics["baseline_rule_based"]["hit_rate"]},
        "X": X.tolist(),
        "y": y.tolist(),
    }
    with open(JS_OUT, "w", encoding="utf-8") as f:
        f.write("// Modelo k-NN entrenado con ml/train_model.py -- NO EDITAR A MANO.\n")
        f.write("// Para regenerarlo: python ml/build_dataset.py && python ml/train_model.py\n")
        f.write("const CHASIDE_ML_MODEL = ")
        f.write(json.dumps(model, ensure_ascii=False, separators=(",", ":")))
        f.write(";\n")
    print(f"\nModelo exportado: {os.path.relpath(JS_OUT, HERE)} "
          f"({os.path.getsize(JS_OUT)/1024:.0f} KB)")


def write_parity_cases(X, y, careers, k, weights, n_classes):
    """Casos de prueba (entrada -> ranking esperado) para comprobar Python == JavaScript."""
    rng = np.random.default_rng(SEED + 1)
    cases = []
    picks = rng.choice(len(X), size=150, replace=False)
    inputs = [X[i] for i in picks]
    for _ in range(100):                                    # perfiles aleatorios
        inputs.append(rng.integers(0, 15, size=len(AREAS)))
    inputs.append(np.zeros(len(AREAS), dtype=np.int64))     # casos borde
    inputs.append(np.full(len(AREAS), 14, dtype=np.int64))
    rk = rank_all(X, y, np.array(inputs), k, weights, n_classes)
    for x, r in zip(inputs, rk):
        cases.append({"scores": [int(v) for v in x], "ranking": [int(c) for c in r[:14]]})
    with open(os.path.join(REPORTS, "parity_cases.json"), "w", encoding="utf-8") as f:
        json.dump(cases, f)


if __name__ == "__main__":
    main()
