# 生成 64x64 PNG 压缩的 ICO（Vista+ 支持），无第三方依赖。
import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, '..', 'assets')
os.makedirs(OUT_DIR, exist_ok=True)
W = H = 64
BLUE = (63, 106, 216, 255)
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)


def rounded(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


books = [(14, 18, 23, 47), (26, 13, 35, 47), (38, 21, 47, 47)]
rows = []
for y in range(H):
    row = bytearray([0])  # PNG filter: None
    for x in range(W):
        c = CLEAR
        if rounded(x, y, 2, 2, 61, 61, 13):
            c = BLUE
            for (x0, y0, x1, y1) in books:
                if x0 <= x <= x1 and y0 <= y <= y1:
                    c = WHITE
                    break
        row += bytes(c)
    rows.append(bytes(row))
raw = b''.join(rows)


def chunk(tag, data):
    return (struct.pack('>I', len(data)) + tag + data +
            struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))


png = (b'\x89PNG\r\n\x1a\n'
       + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0))
       + chunk(b'IDAT', zlib.compress(raw, 9))
       + chunk(b'IEND', b''))

ico = (struct.pack('<HHH', 0, 1, 1)
       + struct.pack('<BBBBHHII', 64, 64, 0, 0, 1, 32, len(png), 22)
       + png)

ico_path = os.path.join(OUT_DIR, 'app.ico')
with open(ico_path, 'wb') as f:
    f.write(ico)
with open(os.path.join(OUT_DIR, 'app.png'), 'wb') as f:
    f.write(png)
print('icon:', ico_path, len(ico), 'bytes')
