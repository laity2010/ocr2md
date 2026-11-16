"""Non-destructive MinerU display LaTeX projection.

The MD projection contains TeX only. Original image_path is retained
exclusively in immutable MinerU JSON; formula evidence uses PDF bbox crops.
"""
from __future__ import annotations

import re
from urllib.parse import quote, urlsplit


def _safe_reference(path):
    if not isinstance(path,str) or not path or re.search(r'[\x00-\x1f\x7f]',path):
        return None
    try:
        parsed=urlsplit(path)
    except ValueError:
        return None
    if parsed.scheme.lower() not in ('','http','https'):
        return None
    if parsed.scheme and not parsed.netloc:
        return None
    if not parsed.scheme and (path.startswith('//') or path.startswith('\\')):
        return None
    # The angle-link form protects parentheses and spaces. Never interpret an
    # OCR URL as HTML; prevent the literal closing angle from breaking syntax.
    return quote(path,safe="/:@?&=#%+;,._~!$'()*-[]")


def display_equation(block, *, legacy_links=False):
    """Output native $$ and LaTeX. Legacy links are available only for
    strict one-time reconciliation of an older MD document, never for new MD.
    """
    latex_lines=[]
    images=[]
    for line in block.get('lines') or []:
        if not isinstance(line,dict):
            continue
        content=[]
        for span in line.get('spans') or []:
            if not isinstance(span,dict):
                continue
            if isinstance(span.get('content'),str):
                content.append(span['content'])
            if legacy_links:
                path=span.get('image_path')
                if isinstance(path,str) and path not in images:
                    images.append(path)
        if content:
            latex_lines.append(''.join(content))
    latex='\n'.join(latex_lines)
    output=[]
    if latex:
        # A literal delimiter-only line cannot be nested in another $$ block.
        # Preserve source exactly through our supported math fence in that
        # exceptional case rather than producing silently broken Markdown.
        if re.search(r'(?m)^\$\$[ \t]*$',latex):
            count=max([3]+[len(m.group(0))+1 for m in re.finditer(r'`+',latex)])
            fence='`'*count
            output.append(f'{fence}math\n{latex}\n{fence}')
        else:
            output.append(f'$$\n{latex}\n$$')
    for path in images:
        reference=_safe_reference(path)
        if reference:
            label='原始公式图' if len(output)==(1 if latex else 0) else f'原始公式图 {len(output)-(1 if latex else 0)+1}'
            output.append(f'[{label}](<{reference}>)')
    return '\n'.join(output)
