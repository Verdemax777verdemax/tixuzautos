#!/usr/bin/env python3
"""Small configurable AI router for Tixuz YouTube library jobs."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULT_CONFIG = {
    "providers": {
        "openai": {
            "kind": "openai-compatible",
            "api_key_env": "OPENAI_API_KEY",
            "api_base": "https://api.openai.com/v1",
            "model": "gpt-4o-mini",
        },
        "deepseek": {
            "kind": "openai-compatible",
            "api_key_env": "DEEPSEEK_API_KEY",
            "api_base": "https://api.deepseek.com",
            "model": "deepseek-chat",
        },
        "kimi": {
            "kind": "openai-compatible",
            "api_key_env": "KIMI_API_KEY",
            "api_base": "https://api.moonshot.ai/v1",
            "model": "moonshot-v1-8k",
        },
        "xai": {
            "kind": "openai-compatible",
            "api_key_env": "XAI_API_KEY",
            "api_base": "https://api.x.ai/v1",
            "model": "grok-3-mini",
        },
        "perplexity": {
            "kind": "openai-compatible",
            "api_key_env": "PERPLEXITY_API_KEY",
            "api_base": "https://api.perplexity.ai",
            "model": "sonar",
        },
    },
    "routes": {
        "extract": ["deepseek", "kimi", "xai", "openai"],
        "classify": ["kimi", "deepseek", "xai", "openai"],
        "editorial": ["openai", "kimi", "deepseek", "xai"],
        "verify": ["perplexity", "xai", "openai"],
    },
}


@dataclass(frozen=True)
class Provider:
    name: str
    kind: str
    api_key_env: str
    api_base: str
    model: str

    @property
    def api_key(self) -> str:
        return os.environ.get(self.api_key_env, "")


class AIRouterError(RuntimeError):
    pass


def load_config(path: str | Path | None = None) -> dict[str, Any]:
    if not path:
        return DEFAULT_CONFIG
    config_path = Path(path)
    if not config_path.exists():
        return DEFAULT_CONFIG
    merged = json.loads(config_path.read_text(encoding="utf-8"))
    return {
        "providers": {**DEFAULT_CONFIG["providers"], **merged.get("providers", {})},
        "routes": {**DEFAULT_CONFIG["routes"], **merged.get("routes", {})},
    }


def provider_from_config(name: str, data: dict[str, Any]) -> Provider:
    raw = data["providers"][name]
    return Provider(
        name=name,
        kind=raw.get("kind", "openai-compatible"),
        api_key_env=raw["api_key_env"],
        api_base=raw["api_base"],
        model=raw["model"],
    )


def available_providers(config: dict[str, Any], route: str) -> list[Provider]:
    names = config.get("routes", {}).get(route, [])
    providers = []
    for name in names:
        if name not in config.get("providers", {}):
            continue
        provider = provider_from_config(name, config)
        if provider.api_key:
            providers.append(provider)
    return providers


def chat_json(
    provider: Provider,
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.15,
    timeout: int = 120,
) -> dict[str, Any]:
    if provider.kind != "openai-compatible":
        raise AIRouterError(f"Unsupported provider kind: {provider.kind}")
    if not provider.api_key:
        raise AIRouterError(f"Missing API key env var: {provider.api_key_env}")

    body = {
        "model": provider.model,
        "temperature": temperature,
        "response_format": {"type": "json_object"},
        "messages": messages,
    }
    raw = post_chat(provider, body, timeout)
    return parse_json_content(raw)


def post_chat(provider: Provider, body: dict[str, Any], timeout: int) -> dict[str, Any]:
    request = urllib.request.Request(
        provider.api_base.rstrip("/") + "/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {provider.api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        if "response_format" in detail and body.get("response_format"):
            retry_body = dict(body)
            retry_body.pop("response_format", None)
            return post_chat(provider, retry_body, timeout)
        raise AIRouterError(f"{provider.name} HTTP {exc.code}: {detail}") from exc


def parse_json_content(raw: dict[str, Any]) -> dict[str, Any]:
    content = raw.get("choices", [{}])[0].get("message", {}).get("content", "{}")
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        start = content.find("{")
        end = content.rfind("}")
        if start >= 0 and end > start:
            return json.loads(content[start : end + 1])
        raise


def route_json(
    config: dict[str, Any],
    route: str,
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.15,
    timeout: int = 120,
) -> tuple[dict[str, Any], str]:
    errors = []
    for provider in available_providers(config, route):
        try:
            return chat_json(provider, messages, temperature=temperature, timeout=timeout), provider.name
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{provider.name}: {type(exc).__name__}")
    raise AIRouterError(f"No provider succeeded for route {route}. Errors: {', '.join(errors) or 'no API keys'}")
