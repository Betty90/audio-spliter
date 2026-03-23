#!/usr/bin/env python3
"""
Generate simple placeholder icon files for AudioSlicer AI.
Creates: icon.png (512x512), icon.ico (Windows), icon.icns (macOS)
"""

from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

def create_gradient_background(size, colors):
    """Create a gradient background."""
    img = Image.new('RGB', size, colors[0])
    draw = ImageDraw.Draw(img)

    for y in range(size[1]):
        ratio = y / size[1]
        r = int(colors[0][0] * (1 - ratio) + colors[1][0] * ratio)
        g = int(colors[0][1] * (1 - ratio) + colors[1][1] * ratio)
        b = int(colors[0][2] * (1 - ratio) + colors[1][2] * ratio)
        draw.line([(0, y), (size[0], y)], fill=(r, g, b))

    return img

def draw_audio_wave(draw, center_x, center_y, width, height):
    """Draw an audio waveform visualization."""
    bars = 7
    bar_width = width // (bars * 2)
    heights = [0.3, 0.5, 0.8, 1.0, 0.8, 0.5, 0.3]

    for i, h in enumerate(heights):
        bar_h = int(height * h)
        x = center_x - width // 2 + i * bar_width * 2
        y1 = center_y - bar_h // 2
        y2 = center_y + bar_h // 2
        draw.rectangle([x, y1, x + bar_width - 2, y2], fill=(255, 255, 255, 230))

def create_icon(size):
    """Create the AudioSlicer AI icon."""
    colors = [(99, 102, 241), (168, 85, 247)]
    img = create_gradient_background((size, size), colors)

    mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    corner_radius = size // 8
    mask_draw.rounded_rectangle([0, 0, size, size], radius=corner_radius, fill=255)

    final = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    final.paste(img, (0, 0))
    final.putalpha(mask)

    draw = ImageDraw.Draw(final)
    draw_audio_wave(draw, size // 2, size // 2 - size // 20, size // 2, size // 3)

    try:
        font_size = size // 5
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
    except:
        font = ImageFont.load_default()

    text = "AS"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]

    text_x = (size - text_width) // 2
    text_y = size - size // 4 - text_height // 2

    draw.text((text_x, text_y), text, font=font, fill=(255, 255, 255, 230))

    return final

def create_ico(png_path, ico_path):
    """Create Windows ICO file with multiple sizes."""
    img = Image.open(png_path)
    sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    icons = []

    for size in sizes:
        icon = img.resize(size, Image.Resampling.LANCZOS)
        icons.append(icon)

    icons[0].save(ico_path, format='ICO', sizes=sizes)
    return True

def create_icns(png_path, icns_path):
    """Create macOS ICNS file."""
    import tempfile
    import subprocess

    img = Image.open(png_path)

    with tempfile.TemporaryDirectory() as tmpdir:
        iconset = Path(tmpdir) / "icon.iconset"
        iconset.mkdir()

        sizes = [16, 32, 64, 128, 256, 512, 1024]
        for size in sizes:
            icon = img.resize((size, size), Image.Resampling.LANCZOS)
            icon.save(iconset / f"icon_{size}x{size}.png")
            if size <= 512:
                icon2x = img.resize((size * 2, size * 2), Image.Resampling.LANCZOS)
                icon2x.save(iconset / f"icon_{size}x{size}@2x.png")

        try:
            subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(icns_path)], check=True)
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            img.save(icns_path)
            return True

def main():
    icons_dir = Path(__file__).parent
    print("Generating AudioSlicer AI icon files...")

    size = 512
    icon = create_icon(size)

    png_path = icons_dir / "icon.png"
    icon.save(png_path, 'PNG')
    print(f"  Created {png_path} ({size}x{size})")

    ico_path = icons_dir / "icon.ico"
    create_ico(png_path, ico_path)
    print(f"  Created {ico_path}")

    icns_path = icons_dir / "icon.icns"
    create_icns(png_path, icns_path)
    print(f"  Created {icns_path}")

    print("\nDone! Icons generated successfully.")

if __name__ == "__main__":
    main()
