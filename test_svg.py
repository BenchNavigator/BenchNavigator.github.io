import re

with open('mascot_pixel_transparent.svg', 'r') as f:
    content = f.read()

rects = re.findall(r'<rect x="(\d+)" y="(\d+)"', content)
grid = [['  ' for _ in range(20)] for _ in range(20)]

for x_str, y_str in rects:
    x = int(x_str) // 40
    y = int(y_str) // 40
    grid[y][x] = '##'

for row in grid:
    print(''.join(row))
