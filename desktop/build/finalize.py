# 最终改名（Python 处理中文路径稳定，绕开 Node fs.cpSync 的 Windows 段错误）
import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
SRC = os.path.join(DIST, 'OpenReader')
DST = os.path.join(DIST, '开放书库')

if not os.path.isdir(SRC):
    raise SystemExit('找不到构建产物：' + SRC)

# 绿色版的用户书库就在 DST/data。重建会删掉旧产物目录，所以先把 data 整体
# 移出到同盘的暂存位置（os.rename 是元数据操作，74MB 也几乎零成本），
# 新产物就位后再原样移回，用户不用重新导入、也不会丢书。
HOLD = os.path.join(DIST, '_data_hold_%d' % os.getpid())
if os.path.isdir(DST) and os.path.isdir(os.path.join(DST, 'data')):
    if os.path.exists(HOLD):
        raise SystemExit('发现上次未恢复的书库暂存目录：' + HOLD
                         + '\n请先手动把它改名为 data 放回「开放书库」目录，再重新构建。')
    os.rename(os.path.join(DST, 'data'), HOLD)
    print('已暂存用户书库 ->', HOLD)

if os.path.exists(DST):
    shutil.rmtree(DST)
os.rename(SRC, DST)

if os.path.isdir(HOLD):
    os.rename(HOLD, os.path.join(DST, 'data'))
    print('已恢复用户书库 ->', os.path.join(DST, 'data'))

for old, new in [
    ('electron.exe', '开放书库.exe'),
    ('README.txt', '使用说明.txt'),
    ('FORMAT_SPEC.md', '书库格式规范_v0.1.md'),
]:
    a, b = os.path.join(DST, old), os.path.join(DST, new)
    if os.path.exists(a):
        os.rename(a, b)

required = [
    '开放书库.exe',
    os.path.join('resources', 'app', 'package.json'),
    os.path.join('resources', 'app', 'server.mjs'),
    os.path.join('resources', 'app', 'electron', 'main.cjs'),
    os.path.join('resources', 'app', 'electron', 'preload.cjs'),
    os.path.join('resources', 'app', 'runtime', 'node.exe'),
    os.path.join('resources', 'app', 'src', 'web', 'index.html'),
    os.path.join('resources', 'app', 'src', 'core', 'parsers.mjs'),
    os.path.join('resources', 'app', 'src', 'core', 'pdf.mjs'),
    os.path.join('resources', 'app', 'src', 'core', 'formats.mjs'),
    os.path.join('resources', 'app', 'assets', 'app.ico'),
]
missing = [r for r in required if not os.path.exists(os.path.join(DST, r))]
if missing:
    raise SystemExit('产物缺文件：' + ', '.join(missing))

total = 0
for base, dirs, files in os.walk(DST):
    for f in files:
        total += os.path.getsize(os.path.join(base, f))

exe = os.path.join(DST, '开放书库.exe')
print('输出目录:', DST)
print('主程序  :', exe)
print('EXE 大小: %.1f MB' % (os.path.getsize(exe) / 1048576))
print('整包大小: %.1f MB' % (total / 1048576))
print('必需文件: 全部齐备 (%d 项)' % len(required))
print('顶层内容:', ', '.join(sorted(os.listdir(DST))[:12]))
