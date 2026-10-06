"""Read-only MinerU chunk -> original PDF attachment page mapping.

Never guess across multiple PDFs or unordered JSON chunks.
All page links are emitted only after checking the original PDF page count.
"""
import ctypes
import json
import re
from pathlib import Path


def original_pdf(project_dir):
    root = Path(project_dir).resolve()
    pdfs = [
        item for item in root.iterdir()
        if item.is_file()
        and item.suffix.lower() == ".pdf"
        and item.resolve().parent == root
    ]
    if len(pdfs) != 1:
        return None
    return pdfs[0]


def original_pdf_page_count(pdf_path):
    """Use the macOS CoreGraphics PDF reader without parsing the PDF ourselves."""
    cf = ctypes.CDLL("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")
    cg = ctypes.CDLL("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics")
    cf.CFURLCreateFromFileSystemRepresentation.argtypes = [
        ctypes.c_void_p, ctypes.c_char_p, ctypes.c_long, ctypes.c_bool,
    ]
    cf.CFURLCreateFromFileSystemRepresentation.restype = ctypes.c_void_p
    cf.CFRelease.argtypes = [ctypes.c_void_p]
    cg.CGPDFDocumentCreateWithURL.argtypes = [ctypes.c_void_p]
    cg.CGPDFDocumentCreateWithURL.restype = ctypes.c_void_p
    cg.CGPDFDocumentGetNumberOfPages.argtypes = [ctypes.c_void_p]
    cg.CGPDFDocumentGetNumberOfPages.restype = ctypes.c_size_t
    cg.CGPDFDocumentRelease.argtypes = [ctypes.c_void_p]

    raw = str(Path(pdf_path).resolve()).encode("utf-8")
    url = cf.CFURLCreateFromFileSystemRepresentation(None, raw, len(raw), False)
    if not url:
        return None
    try:
        pdf = cg.CGPDFDocumentCreateWithURL(url)
        if not pdf:
            return None
        try:
            return cg.CGPDFDocumentGetNumberOfPages(pdf)
        finally:
            cg.CGPDFDocumentRelease(pdf)
    finally:
        cf.CFRelease(url)


def pdf_chunk_offsets(project_dir, pdf_pages):
    """Only numbered, consecutive chunks with 0-based ordered page_idx pass."""
    root = Path(project_dir).resolve()
    files = sorted((root / "json").glob("*.json"))
    if not files:
        return None
    offsets = {}
    running = 0
    for chunk, file in enumerate(files, 1):
        prefix = re.match(r"^(\d+)[ _-]", file.name)
        if len(files) > 1 and (not prefix or int(prefix.group(1)) != chunk):
            return None
        try:
            pages = json.loads(file.read_text(encoding="utf-8"))["pdf_info"]
            if not isinstance(pages, list) or any(
                not isinstance(page, dict) or page.get("page_idx") != index
                for index, page in enumerate(pages)
            ):
                return None
        except (ValueError, TypeError, KeyError, OSError):
            return None
        offsets["json/" + file.name] = (running, len(pages))
        running += len(pages)
    if running != pdf_pages:
        return None
    return offsets


def enrich_pdf_audit(project_dir, payload):
    pdf_path = original_pdf(project_dir)
    attachment = {
        "available": False,
        "pageCount": None,
        "name": pdf_path.name if pdf_path else None,
        "reason": "",
    }
    if not pdf_path:
        attachment["reason"] = "项目根目录没有唯一的原始 PDF 附件"
    else:
        pages = original_pdf_page_count(pdf_path)
        attachment["pageCount"] = pages
        offsets = pdf_chunk_offsets(project_dir, pages) if pages else None
        if offsets is None:
            attachment["reason"] = "原 PDF 总页数、MinerU JSON 分段和顺序不一致，禁止猜页"
        else:
            attachment["available"] = True
            for entry in payload.get("entries", []):
                document = entry.get("documentKey")
                index = entry.get("pageIndex")
                chunk = offsets.get(document)
                if chunk is None or type(index) is not int or not (0 <= index < chunk[1]):
                    continue
                entry["pdfPageNumber"] = chunk[0] + index + 1
    payload["pdfAttachment"] = attachment
    return payload
