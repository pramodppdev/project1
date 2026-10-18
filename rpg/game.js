'use strict';

// ---------- World constants ----------

const MAP_W = 48;
const MAP_H = 32;
const SAVE_KEY = 'legends-of-bharat-v1';
const START = { x: 8, y: 24 };
const STEP_MS = 150;
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

const REGIONS = {
    village: { name: 'Rampur Village', safe: true },
    plains: { name: 'The Gangetic Plains', spawn: ['boar', 'boar', 'jackal'], count: 5 },
    forest: { name: 'Dandak Forest', spawn: ['dacoit', 'dacoit', 'cobra', 'cobra', 'tiger'], count: 8 },
    river: { name: 'River Ganga', safe: true },
    fort: { name: "Rani Devika's Fort", safe: true },
    desert: { name: 'The Thar Desert', spawn: ['scorpion', 'scorpion', 'raider'], count: 8 },
    mountain: { name: 'The Himalayan Pass', spawn: ['leopard', 'leopard', 'scout'], count: 7 },
};

const ENEMIES = {
    boar: { name: 'Wild Boar', icon: '🐗', hp: 22, atk: 7, def: 1, xp: 8, gold: 4 },
    jackal: { name: 'Rabid Jackal', icon: '🐺', hp: 18, atk: 8, def: 1, xp: 7, gold: 3 },
    dacoit: { name: 'Dacoit', icon: '🥷🏽', hp: 34, atk: 11, def: 3, xp: 16, gold: 12 },
    cobra: { name: 'King Cobra', icon: '🐍', hp: 26, atk: 12, def: 2, xp: 14, gold: 5 },
    tiger: { name: 'Bengal Tiger', icon: '🐅', hp: 55, atk: 14, def: 4, xp: 30, gold: 6 },
    scorpion: { name: 'Giant Scorpion', icon: '🦂', hp: 60, atk: 19, def: 7, xp: 38, gold: 14 },
    raider: { name: 'Desert Raider', icon: '🏇🏽', hp: 75, atk: 21, def: 7, xp: 48, gold: 30 },
    leopard: { name: 'Snow Leopard', icon: '🐆', hp: 95, atk: 27, def: 10, xp: 70, gold: 12 },
    scout: { name: 'Rakshasa Scout', icon: '👺', hp: 120, atk: 29, def: 11, xp: 90, gold: 35 },
    sardar: { name: 'Sardar Dhurandhar Singh', icon: '🧔🏽', hp: 140, atk: 17, def: 6, xp: 120, gold: 100, boss: 'sardarDefeated' },
    queen: { name: 'The Scorpion Queen', icon: '🦂', hp: 260, atk: 26, def: 10, xp: 300, gold: 200, boss: 'queenDefeated' },
    kaal: { name: 'Rakshasa Kaal', icon: '👹', hp: 360, atk: 34, def: 14, xp: 0, gold: 0, boss: 'kaalDefeated' },
};

const ITEMS = {
    ladoo: { name: 'Besan Ladoo', icon: '🟠', desc: 'Restores 35 health', price: 8, hp: 35 },
    kheer: { name: 'Bowl of Kheer', icon: '🥣', desc: 'Restores 100 health', price: 25, hp: 100 },
    tulsi: { name: 'Tulsi Tonic', icon: '🍵', desc: 'Restores 15 prana', price: 12, prana: 15 },
};

const GEAR = {
    lathi: { name: 'Bamboo Lathi', icon: '🦯', slot: 'weapon', atk: 0 },
    talwar: { name: 'Steel Talwar', icon: '🗡️', slot: 'weapon', atk: 5, price: 60 },
    khanda: { name: 'Khanda Sword', icon: '⚔️', slot: 'weapon', atk: 10, price: 180 },
    kurta: { name: 'Cotton Kurta', icon: '👕', slot: 'armor', def: 0 },
    vest: { name: 'Leather Vest', icon: '🦺', slot: 'armor', def: 3, price: 50 },
    chainmail: { name: 'Chainmail', icon: '🛡️', slot: 'armor', def: 7, price: 170 },
};

const SHOPS = {
    village: { title: "Seth Govind's Stall", stock: ['ladoo', 'tulsi', 'talwar', 'vest'] },
    fort: { title: "Farida's Caravan", stock: ['ladoo', 'kheer', 'tulsi', 'khanda', 'chainmail'] },
};

const SKILLS = {
    vajra: { name: 'Vajra Strike', cost: 5, desc: 'A thunderous blow, 1.8x damage' },
    pranayama: { name: 'Pranayama', cost: 6, desc: 'Breathe deep and heal 40% health' },
};

const NPCS = [
    { id: 'elder', x: 9, y: 22, icon: '👴🏽', name: 'Mukhiya Ramdas' },
    { id: 'vaidya', x: 4, y: 25, icon: '👵🏽', name: 'Vaidya Kamala' },
    { id: 'merchant', x: 12, y: 25, icon: '👳🏽', name: 'Seth Govind' },
    { id: 'child', x: 5, y: 20, icon: '🧒🏽', name: 'Little Chotu' },
    { id: 'guru', x: 12, y: 10, icon: '🧘🏽', name: 'Guru Anand' },
    { id: 'rani', x: 33, y: 26, icon: '👸🏽', name: 'Rani Devika' },
    { id: 'trader', x: 31, y: 24, icon: '🧕🏽', name: 'Farida the Trader' },
];

const BOSSES = [
    { kind: 'sardar', x: 8, y: 4 },
    { kind: 'queen', x: 43, y: 27 },
    { kind: 'kaal', x: 41, y: 4 },
];

const PAL = {
    grass: '#7aa04a', grass2: '#6f9643',
    forest: '#3f6b33', forest2: '#375f2c',
    sand: '#e2c27d', sand2: '#d8b46c',
    snow: '#e6ecf0', snow2: '#d6dee5',
    path: '#c9a46a', path2: '#bf9a60',
    water: '#2f7fb5', wave: '#6cb4e0',
    plank: '#8a5a2b', plank2: '#6e4520',
    trunk: '#6b4423', leaf: '#2c5a26', leaf2: '#3d7a32',
    cactus: '#4f8f3a', rock: '#8a8784', rock2: '#6d6a67',
    mud: '#c58b56', thatch: '#8a5a2b', door: '#4a2c14',
    stone: '#c99a5b', stone2: '#a87b42',
    temple: '#e07b2a', flag: '#f2c230',
    tent: '#9c2f2f', fire: '#ffb02e',
};

// ---------- Game state ----------

let ground = [];
let objects = [];
let entities = [];
let player;
let flags;
let ui = { dialog: null, battle: null, shop: null, menu: false, ending: false };
let lastRegion = null;
let toastTimer = null;
let moveReadyAt = 0;
let lastHint = 0;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const $ = id => document.getElementById(id);

