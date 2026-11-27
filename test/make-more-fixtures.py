# -*- coding: utf-8 -*-
"""用 Python 标准库构造结构真实的多种格式样本，验证零依赖解析器。

PDF 样本全部手写字节，覆盖 ToUnicode CMap（中文）、FlateDecode、ASCII85、
LZW、PNG Predictor、ObjStm + xref stream、扫描件与加密件。
"""
import os
import struct
import zlib
import base64
import quopri
import zipfile
import io

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'fixtures')
os.makedirs(OUT, exist_ok=True)


def save(name, data):
    if isinstance(data, str):
        data = data.encode('utf-8')
    p = os.path.join(OUT, name)
    with open(p, 'wb') as f:
        f.write(data)
    return p, len(data)


# ---------------------------------------------------------------- PDF 基础构造器
class Pdf:
    def __init__(self, version='1.4'):
        self.version = version
        self.objs = {}
        self.seq = 0

    def add(self, body, num=None):
        if isinstance(body, str):
            body = body.encode('latin-1')
        if num is None:
            self.seq += 1
            num = self.seq
        else:
            self.seq = max(self.seq, num)
        self.objs[num] = body
        return num

    def stream(self, extra, data, filters=None, parms=None, num=None):
        f = ''
        if filters:
            names = ' '.join('/' + x for x in filters)
            f = ' /Filter ' + (f'[ {names} ]' if len(filters) > 1 else '/' + filters[0])
        p = ' /DecodeParms ' + parms if parms else ''
        head = f'<< {extra} /Length {len(data)}{f}{p} >>\nstream\n'.encode('latin-1')
        return self.add(head + data + b'\nendstream', num)

    def build(self, root=1, info=None, extra_trailer=''):
        out = bytearray(f'%PDF-{self.version}\n'.encode('latin-1') + b'%\xe2\xe3\xcf\xd3\n')
        offsets = {}
        for n in sorted(self.objs):
            offsets[n] = len(out)
            out += f'{n} 0 obj\n'.encode('ascii') + self.objs[n] + b'\nendobj\n'
        xref = len(out)
        size = max(self.objs) + 1
        out += f'xref\n0 {size}\n'.encode('ascii')
        out += b'0000000000 65535 f \n'
        for n in range(1, size):
            if n in offsets:
                out += f'{offsets[n]:010d} 00000 n \n'.encode('ascii')
            else:
                out += b'0000000000 65535 f \n'
        out += f'trailer\n<< /Size {size} /Root {root} 0 R'.encode('ascii')
        if info:
            out += f' /Info {info} 0 R'.encode('ascii')
        if extra_trailer:
            out += (' ' + extra_trailer).encode('latin-1')
        out += f' >>\nstartxref\n{xref}\n%%EOF\n'.encode('ascii')
        return bytes(out)


def make_cmap(chars):
    """给每个字符分配 2 字节 CID，返回 (cmap_bytes, cid_map)。"""
    cid = {c: i for i, c in enumerate(chars, 1)}
    bf = '\n'.join(f'<{cid[c]:04X}> <{ord(c):04X}>' for c in chars)
    cmap = f'''/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CMapName /TestMap def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
{len(chars)} beginbfchar
{bf}
endbfchar
1 beginbfrange
<0100> <0102> <0041>
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end'''
    return cmap.encode('ascii'), cid


def cid_hex(s, cid):
    return '<' + ''.join(f'{cid[c]:04X}' for c in s) + '>'


def utf16hex(s):
    return '<FEFF' + ''.join(f'{ord(c):04X}' for c in s) + '>'


PAGE1 = ['第一章 青瓦纸鸢', '山行笔记里记着一处旧书摊。']
PAGE2 = ['第二章 雨夜', '摊主说书不必都读完，翻到哪页算哪页。']
ALL_CHARS = sorted(set(''.join(PAGE1 + PAGE2 + ['开放书库', '测试作者'])))


