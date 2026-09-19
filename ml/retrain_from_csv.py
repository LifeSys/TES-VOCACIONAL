# -*- coding: utf-8 -*-
"""
Reentrenamiento con DATOS REALES (cuando existan).

Flujo:
  1. En el panel admin: "Exportar CSV" -> resultados-chaside-AAAA-MM-DD.csv
  2. Abrir el CSV en Excel y AGREGAR una columna llamada  carrera_validada  con la carrera
     (escrita EXACTAMENTE como aparece en js/data.js) que el psicologo escolar valido para
     ese estudiante, o la carrera que el estudiante eligio/estudia (seguimiento posterior).
     Las filas sin carrera_validada se ignoran.
  3. Ejecutar:
        python retrain_from_csv.py resultados.csv            # solo combina y muestra el resumen
        python retrain_from_csv.py resultados.csv --entrenar # combina y reentrena/exporta el modelo

Los registros reales se AGREGAN al dataset sintetico (no lo reemplazan) y se repiten
--peso veces (por defecto 5) para que pesen mas que un ejemplo sintetico.

IMPORTANTE: con pocos registros reales (p. ej. los 32 del piloto) NO conviene reentrenar:
el modelo casi no cambiaria y las etiquetas serian muy escasas por carrera. Con esos 32 lo
correcto es VALIDAR (comparar la recomendacion del modelo con la valoracion del psicologo).
Reentrenar tiene sentido con cientos de registros validados.
Nota: al repetir los registros reales (--peso), copias del mismo registro pueden caer en
entrenamiento y en prueba, asi que las metricas del reentrenamiento salen algo optimistas;
la validacion honesta con datos reales debe hacerse aparte (registros no usados para entrenar).
"""
import argparse
import os
import subprocess
import sys

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
AREAS = ["C", "H", "A", "S", "I", "D", "E"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv", help="CSV exportado del panel admin + columna carrera_validada")
    ap.add_argument("--peso", type=int, default=5, help="veces que se repite cada registro real")
    ap.add_argument("--entrenar", action="store_true", help="ademas reentrena y exporta el modelo")
    args = ap.parse_args()

    synth = pd.read_csv(os.path.join(HERE, "data", "dataset.csv"), encoding="utf-8")
    area_of = dict(zip(synth["carrera"], synth["area_principal"]))

    real = pd.read_csv(args.csv, encoding="utf-8-sig")
    if "carrera_validada" not in real.columns:
        sys.exit("Falta la columna 'carrera_validada' en el CSV (ver instrucciones al inicio del script).")
    real = real[real["carrera_validada"].notna() & (real["carrera_validada"].astype(str).str.strip() != "")]
    unknown = sorted(set(real["carrera_validada"]) - set(area_of))
    if unknown:
        sys.exit(f"Carreras que no existen en el catalogo: {unknown}\nEscribelas exactamente como en js/data.js.")

    rows = real[[f"puntaje_{a}" for a in AREAS]].copy()
    rows.columns = AREAS
    rows["carrera"] = real["carrera_validada"].values
    rows["area_principal"] = rows["carrera"].map(area_of)
    combined = pd.concat([synth] + [rows] * args.peso, ignore_index=True)
    out = os.path.join(HERE, "data", "dataset_combinado.csv")
    combined.to_csv(out, index=False, encoding="utf-8")
    print(f"Registros reales validados: {len(rows)} (x{args.peso} = {len(rows) * args.peso})")
    print(f"Dataset combinado: {len(combined)} filas -> {os.path.relpath(out, HERE)}")

    if args.entrenar:
        env = dict(os.environ, CHASIDE_DATASET=out, PYTHONIOENCODING="utf-8")
        subprocess.check_call([sys.executable, os.path.join(HERE, "train_model.py")], env=env)
        print("\nModelo reentrenado. Ejecuta: node ml/verify_js_parity.js  y luego publica (git add/commit/push).")


if __name__ == "__main__":
    main()
