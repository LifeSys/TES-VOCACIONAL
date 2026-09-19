# Reporte de entrenamiento y validación del modelo k-NN

- Versión del modelo: `knn-v1`
- Algoritmo: k-Nearest Neighbors (aprendizaje supervisado), votacion ponderada
- Hiperparámetros seleccionados (validación cruzada 5-fold sobre entrenamiento): k = **60**, ponderación = **distance**
- Dataset: 2350 estudiantes sintéticos (47 carreras). Entrenamiento: 1880 · Prueba: 470 · semilla: 2026

## Resultados en el conjunto de prueba (datos no vistos por el modelo)

| Métrica | Valor |
|---|---|
| La carrera de origen está entre las 1 primeras recomendadas | 45.1% |
| La carrera de origen está entre las 3 primeras recomendadas | 81.3% |
| La carrera de origen está entre las 5 primeras recomendadas | 91.5% |
| La carrera de origen está entre las 8 primeras recomendadas | 98.9% |
| La carrera de origen está entre las 14 primeras recomendadas | 99.8% |
| Área de la primera recomendación = área de la carrera de origen | 87.5% |
| MRR (rango recíproco medio) | 0.647 |

## Comparación con la regla anterior del sistema

| Método | Acierto | Tamaño de la lista |
|---|---|---|
| Regla anterior (carreras de las 2 áreas con mayor puntaje) | 98.3% | ~13.75 carreras |
| Modelo k-NN (lista del mismo tamaño) | 99.8% | ~13.75 carreras |
| Modelo k-NN (lo que ve el estudiante: 8 carreras) | 98.9% | 8 carreras |
| Azar (lista de 8) | 17.0% | 8 carreras |

## Verificación cruzada

Exactitud top-1 con `KNeighborsClassifier` de scikit-learn (mismos k y pesos): 43.8% (implementación propia: 45.1%).

## Validación cruzada (entrenamiento, 5-fold)

| weights   |   k |   top1_mean |   top3_mean |   top5_mean |   top8_mean |
|:----------|----:|------------:|------------:|------------:|------------:|
| distance  |   5 |      0.4511 |      0.808  |      0.9213 |      0.9761 |
| distance  |  10 |      0.4511 |      0.808  |      0.9213 |      0.9761 |
| distance  |  15 |      0.4489 |      0.8085 |      0.9234 |      0.9782 |
| distance  |  20 |      0.4511 |      0.808  |      0.9213 |      0.9761 |
| distance  |  30 |      0.4489 |      0.8085 |      0.9234 |      0.9782 |
| distance  |  40 |      0.4511 |      0.8085 |      0.9218 |      0.9766 |
| distance  |  60 |      0.4505 |      0.8096 |      0.9261 |      0.9798 |
| uniform   |   5 |      0.433  |      0.808  |      0.9176 |      0.9745 |
| uniform   |  10 |      0.433  |      0.808  |      0.9176 |      0.9745 |
| uniform   |  15 |      0.4367 |      0.7995 |      0.9191 |      0.9793 |
| uniform   |  20 |      0.433  |      0.808  |      0.9176 |      0.9745 |
| uniform   |  30 |      0.4367 |      0.7995 |      0.9191 |      0.9793 |
| uniform   |  40 |      0.433  |      0.809  |      0.9191 |      0.975  |
| uniform   |  60 |      0.4388 |      0.8    |      0.9218 |      0.9793 |

## Carreras más difíciles de distinguir (menor exactitud top-8)

| carrera                  | area   |   n_prueba |   top1 |   top3 |   top8 |
|:-------------------------|:-------|-----------:|-------:|-------:|-------:|
| Marketing                | C      |         10 |    0.3 |    0.5 |    0.9 |
| Derecho                  | H      |         10 |    0.2 |    0.6 |    0.9 |
| Obstetricia              | S      |         10 |    0.1 |    0.6 |    0.9 |
| Ciencias Militares       | D      |         10 |    0.3 |    0.8 |    0.9 |
| Química                  | E      |         10 |    0.3 |    0.8 |    0.9 |
| Economía                 | C      |         10 |    0.6 |    1   |    1   |
| Negocios Internacionales | C      |         10 |    0.1 |    0.9 |    1   |
| Contabilidad             | C      |         10 |    0.6 |    0.7 |    1   |

## Limitaciones (declarar en la tesis)

1. **El dataset es sintético**: los perfiles CHASIDE típicos de cada carrera los definió el investigador con criterio experto, apoyándose en los rasgos característicos del manual. Estas métricas miden qué tan bien el modelo *recupera* esos perfiles, **no** qué tan bien predice la carrera que un estudiante real terminaría eligiendo o en la que rendiría.
2. Carreras con perfiles muy parecidos (p. ej. Física/Matemática, Ingeniería Electrónica/Mecatrónica) son difíciles de separar solo con 7 puntajes; por eso el sistema recomienda un *ranking* de varias carreras y no una sola.
3. La validación real ocurre con el piloto (pretest-postest, 32 estudiantes): comparar las recomendaciones del modelo con la valoración del psicólogo escolar y con la percepción de utilidad (TAM).