def content_page(lines, cid):
    out = ['BT', '/F1 16 Tf', '72 720 Td']
    for i, line in enumerate(lines):
        if i:
            out.append('0 -24 Td')
        out.append(f'{cid_hex(line, cid)} Tj')
    out.append('ET')
    return ('\n'.join(out) + '\n').encode('ascii')


def base_pdf(version='1.4', compress=False, filters=None, parms=None, predictor=False):
    cmap, cid = make_cmap(ALL_CHARS)
    p = Pdf(version)
    p.add('<< /Type /Catalog /Pages 2 0 R >>', 1)
    p.add('<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>', 2)
    p.add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
          '/Resources << /Font << /F1 5 0 R >> >> /Contents 8 0 R >>', 3)
    p.add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
          '/Resources << /Font << /F1 5 0 R >> >> /Contents 9 0 R >>', 4)
    p.add('<< /Type /Font /Subtype /Type0 /BaseFont /TestFont /Encoding /Identity-H '
          '/DescendantFonts [6 0 R] /ToUnicode 7 0 R >>', 5)
    p.add('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /TestFont /DW 1000 '
          '/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> >>', 6)
    info = p.add(f'<< /Title {utf16hex("开放书库")} /Author {utf16hex("测试作者")} '
                 '/Producer (OpenReader Fixture) >>', 10)

    def put(data, num, extra=''):
        if compress:
            data = zlib.compress(data, 9)
        if predictor:
            cols = 20
            rows = [data[i:i + cols].ljust(cols, b'\0')
                    for i in range(0, len(data), cols)]
            data = zlib.compress(b''.join(b'\x00' + r for r in rows), 9)
        p.stream(extra, data, filters=filters, parms=parms, num=num)

    put(cmap, 7)
    put(content_page(PAGE1, cid), 8)
    put(content_page(PAGE2, cid), 9)
    return p.build(info=info)


# 1) 中文 ToUnicode CMap，内容流未压缩
save('pdf_cmap.pdf', base_pdf())

# 2) 内容流与 CMap 都用 FlateDecode
save('pdf_flate.pdf', base_pdf(compress=True, filters=['FlateDecode']))

# 3) ASCII85 + Flate 双层滤镜
cm, cid = make_cmap(ALL_CHARS)
a85pdf = Pdf('1.4')
a85pdf.add('<< /Type /Catalog /Pages 2 0 R >>', 1)
a85pdf.add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 2)
a85pdf.add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
           '/Resources << /Font << /F1 5 0 R >> >> /Contents 8 0 R >>', 3)
a85pdf.add('<< /Type /Font /Subtype /Type0 /BaseFont /TestFont /Encoding /Identity-H '
           '/DescendantFonts [6 0 R] /ToUnicode 7 0 R >>', 5)
a85pdf.add('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /TestFont /DW 1000 >>', 6)
info3 = a85pdf.add(f'<< /Title {utf16hex("双层滤镜之书")} >>', 10)
a85pdf.stream('', zlib.compress(cm, 9), filters=['FlateDecode'], num=7)
enc = base64.a85encode(zlib.compress(content_page(PAGE1, cid), 9), adobe=False) + b'~>'
a85pdf.stream('', enc, filters=['ASCII85Decode', 'FlateDecode'], num=8)
save('pdf_a85.pdf', a85pdf.build(info=info3))

# 4) WinAnsi 简单字体 + TJ 位移空格
wp = Pdf('1.4')
wp.add('<< /Type /Catalog /Pages 2 0 R >>', 1)
wp.add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 2)
wp.add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
       '/Resources << /Font << /F1 5 0 R >> >> /Contents 8 0 R >>', 3)
wp.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', 5)
winfo = wp.add('<< /Title (WinAnsi Book) /Author (Fixture Author) >>', 10)
wcontent = b'''BT
/F1 12 Tf
72 700 Td
(Hello world, this is a WinAnsi PDF.) Tj
0 -18 Td
[(Chapter) -250 (One: The old bookshop)] TJ
0 -18 Td
(Second line with an em-dash \\226 done.) Tj
ET
'''
wp.stream('', wcontent, num=8)
save('pdf_winansi.pdf', wp.build(info=winfo))


