"""Build single-file, fully offline copies of the games into dist/.

Each output is one HTML file with the CSS, the game scripts and three.js
inlined, so it opens by double-clicking with no internet and no server.

    python3 tools/build.py
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
GAMES = {
    'age-of-bharat.html': ROOT / 'rts',
    'legends-of-bharat.html': ROOT / 'rpg',
}


def build(game_dir: pathlib.Path) -> str:
    html = (game_dir / 'index.html').read_text(encoding='utf-8')

    def inline_css(m):
        return '<style>\n' + (game_dir / m.group(1)).read_text(encoding='utf-8') + '\n</style>'

    def inline_js(m):
        src = (game_dir / m.group(1)).resolve()
        code = src.read_text(encoding='utf-8').replace('</script', '<\\/script')
        return '<script>\n' + code + '\n</script>'

    html = re.sub(r'<link rel="stylesheet" href="(?!https?:)([^"]+)">', inline_css, html)
    html = re.sub(r'<script src="(?!https?:)([^"]+)"></script>', inline_js, html)
    return html


def main():
    out = ROOT / 'dist'
    out.mkdir(exist_ok=True)
    for name, game_dir in GAMES.items():
        text = build(game_dir)
        (out / name).write_text(text, encoding='utf-8')
        print(f'{name}: {len(text) // 1024} KB')


if __name__ == '__main__':
    main()
