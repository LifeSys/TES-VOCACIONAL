# Modelo 0.2-sintetico

- Datos: **sinteticos** · 420 casos · entrenado el 2026-10-28T02:46:58+00:00
- Huella SHA-256 del modelo: `b2b1775e475f9d658f4538956db3fd2e15c4b93b7f91b179c1ab6734f2833a05`
- Criterios: satisfacción promedio ≥ 4.0, ciclo ≥ 3, mínimo 30 casos por área
- Casos por área: {'C': 60, 'H': 60, 'A': 60, 'S': 60, 'I': 60, 'D': 60, 'E': 60}
- Áreas fuera del modelo (menos de 30 casos): ninguna

## Comparación de modelos (validación cruzada anidada)

5 pliegues externos estratificados para medir; dentro de cada uno, 3 pliegues internos eligen los hiperparámetros (criterio: exactitud top-3). Todos los modelos ponderan las clases (`class_weight="balanced"`; en Naive Bayes, probabilidades a priori iguales).

| Modelo | Exactitud top-3 | Exactitud top-1 | F1 macro |
|---|---|---|---|
| Clave CHASIDE (línea base) | 99.5% | 90.2% | 0.903 |
| Regresión logística | 99.0% | 83.8% | 0.837 |
| Naive Bayes | 98.6% | 83.6% | 0.835 |
| Random Forest | 97.6% | 75.2% | 0.752 |
| SVM | 98.8% | 83.3% | 0.833 |
| Azar (referencia) | 42.9% | 14.3% | — |

La fila **Azar (referencia)** es lo que se acierta eligiendo áreas al azar: 3 de 7 áreas en top-3.

En la **clave CHASIDE** las áreas empatadas comparten puesto, sin desempate al azar: hay acierto top-k si el área real tiene puesto ≤ k. Por los empates, la clave muestra en promedio 3.5 áreas en su top-3 y 1.07 en su top-1. Para el F1, si el área real no está en el primer puesto se toma como predicción la primera área del primer puesto.

## Prueba de McNemar: regresión logística frente a la clave CHASIDE

Sobre los mismos 420 casos (predicciones fuera de pliegue del modelo):

- **Top-3**: el modelo acierta y la clave no en **0** casos; la clave acierta y el modelo no en **2**. χ² (con corrección de continuidad) = 0.5, p exacta = 0.5.
- **Top-1**: el modelo acierta y la clave no en **9** casos; la clave acierta y el modelo no en **36**. χ² (con corrección de continuidad) = 15.0222, p exacta = 6.575e-05.

## Hiperparámetros elegidos en cada pliegue externo

- Regresión logística: {"C": 0.01}; {"C": 0.01}; {"C": 0.01}; {"C": 0.05}; {"C": 0.01}
- Naive Bayes: {"alpha": 1.0}; {"alpha": 0.1}; {"alpha": 0.1}; {"alpha": 0.1}; {"alpha": 0.1}
- Random Forest: {"max_depth": null, "min_samples_leaf": 3}; {"max_depth": 10, "min_samples_leaf": 1}; {"max_depth": 10, "min_samples_leaf": 1}; {"max_depth": null, "min_samples_leaf": 3}; {"max_depth": 10, "min_samples_leaf": 1}
- SVM: {"estimator__C": 0.5, "estimator__gamma": "scale"}; {"estimator__C": 0.5, "estimator__gamma": 0.01}; {"estimator__C": 1.0, "estimator__gamma": "scale"}; {"estimator__C": 1.0, "estimator__gamma": 0.01}; {"estimator__C": 0.5, "estimator__gamma": "scale"}

Modelo desplegado: regresión logística con C = 0.1 elegido por validación cruzada sobre todos los casos (permite explicar el resultado con los ítems que más pesan).

> **Datos sintéticos**: este modelo solo sirve para probar el sistema (modo Demo). No usar para la tesis.
