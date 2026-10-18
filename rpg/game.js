'use strict';

// ---------- World constants ----------

const MAP_W = 48;
const MAP_H = 32;
const SAVE_KEY = 'legends-of-bharat-v1';
const START = { x: 8, y: 24 };
const STEP_MS = 150;

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
    worldDirty = true;
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

// ---------- 3D rendering (blocky voxel style) ----------

const canvas = $('world');
let renderer = null;
let scene = null;
let camera = null;
let BOX = null;
let worldGroup = null;
let waterTex = null;
let heroModel = null;
let worldDirty = true;
let viewW = 1;
let viewH = 1;
let flames = [];
let battleClearing = null;
const MATS = {};
const models = new Map();
const SKY = '#9fd3f0';

function hash(x, y) {
    return ((x * 73856093) ^ (y * 19349663)) >>> 0;
}

function shade(hex, amt) {
    const c = new THREE.Color(hex);
    c.offsetHSL(0, 0, amt);
    return `#${c.getHexString()}`;
}

// A 16x16 noisy texture with nearest-neighbour filtering gives the chunky pixel look.
function pixelTexture(base, opts = {}) {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d');
    const rng = mulberry32(parseInt(base.slice(1), 16) + (opts.seed || 0));
    for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
            let col = shade(base, (rng() - 0.5) * (opts.vary ?? 0.08));
            if (opts.pattern) col = opts.pattern(x, y, rng) || col;
            g.fillStyle = col;
            g.fillRect(x, y, 1, 1);
        }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
}

function texMat(base, opts) {
    return new THREE.MeshLambertMaterial({ map: pixelTexture(base, opts) });
}

function makeMaterials() {
    const dots = (base, amt, chance) => (x, y, r) => (r() < chance ? shade(base, amt) : null);
    MATS.grass = texMat('#6aa84f', { vary: 0.1, pattern: dots('#6aa84f', 0.1, 0.08) });
    MATS.forestGrass = texMat('#4a7a36', { vary: 0.1, pattern: dots('#4a7a36', -0.08, 0.12) });
    MATS.sand = texMat('#e3c37e', { vary: 0.06 });
    MATS.snow = texMat('#eef3f6', { vary: 0.04 });
    MATS.path = texMat('#c8a165', { vary: 0.1, pattern: dots('#a9875a', 0, 0.12) });
    MATS.riverbed = texMat('#8a7a55', { vary: 0.1 });
    waterTex = pixelTexture('#3b86c4', { vary: 0.05, pattern: (x, y) => ((x + y * 2) % 8 < 2 ? '#62a6dc' : null) });
    waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
    MATS.water = new THREE.MeshLambertMaterial({ map: waterTex, transparent: true, opacity: 0.85 });
    MATS.bark = texMat('#6b4423', { pattern: (x) => (x % 4 === 0 ? '#553519' : null) });
    MATS.leaves = texMat('#2f6b2a', { vary: 0.12, pattern: dots('#24561f', 0, 0.18) });
    MATS.cactus = texMat('#4f8f3a', { pattern: (x) => (x % 4 === 1 ? '#3d7330' : null) });
    MATS.stone = texMat('#8c8a87', { vary: 0.1, pattern: dots('#6f6d6a', 0, 0.15) });
    MATS.stoneDark = texMat('#6a6764', { vary: 0.1 });
    MATS.mud = texMat('#c58b56', { vary: 0.08 });
    MATS.thatch = texMat('#b0843f', { pattern: (x, y) => (y % 3 === 0 ? '#8e6a30' : null) });
    MATS.door = texMat('#4a2c14', { vary: 0.05 });
    const brick = (x, y) => (y % 4 === 0 || (x + (Math.floor(y / 4) % 2) * 4) % 8 === 0 ? '#e4c08a' : null);
    MATS.sandstone = texMat('#d2a464', { vary: 0.05, pattern: brick });
    MATS.plank = texMat('#8a5a2b', { pattern: (x, y) => (y % 4 === 0 ? '#6e4520' : null) });
    MATS.tent = texMat('#9c2f2f', { pattern: (x) => (x % 5 === 0 ? '#7d2424' : null) });
    MATS.saffron = texMat('#e07b2a', { vary: 0.06 });
    MATS.gold = texMat('#f2c230', { vary: 0.08 });
    MATS.black = new THREE.MeshLambertMaterial({ color: '#140c10' });
    MATS.flame = new THREE.MeshBasicMaterial({ color: '#ffb02e' });
    MATS.flameCore = new THREE.MeshBasicMaterial({ color: '#fff1a8' });
}

