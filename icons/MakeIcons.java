import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.*;
import java.io.*;
import java.nio.*;
import java.nio.file.*;
import java.util.*;

/** 开放书库双端图标生成器（零第三方依赖，JDK ImageIO 解码 JPG）。 */
public class MakeIcons {
    static final double CROP = 0.88;      // 1.00 = 保留原构图留白
    static final boolean RING = false;    // true = 加一圈浅金细边
    static final int[] ICO_SIZES = {16, 32, 48, 64, 128, 256};
    static final String[][] DENS = {
        {"mipmap-mdpi", "48"}, {"mipmap-hdpi", "72"}, {"mipmap-xhdpi", "96"},
        {"mipmap-xxhdpi", "144"}, {"mipmap-xxxhdpi", "192"},
    };
    static BufferedImage src, master;

    static BufferedImage crop() {
        int w = src.getWidth(), h = src.getHeight();
        int side = (int) Math.round(Math.min(w, h) * CROP);
        return src.getSubimage((w - side) / 2, (h - side) / 2, side, side);
    }

    static BufferedImage resize(int size) {
        BufferedImage out = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = out.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION,
                           RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING,
                           RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_RENDERING,
                           RenderingHints.VALUE_RENDER_QUALITY);
        g.drawImage(master, 0, 0, size, size, null);
        g.dispose();
        return out;
    }

    static double cover(String kind, double x, double y, int s) {
        int hit = 0;
        for (int sy = 0; sy < 4; sy++) for (int sx = 0; sx < 4; sx++) {
            double px = (x + (sx + 0.5) / 4) / s;
            double py = (y + (sy + 0.5) / 4) / s;
            if (kind.equals("round")) {
                if (Math.hypot(px - 0.5, py - 0.5) <= 0.5) hit++;
            } else {
                double r = 0.22;
                double dx = Math.abs(px - 0.5) - (0.5 - r);
                double dy = Math.abs(py - 0.5) - (0.5 - r);
                double d = Math.hypot(Math.max(dx, 0.0), Math.max(dy, 0.0))
                         + Math.min(Math.max(dx, dy), 0.0) - r;
                if (d <= 0.0) hit++;
            }
        }
        return hit / 16.0;
    }

    static BufferedImage shaped(int size, String kind) {
        BufferedImage im = resize(size);
        if (kind.equals("square")) return im;
        BufferedImage out = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < size; y++) for (int x = 0; x < size; x++) {
            int rgb = im.getRGB(x, y) & 0xFFFFFF;
            int a = (int) Math.round(cover(kind, x, y, size) * 255);
            out.setRGB(x, y, (a << 24) | rgb);
        }
        if (RING) {
            Graphics2D g = out.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING,
                               RenderingHints.VALUE_ANTIALIAS_ON);
            g.setColor(new Color(0xD8, 0xB4, 0x83, 190));
            g.setStroke(new BasicStroke(Math.max(1.0f, size / 96.0f)));
            if (kind.equals("round")) g.drawOval(1, 1, size - 2, size - 2);
            else g.drawRoundRect(1, 1, size - 2, size - 2,
                                 (int) (size * 0.44), (int) (size * 0.44));
            g.dispose();
        }
        return out;
    }

    static byte[] png(BufferedImage im) throws IOException {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        ImageIO.write(im, "png", o);
        return o.toByteArray();
    }

    static byte[] ico(java.util.List<byte[]> frames) {
        int total = 0;
        for (byte[] f : frames) total += f.length;
        ByteBuffer b = ByteBuffer.allocate(6 + 16 * frames.size() + total)
                                 .order(ByteOrder.LITTLE_ENDIAN);
        b.putShort((short) 0); b.putShort((short) 1);
        b.putShort((short) frames.size());
        int off = 6 + 16 * frames.size();
        for (int i = 0; i < frames.size(); i++) {
            int s = ICO_SIZES[i];
            b.put((byte) (s >= 256 ? 0 : s));       // width
            b.put((byte) (s >= 256 ? 0 : s));       // height
            b.put((byte) 0); b.put((byte) 0);       // colors / reserved
            b.putShort((short) 1);                  // planes
            b.putShort((short) 32);                 // bit count
            b.putInt(frames.get(i).length);
            b.putInt(off);
            off += frames.get(i).length;
        }
        for (byte[] f : frames) b.put(f);
        return b.array();
    }

    static void write(Path p, byte[] data) throws IOException {
        Files.createDirectories(p.getParent());
        Files.write(p, data);
        System.out.println("  " + p.getFileName() + " @ " + p.getParent()
                           + "  " + data.length + " B");
    }

    public static void main(String[] a) throws Exception {
        Path root = Paths.get(a[1]);
        src = ImageIO.read(new File(a[0]));
        if (src == null) throw new IOException("cannot decode JPG: " + a[0]);
        System.out.println("source = " + src.getWidth() + "x" + src.getHeight()
                           + "  CROP=" + CROP + "  RING=" + RING);
        master = crop();

        java.util.List<byte[]> frames = new ArrayList<>();
        for (int s : ICO_SIZES) frames.add(png(shaped(s, "square")));
        byte[] ico = ico(frames);
        write(root.resolve("open-reader/assets/app.ico"), ico);
        write(root.resolve("open-reader/dist/开放书库/resources/app/assets/app.ico"), ico);

        Path res = root.resolve("安卓/app/src/main/res");
        for (String[] d : DENS) {
            int s = Integer.parseInt(d[1]);
            Path dir = res.resolve(d[0]);
            write(dir.resolve("ic_launcher.png"), png(shaped(s, "squircle")));
            write(dir.resolve("ic_launcher_round.png"), png(shaped(s, "round")));
        }
        System.out.println("done: 2 ico + 10 png");
    }
}
