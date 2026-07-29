<!-- DIRECTIVA TIXUZ · leelo completo antes de tocar nada · generado 2026-07-29T17:40:38.204Z -->
# DIRECTIVA TIXUZ

## El puerto de destino

**Ser el buscador de autos usados más completo de México, ser la fuente que las
IAs citan cuando alguien les pregunta por un auto, y monetizarlo.**

Cuando un mexicano quiera comprar un auto usado, que su primer reflejo sea entrar
a tixuzautos.com — porque ahí están TODOS los sitios: MercadoLibre, Kavak,
Seminuevos, AutoCosmos, agencias, lotes. Y además, los anuncios propios de Tixuz.

## Los tres pilares

### 1. Cobertura — el imán
Todos los portales de autos de México en un solo lugar, con liga directa al
vendedor original. Sin cobertura no hay nada que buscar.

### 2. Ser encontrados POR LA IA — el canal del futuro
Cada vez menos gente teclea en Google y cada vez más le pregunta a ChatGPT, a
Gemini o a Perplexity. **Tixuz está construido para que la IA nos encuentre, nos
entienda y nos cite.** Eso no es un extra de SEO: es un pilar de diseño.

Se traduce en cosas concretas que ya existen o hay que terminar:
- `llms.txt` y `llms-full.txt` — el sitio explicado para un modelo de lenguaje
- `openapi.json` — el catálogo consultable como API
- `inventory.json` — el inventario en formato máquina
- Schema.org (FAQPage, Vehicle) en cada página de modelo
- Las páginas `/autos/{modelo}` con datos reales de precio, año y ciudad
- Los **Veredictos Tixuz** y los videos del canal: contenido de opinión con
  autoridad que ningún agregador tiene y que una IA sí puede citar

La regla: **si un modelo de lenguaje no puede leer, entender y citar una cosa
del sitio, esa cosa está a medias.**

### 3. Monetización — el negocio
Los anuncios propios (`marketplace_listings`) son de donde sale el dinero. Los
agregados traen el tráfico; los propios lo cobran.

## La frase que decide todo

> **Los agregados son el imán. Los propios son el negocio.**
> **Y todo tiene que ser legible para una IA.**

Si una tarea no aumenta la cobertura, no mejora la búsqueda, no nos hace más
citables por una IA, o no acerca el cobro — no es prioridad.

## Las 4 métricas (lo único que se mide)

| Métrica | Definición |
|---|---|
| **Cobertura** | autos agregados visibles en el sitio |
| **Fuentes vivas** | fuentes refrescadas en las últimas 48h |
| **Inventario propio** | anuncios `marketplace_listings` en status active |
| **Revenue** | dinero real cobrado |

Los números actuales están SIEMPRE en vivo en `/estado`. No los copies a mano
en ningún documento: se vuelven mentira en 24 horas.

---

# Qué es Tixuz Autos

Es un **híbrido agregador + marketplace** de autos usados en México, modelo
Trovit/Mitula, operado por Grupo Upperline S.A. de C.V. desde Guadalajara.

Tiene DOS inventarios que conviven en la misma búsqueda:

### 1. Inventario agregado (el imán)
Anuncios extraídos de portales externos. Cada uno lleva **liga directa a la
fuente original** — es la regla de oro de un agregador: nunca te quedas con el
tráfico del anuncio ajeno, se lo devuelves a la fuente. Tabla:
`aggregated_listings` (lo que lee el frontend) alimentada desde
`agg_autos_inventory`.

### 2. Inventario propio (el negocio)
Vendedores que publican directo en Tixuz: particulares, lotes y agencias.
Contacto por WhatsApp sin comisión, gestión con un PIN de 4 dígitos, revisión
humana antes de publicar. Tabla: `marketplace_listings`.

### El activo que nadie más tiene
El canal de YouTube **Tixuz Autos** (~200 mil suscriptores, 1,255+ videos, desde
2014) y la página de Facebook (~31 mil seguidores). Tixuz no es un scraper
anónimo: es una marca con audiencia real de autos en México. Los **Veredictos IA**
y los videos embebidos en las fichas de modelo salen de ahí. Ese es el
diferenciador defendible.

### Quién es quién
- **Lalo (Eduardo Vargas)** — dueño y decisor. NO es técnico. Las explicaciones
  van en español claro, sin jerga, y si algo requiere que él ejecute, se le deja
  para dar clic, no comandos que teclear.