function addObject(part, o, x, z) {
    const h = hash(x, z);
    switch (o) {
        case 'T': {
            const tall = 0.8 + (h % 3) * 0.15;
            part('bark', x, 0, z, 0.3, tall, 0.3);
            part('leaves', x, tall - 0.1, z, 1, 0.8, 1);
            part('leaves', x, tall + 0.7, z, 0.6, 0.45, 0.6);
            break;
        }
        case 'c':
            part('cactus', x, 0, z, 0.3, 1.1, 0.3);
            part('cactus', x - 0.25, 0.45, z, 0.2, 0.14, 0.16);
            part('cactus', x - 0.3, 0.45, z, 0.12, 0.4, 0.14);
            part('cactus', x + 0.25, 0.6, z, 0.2, 0.14, 0.16);
            part('cactus', x + 0.3, 0.6, z, 0.12, 0.35, 0.14);
            break;
        case 'M': {
            part('stone', x, 0, z, 1, 1, 1);
            const extra = h % 3;
            part('stone', x + (h % 2 ? 0.08 : -0.08), 1, z, 0.8, 0.6 + extra * 0.3, 0.8);
            part('snow', x, 1.6 + extra * 0.3, z, 0.55, 0.35, 0.55);
            break;
        }
        case 'H':
            part('mud', x, 0, z, 0.9, 0.8, 0.9);
            part('thatch', x, 0.8, z, 1.05, 0.2, 1.05);
            part('thatch', x, 1.0, z, 0.75, 0.2, 0.75);
            part('thatch', x, 1.2, z, 0.42, 0.2, 0.42);
            part('door', x, 0, z + 0.45, 0.26, 0.52, 0.04);
            break;
        case 'K':
            part('sandstone', x, 0, z, 0.95, 0.45, 0.95);
            part('saffron', x, 0.45, z, 0.72, 0.45, 0.72);
            part('saffron', x, 0.9, z, 0.52, 0.42, 0.52);
            part('saffron', x, 1.32, z, 0.32, 0.38, 0.32);
            part('gold', x, 1.7, z, 0.08, 0.45, 0.08);
            part('gold', x + 0.16, 1.98, z, 0.26, 0.14, 0.03);
            part('door', x, 0, z + 0.48, 0.24, 0.4, 0.04);
            break;
        case 'w':
            part('stone', x, 0, z - 0.3, 0.75, 0.4, 0.15);
            part('stone', x, 0, z + 0.3, 0.75, 0.4, 0.15);
            part('stone', x - 0.3, 0, z, 0.15, 0.4, 0.45);
            part('stone', x + 0.3, 0, z, 0.15, 0.4, 0.45);
            part('water', x, 0, z, 0.45, 0.3, 0.45);
            part('bark', x - 0.3, 0.4, z, 0.06, 0.5, 0.06);
            part('bark', x + 0.3, 0.4, z, 0.06, 0.5, 0.06);
            part('bark', x, 0.85, z, 0.66, 0.06, 0.06);
            break;
        case 'W':
            part('sandstone', x, 0, z, 1, 1.3, 1);
            part('sandstone', x - 0.3, 1.3, z - 0.3, 0.32, 0.25, 0.32);
            part('sandstone', x + 0.3, 1.3, z + 0.3, 0.32, 0.25, 0.32);
            break;
        case 'R':
            part('stone', x - 0.15, 0, z + 0.1, 0.6, 0.55, 0.6);
            part('stoneDark', x + 0.2, 0, z - 0.15, 0.5, 0.45, 0.5);
            part('stone', x + 0.05, 0.45, z, 0.4, 0.3, 0.4);
            break;
        case 'C':
            part('stoneDark', x, 0, z, 1, 1.7, 1);
            part('black', x, 0, z + 0.47, 0.6, 1.0, 0.08);
            break;
        case 'A':
            part('tent', x, 0, z, 0.95, 0.3, 0.95);
            part('tent', x, 0.3, z, 0.72, 0.3, 0.72);
            part('tent', x, 0.6, z, 0.48, 0.3, 0.48);
            part('tent', x, 0.9, z, 0.24, 0.25, 0.24);
            part('black', x, 0, z + 0.48, 0.24, 0.4, 0.03);
            break;
        case 'F':
            part('bark', x, 0, z, 0.65, 0.12, 0.16);
            part('bark', x, 0.06, z, 0.16, 0.12, 0.65);
            part('stone', x - 0.35, 0, z, 0.12, 0.12, 0.12);
            part('stone', x + 0.35, 0, z, 0.12, 0.12, 0.12);
            flames.push([x, z]);
            break;
        case 'B':
            part('plank', x - 0.3, -0.25, z, 0.35, 0.1, 0.8);
            part('plank', x + 0.25, -0.3, z + 0.12, 0.3, 0.1, 0.45);
            break;
        default:
            break;
    }
}