# 5) FlateDecode + PNG Predictor（内容流本身带 predictor）
pp = Pdf('1.4')
pp.add('<< /Type /Catalog /Pages 2 0 R >>', 1)
pp.add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 2)
pp.add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
       '/Resources << /Font << /F1 5 0 R >> >> /Contents 8 0 R >>', 3)
pp.add('<< /Type /Font /Subtype /Type0 /BaseFont /TestFont /Encoding /Identity-H '
       '/DescendantFonts [6 0 R] /ToUnicode 7 0 R >>', 5)
pp.add('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /TestFont /DW 1000 >>', 6)
pinfo = pp.add(f'<< /Title {utf16hex("预测器之书")} >>', 10)
pp.stream('', zlib.compress(cm, 9), filters=['FlateDecode'], num=7)
raw = content_page(PAGE1, cid)
cols = 20
prows = [raw[i:i + cols].ljust(cols, b'\0') for i in range(0, len(raw), cols)]
pred = b''.join(b'\x00' + r for r in prows)
pp.stream('', zlib.compress(pred, 9), filters=['FlateDecode'],
          parms='<< /Predictor 12 /Columns 20 /Colors 1 /BitsPerComponent 8 >>', num=8)
save('pdf_predictor.pdf', pp.build(info=pinfo))


# 6) LZWDecode（短文本，字典长度稳定在 9 位）
def lzw_encode(data):
    table = {bytes([i]): i for i in range(256)}
    nxt, size, bits = 258, 9, []

    def emit(c):
        for k in range(size - 1, -1, -1):
            bits.append((c >> k) & 1)

    emit(256)
    w = b''
    for ch in data:
        c = bytes([ch])
        wc = w + c
        if wc in table:
            w = wc
        else:
            emit(table[w])
            table[wc] = nxt
            nxt += 1
            if nxt + 1 >= (1 << size) and size < 12:
                size += 1
            w = c
    if w:
        emit(table[w])
    emit(257)
    while len(bits) % 8:
        bits.append(0)
    out = bytearray()
    for i in range(0, len(bits), 8):
        v = 0
        for b in bits[i:i + 8]:
            v = (v << 1) | b
        out.append(v)
    return bytes(out)


lp = Pdf('1.4')
lp.add('<< /Type /Catalog /Pages 2 0 R >>', 1)
lp.add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 2)
lp.add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
       '/Resources << /Font << /F1 5 0 R >> >> /Contents 8 0 R >>', 3)
lp.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', 5)
linfo = lp.add('<< /Title (LZW Book) >>', 10)
lcontent = b'BT\n/F1 12 Tf\n72 700 Td\n(LZW compressed text works.) Tj\nET\n'
lp.stream('', lzw_encode(lcontent), filters=['LZWDecode'],
          parms='<< /EarlyChange 1 >>', num=8)
save('pdf_lzw.pdf', lp.build(info=linfo))