function mulberry32(seed) {
    return function () {
        seed |= 0;
        seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function newPlayer() {
    return {
        x: START.x, y: START.y, rx: START.x, ry: START.y,
        lvl: 1, xp: 0, hp: 40, prana: 12, gold: 20,
        weapon: 'lathi', armor: 'kurta', owned: ['lathi', 'kurta'],
        items: { ladoo: 3 }, skills: ['vajra'], steps: 0,
    };
}

function stats() {
    const l = player.lvl - 1;
    return {
        maxHp: 40 + 10 * l,
        maxPrana: 12 + 3 * l,
        atk: 8 + 2 * l + GEAR[player.weapon].atk,
        def: 3 + l + GEAR[player.armor].def,
    };
}

function xpToNext(lvl) {
    return 12 * lvl + 6 * lvl * lvl;
}

// ---------- Map ----------

const idx = (x, y) => y * MAP_W + x;
const inMap = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

function regionAt(x, y) {
    if (x >= 2 && x <= 14 && y >= 17 && y <= 29) return 'village';
    if (x === 16 || x === 17) return 'river';
    if (x >= 29 && x <= 37 && y >= 22 && y <= 28) return 'fort';
    if (x < 16) return y < 14 ? 'forest' : 'plains';
    return y <= 13 ? 'mountain' : 'desert';
}

function buildWorld() {
    const rng = mulberry32(108);
    ground = new Array(MAP_W * MAP_H);
    objects = new Array(MAP_W * MAP_H).fill('');

    for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
            let g;
            let o = '';
            if (x < 16) {
                if (y < 14) { g = 'f'; if (rng() < 0.32) o = 'T'; } else { g = '.'; if (rng() < 0.06) o = 'T'; }
            } else if (x <= 17) {
                g = '~';
            } else if (y < 13) {
                g = 'n'; if (rng() < 0.22) o = 'M';
            } else if (y === 13) {
                g = 'n'; o = 'M';
            } else {
                g = 's'; if (rng() < 0.05) o = 'c';
            }
            const edge = x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1;
            if (edge && g !== '~') o = x < 16 ? 'T' : y <= 13 ? 'M' : 'c';
            ground[idx(x, y)] = g;
            objects[idx(x, y)] = o;
        }
    }

    const clear = (x1, y1, x2, y2, g) => {
        for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) {
            objects[idx(x, y)] = '';
            if (g) ground[idx(x, y)] = g;
        }
    };
    const put = (x, y, o) => { objects[idx(x, y)] = o; };
    const carve = (x1, y1, x2, y2) => {
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) { ground[idx(x, y1)] = 'p'; objects[idx(x, y1)] = ''; }
        for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) { ground[idx(x2, y)] = 'p'; objects[idx(x2, y)] = ''; }
    };

    // Rampur village
    clear(2, 17, 14, 29, '.');
    carve(3, 23, 14, 23);
    carve(8, 18, 8, 28);
    for (const [hx, hy] of [[3, 18], [5, 18], [11, 18], [3, 27], [6, 27], [10, 27], [13, 27], [3, 21]]) put(hx, hy, 'H');
    put(10, 20, 'K');
    put(6, 25, 'w');

    // Forest: dacoit camp and the guru's ashram
    carve(8, 17, 8, 6);
    clear(4, 2, 12, 6, 'f');
    put(5, 3, 'A'); put(11, 3, 'A'); put(6, 5, 'A'); put(8, 2, 'F');
    carve(8, 10, 12, 10);
    clear(11, 8, 14, 11, 'f');
    put(13, 8, 'H');

    // Bridge over the Ganga (broken at the start)
    carve(8, 21, 15, 21);
    ground[idx(16, 21)] = '~'; ground[idx(17, 21)] = '~';
    put(16, 21, 'B'); put(17, 21, 'B');

    // Desert road, fort and ruins
    carve(18, 21, 43, 21);
    for (let x = 29; x <= 37; x++) { put(x, 22, 'W'); put(x, 28, 'W'); }
    for (let y = 22; y <= 28; y++) { put(29, y, 'W'); put(37, y, 'W'); }
    clear(30, 23, 36, 27, 'p');
    clear(33, 22, 33, 22, 'p');
    carve(43, 21, 43, 26);
    clear(39, 24, 46, 30, 's');
    for (const [wx, wy] of [[39, 24], [40, 24], [45, 24], [46, 25], [39, 29], [40, 30], [46, 29], [45, 30]]) put(wx, wy, 'W');

    // Mountain pass (boulders until the Rani clears it) and Kaal's cave
    carve(33, 21, 33, 14);
    clear(32, 13, 33, 13, 'p');
    put(32, 13, 'R'); put(33, 13, 'R');
    carve(33, 12, 33, 4);
    carve(33, 4, 40, 4);
    clear(36, 2, 44, 6, 'n');
    carve(33, 4, 41, 4);
    for (const [mx, my] of [[42, 2], [43, 2], [43, 3], [43, 5], [42, 6], [43, 6], [44, 4]]) put(mx, my, 'M');
    put(42, 4, 'C');
    put(42, 3, 'M'); put(42, 5, 'M');
}

function applyFlagsToMap() {
    if (flags.bridgeFixed) {
        for (const x of [16, 17]) { ground[idx(x, 21)] = '='; objects[idx(x, 21)] = ''; }
    }
    if (flags.passOpen) {
        for (const x of [32, 33]) objects[idx(x, 13)] = '';
    }
}

function walkable(x, y) {
    return inMap(x, y) && ground[idx(x, y)] !== '~' && !objects[idx(x, y)];
}

function entityAt(x, y) {
    return entities.find(e => e.x === x && e.y === y);
}

function occupied(x, y) {
    return (player.x === x && player.y === y) || !!entityAt(x, y);
}

function spawnStatic() {
    entities = entities.filter(e => e.kind && !ENEMIES[e.kind].boss);
    for (const n of NPCS) entities.push({ npc: n.id, x: n.x, y: n.y, rx: n.x, ry: n.y, icon: n.icon, name: n.name });
    for (const b of BOSSES) {
        if (!flags[ENEMIES[b.kind].boss]) entities.push({ kind: b.kind, boss: true, x: b.x, y: b.y, rx: b.x, ry: b.y });
    }
}

function spawnEnemy(region, farFromPlayer = true) {
    const r = REGIONS[region];
    for (let tries = 0; tries < 40; tries++) {
        const x = Math.floor(Math.random() * MAP_W);
        const y = Math.floor(Math.random() * MAP_H);
        if (regionAt(x, y) !== region || !walkable(x, y) || occupied(x, y)) continue;
        if (farFromPlayer && Math.abs(x - player.x) + Math.abs(y - player.y) < 8) continue;
        entities.push({ kind: pick(r.spawn), region, x, y, rx: x, ry: y, nextMove: performance.now() + rand(400, 1400), stunUntil: 0 });
        return;
    }
}

