# Tixuz YouTube Library

Herramientas locales para convertir el canal de YouTube de Tixuz en una biblioteca publicable:

1. Sacar inventario de videos, shorts y directos.
2. Descargar metadatos completos por video.
3. Extraer transcripciones disponibles en YouTube.
4. Crear borradores enriquecidos para SEO, agentes AI y paginas de Tixuz.

## Instalacion

```powershell
python -m pip install --user -r tools/youtube-library/requirements.txt
```

## 1. Inventario del canal

```powershell
python tools/youtube-library/fetch_catalog.py --channel @Tixuz --output youtube-library-output
```

Produce:

- `youtube-library-output/catalog/videos.json`
- `youtube-library-output/catalog/videos.csv`

El catalogo guarda contexto de derechos. Por defecto el canal se marca como propio (`owned`).

## 1b. Canales externos y colaboraciones

Para canales donde Tixuz aparece pero el canal no es propio, usa `external-reference`. Esto permite crear fichas con embed, resumen y atribucion sin tratar el material como contenido propio.

Ejemplo para Sergio Oliveira:

```powershell
python tools/youtube-library/fetch_catalog.py --channel @autossergiooliveira --output youtube-library-output/external/sergio-oliveira --source-key sergio-oliveira --source-name "Sergio Oliveira" --source-owner "Sergio Oliveira" --source-url https://www.youtube.com/@autossergiooliveira --usage-rights external-reference --relationship collaborator-channel --permission-note "Usar con embed, enlace y atribucion. No republicar transcripcion completa sin permiso."
```

Luego puedes crear un subcatalogo de posibles colaboraciones con Tixuz/Eduardo:

```powershell
python tools/youtube-library/curate_collaborations.py --catalog youtube-library-output/external/sergio-oliveira/catalog/videos.json --output-catalog youtube-library-output/external/sergio-oliveira/catalog/tixuz-collaborations.json --terms tixuz,lalo,eduardo,vargas
```

Si Sergio da permiso explicito, cambia `--usage-rights authorized` y entonces el sistema puede guardar transcripciones completas.

## 2. Metadatos completos

```powershell
python tools/youtube-library/fetch_details.py --catalog youtube-library-output/catalog/videos.json --output youtube-library-output --limit 25
```

Quita `--limit` para procesar todo el canal. El script es incremental y no repite archivos existentes salvo que uses `--force`.

## 3. Transcripciones

```powershell
python tools/youtube-library/fetch_transcripts.py --catalog youtube-library-output/catalog/videos.json --output youtube-library-output --limit 25
```

Produce JSON y TXT por video en `youtube-library-output/transcripts/`.

Para catalogos `external-reference`, las transcripciones completas se saltan por defecto. Si hay permiso explicito:

```powershell
python tools/youtube-library/fetch_transcripts.py --catalog youtube-library-output/external/sergio-oliveira/catalog/tixuz-collaborations.json --output youtube-library-output/external/sergio-oliveira --allow-external
```

Si YouTube bloquea temporalmente la IP, el script se detiene solo. Puedes continuar por rangos:

```powershell
python tools/youtube-library/fetch_transcripts.py --catalog youtube-library-output/catalog/videos.json --output youtube-library-output --start 100 --limit 100 --sleep 2
```

## 4. Enriquecimiento

Modo local sin API, util para generar borradores basicos:

```powershell
python tools/youtube-library/enrich_records.py --catalog youtube-library-output/catalog/videos.json --output youtube-library-output --limit 25
```

## 3b. Claims: conocimiento sin copiar guiones

Para canales externos, usa `extract_claims.py`. El script puede leer subtitulos publicos de forma temporal, pero por defecto NO guarda la transcripcion completa. Solo guarda afirmaciones parafraseadas, atribuidas y con enlace al video.

```powershell
python tools/youtube-library/extract_claims.py --catalog youtube-library-output/external/sergio-oliveira/catalog/tixuz-collaborations.json --output youtube-library-output/external/sergio-oliveira --fetch-public-transcript --allow-local-fallback
```

Con AI router:

```powershell
python tools/youtube-library/extract_claims.py --catalog youtube-library-output/external/sergio-oliveira/catalog/tixuz-collaborations.json --output youtube-library-output/external/sergio-oliveira --fetch-public-transcript --ai --provider-config youtube-library-output/ai_providers.json --env-file C:\Users\Lalo\Documents\TixuzAutos-Biblioteca\secrets.local.env --allow-local-fallback
```

Produce:

- `claims/*.json`: afirmaciones por video.
- `claims/index.json`
- `claims/index.csv`

Regla editorial: en fuentes externas se permite guardar conocimiento parafraseado y atribuido; no se guarda ni publica transcripcion completa sin permiso.

## 3c. Cola de conocimiento y claims por tema

Cuando ya existen catalogos externos, crea una cola mixta por marcas/modelos para decidir que videos procesar primero:

```powershell
python tools/youtube-library/curate_topic_queue.py --external-dir youtube-library-output/external --output-catalog youtube-library-output/knowledge/catalog/topic-queue.json --per-topic-source 2 --max-videos 180 --min-score 35
```

Luego procesa metadatos y claims seguros:

```powershell
python tools/youtube-library/fetch_details.py --catalog youtube-library-output/knowledge/catalog/topic-queue.json --output youtube-library-output/knowledge --limit 180 --sleep 0.4
python tools/youtube-library/extract_claims.py --catalog youtube-library-output/knowledge/catalog/topic-queue.json --output youtube-library-output/knowledge --fetch-public-transcript --allow-local-fallback --limit 180
```

Finalmente agrupa todo por marca/modelo y fuente:

```powershell
python tools/youtube-library/aggregate_claims.py --output youtube-library-output --include-external
```

Produce:

- `youtube-library-output/knowledge/claims_by_topic.json`
- `youtube-library-output/knowledge/claims_by_topic.csv`
- `youtube-library-output/knowledge/claims_summary.md`

Estos archivos son la base editorial para fichas y articulos: contienen resumen parafraseado, fuente, enlace, polaridad y bandera de revision, pero no guardan transcripciones completas.

Para convertir los temas principales en briefs editoriales locales:

```powershell
python tools/youtube-library/materialize_topic_briefs.py --output youtube-library-output --limit 20
```

Produce:

- `youtube-library-output/knowledge/briefs/records/*.json`
- `youtube-library-output/knowledge/briefs/markdown/*.md`
- `youtube-library-output/knowledge/briefs/html/*.html`
- `youtube-library-output/knowledge/briefs/index.csv`

Los HTML llevan `noindex,nofollow` porque son borradores de trabajo, no paginas finales.

Para ver que videos propios de Tixuz faltan por transcripcion dentro de esos briefs:

```powershell
python tools/youtube-library/audit_transcript_gaps.py --output youtube-library-output
```

Produce:

- `youtube-library-output/knowledge/briefs/transcript_gaps.csv`
- `youtube-library-output/knowledge/briefs/transcript_gaps.json`

Para crear paquetes de publicacion revisables desde los mejores briefs:

```powershell
python tools/youtube-library/materialize_publication_packages.py --output youtube-library-output --ready-only --min-score 70 --limit 5
```

Produce una carpeta por tema en `youtube-library-output/knowledge/publication-packages/` con:

- `article.md`: borrador editorial.
- `article.html`: vista local con embeds y `noindex,nofollow`.
- `schema.json`: Article + VideoObject + BreadcrumbList.
- `sources.csv`: fuentes y uso permitido.
- `checklist.md`: bloqueos antes de publicar.
- `agent-prompt.md`: prompt para Gemini u otro agente redactor.

Si YouTube bloquea la descarga directa de subtitulos, importa transcripciones locales exportadas desde YouTube Studio, Takeout o archivos manuales:

```powershell
python tools/youtube-library/import_local_transcripts.py --input-dir C:\Users\Lalo\Documents\TixuzAutos-Biblioteca\transcript-import-inbox --catalog youtube-library-output/catalog/videos.json --output youtube-library-output
```

Acepta `.txt`, `.srt`, `.vtt` y `.json`. Intenta asociar cada archivo por ID de YouTube en el nombre o por similitud de titulo. Despues de importar, vuelve a correr `materialize_fichas.py`, `materialize_topic_briefs.py`, `audit_transcript_gaps.py` y `backup_library.py`.

Para convertir paquetes en paginas estaticas de borrador dentro del sitio:

```powershell
python tools/youtube-library/materialize_site_guides.py --output youtube-library-output --slug ford
```

Esto escribe `guias/<tema>/index.html` con `noindex,nofollow`. Cuando el articulo quede listo para indexar, se puede regenerar con `--publish-draft`.
Tambien guarda una copia en `youtube-library-output/knowledge/site-guides/<tema>/index.html` para que entre al respaldo local.

Modo con un proveedor OpenAI-compatible:

```powershell
python tools/youtube-library/enrich_records.py --catalog youtube-library-output/catalog/videos.json --output youtube-library-output --limit 25 --provider openai-compatible --api-key-env OPENAI_API_KEY --api-base https://api.openai.com/v1 --model gpt-4o-mini
```

El script no imprime llaves. Solo lee la variable de entorno indicada.

## 5. Enriquecimiento con varias AI

El router usa proveedores baratos primero y deja el modelo fuerte para la ficha final. Copia el ejemplo si quieres cambiar modelos:

```powershell
Copy-Item tools/youtube-library/ai_providers.example.json youtube-library-output/ai_providers.json
```

Luego ejecuta:

```powershell
python tools/youtube-library/enrich_with_router.py --catalog youtube-library-output/catalog/videos.json --output youtube-library-output --limit 25 --provider-config youtube-library-output/ai_providers.json --allow-local-fallback
```

Las llaves se leen desde variables de entorno como `DEEPSEEK_API_KEY`, `KIMI_API_KEY`, `XAI_API_KEY`, `PERPLEXITY_API_KEY` y `OPENAI_API_KEY`. No se guardan en archivos.

Para correr batches locales en esta CPU puedes usar un archivo privado fuera del repo, por ejemplo:

```powershell
python tools/youtube-library/enrich_with_router.py --catalog youtube-library-output/catalog/videos.json --output youtube-library-output --limit 25 --env-file C:\Users\Lalo\Documents\TixuzAutos-Biblioteca\secrets.local.env --allow-local-fallback
```

Ese archivo debe tener formato `CLAVE=valor` y no se sube a git.

## 6. Exportar fichas

```powershell
python tools/youtube-library/materialize_fichas.py --catalog youtube-library-output/catalog/videos.json --output youtube-library-output --limit 25
```

Produce:

- `youtube-library-output/fichas/records/*.json`
- `youtube-library-output/fichas/markdown/*.md`
- `youtube-library-output/fichas/html/*.html`
- `youtube-library-output/fichas/index.json`
- `youtube-library-output/fichas/index.csv`

## 7. Copia local en esta CPU

```powershell
python tools/youtube-library/backup_library.py --output youtube-library-output
```

Por defecto copia todo a:

```text
C:\Users\Lalo\Documents\TixuzAutos-Biblioteca
```

## 8. Pipeline completo

```powershell
python tools/youtube-library/run_library_pipeline.py --details-limit 100 --transcript-limit 25 --enrich-limit 25
```

Con AI router:

```powershell
python tools/youtube-library/run_library_pipeline.py --ai --details-limit 100 --transcript-limit 25 --enrich-limit 25
```