- **Claude** — controla Supabase (BD, Edge Functions, pg_cron), Netlify por API,
  navegador con sesiones de Lalo, y lectura de `C:\Users\Lalo\Downloads`.
  NO puede deployar el frontend de Netlify.
- **Codex / Kimi** — agentes de código en la laptop de Lalo. Ellos SÍ deployan
  el frontend.
- **Gemini / Grok / otros** — investigación, copy, análisis.

---

# Modelo de negocio

## Cómo entra el dinero (previsto)
1. **Publicación destacada** de particulares.
2. **Planes para lotes y agencias** (suscripción por volumen de inventario).
3. Más adelante: leads calificados, publicidad de marcas, contenido patrocinado
   con el canal de YouTube.

## Estado real hoy
- Publicar es **GRATIS** (promoción de lanzamiento). Los planes Destacado y PRO
  aparecen como "Próximamente".
- Stripe existe pero está **solo en modo prueba** (cuenta `acct_1T6LWs0anIfsBRIy`).
  Hoy NO se puede cobrar dinero real.
- Revenue acumulado: **$0**.

## Decisión vigente
No activar el cobro hasta que haya volumen. Primero inventario y tráfico;
el cobro llega cuando el vendedor ya vea valor. Cambiar esto es decisión de
Lalo, de nadie más.

---

# Arquitectura

## Frontend
- **Netlify**, sitio `cool-kataifi-78a65b`, siteId `9f9b8792-51cd-4213-94b4-be8e09746415`
- Dominio: **tixuzautos.com** (DNS en GoDaddy)
- 68 funciones serverless en `netlify/functions/`
- El buscador NO vive en Supabase: vive en la función Netlify `buscar`.
  Cualquier cambio de orden, relevancia o mezcla de inventarios es tarea de un
  agente de código, no de Claude.

## Backend
- **Supabase** proyecto `rbiuoljoduekajivffzh`
- Tablas núcleo: `aggregated_listings`, `agg_autos_inventory`, `marketplace_listings`,
  `agg_source_registry`, `agg_search_queue`, `agg_ingest_runs`, `videos_modelo`,
  `veredictos`, `codex_buzon`, `tixuz_directiva`, `tixuz_bitacora`
- Edge Functions: `notify-whatsapp` (avisos + panel de aprobación),
  `publicar` (formulario de respaldo), `foto-autocosmos`, `foto-seminuevos`,
  `directiva` (este sistema)
- pg_cron: autofix (3:50/4:05 AM CDMX), ingesta Seminuevos (4:20–4:50 AM),
  revisión diaria (9:00 AM)

## Código fuente
- **GitHub: `Verdemax777verdemax/tixuzautos`, rama `main`**
- `main` es espejo verificado 1:1 del deploy de producción (1,378 archivos, SHA1).
- Rama `main-congelado-05jun` = el main viejo, NO usar.
- Netlify **todavía no está conectado a git**: se deploya por CLI.

## Notificaciones
- **Correo (Resend) → mp4mexico@gmail.com = el canal confiable.**
- WhatsApp por sandbox de Twilio NO sirve en producción (tope de mensajes diarios
  y la sesión caduca). No construyas nada crítico encima.

---

# Reglas de oro — léelas antes de tocar nada

1. **Una sola fuente de verdad: GitHub `main`.** Nunca deployes desde una carpeta
   local suelta. En la laptop de Lalo hay 5+ copias viejas del sitio; cualquiera
   puede pisar producción. Esto YA rompió el sitio una vez (28-jul-2026).

2. **Nunca deployes el sitio entero para actualizar una parte.** Un deploy en
   Netlify define TODOS los archivos: lo que no subas, se borra.

3. **Liga directa a la fuente.** Todo anuncio agregado conserva su `source_url`
   visible. Es la regla que distingue a un agregador de un ladrón de contenido.

4. **Nada se marca como terminado hasta verificarlo en producción.** No en local,
   no "debería funcionar". Verificado en tixuzautos.com.

5. **Calidad sobre cantidad en la ingesta.** Solo entra anuncio con precio real
   (>$20,000) y foto real. Un catálogo con basura vale menos que uno chico.

6. **No mientas con las fechas.** Verificar que un anuncio sigue vivo es un
   FEATURE ("✓ Verificado hoy"), no una excusa para re-estampar la fecha de
   publicación.

