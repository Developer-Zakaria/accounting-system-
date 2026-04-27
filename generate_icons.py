"""Generate simple PNG icons for the PWA without external dependencies."""
import zlib, struct, os

def make_png(width, height, pixels_rgba):
    def chunk(name, data):
        c = zlib.crc32(name + data) & 0xffffffff
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', c)

    sig   = b'\x89PNG\r\n\x1a\n'
    ihdr  = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
    # Build raw image data (RGB)
    raw = b''
    for row in pixels_rgba:
        raw += b'\x00'  # filter type none
        for r, g, b in row:
            raw += bytes([r, g, b])
    idat = chunk(b'IDAT', zlib.compress(raw, 9))
    iend = chunk(b'IEND', b'')
    return sig + ihdr + idat + iend

def make_icon(size):
    pixels = []
    cx = cy = size // 2
    r = size // 2

    for y in range(size):
        row = []
        for x in range(size):
            dx = x - cx
            dy = y - cy
            dist = (dx*dx + dy*dy) ** 0.5

            if dist > r:
                row.append((240, 244, 248))  # background
            elif dist > r - size*0.06:
                row.append((255, 255, 255))  # border
            else:
                # Gradient blue bg
                t = (y / size)
                br = int(13  + (21 - 13)  * (1-t))
                bg = int(50  + (101 - 50) * (1-t))
                bb = int(113 + (192 - 113) * (1-t))

                # Draw "ج س" text area roughly
                text_zone = (cx - size*0.35 < x < cx + size*0.35 and
                             cy - size*0.1  < y < cy + size*0.15)
                store_zone = (cx - size*0.3 < x < cx + size*0.3 and
                              cy - size*0.35 < y < cy + size*0.05)

                if store_zone:
                    # Simple store icon representation
                    inner_x = (x - (cx - size*0.3)) / (size*0.6)
                    inner_y = (y - (cy - size*0.35)) / (size*0.4)
                    if 0.1 < inner_x < 0.9 and 0.2 < inner_y < 0.9:
                        row.append((255, 255, 255))
                    else:
                        row.append((br, bg, bb))
                else:
                    row.append((br, bg, bb))
        pixels.append(row)
    return make_png(size, size, pixels)

os.makedirs('icons', exist_ok=True)

for size in [192, 512]:
    data = make_icon(size)
    path = f'icons/icon-{size}.png'
    with open(path, 'wb') as f:
        f.write(data)
    print(f'Created {path} ({len(data)} bytes)')

print('Done!')