// During a battle, tall scenery between the camera and the fighters is left out so the fight stays visible.
function hiddenForBattle(o, x, y) {
    const c = battleClearing;
    if (!c || !'TMcHAW'.includes(o)) return false;
    return y >= c.z - 0.5 && Math.abs(x - c.x) <= c.r && y - c.z <= c.r + 1;
}

function rebuildWorld() {
    worldDirty = false;
    if (worldGroup) {
        scene.remove(worldGroup);
        worldGroup.children.forEach(m => { if (m.dispose) m.dispose(); });
    }
    worldGroup = new THREE.Group();
    flames = [];
    const parts = {};
    const part = (mat, x, y, z, sx, sy, sz) => {
        (parts[mat] = parts[mat] || []).push([x, y + sy / 2, z, sx, sy, sz]);
    };

    for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
            const g = ground[idx(x, y)];
            const mat = { '.': 'grass', f: 'forestGrass', s: 'sand', n: 'snow', p: 'path' }[g];
            if (mat) {
                part(mat, x, -1, y, 1, 1, 1);
            } else {
                part('riverbed', x, -1.2, y, 1, 0.2, 1);
                part('water', x, -1, y, 1, 0.8, 1);
                if (g === '=') {
                    part('plank', x, -0.12, y, 1, 0.12, 0.9);
                    part('bark', x, 0, y - 0.42, 1, 0.3, 0.06);
                    part('bark', x, 0, y + 0.42, 1, 0.3, 0.06);
                }
            }
            const o = objects[idx(x, y)];
            if (o && !hiddenForBattle(o, x, y)) addObject(part, o, x, y);
        }
    }

    const m = new THREE.Matrix4();
    for (const [mat, list] of Object.entries(parts)) {
        const mesh = new THREE.InstancedMesh(BOX, MATS[mat], list.length);
        list.forEach(([x, y, z, sx, sy, sz], i) => {
            m.makeScale(sx, sy, sz);
            m.setPosition(x, y, z);
            mesh.setMatrixAt(i, m);
        });
        mesh.instanceMatrix.needsUpdate = true;
        worldGroup.add(mesh);
    }

    flames = flames.map(([x, z]) => {
        const outer = new THREE.Mesh(BOX, MATS.flame);
        const inner = new THREE.Mesh(BOX, MATS.flameCore);
        outer.position.set(x, 0.3, z);
        inner.position.set(x, 0.25, z);
        worldGroup.add(outer, inner);
        return { outer, inner, seed: x * 3.1 };
    });
    scene.add(worldGroup);
}

// ---------- Blocky characters ----------

function lambert(color, emissive = '#000000') {
    return new THREE.MeshLambertMaterial({ color, emissive });
}

function box(parent, mat, w, h, d, x, y, z) {
    const mesh = new THREE.Mesh(BOX, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y + h / 2, z);
    parent.add(mesh);
    return mesh;
}

// A limb hangs from a pivot at its joint so it can swing.
function limb(parent, mat, w, h, d, x, y, z) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const mesh = new THREE.Mesh(BOX, mat);
    mesh.scale.set(w, h, d);
    mesh.position.y = -h / 2;
    pivot.add(mesh);
    parent.add(pivot);
    return pivot;
}

