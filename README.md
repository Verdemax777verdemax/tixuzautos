# Tixuz Autos — custodia del código de producción

Este repo conserva una foto fiel del código vivo de tixuzautos.com tomada del deploy de Netlify del 27-jul-2026.

## Ramas
- `produccion-actual`: espejo verificado del deploy vivo (1378 archivos del deploy + custodia).
- `main`: promovida desde `produccion-actual` después de la custodia.
- `main-congelado-05jun`: rama con el `main` viejo congelado el 05-jun-2026. NO deployar desde aquí.

## Receta de deploy
- Trabajar copiando el repo a `/tmp` antes de deployar: `/mnt` no soporta symlinks.
- Netlify NO debe conectarse a GitHub hasta que este código esté verificado arriba. Conectarlo antes puede hacer rollback de 8 semanas en vivo.
- Al tocar `assets/app.js`, subir el `?v=` en `index.html` para romper caché.
- No refactorizar ni “mejorar” esta foto; cambios de lógica van en tareas aparte.