function populate(initial) {
    for (const [key, r] of Object.entries(REGIONS)) {
        if (!r.spawn) continue;
        const count = entities.filter(e => e.region === key).length;
        if (initial) { for (let i = count; i < r.count; i++) spawnEnemy(key); }
        else if (count < r.count && Math.random() < 0.3) spawnEnemy(key);
    }
}

// ---------- Input and movement ----------

const held = new Set();
const KEYS = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function uiOpen() {
    return !!(ui.dialog || ui.battle || ui.shop || ui.menu || ui.ending);
}

function tryMove(dir, now) {
    const [dx, dy] = DIRS[dir];
    const nx = player.x + dx;
    const ny = player.y + dy;
    moveReadyAt = now + STEP_MS;

    const ent = entityAt(nx, ny);
    if (ent) {
        moveReadyAt = now + 250;
        held.clear();
        if (ent.npc) talkTo(ent.npc);
        else encounter(ent);
        return;
    }
    if (!walkable(nx, ny)) {
        if (inMap(nx, ny) && now - lastHint > 2500) {
            const o = objects[idx(nx, ny)];
            if (o === 'B') { toast('The bridge is broken. Mukhiya Ramdas may know who can repair it.'); lastHint = now; }
            if (o === 'R') { toast('Fallen boulders block the mountain pass.'); lastHint = now; }
        }
        return;
    }
    player.x = nx;
    player.y = ny;
    player.steps++;
    if (player.steps % 8 === 0) player.prana = Math.min(stats().maxPrana, player.prana + 1);
    if (player.steps % 10 === 0) save();

    const region = regionAt(nx, ny);
    if (region !== lastRegion) {
        if (lastRegion !== null && region !== 'river') showBanner(REGIONS[region].name);
        lastRegion = region;
    }
}

function encounter(ent) {
    const def = ENEMIES[ent.kind];
    if (def.boss) {
        const intro = {
            sardar: ['So the farmer boy wants to play hero? My dacoits rule this forest. Draw your lathi!'],
            queen: ['The sand trembles. A monstrous scorpion rises from the ruins, its tail dripping venom.'],
            kaal: ['Mortal! I am Kaal, and these mountains are mine. Your journey ends in the snow.'],
        }[ent.kind];
        say(intro.map(text => ({ name: def.name, text })), () => startBattle(ent));
    } else {
        startBattle(ent);
    }
}

function moveEnemies(now) {
    for (const e of entities) {
        if (!e.region || now < e.nextMove) continue;
        e.nextMove = now + rand(550, 1200);
        if (now < e.stunUntil) continue;

        const dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
        let options;
        if (dist <= 5 && regionAt(player.x, player.y) === e.region && Math.random() < 0.7) {
            const sx = Math.sign(player.x - e.x);
            const sy = Math.sign(player.y - e.y);
            options = Math.abs(player.x - e.x) >= Math.abs(player.y - e.y) ? [[sx, 0], [0, sy]] : [[0, sy], [sx, 0]];
            options = options.filter(([dx, dy]) => dx || dy);
        } else if (Math.random() < 0.5) {
            options = [pick(Object.values(DIRS))];
        } else {
            continue;
        }

        for (const [dx, dy] of options) {
            const nx = e.x + dx;
            const ny = e.y + dy;
            if (nx === player.x && ny === player.y) {
                if (!uiOpen()) encounter(e);
                return;
            }
            if (walkable(nx, ny) && regionAt(nx, ny) === e.region && !entityAt(nx, ny)) {
                e.x = nx;
                e.y = ny;
                break;
            }
        }
    }
}

// ---------- Rendering the world ----------

const canvas = $('world');
const ctx = canvas.getContext('2d');
let viewW = 0;
let viewH = 0;
let ts = 40;

function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    viewW = rect.width;
    viewH = rect.height;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ts = viewW < 600 ? 34 : 44;
}

function hash(x, y) {
    return ((x * 73856093) ^ (y * 19349663)) >>> 0;
}

function drawGround(g, x, y, sx, sy, t) {
    const alt = hash(x, y) % 4 === 0;
    const fill = {
        '.': alt ? PAL.grass2 : PAL.grass,
        f: alt ? PAL.forest2 : PAL.forest,
        s: alt ? PAL.sand2 : PAL.sand,
        n: alt ? PAL.snow2 : PAL.snow,
        p: alt ? PAL.path2 : PAL.path,
        '~': PAL.water,
        '=': PAL.water,
    }[g];
    ctx.fillStyle = fill;
    ctx.fillRect(sx, sy, ts + 1, ts + 1);

    if (g === '~' || g === '=') {
        ctx.strokeStyle = PAL.wave;
        ctx.lineWidth = 1.5;
        const off = ((t / 900) + (y * 0.37)) % 1;
        ctx.beginPath();
        for (let i = 0; i < 2; i++) {
            const wy = sy + ts * (0.3 + i * 0.4);
            const wx = sx + ts * (off * 0.5 + i * 0.2);
            ctx.moveTo(wx, wy);
            ctx.quadraticCurveTo(wx + ts * 0.12, wy - 3, wx + ts * 0.25, wy);
        }
        ctx.stroke();
    }
    if (g === '=') {
        ctx.fillStyle = PAL.plank;
        ctx.fillRect(sx, sy + ts * 0.12, ts + 1, ts * 0.76);
        ctx.strokeStyle = PAL.plank2;
        ctx.lineWidth = 1;
        for (let i = 1; i < 5; i++) {
            ctx.beginPath();
            ctx.moveTo(sx + (ts * i) / 5, sy + ts * 0.12);
            ctx.lineTo(sx + (ts * i) / 5, sy + ts * 0.88);
            ctx.stroke();
        }
    }
}