function humanoid(o) {
    const g = new THREE.Group();
    const skin = lambert(o.skin);
    const shirt = lambert(o.shirt);
    const pants = lambert(o.pants);
    const legL = limb(g, pants, 0.17, 0.5, 0.17, -0.1, 0.5, 0);
    const legR = limb(g, pants, 0.17, 0.5, 0.17, 0.1, 0.5, 0);
    box(g, shirt, 0.44, 0.5, 0.24, 0, 0.5, 0);
    if (o.robe) box(g, shirt, 0.46, 0.32, 0.28, 0, 0.2, 0);
    if (o.sash) box(g, lambert(o.sash), 0.45, 0.08, 0.25, 0, 0.62, 0);
    const armMat = o.bareArms ? skin : shirt;
    const armL = limb(g, armMat, 0.13, 0.46, 0.13, -0.29, 0.98, 0);
    const armR = limb(g, armMat, 0.13, 0.46, 0.13, 0.29, 0.98, 0);

    const head = new THREE.Group();
    head.position.y = 1.0;
    g.add(head);
    box(head, skin, 0.36, 0.36, 0.36, 0, 0, 0);
    const eye = o.glow ? lambert('#ffd23a', '#ffb000') : lambert('#1a1010');
    box(head, eye, 0.06, 0.06, 0.02, -0.08, 0.17, 0.18);
    box(head, eye, 0.06, 0.06, 0.02, 0.08, 0.17, 0.18);
    if (o.hair) {
        const hair = lambert(o.hair);
        box(head, hair, 0.38, 0.1, 0.38, 0, 0.3, 0);
        box(head, hair, 0.38, o.longHair ? 0.5 : 0.24, 0.06, 0, o.longHair ? -0.2 : 0.08, -0.17);
    }
    if (o.turban) {
        const t = lambert(o.turban);
        box(head, t, 0.4, 0.14, 0.4, 0, 0.27, 0);
        box(head, t, 0.3, 0.1, 0.3, 0, 0.41, 0);
    }
    if (o.hijab) {
        const hj = lambert(o.hijab);
        box(head, hj, 0.42, 0.1, 0.42, 0, 0.32, 0);
        box(head, hj, 0.05, 0.4, 0.4, -0.2, -0.04, -0.01);
        box(head, hj, 0.05, 0.4, 0.4, 0.2, -0.04, -0.01);
        box(head, hj, 0.42, 0.44, 0.05, 0, -0.08, -0.2);
    }
    if (o.beard) box(head, lambert(o.beard), 0.32, o.longBeard ? 0.26 : 0.13, 0.06, 0, o.longBeard ? -0.14 : 0, 0.19);
    if (o.mustache) box(head, lambert(o.mustache), 0.24, 0.05, 0.03, 0, 0.09, 0.195);
    if (o.mask) box(head, lambert(o.mask), 0.38, 0.15, 0.38, 0, 0, 0);
    if (o.crown) {
        const gold = lambert('#f2c230', '#3a2a00');
        box(head, gold, 0.38, 0.08, 0.38, 0, 0.34, 0);
        for (const cx of [-0.14, 0, 0.14]) box(head, gold, 0.06, 0.1, 0.06, cx, 0.42, 0.16);
    }
    if (o.horns) {
        const horn = lambert('#efe2c4');
        for (const s of [-1, 1]) {
            const hm = box(head, horn, 0.07, 0.2, 0.07, 0.14 * s, 0.33, 0);
            hm.rotation.z = -0.4 * s;
        }
    }
    g.scale.setScalar(o.scale || 1);
    return { body: g, limbs: [[legL, 0, 0.8], [legR, Math.PI, 0.8], [armL, Math.PI, 0.7], [armR, 0, 0.7]], armR };
}

function quadruped(o) {
    const g = new THREE.Group();
    const bodyMat = o.pattern ? texMat(o.color, { pattern: o.pattern }) : lambert(o.color);
    const legMat = lambert(o.leg || o.color);
    const [len, h, w] = o.size;
    const legH = o.legH;
    box(g, bodyMat, w, h, len, 0, legH, 0);
    const head = box(g, bodyMat, o.head, o.head, o.head, 0, legH + h * 0.45, len / 2 + o.head / 2 - 0.06);
    const eye = lambert('#1a1010');
    box(g, eye, 0.04, 0.05, 0.02, -o.head * 0.25, legH + h * 0.45 + o.head * 0.62, len / 2 + o.head - 0.05);
    box(g, eye, 0.04, 0.05, 0.02, o.head * 0.25, legH + h * 0.45 + o.head * 0.62, len / 2 + o.head - 0.05);
    if (o.snout) box(g, lambert(o.snout), o.head * 0.55, o.head * 0.4, 0.12, 0, legH + h * 0.45 + 0.02, len / 2 + o.head - 0.02);
    if (o.tusks) {
        for (const s of [-1, 1]) box(g, lambert('#f4efe2'), 0.04, 0.12, 0.04, s * o.head * 0.3, legH + h * 0.45, len / 2 + o.head);
    }
    if (o.ears) {
        for (const s of [-1, 1]) box(g, bodyMat, 0.07, 0.12, 0.05, s * o.head * 0.3, legH + h * 0.45 + o.head, len / 2 + o.head / 2);
    }
    if (o.tail) {
        const tail = box(g, legMat, 0.06, 0.06, o.tail, 0, legH + h * 0.75, -len / 2 - o.tail / 2);
        tail.rotation.x = 0.4;
    }
    const legs = [];
    for (const [sx, sz, ph] of [[-1, 1, 0], [1, 1, Math.PI], [-1, -1, Math.PI], [1, -1, 0]]) {
        const leg = limb(g, legMat, 0.12, legH, 0.12, sx * (w / 2 - 0.07), legH, sz * (len / 2 - 0.1));
        legs.push([leg, ph, 0.6]);
    }
    head.userData.isHead = true;
    g.scale.setScalar(o.scale || 1);
    return { body: g, limbs: legs };
}

