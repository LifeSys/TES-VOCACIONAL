# OrientaIA — Test Vocacional CHASIDE con Machine Learning

Sistema web de orientación vocacional basado en el instrumento **CHASIDE** (98 ítems, 7 áreas: C Administrativas, H Humanísticas, A Artísticas, S Salud, I Ingeniería, D Defensa, E Ciencias Exactas y Agrarias) con un modelo de **regresión logística** que calcula la probabilidad de cada área.

Sitio estático (HTML/CSS/JS puro, sin build step) publicado en **GitHub Pages**, con los datos en **Firebase** (plan gratuito). Implementa el documento *Requerimientos del sistema — Test Vocacional CHASIDE con ML*.

## Un sistema, cuatro modos

El código que se ingresa al inicio decide el flujo. Formato: prefijo + 3 dígitos (`EXP-001`). Cada código se puede usar **una sola vez**.

| Modo | Código | Flujo | Colección |
|---|---|---|---|
| Universitario | `UNI-001` | Consentimiento → carrera y ciclo → satisfacción con la carrera (4) → CHASIDE → gracias | `entrenamiento` |
| Egresado | `EGR-001` | Consentimiento → carrera, años de egresado, ¿trabaja en su área? → satisfacción con la profesión (4) → CHASIDE → gracias | `entrenamiento` |
| Experimental | `EXP-001` | Asentimiento → preprueba (10) → CHASIDE → resultado con ML y explicación → posprueba (10) → adecuación (3) → TAM (13) → SUS (10) → gracias + PDF | `participantes` |
| Control | `CTL-001` | Asentimiento → preprueba → test en papel (marca inicio y fin) → posprueba → adecuación → gracias | `participantes` |
| Demo | `DEMO` | Igual que Experimental, **sin guardar nada** (sustentación, pruebas) | — |

Si se recarga la página a mitad del test, al volver a ingresar el mismo código (en el mismo dispositivo) continúa donde se quedó.

## Estructura

```
index.html                 entrada del sitio (participantes)
admin.html                 panel administrativo (privado, sin enlace visible)
modelo.json                modelo de ML desplegado (se reemplaza al reentrenar, RNF06)
privacidad.html            política de privacidad (enlazada desde el pie y el consentimiento)
css/styles.css             estilos
js/config.js               configuración: formato de códigos, cierre de la recolección UNI/EGR, calidad de datos
js/instrumentos.js         textos de consentimiento/asentimiento y escalas Likert (editar aquí)
js/data.js                 banco de 98 ítems CHASIDE (en tuteo) + catálogo cerrado de carreras por área
js/chaside.js              clave CHASIDE, ranking con empates y control de calidad (RF09, RF10)
js/ml-engine.js            inferencia del modelo en el navegador (RF11, RF12)
js/pdf-resultado.js        PDF de resultados (estudiante y panel admin)
js/app.js                  flujo del participante
js/admin.js                panel admin (RF14-RF17)
js/firebase-config.js      claves públicas del proyecto Firebase
firestore.rules            reglas de seguridad (RNF01)
ml/                        entrenamiento en Colab y verificación (ver ml/README.md)
```

## Antes de usarlo con participantes

1. **Instrumentos**: las escalas marcadas `borrador: true` en [`js/instrumentos.js`](js/instrumentos.js) (claridad vocacional, satisfacción, adecuación) y los textos de consentimiento son una primera redacción. Reemplázalos por la versión aprobada en el juicio de expertos, sin cambiar la cantidad de ítems.
2. **Catálogo de carreras**: la lista cerrada de `js/data.js` decide el área de cada universitario/egresado. Revisa que estén las carreras de la UPN y de las escuelas policiales/militares.
3. **Modelo**: `modelo.json` es provisional (versión `0.1-sintetico`, datos simulados) y solo sirve para el modo Demo. Entrénalo con los datos reales de UNI/EGR antes de aplicar códigos EXP- (ver `ml/README.md`). El panel admin muestra un aviso mientras sea sintético.
4. **Cerrar la recolección** antes del cuasi experimento: en `js/config.js`, `recoleccionEntrenamientoAbierta: false`.

## Panel administrativo

`admin.html` (solo por URL directa, login con correo y contraseña de Firebase Authentication):

- **Escolares**: EXP y CTL con avance, top 3 del modelo, calidad, tiempo y PDF individual. **Exportar CSV de escolares** (pre/post, 98 respuestas y tiempos, clave, probabilidades, explicación, adecuación, TAM, SUS y su puntaje 0-100).
- **Entrenamiento**: UNI y EGR con carrera, área, satisfacción, calidad y si entra al modelo. **Exportar CSV de entrenamiento** (con columna `tipo`).
- **Conteo por área**: casos válidos por área frente a la meta de 50 (RF16).
- **Cuestionario impreso**: las 98 preguntas en blanco, la clave de corrección y la tabla de carreras para el grupo control (RF17).
- **Modelo**: versión desplegada y comparación de modelos.

## Firebase

- Reglas: `firebase deploy --only firestore:rules --account johannsebastian789@gmail.com` (o pegar `firestore.rules` en la consola → Firestore → Reglas → Publicar).
- Recomendado: Authentication → Settings → User actions → desmarcar **Enable create (sign-up)**, para que nadie pueda crearse una cuenta con la clave pública y leer los resultados.
- Las claves de `js/firebase-config.js` son públicas por diseño; la seguridad la dan las reglas.

## Correr localmente

```bash
python -m http.server 8000
```

Abrir `http://localhost:8000/` y usar el código `DEMO` para probar sin guardar datos.