function drawObject(o, x, y, sx, sy, t) {
    const c = ts / 2;
    switch (o) {
        case 'T':
            ctx.fillStyle = PAL.trunk;
            ctx.fillRect(sx + c - ts * 0.06, sy + ts * 0.55, ts * 0.12, ts * 0.35);
            ctx.fillStyle = PAL.leaf;
            circle(sx + c, sy + ts * 0.42, ts * 0.34);
            ctx.fillStyle = PAL.leaf2;
            circle(sx + c - ts * 0.08, sy + ts * 0.35, ts * 0.18);
            break;
        case 'c':
            ctx.fillStyle = PAL.cactus;
            roundRect(sx + c - ts * 0.08, sy + ts * 0.2, ts * 0.16, ts * 0.7, ts * 0.08);
            roundRect(sx + c - ts * 0.3, sy + ts * 0.4, ts * 0.12, ts * 0.25, ts * 0.06);
            roundRect(sx + c + ts * 0.18, sy + ts * 0.32, ts * 0.12, ts * 0.25, ts * 0.06);
            break;
        case 'M':
            ctx.fillStyle = PAL.rock2;
            tri(sx + ts * 0.05, sy + ts * 0.95, sx + c, sy + ts * 0.08, sx + ts * 0.95, sy + ts * 0.95);
            ctx.fillStyle = PAL.rock;
            tri(sx + ts * 0.2, sy + ts * 0.95, sx + c, sy + ts * 0.08, sx + ts * 0.62, sy + ts * 0.95);
            ctx.fillStyle = PAL.snow;
            tri(sx + c - ts * 0.13, sy + ts * 0.3, sx + c, sy + ts * 0.08, sx + c + ts * 0.13, sy + ts * 0.3);
            break;
        case 'H':
            ctx.fillStyle = PAL.mud;
            ctx.fillRect(sx + ts * 0.12, sy + ts * 0.42, ts * 0.76, ts * 0.5);
            ctx.fillStyle = PAL.thatch;
            tri(sx + ts * 0.02, sy + ts * 0.46, sx + c, sy + ts * 0.08, sx + ts * 0.98, sy + ts * 0.46);
            ctx.fillStyle = PAL.door;
            ctx.fillRect(sx + c - ts * 0.09, sy + ts * 0.62, ts * 0.18, ts * 0.3);
            break;
        case 'K':
            ctx.fillStyle = PAL.temple;
            ctx.fillRect(sx + ts * 0.18, sy + ts * 0.55, ts * 0.64, ts * 0.38);
            tri(sx + ts * 0.25, sy + ts * 0.58, sx + c, sy + ts * 0.1, sx + ts * 0.75, sy + ts * 0.58);
            ctx.fillStyle = PAL.flag;
            tri(sx + c, sy + ts * 0.02, sx + c + ts * 0.22, sy + ts * 0.08, sx + c, sy + ts * 0.14);
            ctx.fillStyle = PAL.door;
            ctx.fillRect(sx + c - ts * 0.08, sy + ts * 0.7, ts * 0.16, ts * 0.23);
            break;
        case 'w':
            ctx.fillStyle = PAL.rock;
            circle(sx + c, sy + c, ts * 0.36);
            ctx.fillStyle = PAL.water;
            circle(sx + c, sy + c, ts * 0.22);
            break;
        case 'W':
            ctx.fillStyle = PAL.stone;
            ctx.fillRect(sx, sy + ts * 0.1, ts + 1, ts * 0.85);
            ctx.strokeStyle = PAL.stone2;
            ctx.lineWidth = 1;
            for (let r = 0; r < 3; r++) {
                const ry = sy + ts * (0.1 + r * 0.28);
                ctx.strokeRect(sx + (r % 2 ? ts * 0.25 : 0), ry, ts * 0.5, ts * 0.28);
            }
            break;
        case 'R':
            ctx.fillStyle = PAL.rock2;
            circle(sx + ts * 0.35, sy + ts * 0.6, ts * 0.3);
            ctx.fillStyle = PAL.rock;
            circle(sx + ts * 0.65, sy + ts * 0.5, ts * 0.28);
            break;
        case 'C':
            ctx.fillStyle = PAL.rock2;
            ctx.fillRect(sx, sy, ts + 1, ts + 1);
            ctx.fillStyle = '#120c14';
            ctx.beginPath();
            ctx.ellipse(sx + c, sy + ts * 0.75, ts * 0.32, ts * 0.5, 0, Math.PI, 0);
            ctx.fill();
            break;
        case 'A':
            ctx.fillStyle = PAL.tent;
            tri(sx + ts * 0.08, sy + ts * 0.9, sx + c, sy + ts * 0.12, sx + ts * 0.92, sy + ts * 0.9);
            ctx.fillStyle = PAL.door;
            tri(sx + c - ts * 0.12, sy + ts * 0.9, sx + c, sy + ts * 0.5, sx + c + ts * 0.12, sy + ts * 0.9);
            break;
        case 'F': {
            ctx.fillStyle = PAL.trunk;
            ctx.fillRect(sx + ts * 0.2, sy + ts * 0.72, ts * 0.6, ts * 0.12);
            const flick = Math.sin(t / 120 + x) * ts * 0.05;
            ctx.fillStyle = PAL.fire;
            tri(sx + ts * 0.3, sy + ts * 0.74, sx + c + flick, sy + ts * 0.22, sx + ts * 0.7, sy + ts * 0.74);
            ctx.fillStyle = PAL.temple;
            tri(sx + ts * 0.38, sy + ts * 0.74, sx + c - flick, sy + ts * 0.42, sx + ts * 0.62, sy + ts * 0.74);
            break;
        }
        case 'B':
            ctx.fillStyle = PAL.plank;
            ctx.fillRect(sx, sy + ts * 0.12, ts * 0.3, ts * 0.76);
            ctx.save();
            ctx.translate(sx + ts * 0.7, sy + c);
            ctx.rotate(0.5);
            ctx.fillRect(-ts * 0.12, -ts * 0.3, ts * 0.24, ts * 0.6);
            ctx.restore();
            break;
        default:
            break;
    }
}

function circle(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
}

function tri(x1, y1, x2, y2, x3, y3) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.closePath();
    ctx.fill();
}

function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
}

