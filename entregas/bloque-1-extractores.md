# BLOQUE 1 - Integridad de datos y pipeline nocturno

Fecha: 2026-07-14

Proyecto: Tixuz Autos agregador  
Netlify: `cool-kataifi-78a65b`  
Supabase: `rbiuoljoduekajivffzh`  
Deploy de backend verificado: `6a566a909d0a832e88067b85`

## Resultado

Se reemplazaron los extractores de Seminuevos, AutoCosmos y Kavak con parsers de ficha individual. El inventario nocturno ya no acepta URLs de categorias, busquedas o guias de precios como si fueran anuncios.

- Seminuevos: descubrimiento y detalle exclusivamente mediante ScraperAPI.
- AutoCosmos: HTML directo de listado y ficha individual.
- Kavak: sitemap de fichas y JSON-LD `Car` de cada anuncio.
- Fotos: solo se persiste una imagen extraida de la misma ficha. Si no se puede demostrar la relacion, `image_url` y `thumbnail_url` quedan en `null`.
- Normalizacion: kilometraje entero o `null`; ciudad y estado separados; nunca se guarda `Mexico` generico; fecha absoluta ISO o `null`.
- Metadatos: version, transmision, vendedor y fecha se conservan en `raw_payload`; las columnas existentes `city`, `state`, `seller_type` e `image_url` tambien se llenan directamente.
- El guardado superficial desde la busqueda viva quedo desactivado. Solo el pipeline profundo escribe nuevas fichas externas en `agg_autos_inventory`.

## Pipeline nocturno

`ingesta-nocturna` corre a las `09:00 UTC` una vez al dia. La scheduled function encola `ingesta-nocturna-background`, que puede trabajar hasta 15 minutos sin el limite de 30 segundos de una scheduled function normal.

La corrida toma 25 busquedas por defecto (rango permitido 1-30; produccion queda en 25) de `agg_search_queue`, ordenadas por:

1. `last_run_at` mas antiguo, con nulos primero.
2. `priority` descendente.
3. `created_at` ascendente.

Cada busqueda actualiza `last_run_at`, por lo que las 50 entradas activas rotan en round-robin. Cada corrida se registra en `agg_ingest_runs` con inicio, fin, consultas, altas, actualizaciones, cobertura y errores separados por fuente.

El cron viejo separado de Kavak fue desactivado para evitar ingestas duplicadas.

## Corrida productiva de prueba

Run ID: `nightly-20260714-170128113`  
Inicio: `2026-07-14T17:01:28.113Z`  
Fin: `2026-07-14T17:02:32.138Z`

| Metrica | Resultado |
|---|---:|
| Busquedas procesadas | 3 |
| Listings encontrados/upsertados | 5 / 5 |
| Nuevos / actualizados | 4 / 1 |
| Kilometraje lleno | 100% (5/5) |
| Ciudad llena | 40% (2/5) |
| Fecha real llena | 0% (0/5) |
| Foto propia llena | 100% (5/5) |
| Fotos duplicadas entre anuncios | 0 |
| Fotos invalidas para su fuente | 0 |
| URLs que no eran ficha individual | 0 |

El 0% de fecha es intencional: las fichas probadas de AutoCosmos y Kavak no exponen una fecha de publicacion verificable. Se guardo `null`; no se uso la fecha de extraccion ni textos relativos como `Hoy`.

La corrida escaneo 165 filas activas del inventario relevante. La cuarentena automatica deja fuera URLs que no sean fichas individuales. Las imagenes historicas ya no se eliminan solo por carecer de la marca nueva `image_verified`; se conservan hasta poder verificar o rechazar la ficha concreta.

## Correccion de fotos historicas (2026-07-14)

Deploy: `6a567c104118894eb44deef5`

La primera version del saneamiento dejo en `null` miniaturas historicas validas de AutoCosmos porque esos registros eran anteriores a `raw_payload.image_verified`. Se corrigio la regla y se volvieron a consultar las fichas individuales afectadas.

- 122 anuncios de AutoCosmos recuperaron su `og:image` original.
- Los 9 Aveo activos quedaron con 9 imagenes distintas y cargando correctamente.
- Se detecto una foto repetida por el propio portal en dos fichas Taos; una se dejo en `null` para no reutilizarla.
- El reparador ya no guarda SVG ni placeholder como `thumbnail_url`.
- El reparador y el pipeline rechazan una imagen ya asignada a otra ficha.
- Produccion reporta 0 miniaturas pendientes para `AutoCosmos + Chevrolet + Aveo`.

## REQUIERE LALO

Falta crear `SCRAPERAPI_KEY` en las variables de entorno de Netlify. La integracion esta desplegada y falla de forma aislada con `missing_SCRAPERAPI_KEY`; AutoCosmos y Kavak siguen procesandose y el error queda en `agg_ingest_runs.errors`.

Una vez disponible la llave:

```powershell
npm exec --package netlify-cli -- netlify env:set SCRAPERAPI_KEY <VALOR> --context production
```

Despues se puede repetir una corrida acotada para medir Seminuevos.

## Archivos tocados

- `netlify/functions/seminuevos-discover.cjs`
- `netlify/functions/autocosmos-discover.cjs`
- `netlify/functions/kavak-discover.cjs`
- `netlify/functions/lib/listing-normalize.cjs`
- `netlify/functions/lib/fuentes-externas.cjs`
- `netlify/functions/lib/nightly-ingest.cjs`
- `netlify/functions/buscar-externos.js`
- `netlify/functions/backfill-thumbnails.js`
- `netlify/functions/ingesta-nocturna.mjs`
- `netlify/functions/ingesta-nocturna-background.mjs`
- `netlify/functions/ingesta-nocturna.cjs` (retirado)
- `netlify/functions/kavak-ingest.js`
- `tools/test-bloque1-parsers.cjs`
- `tools/run-bloque1-once.cjs`
- `tools/verify-bloque1-production.cjs`
- `entregas/BLOQUE-1-extractores.md`

`index.html` y los archivos de frontend no fueron modificados.

## Como probar

Pruebas de parsers y reglas de integridad:

```powershell
node tools\test-bloque1-parsers.cjs
```

Disparar una corrida productiva acotada (la respuesta `202` confirma que fue encolada):

```powershell
Invoke-RestMethod -Method Post "https://tixuzautos.com/.netlify/functions/ingesta-nocturna?limit=3&per_source_limit=1&max_runtime_ms=180000"
```

Verificar el ultimo run y sus listings en Supabase sin imprimir la llave:

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = (npm exec --package netlify-cli -- netlify env:get SUPABASE_SERVICE_ROLE_KEY --context production | Select-Object -Last 1)
node tools\verify-bloque1-production.cjs
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY
```

Comprobaciones de produccion realizadas:

- `/.netlify/functions/health` responde `200`.
- `ingesta-nocturna` responde `202` y encola la Background Function.
- `ingesta-nocturna` e `ingesta-nocturna-background` aparecen desplegadas en Netlify.
- El run productivo y sus cinco listings existen en Supabase.
- Las cinco fotos del run son distintas y pertenecen a sus fichas.
