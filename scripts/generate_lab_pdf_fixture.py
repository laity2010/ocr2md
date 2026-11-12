#!/usr/bin/env python3
"""Generate a tiny ORIGINAL and intentionally public PDF.js test fixture.

No external PDFs or user's private OCR documents enter the published Lab.
Uses PDF 1.4 primitives and the standard Helvetica font, no dependencies.
"""
from pathlib import Path

OUT=Path(__file__).resolve().parents[1]/'ui/lab-pdf/fixtures/preview.pdf'

def esc(s):return s.replace('\\','\\\\').replace('(','\\(').replace(')','\\)')
def show(text,x,y,size=14):
    return f'BT /F1 {size} Tf {x} {y} Td ({esc(text)}) Tj ET\n'

def content(page):
    out='0.16 0.31 0.32 rg\n'
    out+=show(f'OCR2MD PDF VIEWER LAB  /  PAGE {page}',65,757,18)
    out+='0.18 0.27 0.29 rg\n'
    if page==1:
        out+=show('Public synthetic document - no private user material.',70,686,12)
        out+=show('BlockID 12 anchors a paragraph of OCR evidence.',75,650,12)
        out+=show('ParentID links child records, never PBS labels.',75,627,12)
        out+=show('Zoom and select the text layer. Click the overlay labels.',75,600,12)
    elif page==2:
        out+=show('Page 2: the PDF renderer owns the page and its text.',75,681,12)
        out+=show('Block geometry comes from coordinates in page space.',75,650,12)
        out+='0.29 0.55 0.51 RG 1.3 w 70 490 445 80 re S\n'
        out+=show('A reusable PDF viewer needs no CMD or SQLite dependency.',80,526,12)
    else:
        out+=show('Page 3: vector table experiment',75,687,14)
        out+='0.29 0.55 0.51 RG 1 w 70 460 450 130 re S\n'
        for x in [235,385]:out+=f'{x} 460 m {x} 590 l S\n'
        for y in [525]:out+=f'70 {y} m 520 {y} l S\n'
        out+=show('Cell A',82,553,11)+show('Cell B',247,553,11)+show('Cell C',395,553,11)
        out+=show('Cell D',82,482,11)+show('Cell E',247,482,11)+show('Cell F',395,482,11)
    out+='0.27 0.36 0.37 rg\n'
    out+=show(f'PDF Viewer Lab fixture  |  {page} / 3',75,48,10)
    return out.encode('ascii')

def build():
    streams=[content(i) for i in range(1,4)]
    objects={1:b'<< /Type /Catalog /Pages 2 0 R >>',
        2:b'<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R] /Count 3 >>',
        3:b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'}
    for i,stream in enumerate(streams):
        page_n=4+i*2
        data_n=page_n+1
        objects[page_n]=f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {data_n} 0 R >>'.encode()
        objects[data_n]=f'<< /Length {len(stream)} >>\nstream\n'.encode()+stream+b'endstream'
    pdf=bytearray(b'%PDF-1.4\n%LABPDF\n');offsets=[0]
    for number in range(1,10):
        offsets.append(len(pdf))
        pdf.extend(f'{number} 0 obj\n'.encode()+objects[number]+b'\nendobj\n')
    xref=len(pdf)
    pdf.extend(b'xref\n0 10\n0000000000 65535 f \n')
    for position in offsets[1:]:pdf.extend(f'{position:010} 00000 n \n'.encode())
    pdf.extend(b'trailer\n<< /Size 10 /Root 1 0 R >>\n')
    pdf.extend(f'startxref\n{xref}\n%%EOF\n'.encode())
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_bytes(pdf)
    print('PUBLIC_SYNTHETIC_PDF_FIXTURE',OUT,len(pdf),'bytes')
if __name__=='__main__':build()