# 7) PDF 1.5：ObjStm（Catalog / Pages / Info）+ xref stream + predictor
cm15, cid15 = make_cmap(ALL_CHARS)
direct = {
    3: b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
       b'/Resources << /Font << /F1 5 0 R >> >> /Contents 8 0 R >>',
    5: b'<< /Type /Font /Subtype /Type0 /BaseFont /TestFont /Encoding /Identity-H '
       b'/DescendantFonts [6 0 R] /ToUnicode 7 0 R >>',
    6: b'<< /Type /Font /Subtype /CIDFontType2 /BaseFont /TestFont /DW 1000 >>',
}
objstm_members = [
    (1, b'<< /Type /Catalog /Pages 2 0 R >>'),
    (2, b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    (10, f'<< /Title {utf16hex("对象流之书")} /Author {utf16hex("流式作者")} >>'.encode('ascii')),
]
header_parts, inner = [], bytearray()
for num, body in objstm_members:
    header_parts.append((num, len(inner)))
    inner += body + b' '
header = (' '.join(f'{n} {o}' for n, o in header_parts) + ' ').encode('ascii')
objstm_data = header + inner

out15 = bytearray(b'%PDF-1.5\n%\xe2\xe3\xcf\xd3\n')
offsets = {}
for n in sorted(direct):
    offsets[n] = len(out15)
    out15 += f'{n} 0 obj\n'.encode('ascii') + direct[n] + b'\nendobj\n'
# CMap 与内容流（Flate）
for n, data in [(7, zlib.compress(cm15, 9)),
                (8, zlib.compress(content_page(PAGE1, cid15), 9))]:
    offsets[n] = len(out15)
    head = f'<< /Length {len(data)} /Filter /FlateDecode >>\nstream\n'.encode('ascii')
    out15 += f'{n} 0 obj\n'.encode('ascii') + head + data + b'\nendstream\nendobj\n'
# ObjStm（20）
OBJSTM_NUM = 20
offsets[OBJSTM_NUM] = len(out15)
zdata = zlib.compress(objstm_data, 9)
head = (f'<< /Type /ObjStm /N {len(objstm_members)} /First {len(header)} '
        f'/Length {len(zdata)} /Filter /FlateDecode >>\nstream\n').encode('ascii')
out15 += f'{OBJSTM_NUM} 0 obj\n'.encode('ascii') + head + zdata + b'\nendstream\nendobj\n'

XREF_NUM = 21
offsets[XREF_NUM] = len(out15)
size15 = XREF_NUM + 1
stm_index = {n: i for i, (n, _b) in enumerate(objstm_members)}
rows = []
for n in range(size15):
    if n == 0:
        rec = (0, 0, 65535)
    elif n in stm_index:
        rec = (2, OBJSTM_NUM, stm_index[n])
    elif n in offsets:
        rec = (1, offsets[n], 0)
    else:
        rec = (0, 0, 0)
    rows.append(bytes([rec[0]]) + struct.pack('>I', rec[1]) + struct.pack('>H', rec[2]))
xraw = b''.join(b'\x00' + r for r in rows)
xz = zlib.compress(xraw, 9)
xhead = (f'<< /Type /XRef /Size {size15} /Root 1 0 R /Info 10 0 R /W [1 4 2] '
         f'/Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 7 >> '
         f'/Length {len(xz)} >>\nstream\n').encode('ascii')
out15 += f'{XREF_NUM} 0 obj\n'.encode('ascii') + xhead + xz + b'\nendstream\nendobj\n'
out15 += f'startxref\n{offsets[XREF_NUM]}\n%%EOF\n'.encode('ascii')
save('pdf_objstm.pdf', bytes(out15))

# 8) 扫描版但图像格式浏览器不可显示 -> 明确降级
sp = Pdf('1.4')
sp.add('<< /Type /Catalog /Pages 2 0 R >>', 1)
sp.add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 2)
sp.add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
       '/Resources << /XObject << /Im0 9 0 R >> >> /Contents 8 0 R >>', 3)
sp.stream('', b'q 300 0 0 300 50 50 cm /Im0 Do Q\n', num=8)
sp.stream('/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray '
          '/BitsPerComponent 1 /Filter /CCITTFaxDecode /K -1', b'\x00\x01\x02\x03', num=9)
save('pdf_scanned.pdf', sp.build())

# 8b) 扫描版 JPEG（每页一张 DCTDecode 图片）-> 按原页图片浏览
# 仅用于验证「按字节区间切片」的索引逻辑，带正确的 JPEG SOI/EOI 标记，
# 不含完整可解码图像数据；真实扫描 PDF 的页面完整性已用用户导入的 412 页书验证。
MINI_JPEG = (b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00'
             + bytes(160) + b'\xff\xd9')
