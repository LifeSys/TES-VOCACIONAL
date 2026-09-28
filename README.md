# Vocacional Life IA — Test Vocacional CHASIDE

Sistema web de orientación vocacional para estudiantes de 4to y 5to de secundaria, basado en el instrumento **CHASIDE** (98 ítems verificados, 7 áreas: Administrativas, Humanísticas, Artísticas, Salud, Ingeniería, Defensa, Ciencias Exactas y Agrarias).

Sitio estático (HTML/CSS/JS puro, sin build step, pensado para GitHub Pages) con guardado de resultados en **Firebase** para el panel administrativo.

## Qué hace

1. **Bienvenida**: aviso de privacidad breve + código de acceso (sin nombre, sin datos personales — el código lo asigna la institución).
2. **Test CHASIDE**: 98 preguntas Sí/No, una por pantalla, con barra de progreso y opción de volver atrás.
3. **Resultado**: calcula el puntaje de las 7 áreas CHASIDE y un **modelo de Machine Learning (k-NN)** ordena las 8 carreras más afines a ese perfil, con su afinidad relativa. Se guarda en Firestore si está configurado.
4. **Cierre con PDF**: pantalla de agradecimiento con el botón **Descargar mis resultados (PDF)** (código, fecha, puntaje de las 7 áreas y carreras recomendadas) para entregarlo a la institución.
5. **Panel administrativo** (`admin.html`, sin enlace visible desde el sitio — solo por URL directa): login con correo/contraseña, tabla de resultados registrados con las áreas de cada código, descarga de PDF individual por resultado y **exportación a CSV** (Excel/SPSS).

## Estructura

```
index.html            entrada del sitio (estudiantes)
admin.html             panel administrativo (privado, sin enlace visible)
css/styles.css          estilos (tema oscuro)
js/data.js              banco de 98 ítems CHASIDE + catálogo de carreras (generado y verificado)
js/app.js               lógica del test (sin frameworks)
js/ml-model.js          modelo k-NN ya entrenado (generado por ml/train_model.py, no editar a mano)
js/ml-engine.js         inferencia del modelo en el navegador
ml/                     entrenamiento, validación y reentrenamiento del modelo (ver ml/README.md)
js/admin.js             lógica del panel admin (login, tabla, PDF)
js/firebase-config.js   claves de tu proyecto Firebase (hay que completarlas, ver abajo)
firestore.rules          reglas de seguridad de la base de datos
img/logo.png            logo del proyecto
```

## Configurar Firebase (obligatorio para guardar resultados y usar el panel admin)

El sitio funciona sin esto (el test se puede responder igual), pero **no se guardará ningún resultado** hasta que completes estos pasos. Es gratis.

1. Ve a [console.firebase.google.com](https://console.firebase.google.com) → **Crear un proyecto** (puedes desactivar Google Analytics, no hace falta).
2. Dentro del proyecto: **Compilación → Firestore Database → Crear base de datos** → modo producción → cualquier región cercana (ej. `southamerica-east1`).
3. En **Firestore → Reglas**, pega el contenido de [`firestore.rules`](firestore.rules) de este repo y publica.
4. **Compilación → Authentication → Comenzar → método de acceso → Correo/contraseña → habilitar.**
5. En **Authentication → Users → Add user**, crea tu propio usuario (el correo y contraseña con los que vas a entrar al panel admin — usa los que quieras, no tienen que ser los públicos del sitio).
6. **Configuración del proyecto (ícono de engranaje) → Tus apps → Web (`</>`) → registra una app** (nombre libre, no hace falta hosting de Firebase).
7. Copia el objeto `firebaseConfig` que te muestra y pégalo en [`js/firebase-config.js`](js/firebase-config.js), reemplazando los valores `REEMPLAZA_...`.
8. Commit + push. Listo — recarga el sitio y a partir de ahí los resultados quedan guardados.

## Correr localmente

Cualquier servidor estático sirve. Ejemplo:

```bash
python -m http.server 8000
```

Luego abrir `http://localhost:8000/`.

## Publicar en GitHub Pages

```bash
git add .
git commit -m "Actualiza sitio"
git push
```

En GitHub: **Settings → Pages → Source: Deploy from a branch → main / (root)**.

## Notas importantes

- **`admin.html` no está enlazado desde ningún lugar del sitio** — solo se llega ahí escribiendo la URL directamente. Aun así, no es invisible para nadie que la adivine: la única protección real es el login de Firebase, así que no compartas el link.
- Las claves en `js/firebase-config.js` son públicas por diseño (viajan al navegador de cada visitante) — la seguridad depende de las reglas de Firestore, no de mantener esas claves en secreto.
- Este sigue siendo un prototipo pensado para el piloto de tesis (32 estudiantes), no un sistema con miles de usuarios. Ver `firestore.rules` para el detalle del compromiso de seguridad que se tomó.
