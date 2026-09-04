# OrientaIA — Test Vocacional CHASIDE

Prototipo web del sistema de orientación vocacional para estudiantes de 4to y 5to de secundaria, basado en el instrumento **CHASIDE** (98 ítems verificados, 7 áreas: Administrativas, Humanísticas, Artísticas, Salud, Ingeniería, Defensa, Ciencias Exactas y Agrarias).

Sitio 100% estático (HTML/CSS/JS puro, sin dependencias ni build step) — pensado para GitHub Pages.

## Qué hace

1. **Bienvenida**: aviso de privacidad breve + código de acceso (sin nombre, sin datos personales — el código lo asigna la institución).
2. **Test CHASIDE**: 98 preguntas Sí/No, una por pantalla, con barra de progreso y opción de volver atrás.
3. **Resultado**: calcula las 2 áreas con mayor puntaje del estudiante y muestra las carreras afines a esas áreas.
4. **Cuestionario TAM**: 14 ítems (escala 1-5) para medir la percepción de utilidad del sistema.
5. **Cuestionario en blanco imprimible**: versión en papel de las 98 preguntas, por si se necesita aplicar sin dispositivo.

## Estructura

```
index.html        entrada del sitio
css/styles.css     estilos (tema oscuro)
js/data.js         banco de 98 ítems CHASIDE + catálogo de carreras (generado y verificado)
js/app.js          lógica de la aplicación (sin frameworks)
```

## Correr localmente

Cualquier servidor estático sirve. Ejemplo:

```bash
python -m http.server 8000
```

Luego abrir `http://localhost:8000/`.

## Publicar en GitHub Pages

```bash
git init
git add .
git commit -m "Prototipo OrientaIA - test vocacional CHASIDE"
git branch -M main
git remote add origin <URL_DE_TU_REPO>
git push -u origin main
```

Luego, en GitHub: **Settings → Pages → Source: Deploy from a branch → Branch: main / (root)**.

## Nota importante

Este es un **prototipo de demostración**, no el sistema final de recolección de datos. Al ser 100% estático, no guarda respuestas en ningún servidor — cada visita empieza de cero. El sistema real para el piloto con los 32 estudiantes necesita un backend (ver plan de Fase 1 técnica: Flask + base de datos) para almacenar respuestas de forma persistente y exportarlas a Excel/SPSS.
