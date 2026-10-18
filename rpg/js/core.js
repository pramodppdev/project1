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
    sardar: { name: 'Sardar Dhurandhar Singh', icon: '🧔🏽', hp: 200, atk: 18, def: 6, xp: 120, gold: 100, boss: 'sardarDefeated' },
    queen: { name: 'The Scorpion Queen', icon: '🦂', hp: 440, atk: 27, def: 10, xp: 300, gold: 200, boss: 'queenDefeated' },
    kaal: { name: 'Rakshasa Kaal', icon: '👹', hp: 760, atk: 35, def: 14, xp: 0, gold: 0, boss: 'kaalDefeated' },
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
    village: { title: "Seth Govind's Stall", stock: ['ladoo', 'tulsi', 'talwar', 'vest', 'horse'] },
    fort: { title: "Farida's Caravan", stock: ['ladoo', 'kheer', 'tulsi', 'khanda', 'chainmail'] },
};

const SKILLS = {
    vajra: { name: 'Vajra Strike', cost: 5, desc: 'A thunderous blow, 1.8x damage' },
    pranayama: { name: 'Pranayama', cost: 6, desc: 'Breathe deep and heal your wounds' },
    rockets: { name: 'Rocket Barrage', cost: 8, desc: 'Iron-cased rockets, 2.5x damage that ignores armour' },
};

const NPCS = [
    { id: 'elder', x: 9, y: 22, icon: '👴🏽', name: 'Mukhiya Ramdas' },
    { id: 'vaidya', x: 4, y: 25, icon: '👵🏽', name: 'Vaidya Kamala' },
    { id: 'merchant', x: 12, y: 25, icon: '👳🏽', name: 'Seth Govind' },
    { id: 'child', x: 5, y: 20, icon: '🧒🏽', name: 'Little Chotu' },
    { id: 'guru', x: 12, y: 10, icon: '🧘🏽', name: 'Guru Anand' },
    { id: 'rani', x: 33, y: 26, icon: '👸🏽', name: 'Rani Devika' },
    { id: 'trader', x: 31, y: 24, icon: '🧕🏽', name: 'Farida the Trader' },
    { id: 'havaldar', x: 12, y: 20, icon: '💂🏽', name: 'Havaldar Bhim' },
    { id: 'captain', x: 35, y: 24, icon: '💂🏽', name: 'Senapati Arjan' },
    { id: 'cart_rampur', x: 13, y: 22, name: 'Cart driver Raghu' },
    { id: 'cart_ashram', x: 14, y: 10, name: 'Cart driver Sukhdev' },
    { id: 'cart_fort', x: 30, y: 26, name: 'Cart driver Kesar' },
    { id: 'cart_pass', x: 34, y: 8, name: 'Cart driver Pemba' },
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
        rank: 0, renown: 0, knowledge: 0, squad: [], soldierSeq: 0, research: [],
        provinces: Object.fromEntries(Object.keys(PROVINCES).map(k => [k, newProvince()])),
        day: 1, time: 0.3, weather: 'clear',
        grain: 40, tax: 'fair', ministers: {}, edicts: [], stations: ['rampur'], horse: false, mounted: false, petition: null,
    };
}

function newProvince() {
    return { ...Object.fromEntries(Object.keys(BUILDINGS).map(b => [b, 0])), mood: 60, focus: 'agriculture', farm: null, plan: {} };
}

function stats() {
    const l = player.lvl - 1;
    return {
        maxHp: 40 + 10 * l,
        maxPrana: 12 + 3 * l + (hasResearch('yoga') ? 10 : 0),
        atk: 8 + 2 * l + GEAR[player.weapon].atk + (hasResearch('wootz') ? 4 : 0),
        def: 3 + l + GEAR[player.armor].def + (hasResearch('iron') ? 4 : 0),
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

    // Farmland: Rampur's fields by the village, forest clearings, an oasis by the fort and mountain terraces
    const fields = (x1, y1, x2, y2) => {
        for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) {
            if (ground[idx(x, y)] === 'p') continue;
            ground[idx(x, y)] = 'a';
            objects[idx(x, y)] = '';
        }
    };
    fields(2, 28, 14, 29);
    fields(2, 9, 6, 12);
    fields(20, 23, 26, 26);
    fields(20, 6, 26, 9);
    clear(10, 8, 14, 12);
    clear(34, 7, 36, 9, 'n');

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
        const target = Math.round(r.count * (player.edicts.includes('ahimsa') ? 0.5 : 1));
        if (initial) { for (let i = count; i < target; i++) spawnEnemy(key); }
        else if (count < target && Math.random() < 0.3) spawnEnemy(key);
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
    moveReadyAt = now + stepTime();

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
    trail.unshift({ x: player.x, y: player.y });
    if (trail.length > 14) trail.length = 14;
    player.x = nx;
    player.y = ny;
    player.steps++;
    const scroll = SCROLLS.find(sc => sc.x === nx && sc.y === ny && !flags.scrolls.includes(sc.id));
    if (scroll) { held.clear(); collectScroll(scroll); }
    if (player.steps % 8 === 0) player.prana = Math.min(stats().maxPrana, player.prana + 1);
    if (player.steps % 10 === 0) save();
    discoverStations();

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

function approach(e, speed, dt) {
    for (const [r, k] of [['rx', 'x'], ['ry', 'y']]) {
        const d = e[k] - e[r];
        const stepLen = speed * dt;
        e[r] = Math.abs(d) <= stepLen ? e[k] : e[r] + Math.sign(d) * stepLen;
    }
}
