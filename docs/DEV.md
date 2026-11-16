# 开放书库 · 阅读器 v1.2
> 本文是 v1.2 时期的开发文档，保留作架构与格式解析能力的说明。
> 当前版本已包含 Android 端与 Windows 单文件 EXE，功能、下载与许可见仓库根目录 `README.md`。


免费、离线、开放格式的电子书管理器。**主交付物是 Windows 绿色版 EXE**，双击即用，不用装 Node、不用开浏览器、不用敲命令。数据契约见上一级目录的 `书库格式规范_v0.1.md`。

无账号、无服务器、无收费、无加密容器；书库就是一个可以直接拷走、用文本工具和 SQLite 工具打开的文件目录。

## 直接运行 EXE

```
dist/开放书库/开放书库.exe        ← 双击这个
dist/开放书库/data/               ← 首次启动自动创建，你的全部数据都在这里
```

- **从资源管理器双击启动**。不要从某些 Electron 宿主（如 WorkBuddy 内置终端）里启动：这类宿主会给子进程注入 `ELECTRON_RUN_AS_NODE=1`，使 exe 退化成纯 Node CLI 而静默退出。命令行启动前先 `unset ELECTRON_RUN_AS_NODE`。
- 整个 `开放书库/` 文件夹可以拷到 U 盘或另一台电脑，连 `data/` 一起带走即可。别放进 `C:\Program Files` 这类需要管理员权限的目录。
- 首次启动且书库为空时自动放入 2 本示例书，删掉即可。

## 界面与操作

| 区域 | 功能 |
|---|---|
| 左侧 | 全文搜索、导入、导航（全部/最近阅读/我的书签/未分类）、可增删重命名与隐藏的书架分类树 |
| 书架 | 书籍卡片网格，显示格式、章数、大小、阅读进度；右键可重命名、归类、导出、删除；拖到分类上即可归类 |
| 阅读 | 左侧常驻目录（全部章节、当前章高亮、筛选 / 输入页码跳转、可折叠）、分页加载、**扫描版 PDF 连续滚动自动加载后续页**、字号/行距/字体、三套主题、书签、进度条、键盘翻页、原件导出 |
| 求书 | 左侧「求书」入口内嵌维护者配置的在线求书表单（飞书多维表格），填书名/作者提交；维护者在表格里回复网盘链接，用户回到求书页刷新即可在自己的提交记录里看到链接 |
| 弹窗 | 设置（主题/字体/字号/行距/每页字数/求书表单链接/重建索引/书库路径）、关于、输入与确认（不依赖浏览器原生弹窗） |
| 桌面菜单 | 文件 / 阅读 / 工具 / 帮助，含原生文件对话框导入、打开书库目录、查看运行日志 |

快捷键：`Ctrl+O` 导入 · `Ctrl+F` 搜索 · `←/→`、`PageUp/PageDown`、空格翻页 · `Esc` 返回书架 · `Ctrl+D` 书签 · `Ctrl+=`/`Ctrl+-` 字号 · `Ctrl+T` 主题 · `Ctrl+,` 设置。也支持把文件直接拖进窗口。

## 支持格式

