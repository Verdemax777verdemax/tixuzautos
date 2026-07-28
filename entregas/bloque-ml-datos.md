# BLOQUE ML + DATOS RICOS

Fecha de cierre: 2026-07-14

## Estado

Implementacion, despliegue y corrida de prueba terminados. No se tocaron `index.html` ni archivos de frontend.

- Produccion: https://tixuzautos.com
- Deploy ID: `6a56acf8493d5148bf7caa01`
- Deploy unico: https://6a56acf8493d5148bf7caa01--cool-kataifi-78a65b.netlify.app
- Corrida de prueba: `nightly-20260714-213744948`
- Inicio: `2026-07-14T21:37:44.948Z`
- Fin: `2026-07-14T21:39:48.863Z`
- Busquedas procesadas: 3 (`Nissan Tsuru`, `Kia Rio`, `Chevrolet Spark`)
- Listings encontrados/upsertados: 6
- Nuevos: 5
- Actualizados: 1
- Grupos de imagen duplicada al terminar: 0

## Cobertura de la corrida

Los porcentajes se calcularon sobre los registros realmente guardados por cada fuente en esta corrida.

| Fuente | Listings | km | ciudad | fecha real | foto propia | Observacion |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| AutoCosmos | 2 | 100% | 100% | 0% | 100% | Dos fichas guardadas; las fichas no expusieron fecha verificable. |
| Kavak | 4 | 100% | 0% | 0% | 75% | Una imagen repetida fue rechazada y se guardo `null`. |
| MercadoLibre | 0 | N/A | N/A | N/A | N/A | OAuth valido para identidad, pero `/sites/MLM/search` y `/items` responden 403. |
| Seminuevos | 0 | N/A | N/A | N/A | N/A | Netlify no tiene `SCRAPERAPI_KEY`; no se hizo scraping directo sin la ruta autorizada. |
| **Total guardado** | **6** | **100%** | **33.33%** | **0%** | **83.33%** | Los valores no verificables permanecen en `null`. |

La cobertura de fecha es 0% porque ninguna de las fichas aceptadas en esta muestra expuso una fecha real verificable. El pipeline no transforma etiquetas relativas como `Hoy` en una fecha inventada.

## Adaptador MercadoLibre

Se creo `netlify/functions/lib/fuentes/mercadolibre-api.js` y se integro tanto a `buscar-externos` como al pipeline nocturno.

Implementado:

- Lectura de `ml_access_token`, `ml_refresh_token`, `ml_token_obtained_at` y `ml_token_expires_in` desde `app_config`.
- Renovacion al superar 5.5 horas o acercarse al vencimiento.
- Persistencia atomica del nuevo access token y del refresh token rotado.
- Reintento controlado ante 401.
- Busqueda oficial MLM categoria `MLM1744`.
- Lectura del detalle oficial para usar `pictures` del mismo anuncio.
- Mapeo de precio, anio, km, version, transmision, ciudad/estado, vendedor, `date_created`, foto y permalink.
- Error visible por fuente en la respuesta de busqueda y en `agg_ingest_runs`.

Verificacion real:

- El token actual responde 200 en `/users/me` y `/sites/MLM`.
- Los endpoints de listings responden `403 Access to requested resource is forbidden` con el grant actual.
- La busqueda en produccion muestra MercadoLibre como fuente fallida, no como una fuente activa con cero resultados silenciosos.
- El token tenia menos de 5.5 horas durante la prueba, por lo que no correspondia ejecutar una rotacion real; el umbral y guardado del nuevo par estan cubiertos por prueba automatizada.

## Extractores enriquecidos

Seminuevos, AutoCosmos y Kavak ahora priorizan objetos JSON-LD `Car`/`Vehicle` antes del HTML. El fallback HTML permanece para fichas sin schema util.

Normalizacion aplicada:

- kilometraje entero o `null`;
- ciudad real o `null`, nunca `Mexico` generico;
- fecha ISO real o `null`, nunca `Hoy` literal;
- version, transmision y vendedor cuando la ficha los publica;
- imagen de la ficha actual solamente; si no es verificable o se repite entre anuncios, `image_url`/`thumbnail_url` queda `null`.

## Censo de fuentes nuevas

Censo realizado con requests reales a `robots.txt` y, cuando fue posible, a una ficha individual. Los veredictos quedaron registrados en `agg_source_registry`.

| Fuente | robots.txt | Ficha | JSON-LD observado | Veredicto | Motivo |
| --- | --- | --- | --- | --- | --- |
| Das WeltAuto | No disponible | No disponible | No | BLOQUEADO | El dominio no resolvio DNS durante el censo (`EAI_AGAIN`). |
| Toyota Como Nuevos | No disponible | No disponible | No | BLOQUEADO | El dominio no resolvio DNS (`ENOTFOUND`). |
| Carmudi Mexico | No disponible | No disponible | No | BLOQUEADO | El dominio no resolvio DNS (`ENOTFOUND`). |
| ClikAuto | 200, permite ficha | 200 | Si, pero solo `BreadcrumbList`/`ListItem` | VIABLE | Ficha publica accesible; requiere parser HTML o datos embebidos. |
| Odetta | 404 | Redirige a Atom, 403 | No | BLOQUEADO | El dominio ya no presenta inventario automotriz operativo. |
| Dalton Seminuevos | 200, permite ficha | 200 | No valido en la ficha probada | VIABLE | Ficha publica con datos ricos en HTML. |
| Grupo Plasencia Seminuevos | 200 | Sin ficha individual verificable | No | BLOQUEADO | Portada accesible, pero no se encontro URL individual y declara imagenes ilustrativas. |

Fecha/hora del censo: `2026-07-14T21:29:49.656Z`.

## Archivos tocados

- `netlify/functions/lib/fuentes/mercadolibre-api.js`
- `netlify/functions/lib/nightly-ingest.cjs`
- `netlify/functions/lib/fuentes-externas.cjs`
- `netlify/functions/buscar-externos.js`
- `netlify/functions/lib/listing-normalize.cjs`
- `netlify/functions/lib/fuentes/seminuevos-discover.cjs`
- `netlify/functions/lib/fuentes/autocosmos-discover.cjs`
- `netlify/functions/lib/fuentes/kavak-discover.cjs`
- `tools/test-bloque-ml-datos.cjs`
- `tools/census-rich-sources.cjs`
- `tools/register-rich-source-census.cjs`
- `tools/verify-bloque-ml-production.cjs`
- `entregas/BLOQUE-ML-DATOS.md`

## Como probar

Desde la raiz del repo:

```powershell
node tools\test-bloque1-parsers.cjs
node tools\test-bloque-ml-datos.cjs
node tools\census-rich-sources.cjs
node tools\verify-bloque-ml-production.cjs
```

Busqueda viva con diagnostico de fuentes:

```powershell
Invoke-RestMethod "https://tixuzautos.com/api/buscar-vivo?q=aveo&nocache=1&debug=1"
```

Ingesta manual acotada:

```powershell
Invoke-RestMethod -Method Post "https://tixuzautos.com/.netlify/functions/ingesta-nocturna?limit=3&per_source_limit=2&max_runtime_ms=240000"
```

## REQUIERE LALO

1. MercadoLibre: solicitar o habilitar en la aplicacion OAuth actual acceso a los endpoints de busqueda/detalle de listings. El token existe, no esta vencido y funciona para identidad, pero el proveedor rechaza los recursos de anuncios con 403.
2. Seminuevos: agregar `SCRAPERAPI_KEY` a las variables de entorno de Netlify. Sin esa llave el extractor respeta la ruta acordada y registra el error en vez de usar acceso directo.