function cobra(scale = 1) {
    const g = new THREE.Group();
    const skin = texMat('#3f6b2a', { pattern: (x, y) => ((x + y) % 4 === 0 ? '#c9b060' : null) });
    box(g, skin, 0.55, 0.1, 0.55, 0, 0, 0);
    box(g, skin, 0.38, 0.1, 0.38, 0, 0.1, 0);
    const neck = new THREE.Group();
    neck.position.y = 0.2;
    g.add(neck);
    box(neck, skin, 0.12, 0.55, 0.12, 0, 0, 0.05);
    box(neck, skin, 0.36, 0.3, 0.06, 0, 0.35, 0.02);
    box(neck, skin, 0.16, 0.12, 0.2, 0, 0.55, 0.1);
    box(neck, lambert('#e8d36a', '#5a4a00'), 0.03, 0.03, 0.02, -0.05, 0.62, 0.21);
    box(neck, lambert('#e8d36a', '#5a4a00'), 0.03, 0.03, 0.02, 0.05, 0.62, 0.21);
    g.scale.setScalar(scale);
    return { body: g, limbs: [], sway: neck };
}

function scorpion(color, scale = 1) {
    const g = new THREE.Group();
    const shell = texMat(color, { vary: 0.1 });
    const dark = lambert(shade(color, -0.15));
    box(g, shell, 0.42, 0.14, 0.6, 0, 0.08, 0);
    box(g, shell, 0.26, 0.12, 0.18, 0, 0.1, 0.36);
    const legs = [];
    for (const s of [-1, 1]) {
        box(g, dark, 0.08, 0.06, 0.3, s * 0.2, 0.12, 0.56);
        box(g, shell, 0.16, 0.08, 0.14, s * 0.22, 0.1, 0.74);
        for (const z of [-0.15, 0.05, 0.22]) {
            const leg = limb(g, dark, 0.22, 0.05, 0.05, s * 0.3, 0.12, z);
            leg.rotation.z = s * 0.4;
            legs.push([leg, z * 10, 0.25]);
        }
    }
    const tail = new THREE.Group();
    tail.position.set(0, 0.15, -0.3);
    g.add(tail);
    box(tail, shell, 0.14, 0.14, 0.2, 0, 0, -0.08);
    box(tail, shell, 0.12, 0.25, 0.12, 0, 0.1, -0.18);
    box(tail, shell, 0.11, 0.12, 0.2, 0, 0.35, -0.08);
    box(tail, lambert('#2a0f0f', '#4a0000'), 0.08, 0.14, 0.08, 0, 0.3, 0.06);
    g.scale.setScalar(scale);
    return { body: g, limbs: legs, tailBob: tail };
}

function raider() {
    const horse = quadruped({ color: '#6b4426', leg: '#4a2e18', size: [1.0, 0.45, 0.36], legH: 0.5, head: 0.28, tail: 0.3, ears: true });
    const rider = humanoid({ skin: '#a86d43', shirt: '#2c3e6b', pants: '#2c3e6b', turban: '#d9442b', mustache: '#1a1010', scale: 0.75 });
    rider.body.position.set(0, 0.62, -0.05);
    rider.limbs.forEach(([leg], i) => { if (i < 2) leg.rotation.x = -1.2; });
    horse.body.add(rider.body);
    return { body: horse.body, limbs: horse.limbs, armR: rider.armR };
}