function drawSprite(icon, sx, sy, ring, scale = 0.78) {
    const c = ts / 2;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(sx + c, sy + ts * 0.86, ts * 0.3, ts * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    if (ring) {
        ctx.strokeStyle = ring;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(sx + c, sy + ts * 0.86, ts * 0.36, ts * 0.13, 0, 0, Math.PI * 2);
        ctx.stroke();
    }
    // Colour emoji take their opacity from the fill style, so reset it to opaque.
    ctx.fillStyle = '#000';
    ctx.font = `${Math.round(ts * scale)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, sx + c, sy + ts * 0.48);
}

function hasNews(npcId) {
    switch (npcId) {
        case 'elder': return !flags.metElder || (flags.sardarDefeated && !flags.bridgeFixed);
        case 'guru': return !player.skills.includes('pranayama');
        case 'rani': return flags.bridgeFixed && (!flags.metRani || (flags.queenDefeated && !flags.passOpen));
        default: return false;
    }
}

function draw(t) {
    const camX = clampCam(player.rx * ts + ts / 2 - viewW / 2, MAP_W * ts - viewW);
    const camY = clampCam(player.ry * ts + ts / 2 - viewH / 2, MAP_H * ts - viewH);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, viewW, viewH);

    const x0 = Math.max(0, Math.floor(camX / ts));
    const y0 = Math.max(0, Math.floor(camY / ts));
    const x1 = Math.min(MAP_W - 1, Math.ceil((camX + viewW) / ts));
    const y1 = Math.min(MAP_H - 1, Math.ceil((camY + viewH) / ts));

    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            const sx = Math.floor(x * ts - camX);
            const sy = Math.floor(y * ts - camY);
            drawGround(ground[idx(x, y)], x, y, sx, sy, t);
        }
    }
    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            const o = objects[idx(x, y)];
            if (o) drawObject(o, x, y, Math.floor(x * ts - camX), Math.floor(y * ts - camY), t);
        }
    }

    const drawables = entities.filter(e => e.rx >= x0 - 1 && e.rx <= x1 + 1 && e.ry >= y0 - 1 && e.ry <= y1 + 1);
    drawables.push({ hero: true, rx: player.rx, ry: player.ry });
    drawables.sort((a, b) => a.ry - b.ry);
    for (const e of drawables) {
        const sx = e.rx * ts - camX;
        const sy = e.ry * ts - camY;
        if (e.hero) {
            drawSprite('🧑🏽', sx, sy, '#f29a2e');
        } else if (e.npc) {
            drawSprite(e.icon, sx, sy, null);
            if (hasNews(e.npc)) {
                const bob = Math.sin(t / 250) * 3;
                ctx.font = `bold ${Math.round(ts * 0.45)}px system-ui, sans-serif`;
                ctx.fillStyle = '#f2c230';
                ctx.strokeStyle = '#1a1322';
                ctx.lineWidth = 3;
                ctx.strokeText('!', sx + ts / 2, sy - ts * 0.08 + bob);
                ctx.fillText('!', sx + ts / 2, sy - ts * 0.08 + bob);
            }
        } else {
            const def = ENEMIES[e.kind];
            const pulse = e.boss ? `rgba(242, 154, 46, ${0.6 + 0.4 * Math.sin(t / 300)})` : 'rgba(217, 68, 43, 0.85)';
            drawSprite(def.icon, sx, sy, pulse, e.boss ? 0.95 : 0.74);
        }
    }
}

function clampCam(v, max) {
    return max <= 0 ? max / 2 : Math.max(0, Math.min(max, v));
}

function approach(e, speed, dt) {
    for (const [r, k] of [['rx', 'x'], ['ry', 'y']]) {
        const d = e[k] - e[r];
        const stepLen = speed * dt;
        e[r] = Math.abs(d) <= stepLen ? e[k] : e[r] + Math.sign(d) * stepLen;
    }
}

// ---------- Main loop ----------

let last = performance.now();
let hudClock = 0;
let spawnClock = 0;

function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (!uiOpen()) {
        if (now >= moveReadyAt && held.size) tryMove([...held].pop(), now);
        moveEnemies(now);
        spawnClock += dt;
        if (spawnClock > 1) { spawnClock = 0; populate(false); }
    }

    approach(player, 1000 / STEP_MS, dt);
    for (const e of entities) approach(e, 6, dt);

    hudClock += dt;
    if (hudClock > 0.25) { hudClock = 0; renderHud(); }

    draw(now);
    requestAnimationFrame(frame);
}

// ---------- HUD, toasts, banners ----------

function setMeter(barId, textId, value, max) {
    $(barId).style.width = `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
    $(textId).textContent = `${Math.max(0, value)} / ${max}`;
}

function objective() {
    if (!flags.metElder) return 'Talk to Mukhiya Ramdas near the village temple.';
    if (!flags.sardarDefeated) return 'Defeat Sardar Dhurandhar Singh at the dacoit camp, north through Dandak Forest.';
    if (!flags.bridgeFixed) return 'Return to Mukhiya Ramdas in Rampur.';
    if (!flags.metRani) return 'Cross the Ganga bridge and visit Rani Devika in the desert fort.';
    if (!flags.queenDefeated) return 'Destroy the Scorpion Queen in the ruins south-east of the fort.';
    if (!flags.passOpen) return 'Return to Rani Devika.';
    if (!flags.kaalDefeated) return 'Climb the mountain pass north of the fort and face Rakshasa Kaal.';
    return 'Peace has returned. Explore freely and hunt the strongest beasts.';
}

function renderHud() {
    const s = stats();
    $('hud-level').textContent = `Lv ${player.lvl}`;
    setMeter('hud-hp-bar', 'hud-hp', player.hp, s.maxHp);
    setMeter('hud-prana-bar', 'hud-prana', player.prana, s.maxPrana);
    $('hud-gold').textContent = player.gold;
    $('quest').innerHTML = `<b>Quest</b>${objective()}`;
}

function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
}

function showBanner(text) {
    const el = $('banner');
    el.hidden = true;
    void el.offsetWidth;
    el.textContent = text;
    el.hidden = false;
    clearTimeout(showBanner.timer);
    showBanner.timer = setTimeout(() => { el.hidden = true; }, 2600);
}

// ---------- Dialog ----------

function say(lines, onEnd) {
    ui.dialog = { lines, i: 0, onEnd };
    held.clear();
    renderDialog();
}

function renderDialog() {
    const el = $('dialog');
    if (!ui.dialog) { el.hidden = true; return; }
    const line = ui.dialog.lines[ui.dialog.i];
    $('dialog-name').textContent = line.name;
    $('dialog-text').textContent = line.text;
    $('dialog-next').textContent = ui.dialog.i === ui.dialog.lines.length - 1 ? 'Close ▸' : 'Continue ▸';
    el.hidden = false;
    $('dialog-next').focus({ preventScroll: true });
}

function advanceDialog() {
    if (!ui.dialog) return;
    ui.dialog.i++;
    if (ui.dialog.i >= ui.dialog.lines.length) {
        const cb = ui.dialog.onEnd;
        ui.dialog = null;
        renderDialog();
        if (cb) cb();
        save();
        renderHud();
    } else {
        renderDialog();
    }
}

function lines(name, ...texts) {
    return texts.map(text => ({ name, text }));
}