| 格式 | 行为 |
|---|---|
| TXT / MD / MARKDOWN / TEXT / LOG / RST / TEX / SRT / CSV / JSON / XML / NFO | 完整阅读，UTF-8（含 BOM）与 GB18030 自动检测，自动分章 |
| 其他未知扩展名的纯文本 | 魔数嗅探后自动按纯文本阅读（编码自动检测） |
| EPUB | 按 OPF spine 顺序还原章节，读取标题/作者，剔除样式与脚本 |
| DOCX | 按 Heading 样式或中文章标题分章，多 run 拼接无损，读 core.xml 元数据 |
| **PDF（文字版）** | **按页分章**，支持中文 ToUnicode CMap、对象流 ObjStm、Flate/ASCII85/ASCIIHex/RunLength/LZW/Predictor，读取 /Info 元数据 |
| DOC（Word 97–2003） | OLE 复合文档 → FIB piece table 提取正文，失败时退化为 UTF-16 文本串扫描 |
| RTF | `\uN` 与 `\ansicpg936` 的 `\'hh` 双通道中文还原，跳过字体表/样式表等控制组 |
| ODT / OTT | content.xml 按标题/段落分章，读 meta.xml 的标题与作者 |
| FB2 | FictionBook XML，按 section/title 分章，读 book-title 与作者 |
| MHTML / MHT | MIME multipart，quoted-printable 与 base64 解码，取 HTML 正文 |
| MOBI / PRC / PDB / AZW | PalmDOC 容器，支持未压缩与 LZ77 压缩，清理内嵌 HTML 标签 |
| HTML / HTM / XHTML | 去标签与实体还原，自动分章 |
| ZIP | 自动识别包内 EPUB / FB2 / TXT 并解析 |
| AZW3 / KF8、CHM、DjVu、CBZ / CBR | **不解析，原件完整保留**，右键「导出原始文件」取回 |
| **扫描版 PDF（页面为 JPEG/JPX 图片）** | **按原页图片浏览**：从原 PDF 按字节区间切片返回页面图，不落地副本、不额外占 74 MB；不做 OCR，无文字层故不支持全文检索 |
| 加密 PDF / 图像编码不可直接显示的扫描件 | 明确提示降级，**不做破解、不做 OCR**，原件完整保留 |

**原件永远原样保留**：导入时复制一份 `source.<ext>`，派生文本只用于阅读与检索；任何格式解析失败都只影响阅读，不会丢文件，随时可导出。扫描版图片页只记录「偏移 + 长度」，原件始终只有一份。

**升级自动迁移**：v1.0 导入时标为「暂不解析」的书，升级后首次启动会用新解析器从原件重跑一次（`parser_version` 保证幂等），**不需要重新导入**。

解析层位于 `src/core/parsers.mjs`（统一入口）、`src/core/pdf.mjs`（PDF 专用）、`src/core/formats.mjs`（其余格式），**零外部依赖、纯 Web 标准 API**（`DecompressionStream` / `TextDecoder` / `atob` / `TextEncoder`），Node 与 Android WebView 都能跑。

### PDF 解析的能力边界

这是纯前端实现，覆盖"有文字层"的常规 PDF，包括 Word / Chrome / LaTeX 导出的中文文档。以下情况会明确降级或需要人工判断：

- 页面为 JPEG/JPX 的扫描件：按原页图片浏览，不 OCR、不支持全文检索；其它图像编码与加密 PDF 明确提示降级，不猜内容。
- 没有 ToUnicode CMap 的中文 CID 字体：走 GB18030 / UTF-16BE 启发式，个别老 PDF 可能乱码。
- 复杂排版（多栏、表格、竖排、数学公式）只按内容流顺序抽取文字，不还原版面；行合并基于坐标启发，不保证 100% 保真。
- 不做 OCR，不解密，不处理 HUFF/CDIC 压缩的 MOBI 与 KF8 骨架。

## 架构

```
开放书库.exe (Electron 35 窗口壳)
   ├─ electron/main.cjs     原生窗口、中文菜单、文件对话框、单实例、生命周期
   ├─ electron/preload.cjs  contextBridge 暴露最小能力集（桌面能力可选，浏览器版自动降级）
   ├─ runtime/node.exe      内置 Node 22 运行时（sidecar）
   ├─ server.mjs            HTTP 服务 + 静态资源
   ├─ src/core/             同构业务逻辑，不依赖 DOM / UI 框架
   └─ src/web/              浏览器前端，原生 JS，无框架无构建
```

主进程启动内置 Node 跑 `server.mjs`，随机空闲端口，就绪后才创建窗口；退出时一并关闭后端。窗口通过 `fetch('/api/*')` 与 core 通信，**这份前端与 core 可以原样搬进 Android WebView**。

