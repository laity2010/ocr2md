from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import ProxyHandler, Request, build_opener, urlopen


SETTINGS_ENV = "OCR2MD_TRANSLATION_SETTINGS"
DEFAULT_SERVICE = "DeepL"
DEFAULT_TARGET_LANG = "ZH-HANS"


class TranslationServiceError(ValueError):
    pass


def translation_settings_path() -> Path:
    configured = os.environ.get(SETTINGS_ENV)
    if configured:
        return Path(configured).expanduser()
    return Path.home() / ".ocr2md" / "translation_settings.json"


def load_translation_settings() -> dict[str, Any]:
    path = translation_settings_path()
    if not path.exists():
        return {"service": DEFAULT_SERVICE, "api_key": ""}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"service": DEFAULT_SERVICE, "api_key": ""}
    if not isinstance(payload, dict):
        return {"service": DEFAULT_SERVICE, "api_key": ""}
    service = normalize_translation_service(payload.get("service"))
    return {"service": service, "api_key": str(payload.get("api_key") or "")}


def public_translation_settings() -> dict[str, Any]:
    settings = load_translation_settings()
    api_key = str(settings.get("api_key") or "")
    clean_key = api_key.strip()
    return {
        "service": normalize_translation_service(settings.get("service")),
        "has_api_key": bool(clean_key),
        "masked_api_key": mask_api_key(clean_key),
        "endpoint_mode": deepl_endpoint_mode(clean_key) if clean_key else "",
    }


def save_translation_settings(payload: dict[str, Any]) -> dict[str, Any]:
    existing = load_translation_settings()
    service = normalize_translation_service(payload.get("service"))
    api_key = str(payload.get("api_key")).strip() if "api_key" in payload else str(existing.get("api_key") or "").strip()
    path = translation_settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"service": service, "api_key": api_key}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return public_translation_settings()


def test_translation_service(payload: dict[str, Any]) -> dict[str, Any]:
    settings = load_translation_settings()
    service = normalize_translation_service(payload.get("service") or settings.get("service"))
    text = str(payload.get("text") or "").strip()
    if not text:
        raise TranslationServiceError("Missing test text")
    if service != DEFAULT_SERVICE:
        raise TranslationServiceError(f"Unsupported translation service: {service}")
    api_key = str(settings.get("api_key") or "").strip()
    if not api_key:
        raise TranslationServiceError("Missing DeepL API key")
    return {"service": service, "translated_text": deepl_translate(api_key, text)}


def translate_text(payload: dict[str, Any]) -> dict[str, Any]:
    settings = load_translation_settings()
    service = normalize_translation_service(payload.get("service") or settings.get("service"))
    text = str(payload.get("text") or "")
    if not text.strip():
        raise TranslationServiceError("Missing source text")
    if service != DEFAULT_SERVICE:
        raise TranslationServiceError(f"Unsupported translation service: {service}")
    api_key = str(settings.get("api_key") or "").strip()
    if not api_key:
        raise TranslationServiceError("Missing DeepL API key")
    return {"service": service, "translated_text": deepl_translate(api_key, text)}


def normalize_translation_service(value: Any) -> str:
    service = str(value or DEFAULT_SERVICE).strip()
    return DEFAULT_SERVICE if service.lower() == "deepl" else service


def mask_api_key(api_key: str) -> str:
    if not api_key:
        return ""
    if len(api_key) <= 8:
        return "*" * len(api_key)
    return f"{api_key[:4]}...{api_key[-4:]}"


def deepl_endpoint(api_key: str) -> str:
    if api_key.strip().endswith(":fx"):
        return "https://api-free.deepl.com/v2/translate"
    return "https://api.deepl.com/v2/translate"


def deepl_endpoint_mode(api_key: str) -> str:
    return "Free" if api_key.strip().endswith(":fx") else "Pro"


def deepl_translate(api_key: str, text: str, target_lang: str = DEFAULT_TARGET_LANG) -> str:
    api_key = api_key.strip()
    body = urlencode({"text": text, "target_lang": target_lang}).encode("utf-8")
    request = Request(
        deepl_endpoint(api_key),
        data=body,
        headers={
            "Authorization": f"DeepL-Auth-Key {api_key}",
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "ocr2md-workbench/0.1",
        },
        method="POST",
    )
    try:
        payload = open_deepl_json(request)
    except HTTPError as exc:
        message = deepl_error_message(exc, deepl_endpoint_mode(api_key))
        raise TranslationServiceError(f"DeepL request failed ({exc.code}): {message}") from exc
    except URLError as exc:
        if is_proxy_tunnel_unavailable(exc):
            try:
                payload = open_deepl_json_without_proxy(request)
            except HTTPError as retry_exc:
                message = deepl_error_message(retry_exc, deepl_endpoint_mode(api_key))
                raise TranslationServiceError(
                    f"DeepL direct retry failed ({retry_exc.code}) after proxy tunnel 503: {message}"
                ) from retry_exc
            except URLError as retry_exc:
                raise TranslationServiceError(
                    f"DeepL proxy tunnel failed with 503, and direct retry also failed: {retry_exc.reason}"
                ) from retry_exc
        else:
            raise TranslationServiceError(f"DeepL request failed: {exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise TranslationServiceError("DeepL returned invalid JSON") from exc
    translations = payload.get("translations") if isinstance(payload, dict) else None
    if not isinstance(translations, list) or not translations:
        raise TranslationServiceError("DeepL returned no translation")
    translated = translations[0].get("text") if isinstance(translations[0], dict) else ""
    if not translated:
        raise TranslationServiceError("DeepL returned empty translation")
    return str(translated)


def open_deepl_json(request: Request) -> dict[str, Any]:
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def open_deepl_json_without_proxy(request: Request) -> dict[str, Any]:
    opener = build_opener(ProxyHandler({}))
    with opener.open(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def is_proxy_tunnel_unavailable(error: URLError) -> bool:
    reason = str(getattr(error, "reason", "") or error)
    return "Tunnel connection failed: 503" in reason


def deepl_error_message(error: HTTPError, endpoint_mode: str = "") -> str:
    try:
        body = error.read().decode("utf-8")
    except Exception:
        return friendly_deepl_http_error(error.code, error.reason or "unknown error", endpoint_mode)
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        message = body[:300] if body else (error.reason or "unknown error")
        return friendly_deepl_http_error(error.code, message, endpoint_mode)
    message = payload.get("message") if isinstance(payload, dict) else ""
    return friendly_deepl_http_error(error.code, str(message or error.reason or "unknown error"), endpoint_mode)


def friendly_deepl_http_error(status: int, message: str, endpoint_mode: str) -> str:
    if status == 403:
        mode = f"{endpoint_mode} endpoint" if endpoint_mode else "selected endpoint"
        return (
            f"{message}. 当前使用 {mode}。请确认这是 DeepL API key，不是网页登录密码；"
            "Free key 通常以 :fx 结尾并使用 Free endpoint，Pro key 使用 Pro endpoint；"
            "也请确认 DeepL API 订阅已启用。"
        )
    return message