const MODEL_BUILDERS = {
    hero: () => humanoid({ skin: '#b9794c', shirt: '#f29a2e', pants: '#f3ead6', hair: '#1d1410', sash: '#d9442b' }),
    elder: () => humanoid({ skin: '#a8714a', shirt: '#f3ead6', pants: '#f3ead6', turban: '#f3ead6', beard: '#e8e4dc', longBeard: true }),
    vaidya: () => humanoid({ skin: '#a8714a', shirt: '#2e8b57', pants: '#2e8b57', robe: true, hair: '#9a9a9a', longHair: true, sash: '#f2c230' }),
    merchant: () => humanoid({ skin: '#b07a50', shirt: '#e6b422', pants: '#f3ead6', turban: '#c0392b', mustache: '#1a1010' }),
    child: () => humanoid({ skin: '#b9794c', shirt: '#3f8fd9', pants: '#5a3d22', hair: '#1d1410', scale: 0.72 }),
    guru: () => humanoid({ skin: '#a8714a', shirt: '#e07b2a', pants: '#e07b2a', robe: true, beard: '#ecebe6', longBeard: true, bareArms: true }),
    rani: () => humanoid({ skin: '#c48a5e', shirt: '#a3192c', pants: '#a3192c', robe: true, hair: '#1d1410', longHair: true, crown: true, sash: '#f2c230' }),
    trader: () => humanoid({ skin: '#b98258', shirt: '#1f8a8a', pants: '#2b2b44', hijab: '#145f5f' }),
    dacoit: () => humanoid({ skin: '#9a6440', shirt: '#26201c', pants: '#26201c', turban: '#26201c', mask: '#a3192c' }),
    sardar: () => humanoid({ skin: '#9a6440', shirt: '#3a1414', pants: '#26201c', turban: '#7a1f1f', beard: '#1a1010', mustache: '#1a1010', sash: '#f2c230', scale: 1.35 }),
    scout: () => humanoid({ skin: '#8e2a2a', shirt: '#3a1a2a', pants: '#3a1a2a', horns: true, glow: true, bareArms: true, scale: 1.15 }),
    kaal: () => humanoid({ skin: '#4a1424', shirt: '#1c0c14', pants: '#1c0c14', horns: true, glow: true, bareArms: true, crown: true, scale: 2.1 }),
    boar: () => quadruped({ color: '#6b4a3a', size: [0.75, 0.4, 0.38], legH: 0.2, head: 0.3, snout: '#c9928a', tusks: true, ears: true, tail: 0.12 }),
    jackal: () => quadruped({ color: '#a8875e', leg: '#8a6c48', size: [0.7, 0.3, 0.26], legH: 0.32, head: 0.24, ears: true, tail: 0.3 }),
    tiger: () => quadruped({ color: '#e8862a', leg: '#e8862a', size: [1.0, 0.42, 0.38], legH: 0.32, head: 0.34, ears: true, tail: 0.5, snout: '#f6ead2', pattern: (x) => (x % 4 === 0 ? '#2a1a10' : null) }),
    leopard: () => quadruped({ color: '#e6e1d6', size: [0.95, 0.38, 0.34], legH: 0.34, head: 0.3, ears: true, tail: 0.6, pattern: (x, y, r) => (r() < 0.14 ? '#4a4038' : null) }),
    cobra: () => cobra(),
    scorpion: () => scorpion('#7a4a2a'),
    queen: () => scorpion('#5a1a2a', 2.1),
    raider,
};

function weaponMesh(key) {
    const g = new THREE.Group();
    if (key === 'lathi') {
        box(g, lambert('#c9a46a'), 0.05, 0.95, 0.05, 0, -1.0, 0.08);
    } else {
        const wide = key === 'khanda';
        box(g, lambert('#f2c230'), 0.14, 0.05, 0.08, 0, -0.5, 0.08);
        box(g, lambert('#dfe6ea', '#20262a'), wide ? 0.09 : 0.05, 0.45, 0.03, 0, -0.95, 0.08);
    }
    return g;
}

function makeModel(e) {
    const key = e.hero ? 'hero' : e.npc || e.kind;
    const built = MODEL_BUILDERS[key]();
    const root = new THREE.Group();
    const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.38, 18),
        new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    shadow.scale.setScalar(e.boss ? 1.8 : 1);
    root.add(shadow);

    let ring = null;
    const ringColor = e.hero ? '#f29a2e' : e.boss ? '#f2c230' : e.kind ? '#d9442b' : null;
    if (ringColor) {
        ring = new THREE.Mesh(
            new THREE.RingGeometry(0.42, 0.5, 28),
            new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.02;
        ring.scale.setScalar(e.boss ? 1.8 : 1);
        root.add(ring);
    }

    let marker = null;
    if (e.npc) {
        marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture(), depthTest: false }));
        marker.scale.set(0.45, 0.45, 1);
        marker.position.y = 1.85;
        root.add(marker);
    }

    root.add(built.body);
    const mats = [];
    built.body.traverse(o => { if (o.isMesh) mats.push(o.material); });
    return { root, ring, marker, mats, facing: 0, walk: 0, weapon: null, ...built };
}

let markerTex = null;
function markerTexture() {
    if (markerTex) return markerTex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.font = 'bold 56px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = '#1a1322';
    g.strokeText('!', 32, 34);
    g.fillStyle = '#f2c230';
    g.fillText('!', 32, 34);
    markerTex = new THREE.CanvasTexture(c);
    return markerTex;
}

function clearModels() {
    for (const m of models.values()) scene.remove(m.root);
    models.clear();
}

function turnToward(m, target, dt) {
    let d = target - m.body.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    m.body.rotation.y += d * Math.min(1, dt * 12);
}

