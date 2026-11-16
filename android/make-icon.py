# -*- coding: utf-8 -*-
"""开放书库 launcher 图标生成器（零第三方依赖，纯 Python 手写 PNG）。

改设计只改下面的形状/配色常量，然后：
    python make-icon.py
产出 app/src/main/res/mipmap-*/ic_launcher.png（圆角方形）
  与 ic_launcher_round.png（正圆，供 android:roundIcon 使用）。

做法：先在 192*4 的超采样画布上逐像素混合，再按面积权重降采样到
48/72/96/144/192，边缘用预乘 alpha 平均，不会有白边或黑边。
"""
import math
import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(HERE, 'app', 'src', 'main', 'res')
SS = 4                      # 超采样倍数
BASE = 192                  # xxxhdpi 边长
N = BASE * SS
DENSITIES = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}


def clamp(v):
    return 0.0 if v < 0.0 else (1.0 if v > 1.0 else v)


def mix(a, b, t):
    t = clamp(t)
    return (a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t)


def background(x, y):
    """左上亮蓝 -> 右下靛紫的对角渐变 + 左上柔光。"""
    t = clamp(0.62 * x + 0.38 * y)
    c = (44 / 255 + (92 / 255 - 44 / 255) * t,
         92 / 255 + (52 / 255 - 92 / 255) * t,
         232 / 255 + (214 / 255 - 232 / 255) * t)
    halo = max(0.0, 1.0 - math.hypot(x - 0.22, y - 0.16) / 0.92) * 0.20
    c = mix(c, (1.0, 1.0, 1.0), halo)
    # 右上角一道极淡的圆弧，增加层次但不抢主体
    ring = abs(math.hypot(x - 0.88, y - 0.10) - 0.36)
    if ring < 0.010:
        c = mix(c, (1.0, 1.0, 1.0), 0.10 * (1 - ring / 0.010))
    return c


def shape_cover(shape, x, y):
    """返回 0/1，抗锯齿交给超采样。"""
    if shape == 'round':
        return 1.0 if math.hypot(x - 0.5, y - 0.5) <= 0.5 else 0.0
    r = 0.225                       # 圆角半径，约边长 22%
    dx = abs(x - 0.5) - (0.5 - r)
    dy = abs(y - 0.5) - (0.5 - r)
    d = math.hypot(max(dx, 0.0), max(dy, 0.0)) + min(max(dx, dy), 0.0) - r
    return 1.0 if d <= 0.0 else 0.0


def book(cx, cy, col):
    """一本摊开的书：两页白色、页内文字线、中间书脊、底部投影。"""
    OUT, SPINE, R_OUT = 0.185, 0.5, 0.815

    # 1) 书下方的柔和投影（先画，随后被书页盖住上半部）
    ex, ey = (cx - 0.5) / 0.315, (cy - 0.752) / 0.058
    q = ex * ex + ey * ey
    if q < 1.0:
        col = mix(col, (0.04, 0.07, 0.20), 0.26 * (1.0 - q) ** 1.4)

    # 2) 两页
    if OUT <= cx <= R_OUT:
        if cx <= SPINE:
            t = (cx - OUT) / (SPINE - OUT)      # 0=外缘, 1=书脊
            outer = cx - OUT
        else:
            t = (R_OUT - cx) / (R_OUT - SPINE)
            outer = R_OUT - cx
        top = 0.345 + 0.060 * t
        bot = 0.655 + 0.070 * t
        if top <= cy <= bot:
            # 越靠书脊越暗一点点，做出纸张的折角
            col = mix((1.0, 1.0, 1.0), (0.855, 0.895, 0.985), 0.30 * t)
            edge = min(cy - top, bot - cy, outer)
            if edge < 0.0075:
                col = mix(col, (0.60, 0.71, 0.93), 0.62)
            # 三长一短的正文线
            for k in range(4):
                ly = top + 0.078 + k * 0.050
                reach = 0.80 if k < 3 else 0.54
                if ly < bot - 0.040 and abs(cy - ly) < 0.0062 and 0.16 <= t <= reach:
                    col = mix(col, (0.72, 0.79, 0.94), 0.92)

    # 3) 书脊（压在两页之上）
    if abs(cx - SPINE) < 0.0068 and 0.400 <= cy <= 0.730:
        col = mix(col, (0.20, 0.34, 0.78), 0.96)
    return col