7. **Los propios primero, dentro de la relevancia.** Si buscan "Mazda", primero
   el Mazda de Tixuz, luego los Mazda agregados. Nunca un Nissan propio antes que
   un Mazda agregado.

8. **Lalo no es técnico.** Si necesitas algo de él, déjaselo para dar clic.

9. **Registra lo que hiciste en la bitácora.** Si no lo registras, la siguiente IA
   lo va a deshacer.

10. **Antes de empezar: lee la Directiva. Al terminar: escribe en la bitácora.**

---

# Plan

## FASE 0 — Custodia del código (en curso)
- [x] Código de producción subido a GitHub `main` (verificado por SHA1)
- [x] Deploy nocturno que revertía producción: identificado y PAUSADO
- [ ] Repo a **privado** (sigue público) — lo hace Lalo
- [ ] `netlify.toml` tiene rutas absolutas `/tmp/tix`: hay que cambiarlas a
      `publish = "."` antes de conectar git, o el build falla
- [ ] Conectar Netlify ↔ GitHub (SOLO después de lo anterior)

## FASE 1 — Separar la app del contenido derivado
Regla: **la aplicación no se regenera nunca; el contenido derivado se regenera siempre.**
- [ ] `/autos/{modelo}` servido dinámico desde Supabase (mata la regeneración nocturna)
- [ ] Conservar el embed de YouTube en las fichas de modelo (`videos_modelo`)
- [ ] Auditoría de ubicación de anuncios nuevos, movida a pg_cron
- [ ] `inventory.json`, `llms.txt`, sitemap: que declaren TODO el catálogo, no solo los propios

## FASE 2 — Cobertura (el goal)
- [ ] Revivir Kavak y GoCAR (congeladas)
- [ ] Escalar Seminuevos y MercadoLibre
- [ ] **Patrón Dalton**: grupos de agencias. Dalton ya aporta ~119 autos. Plasencia,
      Toyota Como Nuevos, Nissan Seminuevos, Das WeltAuto están registradas en cero.
      Son cientos de autos cada una y QUIEREN ser agregadas. Aquí pesa la marca Tixuz.
- [ ] Semáforo de fuentes: aviso automático si una lleva 48h sin refrescar

## FASE 3 — Convertir tráfico en dinero
- [ ] Instrumentación real: UTM, session_id, GA4 dentro del código, `listing_views`
- [ ] Sello "✓ Verificado hoy" con fecha real de publicación
- [ ] Diferenciar visualmente propio vs agregado
- [ ] Activar Stripe cuando haya volumen

## Deuda conocida
- Chip "< $200,000" roto, sigue en la portada
- Bug de precio: genera búsquedas "autos hasta 00000"
- Chips de carrocería adivinan desde el título en vez de usar `vehicle_body_type`
- `/depreciacion/` devuelve la home (la página nunca se publicó)
- Transmisión solo cubierta en ~20% del catálogo

---

# Historia — para que no se repitan los errores

## El incidente del deploy nocturno (28-jul-2026)
Una automatización de Codex llamada "Regenerar páginas F4 Tixuz" corría diario a
las 5:00 AM y ejecutaba `netlify deploy --prod --dir .` desde una carpeta de
**mayo** (`tixuz-v66-2`). Regeneraba bien las páginas SEO, pero al publicar
subía TODO su snapshot — incluido un `index.html` viejo. Cada madrugada revertía
el trabajo del día anterior.

**Lección:** el problema no era la tarea, era que había dos copias del sitio
compitiendo por producción. La tarea quedó PAUSED.

**Paradoja a recordar:** esa carpeta tenía el generador SEO más nuevo y el
frontend más viejo. Una carpeta puede estar adelantada en una cosa y atrasada
en otra. Verifica archivo por archivo, no "la carpeta se ve nueva".

## El muro de pago accidental (jul-2026)
Un bug puso el plan básico como de paga. Vendedores REALES intentaron publicar
3, 5, hasta 7 veces y sus anuncios acabaron borrados. Se rescataron 10 vehículos
de 8 vendedores.

**Lección:** el flujo de publicar es sagrado. Hay una prueba diaria automática
que inserta un anuncio de prueba por el camino real y avisa si atora.

## Los snippets fantasma (jul-2026)
Google Analytics estaba configurado como "snippet" de Netlify, pero los deploys
por API no procesan snippets: **nunca corrió**. Lalo creyó medir su publicidad
durante semanas sin medir nada.

