# BLOQUE CALIDAD DE DATOS

Fecha de cierre: 2026-07-14 (America/Mexico_City)

## Estado ejecutivo

El bloque de codigo, frontend, censo, deploy e ingesta de prueba quedo terminado.

- Produccion: https://tixuzautos.com
- Deploy ID: `6a56d1d9535b43cba4c57b52`
- Deploy unico: https://6a56d1d9535b43cba4c57b52--cool-kataifi-78a65b.netlify.app
- Corrida de prueba: `nightly-20260715-002340444`
- Consulta procesada: `Suzuki Swift`
- Inicio: `2026-07-15T00:23:40.444Z`
- Fin: `2026-07-15T00:24:43.731Z`
- Listings encontrados/upsertados: 4
- Nuevos: 4
- Actualizados: 0

El criterio completo de MercadoLibre no puede declararse cumplido: el OAuth y ambos tokens son validos para identidad, pero MercadoLibre devuelve 403 tanto en `/sites/MLM/search` como en `/items/{id}`. No se inventaron resultados ML ni se los reemplazo por otra fuente bajo la etiqueta MercadoLibre.

## Resultado Suzuki Swift en produccion

Antes del cambio, AutoCosmos mostraba un Swift 2019 en `$56,196`, sin km ni ciudad. La ficha original publica realmente:

- precio total: `$229,000`;
- kilometraje: `47,976 km`;
- ciudad/estado: `Iztapalapa, Ciudad de Mexico`;
- version: `Booster Jet Aut`;
- transmision: `Automatica`.

El monto `$56,196` aparece en la descripcion como `inversion inicial`, no como precio del auto. El buscador ahora abre la ficha AutoCosmos y toma el precio total de `Offer/itemprop=price`; los resumenes financieros se descartan.

Verificacion de `/api/buscar-vivo?q=suzuki swift&nocache=1`:

- 14 resultados externos en la muestra;
- 3 AutoCosmos enriquecidos con km y ciudad;
- 0 precios recientes menores a `$60,000`;
- 0 anios mayores al anio actual + 1;
- ciudades de Seminuevos recuperadas de la URL cuando son verificables;
- MercadoLibre: 0 resultados por 403 del proveedor.

Verificacion del frontend renderizado:

- 15 tarjetas visibles;
- 4 imagenes reales cargadas (`naturalWidth > 0`);
- 11 placeholders `Imagen de referencia`;
- 0 imagenes rotas visibles;
- `Mas recientes` oculto porque mas de 50% no tiene fecha real;
- `Menor km` oculto porque mas de 50% no tiene km.

## Cobertura de la ingesta de prueba

Los porcentajes se calculan sobre los registros realmente guardados por fuente en esta corrida.

| Fuente | Listings | km | ciudad | fecha real | precio | foto propia |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| AutoCosmos | 2 | 100% | 100% | 0% | 100% | 100% |
| Kavak | 2 | 100% | 0% | 0% | 100% | 100% |
| MercadoLibre | 0 | N/A | N/A | N/A | N/A | N/A |
| Seminuevos | 0 | N/A | N/A | N/A | N/A | N/A |
| **Total guardado** | **4** | **100%** | **50%** | **0%** | **100%** | **100%** |

Las cuatro fotos guardadas respondieron HTTP 206 con `image/webp` o `image/jpeg`.

La cobertura de fecha es 0% porque las fichas aceptadas no expusieron una fecha real verificable. Se guardo `null`; no se convirtio `Hoy` ni la fecha de extraccion en fecha de publicacion.

## Validaciones anti-basura

Se centralizaron en `listing-normalize.cjs` y se aplican en busqueda viva y antes del upsert nocturno.

- Precio reciente menor a `$40,000`: `null` y evento de validacion.
- Monto financiero menor a `$100,000` con contexto `mensualidad`, `enganche` o `inversion inicial`: `null`.
- Anio anterior a 1980 o superior al actual + 1: `null`.
- Kilometraje superior a 500,000: `null`.
- Kilometraje 0 en auto con mas de dos anios: `null`.
- Los eventos se guardan en `agg_ingest_runs.detalle.validation_rejections` y sus totales en `validation_rejection_counts`.

Rechazos en la corrida real:

| Campo | Rechazos |
| --- | ---: |
| Precio | 0 |
| Anio | 0 |
| Kilometraje | 0 |

La limpieza previa reviso 164 registros activos y no encontro valores que violaran estas reglas. El caso `$56,196` no llego al upsert: el enriquecimiento de ficha obtuvo antes el precio total correcto de `$229,000`.

## MercadoLibre

Implementado en `netlify/functions/lib/fuentes/mercadolibre-api.js`:

