# OrientaIA — Test Vocacional CHASIDE con Machine Learning

Sistema web de orientación vocacional basado en el instrumento **CHASIDE** (98 ítems, 7 áreas: C Administrativas, H Humanísticas, A Artísticas, S Salud, I Ingeniería, D Defensa, E Ciencias Exactas y Agrarias) con un modelo de **regresión logística** que calcula la probabilidad de cada área.

Sitio estático (HTML/CSS/JS puro, sin build step) en **GitHub Pages**, con los datos en **Firebase** (plan gratuito, servidores en São Paulo). Implementa el documento *Requerimientos del sistema — Test Vocacional CHASIDE con ML* (arquitectura de tres enlaces).

## Un sistema, tres enlaces

| Enlace | Para quién | Flujo |
|---|---|---|
| `escolar.html?aula=K7Q2` | Escolares de 4.° y 5.°, en aula | Política para menores + asentimiento → sexo (opcional) → preprueba → CHASIDE → resultado → posprueba → adecuación → (solo EXP: TAM → SUS) → número `ESC-` + PDF |
| `adultos.html` | Universitarios y profesionales (no compartir en colegios) | Política para adultos + consentimiento → ¿18 o más? → universitario / profesional → datos de carrera → satisfacción → CHASIDE → número `UNI-` / `PRO-` |
| `admin.html` | Superadministrador (johannsebastian789@gmail.com) | Login → aulas → tablas → conteos → excluir / borrar → CSV |

- **El aula decide el grupo**: las aulas EXP ven el resultado clásico + el modelo con explicación; las CTL solo el resultado clásico.
- **Autonumeración**: nadie escribe códigos. Al **terminar**, una transacción asigna el siguiente número (`ESC-0001`, `UNI-0001`, `PRO-0001`) y guarda todo de una vez. **Si alguien abandona a la mitad no se guarda nada** ni se gasta un número.
- Si se recarga la página, se puede continuar en el mismo dispositivo. Si al final no hay internet, las respuestas quedan en el dispositivo hasta presionar *Reintentar*.
- **Aula de prueba** para la sustentación: `escolar.html?aula=DEMO` (flujo experimental completo, no guarda nada).
- `index.html` no enlaza a ningún test: solo pide usar el enlace recibido.

## Datos en Firestore (4 colecciones)

| Colección | Qué guarda | Escribe | Lee |
|---|---|---|---|
| `contadores` | Último número de `ESC`, `UNI`, `PRO`; `estado.adultosAbierto` | La web (+1 en transacción); el admin (estado) | La web (solo para numerar) |
| `aulas` | Colegio (código), grado, sección, grupo EXP/CTL, activa | Superadministrador | La web (una por código) y el admin |
| `escolares` | Aula, sexo, asentimiento, pre/post, 98 respuestas + tiempos, inicio/fin, resultado, calidad, adecuación, TAM, SUS | La web, una vez al terminar | Solo el admin |
| `adultos` | Tipo, consentimiento, 18+, carrera y área, ciclo/universidad o años de experiencia/trabaja en su área, satisfacción, 98 respuestas + tiempos, calidad | La web, una vez al terminar | Solo el admin |

Nunca se guarda nombre, DNI, correo, teléfono, fecha de nacimiento, IP, ubicación ni el nombre del colegio en texto libre.

## Estructura

```
index.html                 página neutra (no enlaza a los tests)
escolar.html               enlace de escolares (?aula=…)
adultos.html               enlace de universitarios y profesionales
admin.html                 panel del superadministrador
privacidad-menores.html    política para escolares
privacidad-adultos.html    política para adultos
modelo.json                modelo de ML desplegado (se reemplaza al reentrenar, RNF06)
css/styles.css             estilos
js/config.js               correo del admin, prefijos, aula DEMO, calidad de datos, criterios del modelo
js/instrumentos.js         textos de asentimiento/consentimiento y escalas Likert (editar aquí)
js/data.js                 98 ítems CHASIDE (en tuteo) + catálogo cerrado de carreras por área
js/chaside.js              clave CHASIDE, ranking con empates y control de calidad
js/ml-engine.js            inferencia del modelo en el navegador
js/pdf-resultado.js        PDF de resultados (escolar y panel)
js/participante.js         flujo de escolar.html y adultos.html
js/admin.js                panel del superadministrador
js/firebase-config.js      claves públicas del proyecto Firebase
firestore.rules            reglas de seguridad
ml/                        entrenamiento en Colab y verificación (ver ml/README.md)
herramientas/version.py    actualiza la versión de los .js/.css antes de publicar
```

## Panel del superadministrador

- **Aulas**: crear (colegio, grado, sección, grupo), copiar su enlace y cerrarla al terminar la sesión.
- **Escolares**: tabla con resultado, calidad y tiempo; PDF; excluir / incluir; borrar; **CSV de escolares** para SPSS.
- **Adultos**: tabla con carrera, área, satisfacción y si entra al modelo; excluir / incluir; borrar; abrir o cerrar el enlace de adultos; **CSV de adultos** para entrenar.
- **Conteos**: adultos válidos por área (meta 50) y escolares por grupo.
- **Modelo**: versión desplegada y comparación de modelos.

## Antes de usarlo con participantes

1. **Instrumentos**: reemplazar los textos marcados `borrador` en [`js/instrumentos.js`](js/instrumentos.js) por la versión del juicio de expertos, sin cambiar la cantidad de ítems.
2. **Catálogo de carreras** (`js/data.js`): revisar que estén las carreras de la UPN y de las escuelas policiales y militares.
3. **Modelo**: `modelo.json` es provisional (`0.1-sintetico`). Entrenarlo con el CSV de adultos antes de abrir aulas EXP (ver `ml/README.md`) y luego cerrar el enlace de adultos desde el panel.
4. **Firebase**: Authentication → Settings → User actions → desmarcar **Enable create (sign-up)**.

## Publicar un cambio

Antes de hacer commit + push de cambios en `js/` o `css/`, ejecutar:

```bash
python herramientas/version.py
```

Pone un número de versión nuevo a los archivos, para que los navegadores descarguen la versión nueva sin presionar Ctrl + F5.

## Publicar las reglas

```bash
firebase deploy --only firestore:rules --account johannsebastian789@gmail.com
```

## Correr localmente

```bash
python -m http.server 8000
```

Abrir `http://localhost:8000/escolar.html?aula=DEMO`.
