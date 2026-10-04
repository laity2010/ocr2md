#!/usr/bin/env python3
import importlib.util
import io
import json
import os
import stat
import tempfile
from pathlib import Path
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("ocr2md_dev_server", ROOT / "dev_server.py")
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)
TranslationServiceStore = module.TranslationServiceStore
ChapterProjectStore = module.ChapterProjectStore

with tempfile.TemporaryDirectory() as tmp:
    store = TranslationServiceStore(tmp)
    initial = store.public_payload()
    assert [item["id"] for item in initial["services"]] == ["deepl", "chatgpt"]
    assert all(not item["apiKeyConfigured"] for item in initial["services"])
    assert all("apiKey" not in item for item in initial["services"])
    assert initial["activeProvider"] == "deepl"
    selected = store.select_provider("chatgpt")
    assert selected["activeProvider"] == "chatgpt"
    assert TranslationServiceStore(tmp).public_payload()["activeProvider"] == "chatgpt"
    store.select_provider("deepl")

    saved = store.save_service("deepl", {
        "endpoint": "https://api-free.deepl.com",
        "sourceLanguage": "EN",
        "targetLanguage": "ZH-HANS",
        "model": "prefer_quality_optimized",
        "apiKey": "deepl-secret-test",
    })
    deepl_public = next(item for item in saved["services"] if item["id"] == "deepl")
    assert deepl_public["apiKeyConfigured"] is True
    assert "deepl-secret-test" not in json.dumps(saved)
    secret_path = Path(tmp) / "translation-services.json"
    private_data = json.loads(secret_path.read_text(encoding="utf-8"))
    assert private_data["services"]["deepl"]["apiKey"] == "deepl-secret-test"
    if os.name == "posix":
        assert stat.S_IMODE(secret_path.stat().st_mode) == 0o600

    captured = {}
    def fake_deepl(endpoint, body, headers):
        captured.update(endpoint=endpoint, body=body, headers=headers)
        return {"translations": [{"text": "收入 <ocr2md-protected id=\"p0001\"/> 增长。"}]}
    store._request_json = fake_deepl
    result = store.test_sentence(
        "deepl",
        "Revenue $R_t$ rose.",
        'Revenue <ocr2md-protected id="p0001"/> rose.',
    )
    assert result["placeholderIntegrity"] is True
    assert result["translatedText"].startswith("收入")
    assert captured["endpoint"] == "https://api-free.deepl.com/v2/translate"
    assert captured["body"]["tag_handling"] == "xml"
    assert captured["body"]["ignore_tags"] == ["ocr2md-protected"]
    assert captured["headers"]["Authorization"] == "DeepL-Auth-Key deepl-secret-test"

    captured.clear()
    def fake_deepl_batch(endpoint, body, headers):
        captured.update(endpoint=endpoint, body=body, headers=headers)
        return {"translations": [
            {"text": "第一句。"},
            {"text": '第二句 <ocr2md-protected id="p0002"/>。'},
        ]}
    store._request_json = fake_deepl_batch
    batch = store.translate_deepl_batch([
        {"sourceText": "First sentence.", "translationText": "First sentence."},
        {
            "sourceText": "Second $R_t$ sentence.",
            "translationText": 'Second <ocr2md-protected id="p0002"/> sentence.',
        },
    ], "First sentence. Second $R_t$ sentence. Surrounding paragraph context.")
    assert len(batch["results"]) == 2
    assert all(item["placeholderIntegrity"] for item in batch["results"])
    assert captured["body"]["text"] == [
        "First sentence.",
        'Second <ocr2md-protected id="p0002"/> sentence.',
    ]
    assert captured["body"]["context"].endswith("Surrounding paragraph context.")
    assert captured["body"]["split_sentences"] == "0"

    captured.clear()
    def fake_deepl_xml_safe(endpoint, body, headers):
        captured.update(endpoint=endpoint, body=body, headers=headers)
        return {"translations": [{"text": '研发 &amp; 价值 &lt; 10 <ocr2md-protected id="p0001"/>'}]}
    store._request_json = fake_deepl_xml_safe
    escaped = store.translate_deepl_batch([
        {
            "sourceText": "R&D value < 10 $R_t$",
            "translationText": 'R&D value < 10 <ocr2md-protected id="p0001"/>',
        },
    ], "Context: R&D and A < B > C")
    assert captured["body"]["text"] == [
        'R&amp;D value &lt; 10 <ocr2md-protected id="p0001"/>',
    ]
    assert captured["body"]["context"] == "Context: R&amp;D and A &lt; B &gt; C"
    assert escaped["results"][0]["translatedText"] == '研发 & 价值 < 10 <ocr2md-protected id="p0001"/>'
    assert escaped["results"][0]["placeholderIntegrity"] is True

    saved = store.save_service("chatgpt", {
        "endpoint": "https://api.openai.com/v1/responses",
        "model": "gpt-5.6-luna",
        "targetLanguage": "Simplified Chinese",
        "instruction": "Translate and preserve protected tokens.",
        "apiKey": "openai-secret-test",
    })
    assert "openai-secret-test" not in json.dumps(saved)

    def fake_chatgpt(endpoint, body, headers):
        assert endpoint == "https://api.openai.com/v1/responses"
        assert body["model"] == "gpt-5.6-luna"
        assert headers["Authorization"] == "Bearer openai-secret-test"
        return {
            "output": [{
                "type": "message",
                "content": [{
                    "type": "output_text",
                    "text": '收入 <ocr2md-protected id="p0001"/> 增长。',
                }],
            }],
        }
    store._request_json = fake_chatgpt
    result = store.test_sentence(
        "chatgpt",
        "Revenue $R_t$ rose.",
        'Revenue <ocr2md-protected id="p0001"/> rose.',
    )
    assert result["placeholderIntegrity"] is True
    assert result["durationMs"] >= 0

    def fake_broken(endpoint, body, headers):
        return {"output_text": "收入增长。"}
    store._request_json = fake_broken
    result = store.test_sentence(
        "chatgpt",
        "Revenue $R_t$ rose.",
        'Revenue <ocr2md-protected id="p0001"/> rose.',
    )
    assert result["placeholderIntegrity"] is False
    assert result["missingPlaceholders"] == ['<ocr2md-protected id="p0001"/>']

    original_urlopen = module.urlopen
    def fake_429(request, timeout=30):
        raise HTTPError(
            request.full_url,
            429,
            "Too Many Requests",
            {},
            io.BytesIO(b""),
        )
    module.urlopen = fake_429
    try:
        try:
            TranslationServiceStore._request_json(
                "https://api-free.deepl.com/v2/translate",
                {"text": ["hello"]},
                {"Authorization": "DeepL-Auth-Key test"},
            )
            raise AssertionError("429 must raise TranslationProviderError")
        except module.TranslationProviderError as error:
            assert error.provider_status == 429
            assert "请求过于频繁" in str(error)
    finally:
        module.urlopen = original_urlopen

    try:
        store.save_service("deepl", {"endpoint": "https://example.com"})
        raise AssertionError("invalid endpoint must be rejected")
    except ValueError:
        pass

