#!/usr/bin/env python3
"""Create static guide draft pages from publication packages."""

from __future__ import annotations

import argparse
import csv
import html
import json
import re
from pathlib import Path
from typing import Any


DEFAULT_OUTPUT = Path("youtube-library-output")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split())


def split_frontmatter(markdown: str) -> tuple[dict[str, str], str]:
    if not markdown.startswith("---"):
        return {}, markdown
    parts = markdown.split("---", 2)
    if len(parts) < 3:
        return {}, markdown
    meta: dict[str, str] = {}
    for line in parts[1].splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        meta[key.strip()] = value.strip().strip('"')
    return meta, parts[2].lstrip()


def simple_markdown_to_html(markdown: str) -> str:
    lines = markdown.splitlines()
    blocks: list[str] = []
    paragraph: list[str] = []
    list_items: list[str] = []
    ordered_items: list[str] = []

    def flush_paragraph() -> None:
        nonlocal paragraph
        if paragraph:
            blocks.append(f"<p>{inline_format(' '.join(paragraph))}</p>")
            paragraph = []

    def flush_list() -> None:
        nonlocal list_items
        if list_items:
            blocks.append("<ul>" + "".join(f"<li>{item}</li>" for item in list_items) + "</ul>")
            list_items = []

    def flush_ordered() -> None:
        nonlocal ordered_items
        if ordered_items:
            blocks.append("<ol>" + "".join(f"<li>{item}</li>" for item in ordered_items) + "</ol>")
            ordered_items = []

    for raw in lines:
        line = raw.strip()
        if not line:
            flush_paragraph()
            flush_list()
            flush_ordered()
            continue
        if line.startswith("#"):
            flush_paragraph()
            flush_list()
            flush_ordered()
            level = min(len(line) - len(line.lstrip("#")), 3)
            text = line[level:].strip()
            blocks.append(f"<h{level}>{inline_format(text)}</h{level}>")
            continue
        ordered = re.match(r"^\d+\.\s+(.*)$", line)
        if ordered:
            flush_paragraph()
            flush_list()
            ordered_items.append(inline_format(ordered.group(1)))
            continue
        if line.startswith("- "):
            flush_paragraph()
            flush_ordered()
            list_items.append(inline_format(line[2:].strip()))
            continue
        flush_list()
        flush_ordered()
        paragraph.append(line)

    flush_paragraph()
    flush_list()
    flush_ordered()
    return "\n".join(blocks)


def inline_format(text: str) -> str:
    escaped = html.escape(text)
    link_re = re.compile(r"\[([^\]]+)\]\((https?://[^)]+)\)")
    escaped = link_re.sub(lambda m: f'<a href="{html.escape(m.group(2))}" target="_blank" rel="noopener">{html.escape(m.group(1))}</a>', escaped)
    return escaped


def youtube_embed(video_id: str, title: str) -> str:
    title_attr = html.escape(title or "Video de YouTube")
    video_id_attr = html.escape(video_id)
    return (
        f'<iframe title="{title_attr}" '
        f'src="https://www.youtube-nocookie.com/embed/{video_id_attr}" '
        'loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>'
    )


