# Games of Bharat

Three browser games set in ancient India, written in plain JavaScript with
[three.js](https://threejs.org) for the 3D games. Everything needed is in
this repository: they run fully offline, with no install and no server.

| Game | Folder | What it is |
|---|---|---|
| **Age of Bharat** | `rts/` | 3D real-time strategy for up to 20 kingdoms: living villages, families, elections, diplomacy, conquest |
| **Legends of Bharat** | `rpg/` | 3D open-world RPG on a seeded, generated India |
| **Empire Builder** | `index.html` (root) | The first, simple 2D empire builder |

## Play on your computer

1. Get the code — either
   - `git clone https://github.com/pramodppdev/project1.git` then `git checkout claude/hello-w8j4c6`, or
   - on GitHub switch to the `claude/hello-w8j4c6` branch, then **Code → Download ZIP** and unzip it.
2. Double-click one of these:
   - `dist/age-of-bharat.html` — the strategy game in a single file
   - `dist/legends-of-bharat.html` — the RPG in a single file
   - or `rts/index.html` / `rpg/index.html` to run straight from the source files

Use a recent Chrome, Edge, Firefox or Safari. The single files in `dist/` can be
copied anywhere on their own (a USB stick, a phone) and still work.

With an internet connection the games use the Hind and Rozha One fonts from
Google Fonts; offline they fall back to the computer's own fonts.

### Optional: run a local web server

Opening the files directly works, but if your browser restricts local files:

```sh
python3 -m http.server 8000
```

then open <http://localhost:8000/rts/> or <http://localhost:8000/rpg/>.

## Change the games

Edit the files in `rts/` or `rpg/` and reload the page — there is no build
step. After changing them, rebuild the single-file copies with:

```sh
python3 tools/build.py
```

### Layout

```
rts/            Age of Bharat
  index.html    page and screens
  style.css
  js/data.js    units, buildings, research, dynasties, names
  js/map.js     map setup, territory, pathfinding, fog of war
  js/sim.js     core rules: gathering, building, combat, ages, victory
  js/life.js    people: families, ageing, skills, mood, festivals
  js/realm.js   diplomacy, settlements, defence, elections, schooling
  js/ai.js      computer kingdoms
  js/terrain.js, js/render.js   3D landscape and models
  js/ui.js, js/main.js          controls, panels, game loop
rpg/            Legends of Bharat (rpg/js/worldgen.js is shared by both 3D games)
vendor/three.min.js   three.js r149 (MIT licence)
tools/build.py  makes the offline single files in dist/
dist/           ready-to-play single-file games
```
