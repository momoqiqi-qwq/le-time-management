from pathlib import Path
import xml.etree.ElementTree as ET
from io import BytesIO
from PIL import Image
import cairosvg
import shutil
import json

root = Path(__file__).resolve().parent.parent          # miniprogram/
package_root = root.parent                            # 仓库根（le-time-management/ 与 miniprogram/ 同级）
desktop = package_root / 'le-time-management'
sprite = desktop / 'public/icons/fontawesome/solid.svg'
out = root / 'images/tab'
out.mkdir(parents=True, exist_ok=True)
plugin_out = root / 'images/plugins'
plugin_out.mkdir(parents=True, exist_ok=True)

# tab 图标：仍由 Font Awesome 单色 sprite 渲染（tabBar 需要「灰色常态 + 深青选中」成对出现）。
icons = {
    'quadrant': 'table-cells-large',
    'timeblock': 'clock',
    'capture': 'inbox',
    'settings': 'gear',
}
colors = {'': '#8A979E', '-on': '#0F4C5C'}

# 插件图标：**彩色**素材的唯一来源是 public/icons/plugins/（由 tools/gen-plugin-icons.py 生成），
# 本脚本只把同一份素材复制到小程序目录，不再用 FA 单色渲染覆盖它。
plugin_pngs = desktop / 'public/icons/plugins'
plugin_icons = {}
plugins_dir = desktop / 'public/plugins'
for manifest in sorted(plugins_dir.glob('*/manifest.json')):
    data = json.loads(manifest.read_text(encoding='utf-8'))
    plugin_icons[data['id']] = data.get('faIcon') or data.get('icon') or 'puzzle-piece'

ns = {'svg': 'http://www.w3.org/2000/svg'}
tree = ET.parse(sprite)
root_svg = tree.getroot()


def render(symbol_id, color, size=58):
    symbol = root_svg.find(f"svg:symbol[@id='{symbol_id}']", ns)
    if symbol is None:
        raise RuntimeError(f'Font Awesome symbol not found: {symbol_id}')
    viewbox = symbol.attrib.get('viewBox', '0 0 512 512')
    body = ''.join(ET.tostring(child, encoding='unicode') for child in list(symbol))
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" fill="{color}">{body}</svg>'''
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=size, output_height=size)
    icon = Image.open(BytesIO(png)).convert('RGBA')
    canvas = Image.new('RGBA', (81, 81), (0, 0, 0, 0))
    canvas.alpha_composite(icon, ((81 - size) // 2, (81 - size) // 2))
    return canvas


for name, symbol_id in icons.items():
    for suffix, color in colors.items():
        render(symbol_id, color).save(out / f'{name}{suffix}.png')

copied, rendered = 0, []
for plugin_id, symbol_id in plugin_icons.items():
    source = plugin_pngs / f'{plugin_id}.png'
    if source.exists():
        shutil.copyfile(source, plugin_out / f'{plugin_id}.png')
        copied += 1
    else:
        # 兜底：没有彩色素材（例如新加插件还没补图标映射）时退回 FA 单色渲染。
        render(symbol_id, '#0F4C5C', 50).save(plugin_out / f'{plugin_id}.png')
        rendered.append(plugin_id)

print(f'Generated {len(icons) * len(colors)} tab icons from bundled Font Awesome Free SVG sprite.')
print(f'Copied {copied} colored plugin icons from public/icons/plugins/.')
if rendered:
    print(f'Fallback FA-rendered (missing colored PNG): {", ".join(rendered)} — 请在 tools/gen-plugin-icons.py 的 ICONS 里补映射。')