function animateModel(m, e, now, dt) {
    const dx = e.x - e.rx;
    const dz = e.y - e.ry;
    const moving = Math.abs(dx) + Math.abs(dz) > 0.01;
    if (moving) m.facing = Math.atan2(dx, dz);
    turnToward(m, m.facing, dt);
    m.walk += ((moving ? 1 : 0) - m.walk) * Math.min(1, dt * 10);
    for (const [pivot, phase, amp] of m.limbs) pivot.rotation.x = Math.sin(now / 90 + phase) * amp * m.walk;

    let ox = 0;
    let oz = 0;
    if (m.lunge) {
        const p = (now - m.lunge.start) / 320;
        if (p >= 1) m.lunge = null;
        else { const k = Math.sin(p * Math.PI) * 0.45; ox = m.lunge.dx * k; oz = m.lunge.dz * k; }
    }
    m.root.position.set(e.rx + ox, 0, e.ry + oz);
    m.body.position.y = m.walk > 0.1 ? Math.abs(Math.sin(now / 90)) * 0.06 * m.walk : 0;

    if (m.sway) m.sway.rotation.z = Math.sin(now / 400) * 0.15;
    if (m.tailBob) m.tailBob.rotation.x = Math.sin(now / 250) * 0.2;
    if (m.ring && e.boss) m.ring.material.opacity = 0.55 + 0.4 * Math.sin(now / 300);
    if (m.marker) {
        m.marker.visible = hasNews(e.npc);
        m.marker.position.y = 1.85 + Math.sin(now / 250) * 0.08;
    }

    const flashing = now < (m.flashUntil || 0);
    if (flashing !== !!m.flashed) {
        m.flashed = flashing;
        for (const mat of m.mats) if (mat.emissive) mat.emissive.set(flashing ? '#c0201a' : (mat.userData.baseEmissive || '#000000'));
    }
}

function syncModels(now, dt) {
    const alive = new Set(entities);
    for (const e of entities) {
        if (!models.has(e)) {
            const m = makeModel(e);
            m.facing = e.npc ? 0 : Math.random() * Math.PI * 2;
            m.body.rotation.y = m.facing;
            for (const mat of m.mats) if (mat.emissive) mat.userData.baseEmissive = `#${mat.emissive.getHexString()}`;
            models.set(e, m);
            scene.add(m.root);
        }
    }
    for (const [e, m] of models) {
        if (alive.has(e)) { animateModel(m, e, now, dt); continue; }
        if (!m.dyingAt) m.dyingAt = now;
        const p = (now - m.dyingAt) / 650;
        m.body.rotation.z = Math.min(1, p * 1.5) * Math.PI / 2;
        m.root.position.y = -Math.max(0, p - 0.5) * 1.2;
        if (p >= 1) { scene.remove(m.root); models.delete(e); }
    }

    if (heroModel.weapon !== player.weapon) {
        if (heroModel.weaponMesh) heroModel.armR.remove(heroModel.weaponMesh);
        heroModel.weaponMesh = weaponMesh(player.weapon);
        heroModel.armR.add(heroModel.weaponMesh);
        heroModel.weapon = player.weapon;
    }
    animateModel(heroModel, player, now, dt);
}

// ---------- Battle effects ----------

function facePair(ent) {
    const fm = models.get(ent);
    heroModel.facing = Math.atan2(ent.x - player.x, ent.y - player.y);
    if (fm) fm.facing = Math.atan2(player.x - ent.x, player.y - ent.y);
}

function fxAttack(heroAttacks, text, color) {
    const b = ui.battle;
    if (!b || !heroModel) return;
    const foeModel = models.get(b.ent);
    const attacker = heroAttacks ? heroModel : foeModel;
    const target = heroAttacks ? foeModel : heroModel;
    const from = heroAttacks ? player : b.ent;
    const to = heroAttacks ? b.ent : player;
    const now = performance.now();
    if (attacker) attacker.lunge = { start: now, dx: Math.sign(to.x - from.x), dz: Math.sign(to.y - from.y) };
    if (target) setTimeout(() => { target.flashUntil = performance.now() + 260; }, 140);
    if (text) floatText(to, text, color, heroAttacks ? (b.def.boss ? 2.6 : 1.4) : 1.6);
}

function floatText(e, text, color, height) {
    if (!camera) return;
    const v = new THREE.Vector3(e.rx, height, e.ry).project(camera);
    const el = document.createElement('div');
    el.className = 'dmg';
    el.textContent = text;
    el.style.color = color;
    el.style.left = `${((v.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - v.y) / 2) * 100}%`;
    $('frame').appendChild(el);
    setTimeout(() => el.remove(), 1000);
}

// ---------- Camera and frame ----------

const camPos = { x: START.x, y: 8, z: START.y + 7 };
const camLook = { x: START.x, y: 0, z: START.y };

