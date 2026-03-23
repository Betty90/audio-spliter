#!/usr/bin/env python3
from PIL import Image, ImageDraw
import os

os.chdir("/Users/fanwendi/work/vibe_coding/audio-spliter/assets/icons")

# 创建 512x512 的基础图标
size = 512
img = Image.new("RGBA", (size, size), (99, 102, 241, 255))
draw = ImageDraw.Draw(img)

# 绘制简单的音频波形
bars = 7
bar_width = size // (bars * 2)
heights = [0.3, 0.5, 0.8, 1.0, 0.8, 0.5, 0.3]
center_y = size // 2

for i, h in enumerate(heights):
    bar_h = int(size // 3 * h)
    x = size // 2 - (bars * bar_width) + i * bar_width * 2 + bar_width // 2
    y1 = center_y - bar_h // 2
    y2 = center_y + bar_h // 2
    draw.rounded_rectangle(
        [x, y1, x + bar_width - 4, y2], radius=8, fill=(255, 255, 255, 230)
    )

# 保存 PNG
img.save("icon.png", "PNG")
print("✓ Created icon.png (512x512)")

# 创建包含多个尺寸的 ICO（必须包含 256x256）
sizes = [16, 32, 48, 64, 128, 256]
icons = []
for s in sizes:
    icon = img.resize((s, s), Image.Resampling.LANCZOS)
    icons.append(icon)

# 保存 ICO，包含 256x256
icons[-1].save("icon.ico", format="ICO", sizes=[(s, s) for s in sizes])
print("✓ Created icon.ico with sizes:", sizes)

print("Done!")