with tempfile.TemporaryDirectory() as tmp:
    project = Path(tmp) / "project"
    chapter_dir = project / "chapters" / "01 Test"
    chapter_dir.mkdir(parents=True)
    (chapter_dir / "01 Test.working.md").write_text("# Test\n", encoding="utf-8")
    (chapter_dir / "01 Test.ocr2md.json").write_text("{}\n", encoding="utf-8")
    store = ChapterProjectStore(project)
    chapter_id = store.chapter_id(chapter_dir)

    chapter_revision = store.read(chapter_id)["revision"]
    old_source = "# Test\n\n>\n![[imgs/old.png]]\nText.\n"
    exported = store.export_trans_source(chapter_id, chapter_revision, old_source)
    assert exported["conflict"] is False
    trans_dir = chapter_dir / "trans"
    trans_working_path = trans_dir / "01 Test.working.md"
    trans_source_path = trans_dir / "01 Test.md"
    trans_working_path.write_text(
        trans_working_path.read_text(encoding="utf-8").replace("Text.", "Text edited in trans."),
        encoding="utf-8",
    )
    new_source = "# Test\n\n>\n![[imgs/new.png]]\nText.\n"
    exported = store.export_trans_source(chapter_id, chapter_revision, new_source)
    assert exported["conflict"] is False
    refreshed_working = trans_working_path.read_text(encoding="utf-8")
    assert "![[imgs/new.png]]" in refreshed_working
    assert "![[imgs/old.png]]" not in refreshed_working
    assert "Text edited in trans." in refreshed_working
    assert trans_source_path.read_text(encoding="utf-8") == new_source

    first = {
        "id": "sentence-1",
        "sourceFingerprint": "source-1",
        "contextFingerprint": "context-1",
    }
    second = {
        "id": "sentence-2",
        "sourceFingerprint": "source-2",
        "contextFingerprint": "context-2",
    }
    saved = store.upsert_sentence_translation(
        chapter_id, "deepl", "DeepL", first, "translated",
        translated_text="第一句", model="quality",
    )
    assert saved["data"]["entries"]["sentence-1"]["translatedText"] == "第一句"
    saved = store.upsert_sentence_translation(
        chapter_id, "deepl", "DeepL", second, "error",
        error="temporary failure", model="quality",
    )
    entries = saved["data"]["entries"]
    assert entries["sentence-1"]["status"] == "translated"
    assert entries["sentence-2"]["status"] == "error"
    provider_path = chapter_dir / "trans" / "sentences" / "deepl.json"
    on_disk = json.loads(provider_path.read_text(encoding="utf-8"))
    assert on_disk["entries"]["sentence-1"]["translatedText"] == "第一句"
    assert on_disk["entries"]["sentence-2"]["error"] == "temporary failure"
    saved = store.upsert_sentence_translation(
        chapter_id, "deepl", "DeepL", second, "translated",
        translated_text="第二句", model="quality",
    )
    assert saved["data"]["entries"]["sentence-1"]["status"] == "translated"
    assert saved["data"]["entries"]["sentence-2"]["status"] == "translated"
    assert "error" not in saved["data"]["entries"]["sentence-2"]

print("translation service store tests passed")
