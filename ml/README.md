# Módulo de machine learning

El modelo aprende: *"las personas que responden así el CHASIDE están satisfechas en esta área"*.

| Elemento | Definición |
|---|---|
| Entrada (X) | Las 98 respuestas del CHASIDE (1 = Sí, 0 = No) |
| Etiqueta (y) | Área CHASIDE de la carrera (C, H, A, S, I, D, E) |
| Casos que entran | Universitarios de 3.er ciclo a más con satisfacción promedio ≥ 4; profesionales con satisfacción ≥ 4 que trabajan en su área; en ambos casos test no sospechoso y no excluido en el panel |
| Mínimo | 15 casos por área; un área con menos queda fuera del modelo (solo clave clásica) |
| Modelos comparados | Clave CHASIDE (línea base), regresión logística, Naive Bayes, Random Forest, SVM; todos con ponderación de clases |
| Validación | Cruzada anidada: 5 pliegues externos estratificados miden; 3 internos eligen los hiperparámetros (C, etc.). Exactitud top-3 (y top-1) y F1 macro |
| Referencias | Azar (42,9 % en top-3 con 7 áreas) y prueba de McNemar entre la regresión logística y la clave |
| Empates de la clave | Las áreas empatadas comparten puesto (sin desempate al azar), igual que en la web |
| Modelo desplegado | Regresión logística → `modelo.json` en la raíz del repositorio, con fecha (`entrenadoEn`), huella SHA-256 (`hash`) y huella del CSV (`datosHash`) |
| Salida en la web | Solo en aulas EXP: probabilidad por área (top 3), carreras y las 3 preguntas que más pesaron (estas no se guardan) |

Los escolares nunca se usan para entrenar. Cada resultado guardado lleva la versión del modelo (`resultado.modelo.v`).

## Archivos

| Archivo | Qué hace |
|---|---|
| `entrenar_modelo.py` | Filtra los casos válidos, compara los 5 métodos, entrena la regresión logística y escribe `modelo.json` y `reportes/` |
| `entrenamiento_colab.ipynb` | Cuaderno de Google Colab que sube el script y el CSV, entrena y descarga `modelo.json` |
| `verificar_js.js` | Comprueba que el navegador calcula las mismas probabilidades que Python |
| `reportes/comparacion_modelos.md` | Tabla de comparación de modelos del último entrenamiento (anexo de la tesis) |

## Entrenar con los datos reales

1. Panel → pestaña **Conteos**: excluye los registros sospechosos y espera a tener ≥ 15 casos válidos por área. Luego **cierra el enlace de adultos** en la pestaña Adultos.
2. Pestaña **Adultos** → **CSV de adultos (entrenamiento)**.
3. Abre `entrenamiento_colab.ipynb` en Google Colab, sube `entrenar_modelo.py` y el CSV, y ejecuta las celdas (o en local: `python ml/entrenar_modelo.py adultos-chaside-AAAA-MM-DD.csv --version 1.0`).
4. Copia el `modelo.json` descargado a la raíz del repositorio (reemplaza al provisional), ejecuta `node ml/verificar_js.js` si lo entrenaste en local, y haz commit + push.
5. Anota la versión y la huella (`hash`) en la tesis. No cambies `modelo.json` mientras haya aulas del experimento abiertas: el modelo queda congelado durante la aplicación.

## Modelo provisional

El `modelo.json` actual (versión `0.2-sintetico`) se generó con `python ml/entrenar_modelo.py --sintetico --version 0.2-sintetico`: estudiantes **simulados** que responden Sí con más probabilidad a los ítems de su área. Solo sirve para probar el sistema y el aula DEMO; sus métricas no son resultados de la tesis.