function talkTo(id) {
    const npc = NPCS.find(n => n.id === id);
    const n = npc.name;
    switch (id) {
        case 'elder':
            if (!flags.metElder) {
                flags.metElder = true;
                say(lines(n,
                    'Namaste, Veer. Dark days have come to Rampur.',
                    'Sardar Dhurandhar Singh and his dacoits raid us from their camp in Dandak Forest, straight north up the path.',
                    'They smashed the bridge over the Ganga so no help can reach us. Defeat the Sardar, and our carpenters will rebuild it.',
                    'Train on the boars in the fields first. Seth Govind sells supplies, and Vaidya Kamala will tend your wounds for free.'));
            } else if (!flags.sardarDefeated) {
                say(lines(n, 'The dacoit camp lies north through the forest. A guru lives in an ashram east of the path there. He may teach you something useful.'));
            } else if (!flags.bridgeFixed) {
                flags.bridgeFixed = true;
                player.gold += 50;
                addItem('kheer', 2);
                applyFlagsToMap();
                say(lines(n,
                    'Shabash, Veer! The whole village is singing your name.',
                    'Our carpenters have already rebuilt the Ganga bridge to the east. Take 50 gold and two bowls of kheer from my wife\'s kitchen.',
                    'Word has come from Rani Devika of the desert fort. Something terrible stirs in the Thar. Go east and help her.'),
                () => toast('Received 50 gold and 2 Bowls of Kheer'));
            } else if (!flags.kaalDefeated) {
                say(lines(n, 'Rani Devika\'s fort stands past the bridge, in the Thar Desert. May the road be kind to you.'));
            } else {
                say(lines(n, 'They will sing songs of Veer of Rampur for a hundred years.'));
            }
            break;
        case 'vaidya':
            say(lines(n, 'Sit, child. A little neem, a little turmeric, and plenty of rest.'), () => {
                const s = stats();
                player.hp = s.maxHp;
                player.prana = s.maxPrana;
                toast('Health and prana fully restored');
            });
            break;
        case 'merchant':
            say(lines(n, 'Ladoos fresh from the kadhai, and a fine talwar for a brave customer!'), () => openShop('village'));
            break;
        case 'child':
            say(lines(n, pick([
                'Bhaiya, enemies glow red on the ground. The big glowing ones are really strong!',
                'If a fight goes badly you can run away. But you can\'t run from a boss!',
                'Walking slowly refills your prana. Vajra Strike hits really hard.',
                'A yellow ! means someone has something important to tell you.',
            ])));
            break;
        case 'guru':
            if (!player.skills.includes('pranayama')) {
                say(lines(n,
                    'Peace, young warrior. You carry much anger in your shoulders.',
                    'Sit and breathe with me. In through the nose, hold, and out slowly. The breath is life itself.',
                    'You have learned Pranayama. In battle it will heal your wounds, if you have the prana for it.'),
                () => { player.skills.push('pranayama'); toast('Learned the skill Pranayama'); });
            } else {
                say(lines(n, 'Strength without patience is a river without banks. Breathe, then strike.'));
            }
            break;
        case 'rani':
            if (!flags.metRani) {
                flags.metRani = true;
                if (flags.queenDefeated) {
                    say(lines(n, 'You have already slain the Scorpion Queen? Then my desert owes you everything.'), () => talkTo('rani'));
                    return;
                }
                say(lines(n,
                    'So you are the hero of Rampur. Welcome to my fort.',
                    'A giant Scorpion Queen has nested in the old ruins to the south-east. Her brood poisons our wells and her venom kills our camels.',
                    'Destroy her, and I will send my soldiers to clear the boulders from the Himalayan pass. Something evil waits beyond it.',
                    'Farida\'s caravan sells the finest steel in the Thar. Arm yourself well.'));
            } else if (flags.queenDefeated && !flags.passOpen) {
                flags.passOpen = true;
                player.gold += 150;
                applyFlagsToMap();
                say(lines(n,
                    'The Scorpion Queen is dead! Tonight the whole fort will feast.',
                    'Take 150 gold from the royal treasury. My soldiers have cleared the pass north of the fort.',
                    'Beyond it lives Rakshasa Kaal, the demon who sent the scorpions and paid the dacoits. End this, Veer.'),
                () => toast('Received 150 gold. The mountain pass is open.'));
            } else if (!flags.queenDefeated) {
                say(lines(n, 'The ruins lie south-east, past the end of the desert road.'));
            } else if (!flags.kaalDefeated) {
                say(lines(n, 'The pass is open. Kaal\'s cave is at the far north-east of the mountains.'));
            } else {
                say(lines(n, 'You will always have a place at my table, Veer.'));
            }
            break;
        case 'trader':
            say(lines(n, 'Salaam, traveller! Steel from Damascus, kheer from Lucknow. Have a look.'), () => openShop('fort'));
            break;
        default:
            break;
    }
}

// ---------- Inventory helpers ----------

function addItem(key, n = 1) {
    player.items[key] = (player.items[key] || 0) + n;
}

function useItem(key) {
    if (!player.items[key]) return null;
    const it = ITEMS[key];
    const s = stats();
    player.items[key]--;
    if (!player.items[key]) delete player.items[key];
    if (it.hp) {
        const before = player.hp;
        player.hp = Math.min(s.maxHp, player.hp + it.hp);
        return `You eat a ${it.name} and recover ${player.hp - before} health.`;
    }
    const before = player.prana;
    player.prana = Math.min(s.maxPrana, player.prana + it.prana);
    return `You drink a ${it.name} and recover ${player.prana - before} prana.`;
}

// ---------- Battle ----------

function damage(atk, def) {
    return Math.max(1, Math.round(atk * rand(0.85, 1.15) - def * 0.6));
}

function startBattle(ent) {
    const def = ENEMIES[ent.kind];
    ui.battle = { ent, def, hp: def.hp, maxHp: def.hp, turn: 0, busy: false, charging: false, done: false, menu: 'main' };
    held.clear();
    $('battle-log').innerHTML = '';
    $('foe').classList.toggle('boss', !!def.boss);
    blog(def.boss ? `${def.name} stands before you!` : `A ${def.name} attacks!`);
    $('battle').hidden = false;
    renderBattle();
}

function blog(text, kind = '') {
    const li = document.createElement('li');
    li.textContent = text;
    if (kind) li.className = kind;
    $('battle-log').prepend(li);
}

function shake(id) {
    const el = $(id);
    el.classList.remove('hit');
    void el.offsetWidth;
    el.classList.add('hit');
}

function renderBattle() {
    const b = ui.battle;
    if (!b) return;
    const s = stats();
    $('foe-icon').textContent = b.def.icon;
    $('foe-name').textContent = b.def.name;
    setMeter('foe-hp-bar', 'foe-hp', b.hp, b.maxHp);
    $('battle-level').textContent = `Lv ${player.lvl}`;
    setMeter('battle-hp-bar', 'battle-hp', player.hp, s.maxHp);
    setMeter('battle-prana-bar', 'battle-prana', player.prana, s.maxPrana);

    const box = $('battle-actions');
    if (b.done) {
        box.innerHTML = '<button class="primary" data-act="continue">Continue <small>Return to the map</small></button>';
    } else if (b.menu === 'items') {
        const owned = Object.entries(player.items).filter(([, n]) => n > 0);
        box.innerHTML = owned.map(([k, n]) =>
            `<button data-act="item" data-arg="${k}" ${b.busy ? 'disabled' : ''}>${ITEMS[k].icon} ${ITEMS[k].name} ×${n}<small>${ITEMS[k].desc}</small></button>`).join('')
            + '<button data-act="back">Back<small>Return to actions</small></button>';
    } else {
        const dis = b.busy ? 'disabled' : '';
        const skillBtns = player.skills.map(k => {
            const sk = SKILLS[k];
            const ok = player.prana >= sk.cost && !b.busy;
            return `<button data-act="${k}" ${ok ? '' : 'disabled'}>${sk.name}<small>${sk.cost} prana · ${sk.desc}</small></button>`;
        }).join('');
        const itemCount = Object.values(player.items).reduce((a, n) => a + n, 0);
        box.innerHTML = `
            <button class="primary" data-act="attack" ${dis}>Attack<small>Strike with your ${GEAR[player.weapon].name}</small></button>
            ${skillBtns}
            <button data-act="items" ${itemCount && !b.busy ? '' : 'disabled'}>Items<small>${itemCount} in your satchel</small></button>
            <button data-act="flee" ${dis}>Flee<small>${b.def.boss ? 'Impossible against a boss' : '60% chance to escape'}</small></button>`;
    }
}

