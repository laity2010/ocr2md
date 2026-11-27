"""WP02 deterministic, lossless protection. Offsets are local RAW UTF-16."""
import hashlib
import json
import re
from bisect import bisect_right

POLICY = 'wp02/v1'
SOURCE_FIELDS = {'source_document_hash','source_line','source_line_hash','sentence_index','from_utf16','to_utf16','raw','type','level','candidates_json','review_state','adopted_engine'}
DIGEST = re.compile(r'[0-9a-f]{64}\Z')
def sha(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()
def canonical(value):
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def u16(text):
    return len(text.encode('utf-16-le'))//2
def require(ok,message):
    if not ok: raise ValueError(message)

def validate_snapshot(s):
    require(isinstance(s,dict) and s.get('schema')=='ocr2md-sentence-snapshot/v1','原句快照契约错误')
    rows=s.get('rows')
    require(isinstance(rows,list) and rows,'原句表为空')
    require(all(isinstance(s.get(k),str) and DIGEST.fullmatch(s[k]) for k in ('source_document_hash','sentence_sha256')),'来源摘要错误')
    require(sha(canonical(rows))==s['sentence_sha256'],'原句快照摘要错误')
    previous=None
    for r in rows:
        require(isinstance(r,dict) and set(r)==SOURCE_FIELDS,'原句字段错误')
        require(r['source_document_hash']==s['source_document_hash'] and isinstance(r['source_line_hash'],str) and DIGEST.fullmatch(r['source_line_hash']),'原句来源错误')
        require(all(type(r[k]) is int and r[k]>=0 for k in ('source_line','sentence_index','from_utf16','to_utf16')) and r['source_line']>0 and r['from_utf16']<=r['to_utf16'],'原句坐标错误')
        require(isinstance(r['raw'],str) and isinstance(r['type'],str) and r['type'] and isinstance(r['level'],str) and re.fullmatch(r'>*',r['level']),'原句属性错误')
        same=previous and previous['source_line']==r['source_line']
        require((r['sentence_index']==previous['sentence_index']+1 and r['from_utf16']==previous['to_utf16'] and r['type']==previous['type'] and r['level']==previous['level'] and r['source_line_hash']==previous['source_line_hash'] and '\n' not in previous['raw']) if same else ((not previous or r['source_line']>previous['source_line']) and r['sentence_index']==r['from_utf16']==0),'原句顺序错误')
        length=r['to_utf16']-r['from_utf16']
        body=r['raw'].encode('utf-16-le')
        require(len(body)>=length*2,'RAW 坐标错误')
        head=body[:length*2].decode('utf-16-le');tail=body[length*2:].decode('utf-16-le')
        require('\n' not in head and (not tail or tail.startswith('\n')),'RAW 换行错误')
        previous=r
    require(sha(''.join(r['raw'] for r in rows))==s['source_document_hash'],'原文摘要错误')
    return rows

def scan(text):
    """Scan whole document; mask recognized spans before lower priority passes.
    Unknown prose remains translatable; never infer from a sentence in isolation.
    """
    masked=list(text)
    spans=[]
    occupied=bytearray(len(text))
    def mark(a,b,kind):
        if a>=b:return
        if any(occupied[a:b]):return
        occupied[a:b]=b'\x01'*(b-a)
        spans.append((a,b,kind))
        masked[a:b]=['\n' if c=='\n' else '\x00' for c in text[a:b]]
    def matches(pattern,kind,flags=0,group=0,trim=None):
        for m in re.finditer(pattern,''.join(masked),flags):
            a,b=m.span(group)
            if trim:b=trim(a,b)
            if a<b and '\x00' not in ''.join(masked[a:b]):mark(a,b,kind)
    # Earliest opener wins: e.g. a formula containing <x> is math, an
    # HTML attribute containing $x$ is part of the tag, and a comment
    # containing a fence cannot open a document-wide code span.
    lexical = [
        ('fence_tick',r'(?m:^[ \t]*(?:>[ \t]*)*(?P<bt>`{3,})[^\n]*(?:\n|$)[\s\S]*?(?:(?P<btclose>^[ \t]*(?:>[ \t]*)*(?P=bt)`*[ \t]*(?:\n|$))|\Z))'),
        ('fence_tilde',r'(?m:^[ \t]*(?:>[ \t]*)*(?P<tt>~{3,})[^\n]*(?:\n|$)[\s\S]*?(?:(?P<ttclose>^[ \t]*(?:>[ \t]*)*(?P=tt)~*[ \t]*(?:\n|$))|\Z))'),
        ('html_comment',r'<!--[\s\S]*?(?:-->|\Z)'),
        ('html_literal',r'(?is:<(?P<literal>script|style|pre|code|math|svg|eq)(?=[\s>])[^>]*>[\s\S]*?</(?P=literal)\s*>)'),
        ('code',r'(?<!`)(?P<inline_tick>`+)(?!`)[\s\S]*?(?<!`)(?P=inline_tick)(?!`)'),
        ('latex_display',r'(?<!\\)\$\$[\s\S]*?\$\$|(?<!\\)\\\[[\s\S]*?\\\]'),
        ('latex_inline',r'(?<![\\$])\$(?![$\s])(?:\\[^\n]|[^$\\\n])+?(?<!\s)\$(?![\d$])|(?<!\\)\\\((?:\\(?!\))[^\n]|[^\\\n])*?\\\)'),
        ('media',r'!\[(?:[^\[\]\n]|\[[^\]\n]*\])*\]\((?:[^()\n]|\([^()\n]*\))*\)|!\[\[[^\]\n]+\]\]|!\[[^\]\n]*\]\[[^\]\n]*\]'),
        ('html_tag',r"""<(?:/?[A-Za-z][\w:-]*(?=[\s/>])(?:[^<>"']|"[^"]*"|'[^']*')*|![^<>]*|\?[^<>]*)>"""),
        ('html_entity',r'&(?:#[0-9]+|#x[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]+);'),
        ('footnote',r'\[\^[^\]\n]+\]:?'),
        ('link_definition',r'(?m:^[ \t]*(?:>[ \t]*)*\[(?!\^)[^\]\n]+\]:[^\n]*)'),
        ('link_target',r'\]\((?:[^()\n]|\([^()\n]*\))*\)|\]\[[^\]\n]*\]'),
        ('wiki_link',r'\[\[[^\]\n]+\]\]'),
        ('url',r"""(?:https?://|ftp://|mailto:|obsidian://|file://|www\.)[^\s<>\[\]"']+"""),
        ('email',r'(?i:(?<![\w@])[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})'),
        ('escape',r"""\\[!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~]"""),
    ]
    token=re.compile('|'.join('(?P<lex_'+kind+'>'+pattern+')' for kind,pattern in lexical))
    for m in token.finditer(text):
        kind=m.lastgroup[4:];a,b=m.span()
        if kind.startswith('fence_'):
            is_tick=kind=='fence_tick'
            marker=m.group('bt' if is_tick else 'tt')
            opening=text[m.start():text.find('\n',m.start()) if '\n' in text[m.start():m.end()] else m.end()]
            language=opening.split(marker,1)[1].strip().split(maxsplit=1)
            kind='latex' if language and language[0].lower() in ('math','latex','tex') else 'code'
            if not m.group('btclose' if is_tick else 'ttclose'):kind+='_unclosed'
        elif kind.startswith('latex_'):kind='latex'
        elif kind=='url':
            target=text[a:b].rstrip('.,;:!?')
            while target.endswith(')') and target.count(')')>target.count('('):target=target[:-1]
            while target.endswith('}'):target=target[:-1]
            b=a+len(target)
        mark(a,b,kind)
    matches(r'(?m)^[ \t]*(?:>[ \t]*)+(?=[^\n]|$)','quote')
    matches(r'(?m)(?:^|(?<=\x00))[ \t]*(?:#{1,6}(?=[ \t])|[-+*](?=[ \t])|\d+[.)](?=[ \t]))[ \t]+','markdown_prefix')
    matches(r'\[![A-Za-z][\w-]*\][+-]?','callout')
    matches(r'(?m)^[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*$','table_separator')
    matches(r'(?m)^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$','markdown_rule')
    matches(r'\*{1,3}|_{2,3}|(?<!\w)_(?!\s)|(?<!\s)_(?!\w)|~~|==|\[|\]|\|','markdown_marker')
    return sorted(spans)

def build_rows(snapshot):
    source=validate_snapshot(snapshot)
    text=''.join(r['raw'] for r in source)
    spans=scan(text);starts=[x[0] for x in spans];offset=0;out=[]
    for r in source:
        raw=r['raw'];end=offset+len(raw)
        local=[]
        def add(a,b,kind):
            if a<b:local.append((a,b,kind))
        if r['type'] in ('interline_equation','image_body'):
            add(0,len(raw),'latex' if r['type']=='interline_equation' else 'media')
        else:
            i=max(0,bisect_right(starts,offset)-1)
            while i<len(spans) and spans[i][0]<end:
                a,b,k=spans[i];add(max(0,a-offset),min(len(raw),b-offset),k);i+=1
            # Add only uncovered edge whitespace (including all trailing blank lines).
            for a,b in ((0,len(raw)-len(raw.lstrip())),(len(raw.rstrip()),len(raw))):
                if a>=b:continue
                cursor=a
                for x,y,_ in sorted(local):
                    if y<=cursor:continue
                    if x>=b:break
                    if cursor<x:add(cursor,min(x,b),'whitespace')
                    cursor=max(cursor,y)
                if cursor<b:add(cursor,b,'whitespace')
        local.sort()
        rest=[];cursor=0
        for a,b,k in local:
            require(cursor<=a<b<=len(raw),'保护范围重叠')
            rest.append(raw[cursor:a]);cursor=b
        rest.append(raw[cursor:])
        translatable=any(c.isalpha() for c in ''.join(rest))
        if not translatable:
            # Do not silently drop numbers, punctuation, or empty RAW.
            cursor=0;extra=[]
            for a,b,_ in local:
                if cursor<a:extra.append((cursor,a,'non_text'))
                cursor=b
            if cursor<len(raw):extra.append((cursor,len(raw),'non_text'))
            local=sorted(local+extra)
        protected=[{'from':u16(raw[:a]),'to':u16(raw[:b]),'kind':k,'text':raw[a:b]} for a,b,k in local]
        out.append({k:r[k] for k in ('source_document_hash','source_line_hash','source_line','sentence_index','raw','type','level')}|{'sentence_sha256':snapshot['sentence_sha256'],'policy':POLICY,'protected':protected,'translatable':translatable})
        offset=end
    return out
