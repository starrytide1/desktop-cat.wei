#!/usr/bin/env python3
"""Generate simple cat-face PNG icons + ICO using pure Python (no PIL)."""
import zlib, struct, math, os

OUT = os.path.dirname(os.path.abspath(__file__))

def make_px(size):
    """Return list of RGBA rows for a cat face on transparent bg."""
    cx = cy = size/2
    def R(v): return v*size/256.0
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            r,g,b,a = 0,0,0,0
            # ears (triangles)
            for s in (-1,1):
                ex = cx + s*R(78)
                # triangle points
                ax,ay = ex-s*R(46), cy-R(48)
                bx,by = ex+s*R(46), cy-R(48)
                tx,ty = ex, cy-R(128)
                # barycentric test
                d1=(bx-ax)*(y-ay)-(by-ay)*(x-ax)
                d2=(tx-bx)*(y-by)-(ty-by)*(x-bx)
                d3=(ax-tx)*(y-ty)-(ay-ty)*(x-tx)
                if (d1>=0 and d2>=0 and d3>=0) or (d1<=0 and d2<=0 and d3<=0):
                    r,g,b,a = 0xF4,0xA3,0x4C,255
                    # inner ear
                    ix,iy = ex, cy-R(60)
                    if abs(x-ix)<R(20) and cy-R(112)<y<cy-R(52):
                        r,g,b = 0xF3,0xA0,0xA4
            # head circle
            hr = R(96)
            if (x-cx)**2 + (y-cy)**2 <= hr**2:
                r,g,b,a = 0xF4,0xA3,0x4C,255
            # eyes
            for s in (-1,1):
                ex,ey = cx+s*R(38), cy-R(8)
                if (x-ex)**2 + (y-ey)**2 <= R(13)**2:
                    r,g,b = 0x4E,0x8E,0x5B
                if (x-(ex-R(4)))**2 + (y-(ey-R(4)))**2 <= R(4)**2:
                    r,g,b = 255,255,255
            # nose
            nx,ny = cx, cy+R(28)
            if abs(x-nx)<R(9) and ny-R(5)<y<ny+R(7):
                r,g,b = 0xE8,0x8B,0x92
            row += bytes((r,g,b,a))
        rows.append(bytes(row))
    return rows

def png_chunk(tag, data):
    c = struct.pack(">I", len(data)) + tag + data
    c += struct.pack(">I", zlib.crc32(tag+data) & 0xffffffff)
    return c

def write_png(path, size):
    rows = make_px(size)
    raw = b"".join(b"\x00"+r for r in rows)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    out = b"\x89PNG\r\n\x1a\n"
    out += png_chunk(b"IHDR", ihdr)
    out += png_chunk(b"IDAT", zlib.compress(raw, 9))
    out += png_chunk(b"IEND", b"")
    with open(path,"wb") as f: f.write(out)
    return out

def write_ico(path, png_sizes):
    """Build an ICO wrapping PNG images."""
    images = []
    for s in png_sizes:
        p = os.path.join(OUT, f"_tmp_{s}.png")
        data = write_png(p, s)
        images.append((s, data))
        os.remove(p)
    header = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16*len(images)
    entries = b""
    blobs = b""
    for s, data in images:
        w = 0 if s>=256 else s
        h = 0 if s>=256 else s
        entries += struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(data), offset)
        blobs += data
        offset += len(data)
    with open(path,"wb") as f:
        f.write(header + entries + blobs)

if __name__ == "__main__":
    write_png(os.path.join(OUT,"32x32.png"), 32)
    write_png(os.path.join(OUT,"128x128.png"), 128)
    write_png(os.path.join(OUT,"128x128@2x.png"), 256)
    write_ico(os.path.join(OUT,"icon.ico"), [16,32,48,64,128,256])
    print("icons generated")