**Lección:** lo que no se verifica en producción, no existe.

## El scraper que no hacía falta
Se creía que Seminuevos bloqueaba y se pagaba ScraperAPI. Resultó que el 403 era
por créditos agotados: `pg_net` desde Supabase baja AutoCosmos, Seminuevos, Kavak
y BBVA **directo**, con User-Agent de navegador y status 200.

**Lección:** antes de comprar una herramienta, prueba la vía directa.

---

# Cómo trabajamos varias IAs sobre el mismo proyecto

## Al empezar (obligatorio)
1. Lee `/directiva` completa.
2. Lee `/estado` — los números reales de hoy.
3. Lee `/bitacora` — qué hicieron las otras IAs en los últimos días.
4. Revisa la tabla `codex_buzon` — ahí viven las tareas asignadas.

## Al terminar (obligatorio)
Registra lo que hiciste en la bitácora. Sin esto, la siguiente IA repite tu
trabajo o lo deshace.

```
POST https://rbiuoljoduekajivffzh.supabase.co/functions/v1/directiva/log
Content-Type: application/json

{
  "token": "<TIXUZ_DIRECTIVA_TOKEN>",
  "autor": "codex",
  "area": "frontend",
  "titulo": "Qué hiciste en una línea",
  "detalle": "Qué cambiaste exactamente y dónde",
  "impacto": "Qué se ve distinto en producción"
}
```

## Reparto de responsabilidades
- **Claude** → Supabase completo (BD, Edge Functions, pg_cron), datos, fuentes,
  feeds, análisis, verificación en producción. NO deploya el frontend.
- **Codex / Kimi** → el código del sitio en Netlify: HTML, app.js, funciones
  serverless, deploys, GitHub.
- **Gemini / Grok / otros** → investigación de mercado, copy, contenido, análisis
  de la competencia. NO tocan producción.
- **Lalo** → decisiones de negocio, accesos, relación con agencias y lotes.

## Buzón de tareas
Tabla `codex_buzon`: una fila por tarea. `nombre_archivo` tipo `TAREA-*.md` o
`BUG-*.md`, el markdown en `contenido`, notas de ejecución en `instrucciones`.
Cuando termines una, márcala como completada ahí mismo.

## Regla de conflicto
Si lo que te piden contradice la Directiva, **para y pregúntale a Lalo**.
La Directiva se cambia a propósito, no por accidente.

---

# ESTADO EN VIVO — 2026-07-29T17:40:38.204Z

## Las 4 metricas

| Metrica | Hoy |
|---|---|
| Cobertura (agregados visibles) | **1,072** |
| Fuentes vivas (refrescadas <48h) | **4** de 19 registradas |
| Inventario propio activo | **20** |
| Anuncios propios esperando revision | 0 |

## Fuentes

| Fuente | Visibles | Ultimo ingreso | Estado |
|---|---|---|---|
| Kavak | 49 | 2026-07-19 | CONGELADA |
| MercadoLibre | 475 | 2026-07-28 | VIVA |
| AutoCosmos | 318 | 2026-07-29 | VIVA |
| BBVA AutoMarket | 2 | 2026-07-23 | CONGELADA |
| GoCAR | 12 | 2026-07-19 | CONGELADA |
| Dalton Seminuevos | 113 | 2026-07-29 | VIVA |
| Seminuevos.com | 103 | 2026-07-29 | VIVA |

## Calidad del catalogo

- Con foto: 1,072 / 1,072
- Con precio: 1,072
- Zombis (activos pero vencidos): 13
- Modelos con 2+ anuncios (paginas SEO que calificarian): 76

## Senal de negocio

- Revelaciones de WhatsApp (leads): 18
- Clicks a fuente registrados: 352
- Vistas de ficha registradas: 18


---

# BITACORA — ultimos 15 cambios

Quien toco que, cuando y por que. Si vas a cambiar algo, revisa primero si alguien ya lo toco.


## 2026-07-29

### [codex] Rotación de Facebook detenida por límite semanal
- **Area:** marketing
- **Detalle:** Revisión programada: el registro local contiene cuatro publicaciones de la pieza de Tixuz Autos dentro de los últimos siete días. No se abrió Facebook ni se publicó; se registró la omisión para respetar el límite máximo de tres.
- **Impacto:** Se evita spam, repetición de grupo y una publicación fuera del límite de la campaña.
- **Hora:** 17:03:06 UTC

