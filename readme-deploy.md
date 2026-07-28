# Tixuz Autos Marketplace · Deploy v2

Paquete completo listo para producción. Seguí los pasos en este orden, los links van directos a donde tenés que hacer click.

---

## PASO 1 · Ejecutar el SQL en Supabase

👉 https://supabase.com/dashboard/project/rbiuoljoduekajivffzh/sql/new

1. Abrí el archivo `sql/schema-v2.sql`.
2. Copiá **TODO** el contenido (Ctrl+A, Ctrl+C).
3. Pegalo en el SQL Editor de Supabase.
4. Click en **Run** (abajo a la derecha).
5. Esperá ~10 segundos. Deberías ver "Success. No rows returned".

**Qué hizo este script:**
- Cerró los agujeros de RLS que tenías abiertos (antes cualquiera podía modificar anuncios).
- Creó 6 funciones RPC server-side que validan PIN, firma de Stripe, etc.
- Creó la tabla de idempotencia de Stripe (no procesa el mismo pago 2 veces).
- Apretó el bucket de fotos (máx 5MB, solo jpg/png/webp).
- Agregó columnas: PIN hasheado, view_count, whatsapp_click_count, verification_badge.

Podés correrlo varias veces sin problema — es idempotente.

---

## PASO 2 · Arrastrar el ZIP a Netlify

👉 https://app.netlify.com/projects/cool-kataifi-78a65b/deploys

1. Agarrá el archivo **`tixuz-v2.zip`** que te entregué.
2. En Netlify, en la sección de **Deploys**, arrastralo.
3. Esperá a que diga "Deploy published".

Netlify detecta automáticamente:
- Que publique desde la carpeta raíz.
- Las 7 functions de `netlify/functions/`.
- Los headers de seguridad de `_headers`.
- Los redirects amigables (`/api/...` → `/.netlify/functions/...`).

---

## PASO 3 · Configurar variables de entorno en Netlify

👉 https://app.netlify.com/projects/cool-kataifi-78a65b/settings/env

Click en **"Add a variable"** en Netlify por cada una y pegá estos valores exactos:

**1. `SUPABASE_URL`**
```
https://rbiuoljoduekajivffzh.supabase.co
```

**2. `SUPABASE_ANON_KEY`**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJiaXVvbGpvZHVla2FqaXZmZnpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNzc4NDYsImV4cCI6MjA4Njc1Mzg0Nn0.fvKu71jVZWfSdIVcqMrhMZqUAjswzvaOgnm6-MQpaxM
```

**3. `SUPABASE_SERVICE_ROLE_KEY`** — la que termina en `btEc`.
👉 Copiala directo de: https://supabase.com/dashboard/project/rbiuoljoduekajivffzh/settings/api
(Sección "Project API keys" → fila **service_role** → click en "Reveal" → copiá).

**4. `STRIPE_SECRET_KEY`** — la que empieza con `sk_test_...72ptt`
👉 Copiala de: https://dashboard.stripe.com/test/apikeys

**5. `STRIPE_WEBHOOK_SECRET`**
```
whsec_VEaL7HzhW6QP1nrc7BbvmiiiIBdyjTsS
```

**6. `ADMIN_PASSWORD`**
```
Acapulco8899@
```

**7. `ADMIN_JWT_SECRET`** — un string largo random que firma las cookies admin.

**Para generar un `ADMIN_JWT_SECRET` seguro:** abrí una terminal y pegá:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

O usá cualquier generador de passwords de 60+ caracteres. Ese valor nunca lo vas a usar — solo firma las cookies admin.

Después de agregar las variables, andá a **Deploys → Trigger deploy → Deploy site** para que las functions las tomen.

---

## PASO 4 · Crear el cupón INAUGURACION en Stripe (opcional pero recomendado)

👉 https://dashboard.stripe.com/test/coupons/create

- **Nombre:** Inauguración Tixuz
- **ID (importante):** `INAUGURACION` *(así lo puede pegar el usuario en el checkout)*
- **Tipo:** Porcentaje de descuento
- **Porcentaje:** `100`
- **Duración:** Una vez *(o "3 meses" si querés)*
- **Fecha de vencimiento:** 30 de junio de 2026 *(o cuando quieras cortar la promo)*

Cuando el usuario pague, verá un campo "¿Tenés un código promocional" en el checkout de Stripe. Pega `INAUGURACION` y paga $0.

---

## PASO 5 · Probar el flujo completo

### Test 1: Publicar anuncio

1. Abrí `https://cool-kataifi-78a65b.netlify.app`
2. Click en **"🚗 Vender mi auto"**
3. Completá los 3 pasos (marca, fotos, contacto + PIN).
4. Debería abrirse Stripe checkout.
5. Usá la tarjeta de prueba: `4242 4242 4242 4242` · fecha futura · cualquier CVV.
6. Al pagar, el webhook se dispara y tu anuncio pasa a **active**.

### Test 2: Mis Anuncios

1. Click en **"📋 Mis Anuncios"** en el header.
2. Ingresá el mismo WhatsApp + PIN que usaste al publicar.
3. Deberías ver tu anuncio con botones de Editar / Pausar / Vendido / Borrar.

### Test 3: Admin

1. Click en **"🔐"** en el header.
2. Ingresá la contraseña `Acapulco8899@`.
3. Vas a ver el panel con estadísticas y la lista completa de anuncios con teléfonos.

### Test 4: Verificar webhook

👉 https://dashboard.stripe.com/test/workbench/webhooks