function battleAction(act, arg) {
    const b = ui.battle;
    if (!b) return;
    if (act === 'continue') return endBattle();
    if (b.busy || b.done) return;
    const s = stats();

    if (act === 'items') { b.menu = 'items'; return renderBattle(); }
    if (act === 'back') { b.menu = 'main'; return renderBattle(); }

    if (act === 'attack') {
        const dmg = damage(s.atk, b.def.def);
        b.hp -= dmg;
        blog(`You strike the ${b.def.name} for ${dmg} damage.`);
        shake('foe');
    } else if (act === 'vajra') {
        if (player.prana < SKILLS.vajra.cost) return;
        player.prana -= SKILLS.vajra.cost;
        const dmg = damage(s.atk * 1.8, b.def.def * 0.5);
        b.hp -= dmg;
        blog(`Vajra Strike! Thunder cracks as you deal ${dmg} damage.`, 'gold');
        shake('foe');
    } else if (act === 'pranayama') {
        if (player.prana < SKILLS.pranayama.cost) return;
        player.prana -= SKILLS.pranayama.cost;
        const before = player.hp;
        player.hp = Math.min(s.maxHp, player.hp + Math.round(s.maxHp * 0.4));
        blog(`You breathe deeply and recover ${player.hp - before} health.`, 'good');
    } else if (act === 'item') {
        const msg = useItem(arg);
        if (!msg) return;
        blog(msg, 'good');
        b.menu = 'main';
    } else if (act === 'flee') {
        if (b.def.boss) {
            blog('There is no escape from this fight!', 'bad');
        } else if (Math.random() < 0.6) {
            blog('You slip away into the undergrowth.');
            b.ent.stunUntil = performance.now() + 3000;
            b.fled = true;
            b.done = true;
            return renderBattle();
        } else {
            blog('You try to run, but the enemy blocks your path!', 'bad');
        }
    }

    if (b.hp <= 0) return winBattle();
    b.busy = true;
    renderBattle();
    setTimeout(foeTurn, 600);
}

function foeTurn() {
    const b = ui.battle;
    if (!b || b.done) return;
    b.turn++;
    let mult = 1;
    if (b.def.boss) {
        if (b.charging) {
            mult = 1.7;
            b.charging = false;
        } else if (b.turn % 3 === 0) {
            b.charging = true;
            blog(`${b.def.name} gathers terrible power. Brace yourself!`, 'bad');
            b.busy = false;
            return renderBattle();
        }
    }
    const dmg = damage(b.def.atk * mult, stats().def);
    player.hp -= dmg;
    blog(mult > 1 ? `${b.def.name} unleashes a devastating blow for ${dmg} damage!` : `The ${b.def.name} hits you for ${dmg} damage.`, 'bad');
    shake('hero-card');
    b.busy = false;
    if (player.hp <= 0) return loseBattle();
    renderBattle();
}

function winBattle() {
    const b = ui.battle;
    b.hp = 0;
    b.done = true;
    b.won = true;
    entities = entities.filter(e => e !== b.ent);
    blog(`The ${b.def.name} is defeated!`, 'good');
    if (b.def.xp || b.def.gold) {
        player.xp += b.def.xp;
        player.gold += b.def.gold;
        blog(`You gain ${b.def.xp} experience and ${b.def.gold} gold.`, 'gold');
    }
    player.prana = Math.min(stats().maxPrana, player.prana + 2);
    while (player.xp >= xpToNext(player.lvl)) {
        player.xp -= xpToNext(player.lvl);
        player.lvl++;
        const s = stats();
        player.hp = s.maxHp;
        player.prana = s.maxPrana;
        blog(`Level up! You are now level ${player.lvl}. Health and prana restored.`, 'gold');
    }
    if (b.def.boss) flags[b.def.boss] = true;
    save();
    renderBattle();
}

function loseBattle() {
    const b = ui.battle;
    player.hp = 0;
    b.done = true;
    b.lost = true;
    blog('You collapse. Everything goes dark...', 'bad');
    renderBattle();
}

function endBattle() {
    const b = ui.battle;
    ui.battle = null;
    $('battle').hidden = true;
    if (b.lost) {
        const s = stats();
        const lostGold = Math.floor(player.gold / 2);
        player.gold -= lostGold;
        player.hp = s.maxHp;
        player.prana = s.maxPrana;
        player.x = player.rx = START.x;
        player.y = player.ry = START.y;
        lastRegion = 'village';
        say(lines('Vaidya Kamala', `Villagers carried you home, Veer. You lost ${lostGold} gold on the road, but you will live. Rest, then try again.`));
    } else if (b.won && b.def.boss) {
        const after = {
            sardar: lines('Sardar Dhurandhar Singh', 'Enough! Enough! I yield. A demon in the mountains paid us to raid your village... I swear we will trouble Rampur no more!'),
            queen: lines('Veer', 'The Scorpion Queen crumbles into the sand. I should tell Rani Devika.'),
            kaal: lines('Rakshasa Kaal', 'Impossible... defeated by a farmer from Rampur... The mountains... are free...'),
        }[b.ent.kind];
        say(after, b.ent.kind === 'kaal' ? showEnding : null);
    }
    save();
    renderHud();
}

function showEnding() {
    ui.ending = true;
    $('ending-text').textContent = `Rakshasa Kaal is no more. From the Himalayan snows to the banks of the Ganga, people light diyas in your honour. Veer of Rampur reached level ${player.lvl} and saved the land.`;
    $('ending').hidden = false;
}

// ---------- Shop and menu ----------

function openShop(key) {
    ui.shop = key;
    held.clear();
    renderShop();
    $('shop').hidden = false;
}

function renderShop() {
    const shop = SHOPS[ui.shop];
    $('shop-title').textContent = shop.title;
    $('shop-gold').textContent = player.gold;
    $('shop-list').innerHTML = shop.stock.map(k => {
        if (ITEMS[k]) {
            const it = ITEMS[k];
            return `<li><span class="ico">${it.icon}</span><span class="what"><b>${it.name}</b><small>${it.desc} · you have ${player.items[k] || 0}</small></span>
                <button data-buy="${k}" ${player.gold >= it.price ? '' : 'disabled'}>Buy · ${it.price}</button></li>`;
        }
        const g = GEAR[k];
        const bonus = g.slot === 'weapon' ? `+${g.atk} attack` : `+${g.def} defense`;
        const owned = player.owned.includes(k);
        return `<li><span class="ico">${g.icon}</span><span class="what"><b>${g.name}</b><small>${bonus}</small></span>
            <button data-buy="${k}" ${owned || player.gold < g.price ? 'disabled' : ''}>${owned ? 'Owned' : `Buy · ${g.price}`}</button></li>`;
    }).join('');
}