def page_html(package_dir: Path, canonical_base: str, draft: bool) -> str:
    data = read_json(package_dir / "data.json")
    schema = read_json(package_dir / "schema.json")
    sources = read_csv(package_dir / "sources.csv")
    article_raw = (package_dir / "article.md").read_text(encoding="utf-8")
    frontmatter, body_md = split_frontmatter(article_raw)

    topic = clean_text(data.get("topic"))
    slug = clean_text(data.get("slug"))
    title = clean_text(frontmatter.get("title")) or f"{topic}: guia de compra Tixuz"
    canonical = clean_text(data.get("canonical")) or f"{canonical_base.rstrip('/')}/guias/{slug}/"
    description = (
        f"Guia editorial Tixuz sobre {topic}: videos propios, fuentes atribuidas y preguntas clave antes de comprar."
    )
    robots = "noindex,nofollow" if draft else "index,follow,max-image-preview:large"
    schema_json = json.dumps(schema, ensure_ascii=False, indent=2).replace("</", "<\\/")

    owned = [row for row in sources if row.get("type") == "owned_tixuz_video"]
    external = [row for row in sources if row.get("type") == "external_reference"]
    high_risk = [row for row in sources if row.get("verification") in {"needs_access_or_metadata_review", "needs_transcript_or_manual_review"}]

    owned_embed_html = []
    for row in owned[:3]:
        match = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})", row.get("url", ""))
        video_id = match.group(1) if match else ""
        if not video_id:
            continue
        owned_embed_html.append(
            '<article class="video-card">'
            f'<div>{youtube_embed(video_id, row.get("title", ""))}</div>'
            f'<h3>{html.escape(clean_text(row.get("title")))}</h3>'
            f'<p>{html.escape(clean_text(row.get("verification")))}</p>'
            '</article>'
        )

    source_rows = []
    for row in external[:12]:
        source_rows.append(
            '<tr>'
            f'<td>{html.escape(clean_text(row.get("channel")))}</td>'
            f'<td><a href="{html.escape(clean_text(row.get("url")))}" target="_blank" rel="noopener">{html.escape(clean_text(row.get("title")))}</a></td>'
            f'<td>{html.escape(clean_text(row.get("verification")))}</td>'
            '</tr>'
        )

    warning_list = "".join(
        f'<li><a href="{html.escape(clean_text(row.get("url")))}" target="_blank" rel="noopener">{html.escape(clean_text(row.get("title")))}</a> - {html.escape(clean_text(row.get("verification")))}</li>'
        for row in high_risk[:8]
    )

    return f"""<!doctype html>
<html lang="es-MX">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(description)}">
<meta name="robots" content="{robots}">
<link rel="canonical" href="{html.escape(canonical)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Tixuz Autos">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(description)}">
<meta property="og:url" content="{html.escape(canonical)}">
<meta property="og:image" content="https://tixuzautos.com/assets/og-cover.jpg">
<link rel="me" href="https://www.youtube.com/channel/UCx-BX1_MDzK1v3qRvsHBOTg">
<link rel="me" href="https://www.youtube.com/c/Tixuz">
<script type="application/ld+json">
{schema_json}
</script>
<style>
*{{box-sizing:border-box}}body{{margin:0;font-family:Inter,Arial,sans-serif;background:#0f1623;color:#f0f4ff;line-height:1.6}}a{{color:#8ab4ff;text-decoration:none;overflow-wrap:anywhere}}a:hover{{text-decoration:underline}}.top{{position:sticky;top:0;z-index:10;background:rgba(15,22,35,.96);border-bottom:1px solid #2a3750;backdrop-filter:blur(16px)}}.top-inner{{max-width:1120px;margin:0 auto;padding:14px 20px;display:flex;gap:14px;align-items:center;justify-content:space-between}}.brand{{font-weight:900;letter-spacing:.2px}}.brand span{{color:#3b82f6}}.nav{{display:flex;gap:10px;flex-wrap:wrap}}.nav a{{border:1px solid #2a3750;border-radius:8px;padding:7px 11px;color:#d8e2f3;font-size:.86rem}}.hero{{background:linear-gradient(180deg,#152033 0%,#0f1623 100%);border-bottom:1px solid #2a3750}}.hero-inner{{max-width:1120px;margin:0 auto;padding:54px 20px 34px}}.kicker{{color:#f59e0b;font-weight:800;text-transform:uppercase;font-size:.78rem;letter-spacing:.12em}}h1{{font-size:clamp(2rem,5vw,4.2rem);line-height:1.04;margin:10px 0 14px;max-width:900px}}.lede{{font-size:1.08rem;color:#b7c7dd;max-width:820px}}.chips{{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}}.chip{{background:#1e2a3d;border:1px solid #2a3750;border-radius:999px;padding:6px 10px;color:#cbd8ea;font-size:.86rem}}main{{max-width:1120px;margin:0 auto;padding:28px 20px 64px;display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:26px}}.panel{{background:#161e2e;border:1px solid #2a3750;border-radius:8px;padding:20px;min-width:0}}.notice{{border-left:4px solid #f59e0b;background:rgba(245,158,11,.1);padding:12px 14px;margin:0 0 18px;color:#f7d99b}}.article{{min-width:0;overflow:hidden}}.article h2{{margin-top:32px;font-size:1.55rem}}.article h3{{margin-top:24px}}.article p,.article li{{color:#d4dfef}}.article ul,.article ol{{padding-left:22px}}.videos{{display:grid;gap:14px;margin-top:16px}}.video-card{{background:#111a2b;border:1px solid #2a3750;border-radius:8px;overflow:hidden}}.video-card iframe{{width:100%;aspect-ratio:16/9;border:0;display:block;background:#050914}}.video-card h3{{font-size:1rem;margin:12px 14px 4px;overflow-wrap:anywhere}}.video-card p{{margin:0 14px 14px;color:#8fa3c0;font-size:.9rem}}table{{width:100%;border-collapse:collapse;margin-top:12px;table-layout:fixed}}td,th{{border-bottom:1px solid #2a3750;padding:10px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere;word-break:break-word}}th{{color:#b7c7dd;font-size:.85rem}}.aside{{position:sticky;top:82px;align-self:start}}.score{{font-size:2.5rem;font-weight:900;color:#10b981}}.todo li{{margin-bottom:10px;overflow-wrap:anywhere}}footer{{border-top:1px solid #2a3750;background:#161e2e;color:#8fa3c0}}footer div{{max-width:1120px;margin:0 auto;padding:26px 20px;display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap}}@media(max-width:860px){{main{{grid-template-columns:1fr}}.aside{{position:static}}.top-inner{{align-items:flex-start;flex-direction:column}}}}@media(max-width:520px){{.hero-inner{{padding:38px 14px 26px}}main{{padding:18px 8px 48px}}.panel{{padding:14px}}td,th{{display:block;width:100%}}tr{{display:block;border-bottom:1px solid #2a3750}}td,th{{border-bottom:0}}}}
</style>
</head>
<body>
<header class="top">
  <div class="top-inner">
    <a class="brand" href="/">Tixuz<span>.Autos</span></a>
    <nav class="nav" aria-label="Navegacion">
      <a href="/">Marketplace</a>
      <a href="/buscar-con-ia">Buscar con IA</a>
      <a href="https://www.youtube.com/channel/UCx-BX1_MDzK1v3qRvsHBOTg" target="_blank" rel="noopener">YouTube</a>
    </nav>
  </div>
</header>
<section class="hero">
  <div class="hero-inner">
    <div class="kicker">Guia piloto editorial</div>
    <h1>{html.escape(title)}</h1>
    <p class="lede">{html.escape(description)} Esta pagina esta marcada como borrador hasta completar revision de transcripciones y datos actuales.</p>
    <div class="chips">
      <span class="chip">Puntaje editorial {html.escape(str(data.get("publication_score", "")))}/100</span>
      <span class="chip">{html.escape(str(data.get("owned_tixuz_video_count", "")))} videos propios Tixuz</span>
      <span class="chip">{html.escape(str(data.get("selected_claim_count", "")))} referencias seleccionadas</span>
      <span class="chip">Noindex mientras es borrador</span>
    </div>
  </div>
</section>
<main>
  <section class="panel article">
    <p class="notice">Borrador local: no publicar/indexar como articulo final hasta completar los bloqueos editoriales.</p>
    <h2>Videos base de Tixuz</h2>
    <div class="videos">
      {''.join(owned_embed_html) if owned_embed_html else '<p>No hay video propio embebible para este tema.</p>'}
    </div>
    {simple_markdown_to_html(body_md)}
    <h2>Fuentes externas atribuidas</h2>
    <table>
      <thead><tr><th>Fuente</th><th>Video</th><th>Estado</th></tr></thead>
      <tbody>{''.join(source_rows)}</tbody>
    </table>
  </section>
  <aside class="panel aside">
    <h2>Estado</h2>
    <div class="score">{html.escape(str(data.get("publication_score", "")))}</div>
    <p>Puntaje editorial interno. Aun requiere verificacion humana.</p>
    <h3>Bloqueos</h3>
    <ul class="todo">
      <li>Transcripcion o revision manual de videos propios.</li>
      <li>Datos actuales de versiones, precios y disponibilidad.</li>
      <li>Redaccion final con voz Tixuz.</li>
      <li>Enlaces internos a inventario y comparativas.</li>
    </ul>
    {f'<h3>Fuentes con revision especial</h3><ul class="todo">{warning_list}</ul>' if warning_list else ''}
  </aside>
</main>
<footer><div><span>Tixuz Autos · Mexico</span><span>Canal oficial: youtube.com/c/Tixuz</span></div></footer>
</body>
</html>
"""