jp = Pdf('1.4')
jp.add('<< /Type /Catalog /Pages 2 0 R >>', 1)
jp.add('<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>', 2)
for pn, imref, cref in [(3, 7, 9), (4, 8, 10)]:
    jp.add(f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] '
           f'/Resources << /XObject << /Im0 {imref} 0 R >> >> /Contents {cref} 0 R >>', pn)
    jp.stream('', b'q 595 0 0 842 0 0 cm /Im0 Do Q\n', num=cref)
    jp.stream('/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB '
              '/BitsPerComponent 8 /Filter /DCTDecode', MINI_JPEG, num=imref)
jinfo = jp.add(f'<< /Title {utf16hex("扫描版图册")} >>', 11)
save('pdf_scanned_jpeg.pdf', jp.build(info=jinfo))

# 9) 加密 PDF（只写加密字典，不真正加密内容）
ep = Pdf('1.4')
ep.add('<< /Type /Catalog /Pages 2 0 R >>', 1)
ep.add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 2)
ep.add('<< /Type /Page /Parent 2 0 R /Contents 8 0 R >>', 3)
ep.stream('', b'BT /F1 12 Tf 72 700 Td (secret) Tj ET\n', num=8)
ep.add('<< /Filter /Standard /V 1 /R 2 /O (x) /U (y) /P -4 >>', 30)
save('pdf_encrypted.pdf', ep.build(extra_trailer='/Encrypt 30 0 R /ID [<01> <02>]'))


# ---------------------------------------------------------------- 其余格式
# RTF：中文 \uN 与 \'hh GBK 混排
def u_escape(s):
    """把非 ASCII 字符写成 RTF \\uN? 形式，保证样本文件纯 ASCII。"""
    return ''.join(f'\\u{ord(c)}?' if ord(c) > 127 else c for c in s)


RTF = (r'''{\rtf1\ansi\ansicpg936\uc1\deff0
{\fonttbl{\f0\fnil\fcharset134 SimSun;}}
{\info{\author Fixture Author}{\title RTF Test}}
\pard\plain\f0\fs24
{\b ''' + u_escape('第一章 青瓦纸鸢') + r'''}\par
''' + u_escape('山行笔记里记着一处旧书摊。') + r'''\par
''' + r"\'c9\'bd\'d0\'d0 note \'be\'c9\'ca\'e9\'cc\'af" + r'''\par
{\b ''' + u_escape('第二章 雨夜') + r'''}\par
''' + u_escape('摊主说书不必都读完，翻到哪页算哪页。') + r'''\par
}''')
save('sample.rtf', RTF.encode('ascii'))