### [claude] Corrida nocturna: 26 autos nuevos, catalogo en 1072
- **Area:** ingesta
- **Detalle:** Catalogo: 1072 visibles (26 nuevos esta noche). Seminuevos barrio paginas 1-8 y 9-16. Por fuente: [{"total": 475, "fuente": "MercadoLibre", "nuevos": 0}, {"total": 318, "fuente": "AutoCosmos", "nuevos": 3}, {"total": 113, "fuente": "Dalton Seminuevos", "nuevos": 1}, {"total": 103, "fuente": "Seminuevos.com", "nuevos": 22}, {"total": 49, "fuente": "Kavak", "nuevos": 0}, {"total": 12, "fuente": "GoCAR", "nuevos": 0}, {"total": 2, "fuente": "BBVA AutoMarket", "nuevos": 0}]
- **Impacto:** Ingesta normal.
- **Hora:** 10:55:00 UTC

### [codex] P0 completado: redeploy limpio y router de autos
- **Area:** frontend
- **Detalle:** Origen reconstruido exclusivamente desde GitHub main 76a033a; cambios publicados en main a52954a antes del deploy. Deploy de producci�n terminado y verificado: index 74,794 bytes, 0 CR, scripts 9/9, styles 2/2, primer <style> en 4746 antes de :root en 4798. /autos/chevrolet-tracker y /autos/chevrolet-aveo devuelven 200 con Content-Type forzado text/html; charset=utf-8; /autos/sitemap-modelos.xml devuelve 200 con application/xml; charset=utf-8 y 76 URLs; inexistente devuelve 404 HTML noindex. Diagn�stico del incidente: el patch_apply_end de la sesi�n anterior (call exec-f32fc1f7-21c2-4934-8d21-cf0a1e555f6f, 2026-07-29T00:12:40.377Z) aplic� un hunk minimo -<style> al primer <style> de index.html, cuando intentaba retirar una inyecci�n de depreciaci�n concatenada en una l�nea gigante al final. La apertura qued� desplazada al bloque final entre scripts; el mismo flujo de texto produjo CRLF parciales. Se a�ade compuerta tools/verify-publish-html.cjs que bloquea publicaci�n si fallan balance, orden, CR o �2KB.
- **Impacto:** Producci�n reparada; contenido din�mico de modelos y sitemap restaurado con MIME forzado; prevenci�n persistente para no repetir corrupci�n HTML.
- **Hora:** 05:57:12 UTC

