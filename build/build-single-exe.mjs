#!/usr/bin/env node
/* 把 open-reader/dist/开放书库 绿色目录做成「一个 exe」的自释放单文件版。
 *
 * 运行时行为：
 *   1. 双击 -> 若 %LOCALAPPDATA%\OpenReader\app 里已有本次构建的 stamp，直接跳过展开；
 *      否则展开 payload（带进度，仅首次约 5~15 秒），并写下 stamp。
 *   2. 书库位置（B2）优先级：
 *      a) exe 同目录带 data\library.json  -> 便携模式，用它当书库（向后兼容）；
 *      b) %LOCALAPPDATA%\OpenReader\library-path.txt 里记的自定义路径；
 *      c) 两者都没有 -> 首次启动弹一次文件夹选择框，可点「否」用默认位置，
 *         选择结果写入 library-path.txt，以后不再询问。
 *         重设方法：在 exe 旁边放一个空的「重设书库位置.txt」再双击（选完自动删），
 *         或直接删掉 library-path.txt。
 *      d) 默认 %LOCALAPPDATA%\OpenReader\app\data（升级覆盖不丢书）。
 *      配置文件由 NSIS FileWrite/FileRead 读写，编码为系统 ANSI 代码页（中文 Windows = GBK），
 *      写读口径自洽；不要用记事本另存成 UTF-16 去改它。
 *   3. 启动展开目录里的 开放书库.exe（OPEN_READER_LIBRARY 由 main.cjs:16 读取）。
 *
 * 用法：node build-single-exe.mjs
 * 产物：PC\开放书库.exe + PC\卸载开放书库.exe（分发时只给前者）
 * 依赖：%LOCALAPPDATA%\OpenReaderToolchain\nsis\makensis.exe （NSIS 3.11 便携版）
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));   // PC/build
const PC = path.resolve(HERE, '..');                          // PC
const ROOT = path.resolve(PC, '..');                          // D:\woby\阅读
const SRC = path.join(ROOT, 'PC', 'dist', '开放书库');
const TMP = path.join(process.env.TEMP || os.tmpdir(), 'or-single-build');
const PAYLOAD = path.join(TMP, 'payload');
const NSIS = path.join(process.env.LOCALAPPDATA || '', 'OpenReaderToolchain', 'nsis', 'makensis.exe');
const OUT = path.join(PC, '开放书库.exe');
const UNINSTALL_OUT = path.join(PC, '卸载开放书库.exe');
const NSI = path.join(TMP, 'single.nsi');
const UNINSTALL_NSI = path.join(TMP, 'uninstall.nsi');
const BUILT = path.join(TMP, 'OpenReaderSingle.exe');
const UNBUILT = path.join(TMP, 'OpenReaderUninstall.exe');
const APPDIR = '$LOCALAPPDATA\\OpenReader\\app';
const APP_VERSION = '1.2.0';

const say = (...a) => process.stderr.write(a.join(' ') + '\n');
const win = (p) => p.replace(/\//g, '\\');
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';

function die(msg) { say('ERROR: ' + msg); process.exit(1); }

/* 手写递归复制：Node 22 的 fs.cpSync 遇到中文路径会段错误。
   顶层 data\ 是用户书库，绝不打进分发包；只保留静态运行文件。 */
function copyTree(src, dst, rel = '') {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (!rel && e.name === 'data' && e.isDirectory()) continue;   // 用户数据不分发
    if (/\.bak|\.backup/i.test(e.name)) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyTree(s, d, r);
    else if (e.isFile()) fs.copyFileSync(s, d);
  }
}

