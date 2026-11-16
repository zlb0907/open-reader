# -*- coding: utf-8 -*-
"""生成 GB18030 编码的测试样本。样本已随仓库提供，通常无需重复运行。"""
from pathlib import Path

text = (
    "第一章 你好世界\n"
    "这是一段用 GB18030 编码的中文测试文本，你好世界。\n"
    "第二章 再见\n"
    "编码检测应当正确识别为 gb18030 并正确分章。\n"
)
out = Path(__file__).with_name("fixtures") / "gb18030-chinese.txt"
out.parent.mkdir(parents=True, exist_ok=True)
data = text.encode("gb18030")
out.write_bytes(data)
try:
    data.decode("utf-8")
    print("警告: 该样本恰好也是合法 UTF-8，无法验证编码回退")
except UnicodeDecodeError:
    print("OK: 该样本不是合法 UTF-8，可用于验证 gb18030 回退")
print(f"已写入 {out} ({len(data)} 字节)")