core 模块：`util`（常量/哈希/时间）、`storage`（StorageBackend，各端唯一平台层）、`chapters`（编码/分章/分页）、`parsers`（统一入口 + ZIP/EPUB/DOCX/HTML）、`pdf`（PDF 对象/滤镜/CMap/文本流）、`formats`（RTF/ODT/FB2/MHTML/MOBI/DOC + 文本兜底）、`library`（建库/设置/书架树）、`books`（导入/读取/导出）、`progress`（LWW 合并纯函数）、`indexer`（SQLite FTS5 / 内存降级）、`pack`（.openlib ZIP）、`api`（统一门面）。

## 开发模式（浏览器）

Node.js 22+：

```bash
cd open-reader
npm run fixtures          # 重新生成全部测试样本（需 Python 3）
npm start                 # http://127.0.0.1:8787
npm run check             # core 14 + HTTP 11 + 基础格式 18 + 扩展格式 33，共 76 项断言
npm run verify:exe        # 验证最终绿色版产物（中文路径 / SQLite / EPUB / 导出）
npm run launch:exe        # 真实启动 exe 并保留窗口
```

自定义目录：`node --experimental-sqlite --no-warnings server.mjs --root "D:\我的书库" --port 9000`
（本机 PATH 无 node 时，请改用 node 可执行文件的绝对路径。）

## 重新构建 EXE

```bash
npm run fetch:runtime      # 首次：从 npmmirror 装 Electron 运行时
npm run build:exe          # 组装 + 改图标/版本信息 + 中文命名
```

`build:exe` 末尾的 `finalize.py` 需要 Python 3 在 PATH；没有的话用绝对路径执行一次：
`python -X utf8 build/finalize.py`。

构建脚本有个刻意的绕行：**Node 22 的 `fs.cpSync` 复制到中文目标路径会段错误**，所以组装全程走 ASCII 临时目录，最后用 Python 改名。别把这段"优化"掉。

## 测试现状

| 套件 | 结果 |
|---|---|
| core 断言（建库/导入/分章/进度/合并/FTS5/打包往返/防御） | 14 / 14 |
| HTTP 接口冒烟 | 11 / 11 |
| 基础格式解析（ZIP/EPUB/DOCX/HTML/降级） | 18 / 18 |
| **扩展格式解析（PDF/扫描图片页/RTF/ODT/FB2/MHTML/MOBI/DOC/ZIP/兜底 + 迁移 + API）** | **33 / 33** |
| 绿色版产物端到端 | 30 / 30（含 v1.2 求书功能 4 项） |
| EXE 真实启动链路 | 通过（窗口创建 + 后端 200 + data 建立） |

PDF 样本全部由 Python 标准库手写字节构造：中文 ToUnicode CMap、FlateDecode、ASCII85+Flate、LZW、PNG Predictor、PDF 1.5 对象流 + xref stream、扫描版、加密件。

## 已知边界 / 下一轮

- AZW3 / KF8、HUFF-CDIC MOBI、CHM、漫画包仍只存原件；扫描版 PDF 按图浏览、无 OCR，因此搜不到正文。要全文检索需先用外部 OCR 生成可搜索 PDF 再导入。
- FTS5 默认检索走中文子串 LIKE，`searchFts` 用 trigram 分词；接中文分词器后可切换默认。
- 增量索引按 `updated_at + revision` 判断，保存进度会触发该书重索引（无害，可改用 content_hash）。
- EXE 无数字签名（个人免费软件常见），部分安全软件可能拦截；体积约 327 MB（Chromium + 内置 Node）。
- Android 端未实现：需要 `StorageBackend` 的 SAF / `content://` 适配与 SQLite 替代方案；书库格式已为此设计好，数据零迁移。解析层本身是同构 Web 标准，可直接复用。
- 书架的 `hidden` 只是 UI 隐藏标记，不加密、不承诺安全性。