function stampOf(dir) {
  const h = crypto.createHash('sha256');
  const walk = (p, rel) => {
    for (const e of fs.readdirSync(p, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const r = rel ? rel + '/' + e.name : e.name;
      const f = path.join(p, e.name);
      if (e.isDirectory()) walk(f, r);
      else { h.update(r + '\0'); h.update(fs.readFileSync(f)); }
    }
  };
  walk(dir, '');
  return h.digest('hex').slice(0, 16);
}

/* ---------------- 主程序：自释放 + 书库位置选择 ---------------- */
const NSI_TEMPLATE = `Unicode true
RequestExecutionLevel user
SetCompressor lzma
SetCompressorDictSize 32
AutoCloseWindow true
BrandingText "开放书库"
OutFile "__OUT__"
Icon "__ICON__"
VIProductVersion "__V4__"
VIAddVersionKey /LANG=2052 "ProductName" "开放书库"
VIAddVersionKey /LANG=2052 "CompanyName" "OpenReader"
VIAddVersionKey /LANG=2052 "FileDescription" "开放书库 单文件版"
VIAddVersionKey /LANG=2052 "FileVersion" "__VERSION__"
VIAddVersionKey /LANG=2052 "LegalCopyright" "OpenReader"

; library-path.txt 由 NSIS FileWrite/FileRead 读写（系统 ANSI 代码页，中文 Windows = GBK），
; 写读口径一致，中文路径可正确往返；不要用记事本另存为 UTF-16 改动它。
!define APPDIR "__APPDIR__"
!define CFG "$LOCALAPPDATA\\OpenReader\\library-path.txt"
!define STAMP "__STAMP__"

Section "main"
  SetDetailsPrint textonly
  DetailPrint "正在检查本地运行文件…"

  IfFileExists "\${APPDIR}\\\${STAMP}.stamp" 0 do_extract
  IfFileExists "\${APPDIR}\\开放书库.exe" 0 do_extract
  IfFileExists "\${APPDIR}\\libEGL.dll" 0 do_extract
  IfFileExists "\${APPDIR}\\卸载开放书库.exe" 0 do_extract
  Goto lib_check

do_extract:
  SetDetailsPrint both
  DetailPrint "首次启动：正在展开运行文件（约 5~15 秒，只做一次）…"
  CreateDirectory "\${APPDIR}"
  SetOutPath "\${APPDIR}"
  File /r "__PAYLOAD__\\*.*"
  ; 卸载器由菜单栏「卸载」调用；单独释放，不放进 payload 以免与 stamp 互相依赖。
  File "/oname=卸载开放书库.exe" "__UNINSTALL_EXE__"
  FileOpen $0 "\${APPDIR}\\\${STAMP}.stamp" w
  FileClose $0
  SetDetailsPrint textonly

lib_check:
  CreateDirectory "$LOCALAPPDATA\\OpenReader"

  ; (a) 便携模式优先：exe 同目录带 data\\library.json
  IfFileExists "$EXEDIR\\data\\library.json" 0 no_portable
    System::Call 'kernel32::SetEnvironmentVariableW(w "OPEN_READER_LIBRARY", w "$EXEDIR\\data")'
    Goto run

no_portable:
  ; (c) 重设入口：exe 同目录放一个空的「重设书库位置.txt」
  IfFileExists "$EXEDIR\\重设书库位置.txt" setlib_ask cfg_read

cfg_read:
  ; (b) 已保存的自定义路径（GBK，由本脚本 FileWrite 写入）
  IfFileExists "\${CFG}" 0 setlib_ask
  FileOpen $0 "\${CFG}" r
  IfErrors setlib_ask
  FileRead $0 $1
  FileClose $0
  StrCmp $1 "" setlib_ask
  StrCmp $1 "DEFAULT" run
  System::Call 'kernel32::SetEnvironmentVariableW(w "OPEN_READER_LIBRARY", w "$1")'
  Goto run

setlib_ask:
  MessageBox MB_YESNO|MB_ICONQUESTION "要自定义书库的存放位置吗？$\\r$\\n$\\r$\\n选「是」：打开文件夹选择窗口，书会存在你选的地方。$\\r$\\n选「否」：使用默认位置 $LOCALAPPDATA\\OpenReader\\app\\data。$\\r$\\n$\\r$\\n只询问这一次。以后想改：在 exe 旁边新建一个空的「重设书库位置.txt」再双击即可重新选择。" IDNO use_default
  nsDialogs::SelectFolderDialog "选择书库存放位置（点取消＝使用默认位置）" "$LOCALAPPDATA\\OpenReader"
  Pop $1
  StrCmp $1 "cancel" use_default
  StrCmp $1 "" use_default
  CreateDirectory "$1"
  FileOpen $0 "\${CFG}" w
  FileWrite $0 "$1"
  FileClose $0
  Delete "$EXEDIR\\重设书库位置.txt"
  System::Call 'kernel32::SetEnvironmentVariableW(w "OPEN_READER_LIBRARY", w "$1")'
  Goto run

use_default:
  FileOpen $0 "\${CFG}" w
  FileWrite $0 "DEFAULT"
  FileClose $0
  Delete "$EXEDIR\\重设书库位置.txt"

run:
  Exec '"\${APPDIR}\\开放书库.exe"'
SectionEnd
`;

/* ---------------- 卸载器：不写注册表、不进控制面板 ---------------- */
const UNINSTALL_TEMPLATE = `Unicode true
RequestExecutionLevel user
SetCompressor lzma
AutoCloseWindow true
BrandingText "开放书库 · 卸载"
OutFile "__UNOUT__"
Icon "__ICON__"
VIProductVersion "__V4__"
VIAddVersionKey /LANG=2052 "ProductName" "开放书库 卸载工具"
VIAddVersionKey /LANG=2052 "CompanyName" "OpenReader"
VIAddVersionKey /LANG=2052 "FileDescription" "开放书库 卸载工具"
VIAddVersionKey /LANG=2052 "FileVersion" "__VERSION__"
VIAddVersionKey /LANG=2052 "LegalCopyright" "OpenReader"

!define CFG "$LOCALAPPDATA\\OpenReader\\library-path.txt"

Section "main"
  ; 从菜单栏「卸载」调用时主程序已弹过确认，跳过首次确认，避免连弹两个框；
  ; 顺便等 1.5 秒让主进程彻底退出，否则运行文件被占用会删不掉。
  ReadEnvStr $0 "OR_UNINSTALL_CONFIRMED"
  StrCmp $0 "1" from_menu
  MessageBox MB_YESNO|MB_ICONEXCLAMATION "确定要卸载开放书库吗？$\\r$\\n$\\r$\\n将删除：$\\r$\\n· $LOCALAPPDATA\\OpenReader（运行文件 + 默认书库 data）$\\r$\\n· $APPDATA\\开放书库（缓存 / 日志 / 求书登录信息）$\\r$\\n$\\r$\\n书库里的书会一起删除，且不可恢复。$\\r$\\n不会在控制面板留下卸载项。$\\r$\\n$\\r$\\n请先关闭正在运行的开放书库。" IDNO quit
  Goto have_confirm
from_menu:
  Sleep 1500
have_confirm:

  ; 找出当前书库位置，用于提示用户保存
  StrCpy $1 "$LOCALAPPDATA\\OpenReader\\app\\data"
  IfFileExists "$EXEDIR\\data\\library.json" portable_lib cfg_check
portable_lib:
  StrCpy $1 "$EXEDIR\\data"
  Goto have_lib
cfg_check:
  IfFileExists "\${CFG}" read_cfg have_lib
read_cfg:
  FileOpen $0 "\${CFG}" r
  IfErrors have_lib
  FileRead $0 $2
  FileClose $0
  StrCmp $2 "DEFAULT" have_lib
  StrCmp $2 "" have_lib
  StrCpy $1 "$2"
have_lib:
  MessageBox MB_YESNOCANCEL|MB_ICONQUESTION "要先把书库打开保存一份吗？$\\r$\\n$\\r$\\n当前书库：$1$\\r$\\n$\\r$\\n「是」打开书库文件夹并退出卸载（保存后请再运行一次）$\\r$\\n「否」不保存，直接删除$\\r$\\n「取消」退出卸载" IDNO do_delete IDCANCEL quit
  Exec '"$WINDIR\\explorer.exe" "$1"'
  MessageBox MB_OK "复制保存完成后，请重新双击本卸载器并选择「否」继续删除。"
  Goto quit

do_delete:
  SetDetailsPrint both
  DetailPrint "正在清理运行文件与书库…"
  RMDir /r "$LOCALAPPDATA\\OpenReader"
  DetailPrint "正在清理缓存与日志…"
  RMDir /r "$APPDATA\\开放书库"
  DetailPrint "清理完成。"
  MessageBox MB_YESNO|MB_ICONQUESTION "是否同时删除本目录下的 开放书库.exe？$\\r$\\n（删掉后需要重新出包才能再用，建议保留）" IDNO check_clean
  Delete "$EXEDIR\\开放书库.exe"
check_clean:
  IfFileExists "$LOCALAPPDATA\\OpenReader" still_here cleaned
cleaned:
  MessageBox MB_OK "卸载完成。$\\r$\\n$\\r$\\n本卸载器文件可以自行删除。$\\r$\\n出包工具 %LOCALAPPDATA%\\OpenReaderToolchain 已保留，不影响系统。"
  Goto quit
still_here:
  MessageBox MB_OK "部分文件仍被占用，请先关闭开放书库后重新运行本卸载器。"
quit:
SectionEnd
`;

/* ---------------- main ---------------- */
if (!fs.existsSync(SRC)) die('找不到源目录: ' + SRC);
if (!fs.existsSync(NSIS)) die('找不到 NSIS: ' + NSIS + '\n请检查 %LOCALAPPDATA%\\OpenReaderToolchain\\nsis\\');
if (!fs.existsSync(path.join(SRC, '开放书库.exe'))) die('源目录缺少主程序 开放书库.exe');

const onlyUninstaller = process.argv.includes('--uninstaller-only');
const prepareOnly = process.argv.includes('--prepare-only');

say('== 组装开放书库 单文件版 ==');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(PAYLOAD, { recursive: true });

say('[1/6] 复制静态运行文件（排除 data\\）…');
copyTree(SRC, PAYLOAD);

/* 运行时 exe 的图标在 PE 资源里，是 make-exe.mjs 打包时用 rcedit 写进去的；
   只替换 resources/app/assets/app.ico 不会改它（热更新补丁也换不到）。
   每次重出整包时把当前 app.ico 同步写进 payload 副本，保证任务栏 /
   Alt+Tab / 窗口图标与自释放壳一致。改的是临时副本，dist 源文件不动。 */
const RUNTIME_EXE = path.join(PAYLOAD, '开放书库.exe');
const RCEDIT = path.join(ROOT, 'PC', 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');
const RUNTIME_ICO = path.join(PAYLOAD, 'resources', 'app', 'assets', 'app.ico');
if (fs.existsSync(RCEDIT) && fs.existsSync(RUNTIME_EXE) && fs.existsSync(RUNTIME_ICO)) {
  const r = spawnSync(RCEDIT, [RUNTIME_EXE, '--set-icon', RUNTIME_ICO],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (r.status !== 0) die('同步运行时 exe 图标失败: '
    + ((r.stderr || '') + (r.stdout || '')).slice(-600));
  say('      运行时 exe 图标已同步（rcedit）');
} else {
  say('      警告：rcedit / 运行时 exe 缺失，运行时图标仍是旧图');
}

let total = 0, count = 0;
const sizeWalk = (p) => {
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const f = path.join(p, e.name);
    if (e.isDirectory()) sizeWalk(f);
    else { total += fs.statSync(f).size; count++; }
  }
};
sizeWalk(PAYLOAD);
say('      ' + count + ' 个文件 / ' + mb(total));

say('[2/6] 计算内容标记…');
const stamp = stampOf(PAYLOAD);
say('      stamp = ' + stamp);

say('[3/6] 生成 NSIS 脚本…');
const icoSrc = path.join(SRC, 'resources', 'app', 'assets', 'app.ico');
const ico = path.join(TMP, 'app.ico');
fs.copyFileSync(icoSrc, ico);
const common = [
  ['__ICON__', win(ico)],
  ['__V4__', APP_VERSION + '.0'],
  ['__VERSION__', APP_VERSION],
  ['__APPDIR__', APPDIR],
  ['__STAMP__', stamp],
  ['__PAYLOAD__', win(PAYLOAD)],
  ['__UNINSTALL_EXE__', win(UNBUILT)],
];
const render = (tpl, extra) => [...common, ...extra].reduce((s, [a, b]) => s.replace(a, b), tpl);
fs.writeFileSync(NSI, '\uFEFF' + render(NSI_TEMPLATE, [['__OUT__', win(BUILT)]]), 'utf8');
fs.writeFileSync(UNINSTALL_NSI, '\uFEFF' + render(UNINSTALL_TEMPLATE, [['__UNOUT__', win(UNBUILT)]]), 'utf8');
if (prepareOnly) {
  say('      (--prepare-only) 脚本: ' + NSI + ' / ' + UNINSTALL_NSI);
  process.exit(0);
}

function compile(nsi, built, label) {
  say('      编译 ' + label + '…');
  const r = spawnSync(NSIS, ['/V2', nsi], { cwd: TMP, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const log = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0 || !fs.existsSync(built)) {
    fs.writeFileSync(path.join(TMP, 'makensis-' + label + '.log'), log, 'utf8');
    die('makensis 编译 ' + label + ' 失败（exit ' + r.status + '）\n' + log.slice(-2000));
  }
  const warn = log.split(/\r?\n/).filter((l) => /warning|error/i.test(l));
  warn.slice(0, 5).forEach((l) => say('      ' + l.trim()));
}

say('[4/6] 编译卸载器…');
compile(UNINSTALL_NSI, UNBUILT, 'uninstall');
fs.copyFileSync(UNBUILT, UNINSTALL_OUT);

if (onlyUninstaller) {
  say('      (--uninstaller-only) 只产出卸载器，跳过主程序。');
  process.exit(0);
}

say('[5/6] 编译自释放主程序（329 MB 走 LZMA，需要几分钟）…');
compile(NSI, BUILT, 'main');
fs.copyFileSync(BUILT, OUT);

say('[6/6] 校验产物…');
function report(p) {
  const b = fs.readFileSync(p);
  if (b.slice(0, 2).toString() !== 'MZ') die('产物不是有效 PE 文件: ' + p);
  const sha = crypto.createHash('sha256').update(b).digest('hex');
  say('      ' + path.basename(p) + '  ' + mb(b.length) + '  sha256=' + sha);
  return sha;
}
say('');
say('DONE');
report(OUT);
report(UNINSTALL_OUT);
say('      stamp   = ' + stamp);
say('      验证    = certutil -hashfile "' + OUT + '" SHA256');