function updateCamera(dt) {
    const far = viewW / viewH < 0.9 ? 1.5 : 1;
    let tx = player.rx;
    let tz = player.ry;
    let off = [0, 8.6 * far, 5.4 * far];
    if (ui.battle) {
        const e = ui.battle.ent;
        tx = (player.rx + e.rx) / 2;
        tz = (player.ry + e.ry) / 2;
        const big = ui.battle.def.boss ? 1.5 : 1;
        off = [1.2 * big, 3.4 * far * big, 4.2 * far * big];
    }
    const k = 1 - Math.exp(-dt * 5);
    camPos.x += (tx + off[0] - camPos.x) * k;
    camPos.y += (off[1] - camPos.y) * k;
    camPos.z += (tz + off[2] - camPos.z) * k;
    camLook.x += (tx - camLook.x) * k;
    camLook.y += ((ui.battle ? 0.6 : 0.3) - camLook.y) * k;
    camLook.z += (tz - camLook.z) * k;
    camera.position.set(camPos.x, camPos.y, camPos.z);
    camera.lookAt(camLook.x, camLook.y, camLook.z);
}

function resize() {
    if (!renderer) return;
    const rect = canvas.getBoundingClientRect();
    viewW = Math.max(1, rect.width);
    viewH = Math.max(1, rect.height);
    renderer.setSize(viewW, viewH, false);
    camera.aspect = viewW / viewH;
    camera.updateProjectionMatrix();
}

function render3d(now, dt) {
    if (!renderer) return;
    if (worldDirty) rebuildWorld();
    waterTex.offset.x = (now / 6000) % 1;
    waterTex.offset.y = (now / 9000) % 1;
    for (const f of flames) {
        const s = 1 + Math.sin(now / 90 + f.seed) * 0.15;
        f.outer.scale.set(0.3 * s, 0.4 * s, 0.3 * s);
        f.inner.scale.set(0.15, 0.25 * s, 0.15);
        f.outer.rotation.y = now / 400;
    }
    syncModels(now, dt);
    updateCamera(dt);
    renderer.render(scene, camera);
}

function init3d() {
    if (!window.THREE) {
        $('frame').insertAdjacentHTML('beforeend', '<p class="engine-error">The 3D engine could not load. Check your internet connection and reload the page.</p>');
        return false;
    }
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 16, 32);
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);
    scene.add(new THREE.HemisphereLight('#ffffff', '#6a5a40', 0.8));
    const sun = new THREE.DirectionalLight('#fff1d6', 0.65);
    sun.position.set(-0.6, 1, 0.45);
    scene.add(sun);
    BOX = new THREE.BoxGeometry(1, 1, 1);
    makeMaterials();
    heroModel = makeModel({ hero: true });
    scene.add(heroModel.root);
    resize();
    return true;
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

    render3d(now, dt);
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

function hasNews(npcId) {
    switch (npcId) {
        case 'elder': return !flags.metElder || (flags.sardarDefeated && !flags.bridgeFixed);
        case 'guru': return !player.skills.includes('pranayama');
        case 'rani': return flags.bridgeFixed && (!flags.metRani || (flags.queenDefeated && !flags.passOpen));
        default: return false;
    }
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
    $('frame').classList.add('in-battle');
    facePair(ent);
    battleClearing = { x: (player.x + ent.x) / 2, z: Math.max(player.y, ent.y), r: def.boss ? 3 : 2 };
    worldDirty = true;
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
    $('foe-name').textContent = b.def.name;
    setMeter('foe-hp-bar', 'foe-hp', b.hp, b.maxHp);
    renderHud();

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
        fxAttack(true, `-${dmg}`, '#ffffff');
    } else if (act === 'vajra') {
        if (player.prana < SKILLS.vajra.cost) return;
        player.prana -= SKILLS.vajra.cost;
        const dmg = damage(s.atk * 1.8, b.def.def * 0.5);
        b.hp -= dmg;
        blog(`Vajra Strike! Thunder cracks as you deal ${dmg} damage.`, 'gold');
        shake('foe');
        fxAttack(true, `-${dmg}`, '#f2c230');
    } else if (act === 'pranayama') {
        if (player.prana < SKILLS.pranayama.cost) return;
        player.prana -= SKILLS.pranayama.cost;
        const before = player.hp;
        player.hp = Math.min(s.maxHp, player.hp + Math.round(s.maxHp * 0.4));
        blog(`You breathe deeply and recover ${player.hp - before} health.`, 'good');
        floatText(player, `+${player.hp - before}`, '#8fd18a', 1.6);
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
    fxAttack(false, `-${dmg}`, '#ff8a75');
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
    $('frame').classList.remove('in-battle');
    battleClearing = null;
    worldDirty = true;
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
    if (renderer) clearModels();
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

init3d();
new ResizeObserver(resize).observe(canvas);
startGame(load());
requestAnimationFrame(frame);