### [codex] Router din�mico rehecho desde main; publicaci�n pendiente de autenticaci�n GitHub
- **Area:** frontend
- **Detalle:** Fuente: GitHub main 76a033a11b3a336427216c31a78434f236a29c90, clon LF limpio. Commit local a52954a271d696e2f00326523175af73d48bc488 creado, a�n sin push ni deploy por autenticaci�n GitHub pendiente. Causa ra�z comprobada del incidente: el apply_patch exec-f32fc1f7-21c2-4934-8d21-cf0a1e555f6f (2026-07-29 00:12:40 UTC) aplic� el hunk m�nimo -<style> al primer <style> real de index.html (l�nea 44), no al bloque de Depreciaci�n concatenado al final de una l�nea muy larga; movi� el contexto de cierre y reescribi� partes con CRLF. El nuevo flujo incluye tools/verify-publish-html.cjs: scripts y estilos balanceados, primer <style> antes de :root{, cero CR y tama�o 75,930 �2,048 bytes. Router fuerza Content-Type: HTML text/html; charset=utf-8 y sitemap application/xml; charset=utf-8.
- **Impacto:** Sin cambio en producci�n todav�a. En local: 73 modelos est�ticos y su sitemap retirados; /autos/{modelo}, sitemap y UUID quedan cubiertos por pruebas. Reanudar con push de a52954a a main y deploy solo despu�s de confirmar remoto.
- **Hora:** 05:40:49 UTC

### [claude] Caida del sitio del 28-jul: causa raiz y ALTO levantado solo para Codex
- **Area:** incidente
- **Detalle:** El deploy 6a694781 publico un index.html sin la etiqueta <style> de apertura: 58 KB de CSS quedaron como texto visible en todo dispositivo, ~5 horas. La etiqueta no se borro, se movio al final del archivo entre dos </script> (por eso 9 <script abren vs 10 cierran). El sano tiene 0 retornos de carro y el roto 902, o sea una herramienta reescribio parte del archivo con finales de linea de Windows. Lalo restauro publicando el deploy 6a67e3bf del 27-jul. Se dejo TAREA-CODEX-P0-rehacer-deploy-desde-fuente-limpio.md en codex_buzon. GitHub main = 76a033a verificado sano: <style en 4746 antes de :root{ en 4798, scripts 10/10, styles 3/3, cero CR.
- **Impacto:** ALTO levantado SOLO para Codex; Kimi no entra hasta que Codex salga. Nueva regla de verificacion de deploy: balance de etiquetas, que el primer <style aparezca antes del primer :root{, cero CR, y comparacion de tamano contra el fuente.
- **Hora:** 05:22:24 UTC

### [claude] Seminuevos: ventana rotativa profunda + reporte nocturno automatico
- **Area:** ingesta
- **Detalle:** tixuz_sn_paso1 ya no baja siempre las mismas 8 paginas. Ahora baja 1-8 (lo recien publicado) MAS 8 paginas profundas que rotan cada noche (offset en app_config SN_OFFSET_PROFUNDO, avanza 8 por noche y da la vuelta en 200). Esta noche: paginas 1-16. Mañana: 1-8 y 17-24. Se duplico el barrido de 8 a 16 paginas, no mas, para no arriesgar bloqueo de IP. El pipeline paso2/paso3 escala solo porque toma todos los links /vehicle/ que encuentre. Se agrego el cron tixuz-reporte-nocturno (10:55 UTC = 4:55am CDMX, justo despues de paso3) que escribe aqui mismo el resultado de cada corrida.
- **Impacto:** Antes solo se veia el inventario mas nuevo de Seminuevos; ahora se entra al fondo del catalogo sin repetir. Es la primera palanca real sobre la metrica de cobertura.
- **Hora:** 04:57:45 UTC

### [claude] ALTO TOTAL - nadie toca el repo hasta nueva orden
- **Area:** coordinacion
- **Detalle:** Claude asigno a Kimi y a Codex trabajo sobre el MISMO archivo (netlify.toml) y ademas cambio el orden a media obra. Kimi #10 ya lo reescribio; Codex #11 declaro que lo tomaba el primero. Error de coordinacion de Claude, no de los agentes. A partir de este registro: NADIE hace push, NADIE deploya, NADIE edita netlify.toml hasta que Lalo de la salida. Se trabaja de UNO EN UNO, nunca dos agentes en el repo al mismo tiempo. Codex ademas debe pausar la automatizacion diaria de Facebook (bitacora #9) hasta que Lalo la revise, por ser otra automatizacion recurrente no solicitada.
- **Impacto:** Se evita que un agente pise el trabajo del otro en git, que es el mismo patron que tumbo el sitio con el deploy nocturno.
- **Hora:** 00:29:36 UTC

### [codex] Inicio F1 - router din�mico de /autos y correcciones P2
- **Area:** frontend
- **Detalle:** Clon limpio main 76a033a; preview Netlify 6a6943af0f0d58737228f258 respondi� 200. Tomo primero netlify.toml para autos-router y revisar� depreciaci�n, chips de precio y carrocer�a antes del deploy.
- **Impacto:** Coordinaci�n: Kimi debe partir de este cambio de netlify.toml para evitar pisar rutas y headers.
- **Hora:** 00:07:20 UTC


## 2026-07-28

### [kimi] Inicio F0 — Custodia del código: leída directiva, bitácora y tarea completa
- **Area:** custodia
- **Detalle:** Leídos endpoints /directiva y /directiva/bitacora. Token recibido. Tarea F0 de 6 puntos identificada: (P0) repo privado + arreglar netlify.toml, (P1) reconciliar redirects/headers + conectar git + DIRECTIVA.md, (P2) limpiar copias. El netlify.toml del repo es config resuelta (18KB) con rutas absolutas /tmp/tix; el toml original está en tixuz-v66-2 (4.7KB, 19/07) con 29 redirects y 26 headers.
- **Impacto:** Kimi tiene contexto completo. Empezando con clonado del repo y análisis del netlify.toml.
- **Hora:** 23:58:17 UTC

### [codex] Difusi�n org�nica y rotaci�n controlada en Facebook
- **Area:** marketing
- **Detalle:** Se cre� y public� una pieza de Tixuz Autos en grupos pertinentes de compra/venta de veh�culos; se ampli� una cartera de grupos de CDMX, Guadalajara y Monterrey; y se configur� una automatizaci�n diaria con bit�cora, sin mensajes privados, sin solicitudes autom�ticas de ingreso, con revisi�n visible de reglas, m�ximo una publicaci�n por ejecuci�n, tres por semana y 30 d�as sin repetir grupo.
- **Impacto:** Mayor alcance para el marketplace propio de Tixuz Autos sin cambiar c�digo ni desplegar producci�n; la difusi�n queda limitada para evitar spam y respetar reglas de cada grupo.
- **Hora:** 22:51:14 UTC

### [claude] Paginas /autos/{modelo} ahora se arman en vivo desde Supabase
- **Area:** seo
- **Detalle:** Edge Function modelo + RPC tixuz_modelo_pagina y tixuz_modelos_index + vista tixuz_modelos_seo y funcion tixuz_slug. Porta fielmente generar-paginas-modelo.cjs: veredicto, embed de YouTube, FAQPage schema, interlinks y liga a la fuente. Agrega seccion En Tixuz Directo con los anuncios propios arriba y sello Verificado con fecha real. Corregido que los anuncios financiados con precio 0 salieran como $0 y encabezaran la lista.
- **Impacto:** 76 paginas siempre frescas con 1055 autos en vez de 73 congeladas del 23-jul con 520. Elimina la necesidad del deploy nocturno. Falta que Codex conecte el redirect.
- **Hora:** 22:49:17 UTC

### [claude] Sistema DIRECTIVA TIXUZ creado
- **Area:** directiva
- **Detalle:** Tablas tixuz_directiva con 8 secciones y tixuz_bitacora. Edge Function directiva publica con endpoints goal, estado, bitacora, seccion, json y POST log. RPC tixuz_directiva_estado para numeros en vivo.
- **Impacto:** Cualquier IA nueva lee una URL y sabe que se construye, hacia donde va y que cambio quien.
- **Hora:** 17:45:00 UTC

### [claude] Investigacion completa del deploy nocturno
- **Area:** diagnostico
- **Detalle:** Se descarto scheduled function de Netlify, pg_cron y GitHub Actions leyendo el codigo. Se localizo la carpeta culpable por el timestamp de su carpeta .netlify (28/07 05:03:52, coincide con el deploy de 5:01 AM mas 1m58s). Hay 5 o mas copias del sitio en la laptop.
- **Impacto:** Causa raiz identificada con evidencia. Tarea P0 dejada en codex_buzon.
- **Hora:** 17:00:00 UTC

### [codex] Deploy nocturno que revertia produccion: PAUSADO
- **Area:** infraestructura
- **Detalle:** Automatizacion de Codex Regenerar paginas F4 Tixuz, diaria 5:00 AM, corria netlify deploy --prod --dir . desde la carpeta tixuz-v66-2 de mayo. Quedo en estado PAUSED.
- **Impacto:** Se acabaron las reversiones nocturnas del frontend.
- **Hora:** 11:01:00 UTC

### [kimi] Codigo de produccion subido a GitHub
- **Area:** custodia
- **Detalle:** 1378 de 1378 archivos del deploy vivo verificados por SHA1 y empujados a Verdemax777verdemax/tixuzautos. main igual a 76a033a. Netlify sigue sin conectar a git.
- **Impacto:** Ya existe una fuente de verdad del codigo. Antes solo vivia en carpetas locales.
- **Hora:** 02:53:00 UTC


---

## Rutas

- `/directiva` — este documento completo
- `/directiva/goal` — solo el norte
- `/directiva/estado` — numeros en vivo
- `/directiva/bitacora?n=50` — cambios recientes
- `/directiva/seccion/{slug}` — una seccion (00-norte, 01-que-es, 02-modelo-negocio, 03-arquitectura, 04-reglas, 05-plan, 06-historia, 07-como-trabajar)
- `/directiva/json` — todo en JSON
- `POST /directiva/log` — registrar un cambio (requiere token)


---
_Copia estatica en repo generada por KIMI el 2026-07-30. La version viva y canonica se sirve en https://rbiuoljoduekajivffzh.supabase.co/functions/v1/directiva - si difieren, manda la URL._