function buy(key) {
    const price = (ITEMS[key] || GEAR[key]).price;
    if (player.gold < price) return;
    if (ITEMS[key]) {
        player.gold -= price;
        addItem(key);
        toast(`Bought a ${ITEMS[key].name}`);
    } else if (!player.owned.includes(key)) {
        const g = GEAR[key];
        player.gold -= price;
        player.owned.push(key);
        const current = GEAR[player[g.slot]];
        if ((g.atk || g.def || 0) > (current.atk || current.def || 0)) player[g.slot] = key;
        toast(`Bought and equipped the ${g.name}`);
    }
    save();
    renderShop();
    renderHud();
}

let restartArmed = false;

function openMenu() {
    if (uiOpen()) return;
    ui.menu = true;
    held.clear();
    restartArmed = false;
    renderMenu();
    $('menu').hidden = false;
}

function renderMenu() {
    const s = stats();
    const statBox = (label, value) => `<div class="stat"><small>${label}</small><b>${value}</b></div>`;
    const items = Object.entries(player.items).filter(([, n]) => n > 0);
    $('menu-body').innerHTML = `
        <h3>Current quest</h3>
        <p>${objective()}</p>
        <h3>Veer</h3>
        <div class="stats">
            ${statBox('Level', player.lvl)}
            ${statBox('Experience', `${player.xp} / ${xpToNext(player.lvl)}`)}
            ${statBox('Health', `${player.hp} / ${s.maxHp}`)}
            ${statBox('Prana', `${player.prana} / ${s.maxPrana}`)}
            ${statBox('Attack', s.atk)}
            ${statBox('Defense', s.def)}
        </div>
        <h3>Equipment</h3>
        <div class="stats">
            ${statBox('Weapon', `${GEAR[player.weapon].icon} ${GEAR[player.weapon].name}`)}
            ${statBox('Armour', `${GEAR[player.armor].icon} ${GEAR[player.armor].name}`)}
        </div>
        <h3>Skills</h3>
        <ul class="offers">${player.skills.map(k => `<li><span class="ico">✨</span><span class="what"><b>${SKILLS[k].name}</b><small>${SKILLS[k].cost} prana · ${SKILLS[k].desc}</small></span><span></span></li>`).join('')}</ul>
        <h3>Satchel</h3>
        ${items.length ? `<ul class="offers">${items.map(([k, n]) => `<li><span class="ico">${ITEMS[k].icon}</span><span class="what"><b>${ITEMS[k].name} ×${n}</b><small>${ITEMS[k].desc}</small></span><button data-use="${k}">Use</button></li>`).join('')}</ul>` : '<p class="panel-sub">Your satchel is empty. Buy food from a merchant.</p>'}
        <div class="menu-foot">
            <button class="ghost" id="restart">${restartArmed ? 'Click again to erase your journey' : 'New game'}</button>
        </div>`;
}

function closeSheet(name) {
    if (name === 'shop') ui.shop = null;
    if (name === 'menu') ui.menu = false;
    $(name).hidden = true;
    save();
    renderHud();
}

// ---------- Save, load, start ----------

function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ player, flags })); } catch { /* storage unavailable */ }
}

function load() {
    try {
        const data = JSON.parse(localStorage.getItem(SAVE_KEY));
        if (data && data.player && data.flags) return data;
    } catch { /* ignore a missing or corrupt save */ }
    return null;
}

function startGame(data) {
    player = Object.assign(newPlayer(), data ? data.player : {});
    player.rx = player.x;
    player.ry = player.y;
    flags = data ? data.flags : {};
    buildWorld();
    applyFlagsToMap();
    entities = [];
    spawnStatic();
    populate(true);
    lastRegion = regionAt(player.x, player.y);
    for (const id of ['battle', 'shop', 'menu', 'ending']) $(id).hidden = true;
    ui = { dialog: null, battle: null, shop: null, menu: false, ending: false };
    renderHud();
    if (!data) {
        say(lines('Legends of Bharat',
            'You are Veer, a young farmer of Rampur village on the banks of the Ganga.',
            'Your village is in danger. Go and speak with Mukhiya Ramdas, the village headman. Look for the yellow ! above his head.'));
    } else {
        renderDialog();
        showBanner(REGIONS[lastRegion].name);
    }
}

// ---------- Wiring ----------

window.addEventListener('keydown', ev => {
    if (ui.dialog && (ev.code === 'Space' || ev.code === 'Enter')) {
        ev.preventDefault();
        advanceDialog();
        return;
    }
    if (ev.code === 'Escape') {
        if (ui.shop) closeSheet('shop');
        else if (ui.menu) closeSheet('menu');
        return;
    }
    if (ev.code === 'KeyM' || ev.code === 'KeyI') { openMenu(); return; }
    const dir = KEYS[ev.code];
    if (dir) {
        ev.preventDefault();
        if (!uiOpen()) { held.delete(dir); held.add(dir); }
    }
});

window.addEventListener('keyup', ev => {
    const dir = KEYS[ev.code];
    if (dir) held.delete(dir);
});

window.addEventListener('blur', () => held.clear());

for (const btn of document.querySelectorAll('#dpad button')) {
    const dir = btn.dataset.dir;
    btn.addEventListener('pointerdown', ev => {
        ev.preventDefault();
        if (!uiOpen()) held.add(dir);
    });
    for (const type of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(type, () => held.delete(dir));
}

$('dialog-next').addEventListener('click', advanceDialog);
$('dialog').addEventListener('click', ev => { if (ev.target === $('dialog')) advanceDialog(); });
$('menu-btn').addEventListener('click', openMenu);
$('battle-actions').addEventListener('click', ev => {
    const btn = ev.target.closest('button[data-act]');
    if (btn && !btn.disabled) battleAction(btn.dataset.act, btn.dataset.arg);
});
$('shop-list').addEventListener('click', ev => {
    const btn = ev.target.closest('button[data-buy]');
    if (btn && !btn.disabled) buy(btn.dataset.buy);
});
$('menu-body').addEventListener('click', ev => {
    const use = ev.target.closest('button[data-use]');
    if (use) {
        const msg = useItem(use.dataset.use);
        if (msg) toast(msg);
        renderMenu();
        renderHud();
        return;
    }
    if (ev.target.closest('#restart')) {
        if (!restartArmed) { restartArmed = true; renderMenu(); return; }
        try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
        startGame(null);
    }
});
for (const btn of document.querySelectorAll('[data-close]')) {
    btn.addEventListener('click', () => closeSheet(btn.dataset.close));
}
$('ending-close').addEventListener('click', () => {
    ui.ending = false;
    $('ending').hidden = true;
    renderHud();
});

new ResizeObserver(resize).observe(canvas);
resize();
startGame(load());
requestAnimationFrame(frame);
