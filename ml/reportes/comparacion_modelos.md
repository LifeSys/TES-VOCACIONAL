# Modelo 0.1-sintetico

- Datos: **sinteticos** · 420 casos · entrenado el 2026-09-30
- Casos por área: {'C': 60, 'H': 60, 'A': 60, 'S': 60, 'I': 60, 'D': 60, 'E': 60}
- Áreas fuera del modelo (menos de 50 casos): ninguna

## Comparación de modelos (validación cruzada estratificada de 5 pliegues)

| Modelo | Exactitud top-3 | Exactitud top-1 | F1 macro |
|---|---|---|---|
| Clave CHASIDE (línea base) | 99.0% | 85.7% | 0.857 |
| Regresión logística | 98.8% | 77.9% | 0.778 |
| Naive Bayes | 98.8% | 83.8% | 0.837 |
| Random Forest | 96.7% | 74.5% | 0.745 |
| SVM | 98.3% | 81.7% | 0.816 |

Modelo desplegado: regresión logística (permite explicar el resultado con los ítems que más pesan).

> **Datos sintéticos**: este modelo solo sirve para probar el sistema (modo Demo). No usar para la tesis.
