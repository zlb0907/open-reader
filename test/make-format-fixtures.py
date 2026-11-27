# 生成最小但结构真实的 EPUB / DOCX 样本，用于验证零依赖解析器。
import os
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'fixtures')
os.makedirs(OUT, exist_ok=True)

CONTENT_OPF = '''<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>测试之书</dc:title><dc:creator>测试作者</dc:creator>
  </metadata>
  <manifest>
    <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx"><itemref idref="c1"/><itemref idref="c2"/></spine>
</package>'''

CONTAINER = '''<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>'''

XHTML = '''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>忽略</title>
<style>p{{color:red}}</style></head><body>
<h1>{title}</h1>
<p>{p1}</p><p>{p2}<br/>换行仍应保留 &amp; 实体要还原</p>
</body></html>'''

epub = os.path.join(OUT, 'sample.epub')
with zipfile.ZipFile(epub, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('mimetype', 'application/epub+zip', compress_type=zipfile.ZIP_STORED)
    z.writestr('META-INF/container.xml', CONTAINER)
    z.writestr('OEBPS/content.opf', CONTENT_OPF)
    z.writestr('OEBPS/toc.ncx', '<?xml version="1.0"?><ncx/>')
    z.writestr('OEBPS/ch1.xhtml', XHTML.format(title='第一章 青瓦', p1='青瓦纸鸢是第一章独有的检索词。', p2='第一段正文。'))
    z.writestr('OEBPS/ch2.xhtml', XHTML.format(title='第二章 纸鸢', p1='第二章写着山行笔记与旧书摊。', p2='第二段正文。'))

DOCUMENT = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>第一章 文档标题</w:t></w:r></w:p>
<w:p><w:r><w:t>这是 DOCX 正文，包含关键词 </w:t></w:r><w:r><w:t>青瓦纸鸢</w:t></w:r><w:r><w:t>。</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>第二章 后记</w:t></w:r></w:p>
<w:p><w:r><w:t>结尾段落 &amp; 符号。</w:t></w:r></w:p>
</w:body></w:document>'''

CORE = '''<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>文档测试</dc:title><dc:creator>文档作者</dc:creator></cp:coreProperties>'''

docx = os.path.join(OUT, 'sample.docx')
with zipfile.ZipFile(docx, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types/>')
    z.writestr('word/document.xml', DOCUMENT)
    z.writestr('docProps/core.xml', CORE)

print('generated:', epub, os.path.getsize(epub), 'bytes')
print('generated:', docx, os.path.getsize(docx), 'bytes')