def index_html(records: list[dict[str, Any]], canonical_base: str, draft: bool) -> str:
    canonical = f"{canonical_base.rstrip('/')}/guias/"
    robots = "noindex,nofollow" if draft else "index,follow,max-image-preview:large"
    cards = []
    for record in sorted(records, key=lambda item: (-int(item.get("publication_score") or 0), clean_text(item.get("topic")))):
        topic = clean_text(record.get("topic"))
        slug = clean_text(record.get("slug"))
        score = clean_text(record.get("publication_score"))
        owned = clean_text(record.get("owned_tixuz_video_count"))
        claims = clean_text(record.get("selected_claim_count"))
        cards.append(
            '<article class="card">'
            f'<a href="/guias/{html.escape(slug)}/"><h2>{html.escape(topic)}</h2></a>'
            f'<p>Guia editorial en borrador con {html.escape(owned)} video(s) propios y {html.escape(claims)} referencias seleccionadas.</p>'
            f'<div class="meta"><span>Puntaje {html.escape(score)}/100</span><span>Noindex</span></div>'
            '</article>'
        )

    return f"""<!doctype html>
<html lang="es-MX">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Guias editoriales Tixuz Autos</title>
<meta name="description" content="Borradores editoriales de Tixuz Autos generados desde videos propios y referencias atribuidas.">
<meta name="robots" content="{robots}">
<link rel="canonical" href="{html.escape(canonical)}">
<style>
*{{box-sizing:border-box}}body{{margin:0;font-family:Inter,Arial,sans-serif;background:#0f1623;color:#f0f4ff;line-height:1.55}}a{{color:#8ab4ff;text-decoration:none}}a:hover{{text-decoration:underline}}header{{background:#161e2e;border-bottom:1px solid #2a3750}}.wrap{{max-width:1120px;margin:0 auto;padding:24px 20px}}.brand{{font-weight:900;color:#f0f4ff}}.brand span{{color:#3b82f6}}.hero{{padding:48px 20px 28px;background:linear-gradient(180deg,#152033 0%,#0f1623 100%);border-bottom:1px solid #2a3750}}.hero .wrap{{padding:0}}h1{{font-size:clamp(2rem,5vw,4rem);line-height:1.05;margin:10px 0 14px}}.lede{{max-width:760px;color:#b7c7dd;font-size:1.05rem}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:22px}}.card{{background:#161e2e;border:1px solid #2a3750;border-radius:8px;padding:18px;min-width:0}}.card h2{{margin:0 0 8px;font-size:1.25rem}}.card p{{color:#cbd8ea;margin:0 0 14px}}.meta{{display:flex;flex-wrap:wrap;gap:8px}}.meta span{{border:1px solid #2a3750;background:#1e2a3d;border-radius:999px;padding:4px 9px;color:#8fa3c0;font-size:.82rem}}.notice{{border-left:4px solid #f59e0b;background:rgba(245,158,11,.1);padding:12px 14px;color:#f7d99b;margin-top:18px}}footer{{border-top:1px solid #2a3750;color:#8fa3c0}}@media(max-width:520px){{.wrap{{padding:18px 12px}}.hero{{padding:34px 12px 22px}}}}
</style>
</head>
<body>
<header><div class="wrap"><a class="brand" href="/">Tixuz<span>.Autos</span></a></div></header>
<section class="hero"><div class="wrap">
  <p class="meta"><span>Biblioteca editorial</span><span>Borradores noindex</span></p>
  <h1>Guias editoriales Tixuz Autos</h1>
  <p class="lede">Borradores generados desde videos propios, fuentes externas atribuidas y paquetes de revision. No son articulos finales hasta completar transcripciones, verificacion y voz editorial Tixuz.</p>
  <p class="notice">Estas paginas estan protegidas con noindex mientras se trabajan.</p>
</div></section>
<main class="wrap">
  <div class="grid">{''.join(cards)}</div>
</main>
<footer><div class="wrap">Tixuz Autos · Mexico · youtube.com/c/Tixuz</div></footer>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Create static guide pages from publication packages.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--site-root", default=".")
    parser.add_argument("--packages-dir", help="Path to publication-packages directory.")
    parser.add_argument("--slug", action="append", help="Package slug to materialize. Can be passed more than once.")
    parser.add_argument("--canonical-base", default="https://tixuzautos.com")
    parser.add_argument("--publish-draft", action="store_true", help="Use index/follow instead of noindex.")
    args = parser.parse_args()

    output = Path(args.output)
    packages_dir = Path(args.packages_dir) if args.packages_dir else output / "knowledge" / "publication-packages"
    site_root = Path(args.site_root)
    slugs = args.slug or [path.name for path in sorted(packages_dir.iterdir()) if path.is_dir()]
    written = []
    index_records = []
    for slug in slugs:
        package_dir = packages_dir / slug
        if not (package_dir / "data.json").exists():
            continue
        data = read_json(package_dir / "data.json")
        html_text = page_html(package_dir, args.canonical_base, draft=not args.publish_draft)
        target = site_root / "guias" / slug / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(html_text, encoding="utf-8")
        mirror = output / "knowledge" / "site-guides" / slug / "index.html"
        mirror.parent.mkdir(parents=True, exist_ok=True)
        mirror.write_text(html_text, encoding="utf-8")
        written.append(str(target).replace("\\", "/"))
        index_records.append(data)

    if index_records:
        hub_html = index_html(index_records, args.canonical_base, draft=not args.publish_draft)
        hub_target = site_root / "guias" / "index.html"
        hub_target.parent.mkdir(parents=True, exist_ok=True)
        hub_target.write_text(hub_html, encoding="utf-8")
        hub_mirror = output / "knowledge" / "site-guides" / "index.html"
        hub_mirror.parent.mkdir(parents=True, exist_ok=True)
        hub_mirror.write_text(hub_html, encoding="utf-8")
        written.append(str(hub_target).replace("\\", "/"))

    print(json.dumps({"written": written, "count": len(written)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
