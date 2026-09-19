# Módulo de Machine Learning (k-NN)

Recomienda carreras a partir de los 7 puntajes CHASIDE del estudiante. Reemplaza la regla anterior
("mostrar las carreras de las 2 áreas con mayor puntaje") por un **modelo de aprendizaje supervisado**.

```
puntajes CHASIDE (7 números 0-14)  ->  modelo k-NN  ->  ranking de 8 carreras con afinidad
```

El puntaje CHASIDE en sí (contar los "Sí" por área) **no cambia**: es el instrumento validado.
El modelo actúa *después*, usando esos 7 números como entrada.

## Archivos

| Archivo | Qué hace |
|---|---|
| `build_dataset.py` | Fase 1. Define el perfil CHASIDE típico de cada carrera y genera estudiantes sintéticos → `data/dataset.csv` |
| `train_model.py` | Fases 2-3. Selecciona hiperparámetros (CV 5-fold), evalúa en datos de prueba, compara con la regla anterior, reentrena y exporta → `../js/ml-model.js` y `reports/` |
| `verify_js_parity.js` | Comprueba que el navegador (JS) da los mismos rankings que Python |
| `retrain_from_csv.py` | Reentrena mezclando datos reales validados (ver abajo) |
| `reports/metrics.md` | Reporte de resultados (para el anexo de la tesis) |
| `../js/ml-engine.js` | Inferencia en el navegador (sin servidor) |

## Regenerar el modelo desde cero

```bash
pip install -r ml/requirements.txt
python ml/build_dataset.py
python ml/train_model.py
node ml/verify_js_parity.js     # debe decir: difieren: 0
```

Luego `git add . && git commit && git push` y el sitio usa el modelo nuevo.

## ¿Hay que "entrenar el sistema" a mano?

No. El modelo **ya está entrenado y publicado** (`js/ml-model.js`). Estos pasos solo se repiten si
cambias las carreras, los perfiles o quieres incorporar datos reales.

## Datos reales (después del piloto)

Los perfiles de entrenamiento actuales son **sintéticos** (criterio experto). Con el piloto:

1. Panel admin → **Exportar CSV**.
2. En Excel agrega la columna `carrera_validada` (carrera validada por el psicólogo escolar o
   elegida por el estudiante; texto idéntico al de `js/data.js`).
3. `python ml/retrain_from_csv.py resultados.csv` (solo combina) o con `--entrenar` (reentrena).

**Con 32 estudiantes no conviene reentrenar**: sirven para **validar** (¿la recomendación del modelo
coincide con la del psicólogo?), que es lo que pide el objetivo de evaluación de la tesis.
