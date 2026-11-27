"""Canonical sentence-local placeholders. Keep a single protection list."""
import re

def prefix(raw):
    marker='⟦P'
    while marker in raw:marker+='_'
    return marker

def template(raw,protected):
    data=raw.encode('utf-16-le');pos=0;parts=[];marker=prefix(raw)
    for i,p in enumerate(protected):
        a,b=p['from']*2,p['to']*2
        if not 0<=pos<=a<b<=len(data) or data[a:b].decode('utf-16-le')!=p['text']:
            raise ValueError('保护范围与RAW不一致')
        parts.extend((data[pos:a].decode('utf-16-le'),f'{marker}{i}⟧'));pos=b
    parts.append(data[pos:].decode('utf-16-le'))
    return ''.join(parts)

def refill(text,raw,protected):
    marker=prefix(raw)
    expected={f'{marker}{i}⟧':p['text'] for i,p in enumerate(protected)}
    seen=set()
    def replace(match):
        token=match[0]
        if token not in expected or token in seen:raise ValueError('回填占位符未知或重复')
        seen.add(token);return expected[token]
    if text.count(marker)!=len(expected):raise ValueError('回填占位符数量错误')
    result=re.sub(re.escape(marker)+r'[0-9]+⟧',replace,text)
    if seen!=set(expected):raise ValueError('回填占位符缺失或畸形')
    return result

def check_row(row):
    raw=row['raw'];p=row['protected'];text=row['text']
    if template(raw,p)!=text or refill(text,raw,p)!=raw:
        raise ValueError('RAW → text → 回填 无损校验失败')
    return raw