- tokens leidos desde `app_config`;
- refresh automatico al superar 5.5 horas o acercarse al vencimiento;
- guardado obligatorio del nuevo access token y refresh token rotado;
- busqueda oficial en categoria `MLM1744` con condicion `used`;
- mapeo desde resultados de busqueda aun si falla el detalle;
- atributos `VEHICLE_YEAR`, `KILOMETERS`, `TRANSMISSION` y `TRIM`;
- ciudad/estado desde `location`, `address` o `seller_address`;
- fecha `date_created`, vendedor y permalink;
- thumbnail en alta, cambiando sufijo `-I` a `-O`;
- precio oculto o nulo conservado como `null`.

Diagnostico real del token actual:

- `ml_access_token`: presente;
- `ml_refresh_token`: presente;
- obtenido: `2026-07-14T21:08:20.725Z`;
- vigencia declarada: 21,600 segundos;
- no requeria refresh al verificar;
- `/users/me`: 200, usuario MLM activo;
- `/sites/MLM/search`: 403 con y sin token;
- `/items/{id}`: 403 `access_denied`.

## Extractores enriquecidos

Seminuevos, AutoCosmos y Kavak priorizan JSON-LD `Car`/`Vehicle` y usan HTML solo como fallback. Capturan km, version, transmision, ciudad, vendedor y fecha cuando la ficha los publica.

AutoCosmos tiene un selector dedicado de precio total que prioriza:

1. `schema.org Offer.price`;
2. `itemprop=price`;
3. texto explicito `precio $X` del titulo.

No usa cantidades de la descripcion financiera como precio.

## Censo de fuentes nuevas

Censo repetido con requests reales el `2026-07-15T00:16:21.201Z` y persistido en `agg_source_registry`.

| Fuente | robots/ficha | JSON-LD Vehicle | Veredicto | Motivo |
| --- | --- | --- | --- | --- |
| Das WeltAuto | DNS no disponible | No | BLOQUEADO | `EAI_AGAIN`; sin robots ni ficha accesible. |
| Toyota Como Nuevos | DNS no disponible | No | BLOQUEADO | `ENOTFOUND`. |
| Carmudi Mexico | DNS no disponible | No | BLOQUEADO | `ENOTFOUND`. |
| ClikAuto | robots 200, ficha 200 | No; solo BreadcrumbList/ListItem | VIABLE | Ficha individual publica; requiere parser HTML. |
| Odetta | robots 404, redireccion externa | No | BLOQUEADO | Redirige a Atom; ya no presenta inventario operativo. |
| Dalton Seminuevos | robots 200, ficha 200 | No | VIABLE | Ficha publica con datos ricos en HTML. |
| Grupo Plasencia Seminuevos | robots 200, sin ficha individual | No | BLOQUEADO | No se encontro URL individual verificable. |

## Archivos tocados

- `netlify/functions/lib/listing-normalize.cjs`
- `netlify/functions/lib/fuentes/mercadolibre-api.js`
- `netlify/functions/lib/fuentes-externas.cjs`
- `netlify/functions/lib/nightly-ingest.cjs`
- `netlify/functions/autocosmos-discover.cjs`
- `netlify/functions/seminuevos-discover.cjs`
- `netlify/functions/buscar-serper.mjs`
- `assets/app.js`
- `index.html`
- `tools/test-bloque-ml-datos.cjs`
- `tools/test-calidad-frontend.cjs`
- `tools/verify-quality-search.cjs`
- `tools/prepare-quality-ingest.cjs`
- `tools/verify-bloque-calidad-production.cjs`
- `tools/verify-ml-access.cjs`
- `tools/register-rich-source-census.cjs`
- `entregas/BLOQUE-CALIDAD-DATOS.md`

## Como probar

```powershell
node tools\test-bloque1-parsers.cjs
node tools\test-bloque-ml-datos.cjs
node tools\test-calidad-frontend.cjs
npm exec --yes --package netlify-cli -- netlify dev:exec node tools\verify-quality-search.cjs
npm exec --yes --package netlify-cli -- netlify dev:exec node tools\verify-ml-access.cjs
```

Produccion:

```powershell
Invoke-RestMethod "https://tixuzautos.com/api/buscar-vivo?q=suzuki%20swift&nocache=1&debug=1"
Invoke-RestMethod "https://tixuzautos.com/api/buscar-serper?q=suzuki%20swift&nocache=1&debug=1"
```

## REQUIERE LALO

1. MercadoLibre: abrir caso con soporte/desarrolladores de MercadoLibre para habilitar a la aplicacion `7121462285530717` el acceso a recursos publicos de items/search. El OAuth ya esta bien; el bloqueo actual es 403 de permisos/politica del proveedor.
2. Seminuevos: agregar `SCRAPERAPI_KEY` a Netlify. Sin esa variable solo se pueden usar resumenes de descubrimiento, por lo que km y fecha real permanecen en `null`.

