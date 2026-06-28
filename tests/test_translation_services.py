from __future__ import annotations

import json
import os
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from ocr2md_workbench.translation_services import (
    SETTINGS_ENV,
    deepl_endpoint,
    public_translation_settings,
    save_translation_settings,
    test_translation_service,
    translate_text,
)


class TranslationServicesTests(unittest.TestCase):
    def test_save_and_read_settings_masks_api_key(self) -> None:
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {SETTINGS_ENV: str(Path(tmp) / "settings.json")}):
            saved = save_translation_settings({"service": "DeepL", "api_key": " abcd1234:fx\n"})

            self.assertEqual(saved["service"], "DeepL")
            self.assertTrue(saved["has_api_key"])
            self.assertEqual(saved["masked_api_key"], "abcd...4:fx")
            self.assertEqual(saved["endpoint_mode"], "Free")
            self.assertNotIn("api_key", saved)
            self.assertEqual(public_translation_settings()["masked_api_key"], "abcd...4:fx")

    def test_deepl_endpoint_uses_free_for_fx_key_and_pro_otherwise(self) -> None:
        self.assertEqual(deepl_endpoint(" abc:fx\n"), "https://api-free.deepl.com/v2/translate")
        self.assertEqual(deepl_endpoint("abc"), "https://api.deepl.com/v2/translate")

    def test_save_settings_without_api_key_preserves_existing_key(self) -> None:
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {SETTINGS_ENV: str(Path(tmp) / "settings.json")}):
            save_translation_settings({"service": "DeepL", "api_key": "abcd1234:fx"})
            saved = save_translation_settings({"service": "DeepL"})

            self.assertTrue(saved["has_api_key"])
            self.assertEqual(saved["masked_api_key"], "abcd...4:fx")

    def test_translation_test_requires_key_and_text(self) -> None:
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {SETTINGS_ENV: str(Path(tmp) / "settings.json")}):
            with self.assertRaisesRegex(ValueError, "Missing test text"):
                test_translation_service({"service": "DeepL", "text": ""})
            with self.assertRaisesRegex(ValueError, "Missing DeepL API key"):
                test_translation_service({"service": "DeepL", "text": "Hello."})

    def test_translation_test_returns_mocked_deepl_result(self) -> None:
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {SETTINGS_ENV: str(Path(tmp) / "settings.json")}):
            save_translation_settings({"service": "DeepL", "api_key": "abcd1234:fx"})
            with patch("ocr2md_workbench.translation_services.urlopen") as mocked_urlopen:
                mocked_urlopen.return_value.__enter__.return_value.read.return_value = json.dumps(
                    {"translations": [{"text": "你好。"}]}
                ).encode("utf-8")

                result = test_translation_service({"service": "DeepL", "text": "Hello."})

            self.assertEqual(result["translated_text"], "你好。")
            request = mocked_urlopen.call_args.args[0]
            self.assertEqual(request.full_url, "https://api-free.deepl.com/v2/translate")

    def test_translate_text_returns_mocked_result(self) -> None:
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {SETTINGS_ENV: str(Path(tmp) / "settings.json")}):
            save_translation_settings({"service": "DeepL", "api_key": "abcd1234:fx"})
            with patch("ocr2md_workbench.translation_services.urlopen") as mocked_urlopen:
                mocked_urlopen.return_value.__enter__.return_value.read.return_value = json.dumps(
                    {"translations": [{"text": "译文 {NT1}。"}]}
                ).encode("utf-8")

                result = translate_text({"service": "DeepL", "text": "Text {NT1}."})

            self.assertEqual(result["translated_text"], "译文 {NT1}。")
            request = mocked_urlopen.call_args.args[0]
            self.assertEqual(request.full_url, "https://api-free.deepl.com/v2/translate")

    def test_translate_text_requires_source_text(self) -> None:
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {SETTINGS_ENV: str(Path(tmp) / "settings.json")}):
            save_translation_settings({"service": "DeepL", "api_key": "abcd1234:fx"})

            with self.assertRaisesRegex(ValueError, "Missing source text"):
                translate_text({"service": "DeepL", "text": " "})

    def test_translate_text_retries_without_proxy_after_tunnel_503(self) -> None:
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {SETTINGS_ENV: str(Path(tmp) / "settings.json")}):
            save_translation_settings({"service": "DeepL", "api_key": "abcd1234:fx"})
            with (
                patch(
                    "ocr2md_workbench.translation_services.urlopen",
                    side_effect=URLError("Tunnel connection failed: 503 Service Unavailable"),
                ) as mocked_urlopen,
                patch("ocr2md_workbench.translation_services.build_opener") as mocked_build_opener,
            ):
                mocked_build_opener.return_value.open.return_value.__enter__.return_value.read.return_value = json.dumps(
                    {"translations": [{"text": "你好。"}]}
                ).encode("utf-8")

                result = translate_text({"service": "DeepL", "text": "Hello."})

            self.assertEqual(result["translated_text"], "你好。")
            self.assertEqual(mocked_urlopen.call_count, 1)
            mocked_build_opener.assert_called_once()

    def test_translation_test_reports_deepl_error_without_key(self) -> None:
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {SETTINGS_ENV: str(Path(tmp) / "settings.json")}):
            save_translation_settings({"service": "DeepL", "api_key": "abcd1234"})
            error = HTTPError(
                "https://api.deepl.com/v2/translate",
                403,
                "Forbidden",
                {},
                BytesIO(json.dumps({"message": "Authorization failed"}).encode("utf-8")),
            )
            with patch("ocr2md_workbench.translation_services.urlopen", side_effect=error):
                with self.assertRaisesRegex(ValueError, r"DeepL request failed \(403\): Authorization failed.*Pro endpoint.*API key"):
                    test_translation_service({"service": "DeepL", "text": "Hello."})


if __name__ == "__main__":
    unittest.main()