Click en tu webhook **"Tixuz Autos - Activación de anuncios"** y luego en **"Entregas de eventos"**. Ahí vas a ver cada intento y si respondió 200 OK.

---

## Cuando pases a PRODUCCIÓN (modo Live)

1. En Stripe, cambiá arriba de **"Entorno de prueba"** a **"Cuenta activa"**.
2. Repetí los pasos de webhook (nueva URL, nuevo `whsec_...`).
3. Creá los 3 productos en modo live y copiá los nuevos `price_...`.
4. Actualizá en Supabase la tabla `pricing_plans` con los nuevos price IDs:

👉 https://supabase.com/dashboard/project/rbiuoljoduekajivffzh/editor

```sql
update pricing_plans set stripe_price_id = 'price_NUEVO_BASIC'    where key = 'basic';
update pricing_plans set stripe_price_id = 'price_NUEVO_FEATURED' where key = 'featured';
update pricing_plans set stripe_price_id = 'price_NUEVO_PRO'      where key = 'pro';
```

5. Obtené la **Secret Key de producción** (empieza con `sk_live_...`) — **no me la mandes**, pegala tú directo en Netlify.
6. Cambiá en Netlify:
   - `STRIPE_SECRET_KEY` → `sk_live_...`
   - `STRIPE_WEBHOOK_SECRET` → nuevo `whsec_...` del webhook live.

---

## Solución de problemas

**"Supabase no carga"**
Revisar que la consola del navegador no tire errores CORS. El `_headers` ya incluye `rbiuoljoduekajivffzh.supabase.co` en el `connect-src`.

**"El webhook no activa mi anuncio"**
Ir a https://dashboard.stripe.com/test/workbench/webhooks/we_1TOlRt0anIfsBRIytH7v2bGv/deliveries y revisar el error. Los más comunes: env vars mal pegadas, o el `metadata.listing_id` no llegó a Stripe (eso lo maneja `create-checkout.mjs`).

**"No puedo hacer login como admin"**
Abrí la consola del navegador → Network → click en `admin-auth` → revisá el response. Si dice "Admin no configurado", es que `ADMIN_PASSWORD` no está en env vars.

**"Las fotos no suben"**
Verificar en Supabase que el bucket `marketplace-images` existe y es público. Si no, correr el SQL otra vez.

---

## Archivos incluidos en este ZIP

```
tixuz-v2/
├── index.html                   ← Frontend principal
├── netlify.toml                 ← Config de Netlify
├── _headers                     ← CSP / HSTS / etc.
├── robots.txt
├── sitemap.xml
├── package.json                 ← Dependencias de Functions (Stripe + Supabase)
├── legal/
│   ├── legal.css
│   ├── terminos.html
│   ├── privacidad.html          ← Completa LFPDPPP
│   └── cookies.html
├── netlify/functions/
│   ├── stripe-webhook.mjs       ← Verifica firma, activa anuncios
│   ├── create-checkout.mjs      ← Genera sesión Stripe con metadata
│   ├── admin-auth.mjs           ← Login server-side con cookie HttpOnly
│   ├── admin-data.mjs           ← Panel admin (requiere cookie)
│   ├── manage-listing.mjs       ← CRUD propio con PIN
│   ├── reveal-whatsapp.mjs      ← WhatsApp con rate limit 8/10min
│   └── get-pricing.mjs          ← Precios desde Supabase
└── sql/
    └── schema-v2.sql            ← RLS cerrada, RPC, idempotencia
```

---

## Qué cambia vs la versión anterior

| Problema viejo | Solución en v2 |
|---|---|
| ❌ Cualquiera podía UPDATE/INSERT via anon key | ✅ RLS cerrada, todo pasa por RPC con validaciones |
| ❌ El cliente decidía `plan`, `status`, `featured`, `payment_status` | ✅ La DB fuerza `status='pending_payment'` y deriva `featured` del plan |
| ❌ No había webhook de Stripe, pagos nunca se confirmaban | ✅ Webhook con firma verificada + idempotencia |
| ❌ Teléfonos visibles en el JSON público | ✅ Vista pública oculta WA, revelación con rate limit 8/10min |
| ❌ Admin password en el cliente | ✅ Auth server-side con cookie HttpOnly Secure SameSite=Strict |
| ❌ Storage abierto para UPDATE/DELETE | ✅ Solo INSERT con tipo de archivo validado, 5MB max |
| ❌ Sin CSP / HSTS / X-Frame-Options | ✅ `_headers` con política completa |
| ❌ Sin Términos / Privacidad / Cookies | ✅ 3 páginas completas LFPDPPP |
| ❌ Precios hardcoded | ✅ Tabla `pricing_plans` editable sin tocar código |
| ❌ Sin SEO (SPA, 0 meta tags) | ✅ Open Graph, Schema.org, canonical, sitemap, robots |
| ❌ Sin "Mis Anuncios" funcional | ✅ Login con WA+PIN, editar/pausar/vender/borrar |
| ❌ Sin panel Admin | ✅ Panel con stats, lista completa, forzar activación |

## v58 — Revisión manual de fotos
Los anuncios nuevos quedan en revisión antes de hacerse públicos. Entra con `admin=1` y abre la pestaña **Revisión** para autorizar o rechazar desde el celular.

Opcional para recibir WhatsApp automático del nuevo anuncio:
- `REVIEW_SECRET`
- `ADMIN_REVIEW_WHATSAPP`
- `WHATSAPP_CLOUD_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`

Si no configuras WhatsApp Cloud API, el sistema sigue funcionando: revisas todo desde Admin > Revisión.