# ODT
ODT_CONTENT = '''<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2">
<office:body><office:text>
<text:h text:outline-level="1">第一章 青瓦纸鸢</text:h>
<text:p>山行笔记里记着一处旧书摊。</text:p>
<text:h text:outline-level="1">第二章 雨夜</text:h>
<text:p>摊主说书不必都读完，翻到哪页算哪页。&amp; 实体要还原</text:p>
</office:text></office:body></office:document-content>'''
ODT_META = '''<?xml version="1.0"?><office:document-meta
 xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:dc="http://purl.org/dc/elements/1.1/">
<office:meta><dc:title>ODT 测试之书</dc:title><dc:creator>文档作者</dc:creator></office:meta>
</office:document-meta>'''
odt = os.path.join(OUT, 'sample.odt')
with zipfile.ZipFile(odt, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('mimetype', 'application/vnd.oasis.opendocument.text', zipfile.ZIP_STORED)
    z.writestr('content.xml', ODT_CONTENT)
    z.writestr('meta.xml', ODT_META)

# FB2
FB2 = '''<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
<description><title-info><book-title>FB2 测试之书</book-title>
<author><first-name>测试</first-name><last-name>作者</last-name></author>
</title-info></description>
<body><section><title><p>第一章 青瓦纸鸢</p></title>
<p>山行笔记里记着一处旧书摊。</p></section>
<section><title><p>第二章 雨夜</p></title>
<p>摊主说书不必都读完，翻到哪页算哪页。</p></section></body>
</FictionBook>'''
save('sample.fb2', FB2)

# MHTML（quoted-printable + base64 两份）
HTML = ('<html><head><title>网页存档</title></head><body>'
        '<h1>第一章 青瓦纸鸢</h1><p>山行笔记里记着一处旧书摊。</p>'
        '<h1>第二章 雨夜</h1><p>摊主说书不必都读完。</p></body></html>')
BOUND = '----=_OpenReader_Part_000'
qp = quopri.encodestring(HTML.encode('utf-8')).decode('ascii')
mhtml = (f'MIME-Version: 1.0\r\nSubject: MHTML Fixture\r\n'
         f'Content-Type: multipart/related; boundary="{BOUND}"\r\n\r\n'
         f'--{BOUND}\r\nContent-Type: text/html; charset="utf-8"\r\n'
         f'Content-Transfer-Encoding: quoted-printable\r\n'
         f'Content-Location: http://example.test/\r\n\r\n{qp}\r\n'
         f'--{BOUND}\r\nContent-Type: text/plain; charset="utf-8"\r\n'
         f'Content-Transfer-Encoding: base64\r\n\r\n'
         f'{base64.b64encode("备用纯文本".encode("utf-8")).decode()}\r\n'
         f'--{BOUND}--\r\n')
save('sample.mhtml', mhtml.encode('ascii'))
b64 = (f'MIME-Version: 1.0\r\nSubject: Base64 Fixture\r\n'
       f'Content-Type: multipart/related; boundary="{BOUND}"\r\n\r\n'
       f'--{BOUND}\r\nContent-Type: text/html; charset="utf-8"\r\n'
       f'Content-Transfer-Encoding: base64\r\n\r\n'
       f'{base64.b64encode(HTML.encode("utf-8")).decode()}\r\n'
       f'--{BOUND}--\r\n')
save('sample_b64.mhtml', b64.encode('ascii'))


# MOBI / PDB
MOBI_HTML = ('<html><body><h1>第一章 青瓦纸鸢</h1><p>山行笔记里记着一处旧书摊。</p>'
             '<mbp:pagebreak/><h1>第二章 雨夜</h1><p>摊主说书不必都读完。</p></body></html>').encode('utf-8')


def palmdoc_literal(data):
    out = bytearray()
    for i in range(0, len(data), 8):
        chunk = data[i:i + 8]
        out.append(len(chunk))
        out += chunk
    return bytes(out)


def make_mobi(text, compression=1):
    payload = text if compression == 1 else palmdoc_literal(text)
    r0 = struct.pack('>HHIHHHH', compression, 0, len(text), 1, 4096, 0, 0)
    records = [r0, payload]
    n = len(records)
    hdr_len = 78 + n * 8 + 2
    offsets = []
    pos = hdr_len
    for r in records:
        offsets.append(pos)
        pos += len(r)
    h = bytearray(78)
    h[0:32] = b'OpenReaderFixture'.ljust(32, b'\0')
    struct.pack_into('>HH', h, 32, 0, 0)
    struct.pack_into('>III', h, 36, 0, 0, 0)
    struct.pack_into('>I', h, 48, 0)
    struct.pack_into('>II', h, 52, 0, 0)
    h[60:64] = b'BOOK'
    h[64:68] = b'MOBI'
    struct.pack_into('>I', h, 68, 0)
    struct.pack_into('>I', h, 72, 0)
    struct.pack_into('>H', h, 76, n)
    out = bytearray(h)
    for i, off in enumerate(offsets):
        out += struct.pack('>I', off) + bytes([0]) + struct.pack('>I', i)[1:]
    out += b'\0\0'
    for r in records:
        out += r
    return bytes(out)


save('sample.mobi', make_mobi(MOBI_HTML, 1))
save('sample_lz77.mobi', make_mobi(MOBI_HTML, 2))

# 旧版 DOC（OLE 复合文档 + Word 97 FIB piece table）
DOC_TEXT = '第一章 青瓦纸鸢\r山行笔记里记着一处旧书摊。\r第二章 雨夜\r摊主说书不必都读完。\r'
doc_u16 = DOC_TEXT.encode('utf-16le')
cp_count = len(doc_u16) // 2
# PlcPcd = aCP[(n+1)*4] + aPcd[n*8] = 16 字节（n=1）；Clx = 1 + 4 + 16
clx_len = 1 + 4 + 16
text_off = 0x1AA + clx_len
plcpcd = struct.pack('<II', 0, cp_count) + struct.pack('<H', 0) + struct.pack('<I', text_off) + struct.pack('<H', 0)
clx = b'\x02' + struct.pack('<I', len(plcpcd)) + plcpcd
assert len(clx) == clx_len
word = bytearray(8192)
struct.pack_into('<H', word, 0, 0xA5EC)
struct.pack_into('<H', word, 2, 0x00C1)
struct.pack_into('<H', word, 0x20, 0x000E)
struct.pack_into('<H', word, 0x3E, 0x0016)
struct.pack_into('<H', word, 0x98, 0x005D)
struct.pack_into('<I', word, 0x1A2, 0x1AA)
struct.pack_into('<I', word, 0x1A6, len(clx))
word[0x1AA:0x1AA + len(clx)] = clx
word[text_off:text_off + len(doc_u16)] = doc_u16

FREE, END, FATSECT = 0xFFFFFFFF, 0xFFFFFFFE, 0xFFFFFFFD
nsec = len(word) // 512
fat = [FREE] * 128
fat[0] = FATSECT
fat[1] = END
for i in range(nsec):
    sid = 2 + i
    fat[sid] = (sid + 1) if i + 1 < nsec else END
fat_bytes = b''.join(struct.pack('<I', x) for x in fat)


def dir_entry(name, etype, start=END, size=0):
    e = bytearray(128)
    nb = name.encode('utf-16le') + b'\0\0'
    e[0:len(nb)] = nb
    struct.pack_into('<H', e, 64, len(nb))
    e[66] = etype
    e[67] = 1
    struct.pack_into('<III', e, 68, FREE, FREE, FREE)
    struct.pack_into('<I', e, 116, start)
    struct.pack_into('<Q', e, 120, size)
    return bytes(e)


dir_bytes = (dir_entry('Root Entry', 5, END, 0)
             + dir_entry('WordDocument', 2, 2, len(word))
             + bytes(128) + bytes(128))
hdr = bytearray(512)
hdr[0:8] = bytes([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])
struct.pack_into('<HH', hdr, 24, 0x003E, 3)
struct.pack_into('<H', hdr, 28, 0xFFFE)
struct.pack_into('<HH', hdr, 30, 9, 6)
struct.pack_into('<I', hdr, 44, 1)
struct.pack_into('<I', hdr, 48, 1)
struct.pack_into('<I', hdr, 56, 4096)
struct.pack_into('<I', hdr, 60, END)
struct.pack_into('<I', hdr, 64, 0)
struct.pack_into('<I', hdr, 68, END)
struct.pack_into('<I', hdr, 72, 0)
for i in range(109):
    struct.pack_into('<I', hdr, 76 + i * 4, 0 if i == 0 else FREE)
save('sample.doc', bytes(hdr) + fat_bytes + dir_bytes + bytes(word))

# ZIP 里打包 FB2
pack = os.path.join(OUT, 'fb2pack.zip')
with zipfile.ZipFile(pack, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('book.fb2', FB2)

# 纯文本兜底（未知扩展名）与明确降级
save('sample.unknown', '第一章 青瓦纸鸢\n未知扩展名的纯文本，应该被嗅探兜底接住。\n\n第二章 雨夜\n摊主说书不必都读完。\n')
save('sample.azw3', b'BOOKMOBI\x00\x00\x00\x00fake-kf8-container')

print('== fixtures 生成完成 ==')
for f in sorted(os.listdir(OUT)):
    print(' ', f, os.path.getsize(os.path.join(OUT, f)), 'bytes')