def render(shape):
    """返回预乘 alpha 的 RGBA8 超采样缓冲 (bytearray, N*N*4)。"""
    buf = bytearray(N * N * 4)
    scale = 0.84 if shape == 'round' else 1.0
    inv = 1.0 / scale
    p = 0
    for sy in range(N):
        y = (sy + 0.5) / N
        for sx in range(N):
            x = (sx + 0.5) / N
            if shape_cover(shape, x, y) > 0.0:
                col = background(x, y)
                cx = 0.5 + (x - 0.5) * inv
                cy = 0.5 + (y - 0.5) * inv
                col = book(cx, cy, col)
                buf[p] = int(clamp(col[0]) * 255)
                buf[p + 1] = int(clamp(col[1]) * 255)
                buf[p + 2] = int(clamp(col[2]) * 255)
                buf[p + 3] = 255
            p += 4
    return buf


def premultiply(buf, count):
    """就地转成预乘 alpha（这里 alpha 只可能是 0 或 255，等价拷贝）。"""
    return buf


def downsample(src, sw, sh, dw, dh):
    """面积加权盒式降采样；src 是未预乘 RGBA8，输出未预乘 RGBA8。"""
    acc = [0.0] * (dw * dh * 4)
    for sy in range(sh):
        y0, y1 = sy * dh / sh, (sy + 1) * dh / sh
        ty0, ty1 = int(y0), int(math.ceil(y1))
        for ty in range(ty0, min(ty1, dh)):
            wy = min(y1, ty + 1) - max(y0, ty)
            if wy <= 0:
                continue
            for sx in range(sw):
                x0, x1 = sx * dw / sw, (sx + 1) * dw / sw
                tx0, tx1 = int(x0), int(math.ceil(x1))
                sp = (sy * sw + sx) * 4
                a = src[sp + 3] / 255.0
                pr, pg, pb = (src[sp] * a, src[sp + 1] * a, src[sp + 2] * a)
                for tx in range(tx0, min(tx1, dw)):
                    wx = min(x1, tx + 1) - max(x0, tx)
                    if wx <= 0:
                        continue
                    w = wx * wy
                    dp = (ty * dw + tx) * 4
                    acc[dp] += pr * w
                    acc[dp + 1] += pg * w
                    acc[dp + 2] += pb * w
                    acc[dp + 3] += a * w
    # 权重是以「目标像素」为单位的面积：每个输出像素收到的权重之和恒为 1，
    # 所以 acc 已经是加权平均，不能再除以超采样倍数。
    def byte255(v):
        return int(max(0.0, min(255.0, v)))

    out = bytearray(dw * dh * 4)
    for i in range(dw * dh):
        dp, op = i * 4, i * 4
        a = acc[dp + 3]
        if a <= 0.0001:
            continue
        # acc 的前三项是「预乘后的 0..255 颜色」，除以平均 alpha 还原直色。
        out[op] = byte255(acc[dp] / a)
        out[op + 1] = byte255(acc[dp + 1] / a)
        out[op + 2] = byte255(acc[dp + 2] / a)
        out[op + 3] = byte255(a * 255)
    return out


def write_png(dst, w, h, rgba):
    raw = bytearray()
    stride = w * 4
    for y in range(h):
        raw.append(0)
        raw += rgba[y * stride:(y + 1) * stride]

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data
                + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
           + chunk(b'IEND', b''))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, 'wb') as f:
        f.write(png)
    return len(png)


def main():
    total = 0
    for shape, name in (('squircle', 'ic_launcher.png'),
                        ('round', 'ic_launcher_round.png')):
        print('rendering', shape, '...', flush=True)
        src = render(shape)
        for folder, size in DENSITIES.items():
            dst = os.path.join(RES, folder, name)
            n = write_png(dst, size, size, downsample(src, N, N, size, size))
            total += 1
            print('  %-16s %3d x %3d  %6d B  %s' %
                  (folder, size, size, n, os.path.basename(dst)))
    print('done:', total, 'PNG ->', RES)


if __name__ == '__main__':
    main()
