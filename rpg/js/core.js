'use strict';

// ---------- Constants ----------

const SAVE_KEY = 'legends-of-bharat-open-v1';
const STEP_MS = 150;

// Strength rises with distance from home: five tiers of danger.
const TIER_BASE = [
    { hp: 26, atk: 9, def: 2, xp: 12, gold: 6 },
    { hp: 52, atk: 15, def: 5, xp: 30, gold: 13 },
    { hp: 88, atk: 22, def: 8, xp: 58, gold: 22 },
    { hp: 130, atk: 29, def: 11, xp: 92, gold: 34 },
    { hp: 180, atk: 36, def: 14, xp: 135, gold: 48 },
];
const TIER_PREFIX = ['', 'Fierce ', 'Savage ', 'Dread ', 'Legendary '];

const ENEMY_KINDS = {
    boar: { name: 'Wild Boar', hp: 0.9, atk: 0.85 },
    jackal: { name: 'Jackal', hp: 0.75, atk: 0.9 },
    dacoit: { name: 'Dacoit', gold: 1.6 },
    cobra: { name: 'King Cobra', hp: 0.8, atk: 1.1 },
    tiger: { name: 'Bengal Tiger', hp: 1.3, atk: 1.15, xp: 1.3 },
    leopard: { name: 'Leopard', hp: 1.1, atk: 1.1, xp: 1.1 },
    snowleopard: { name: 'Snow Leopard', hp: 1.15, atk: 1.15, xp: 1.2 },
    scorpion: { name: 'Giant Scorpion', hp: 1.1, atk: 1.05, def: 1.2 },
    raider: { name: 'Desert Raider', hp: 1.2, atk: 1.1, gold: 2 },
    scout: { name: 'Rakshasa', hp: 1.3, atk: 1.15, gold: 1.5, xp: 1.3 },
    croc: { name: 'Mugger Crocodile', hp: 1.4, atk: 1.05, def: 1.3 },
};

const BOSS_KINDS = {
    chief: { title: 'Daku Sardar', intro: 'So you think you can clear my camp? My dacoits have ruled these roads for years!' },
    queen: { title: 'Scorpion Queen', intro: 'The sand heaves. A monstrous scorpion rises from its nest, tail dripping venom.' },
    rakshasa: { title: 'Rakshasa Lord', intro: 'Mortal! This cave and these mountains are mine. You will not leave.' },
    maneater: { title: 'Man-eater', intro: 'A huge tiger slips out of the undergrowth, eyes fixed on you. The villagers spoke true.' },
    mugger: { title: 'Great Mugger', intro: 'The water boils. An enormous crocodile drags itself onto the bank.' },
};

function makeFoe(kind, tier, boss = false) {
    const base = TIER_BASE[Math.max(0, Math.min(4, tier))];
    if (boss) {
        const b = BOSS_KINDS[kind];
        return { kind, boss: true, tier, name: `${TIER_PREFIX[tier]}${b.title}`.trim(), hp: Math.round(base.hp * 4.5), atk: Math.round(base.atk * 1.25), def: Math.round(base.def * 1.2), xp: base.xp * 4, gold: base.gold * 5 };
    }
    const k = ENEMY_KINDS[kind];
    return {
        kind, tier, name: `${TIER_PREFIX[tier]}${k.name}`,
        hp: Math.round(base.hp * (k.hp || 1)), atk: Math.round(base.atk * (k.atk || 1)), def: Math.round(base.def * (k.def || 1)),
        xp: Math.round(base.xp * (k.xp || 1)), gold: Math.round(base.gold * (k.gold || 1)),
    };
}

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

const SHOP_STOCK = {
    village: ['ladoo', 'tulsi', 'talwar', 'vest', 'horse'],
    town: ['ladoo', 'kheer', 'tulsi', 'talwar', 'khanda', 'vest', 'chainmail', 'horse'],
    fort: ['ladoo', 'kheer', 'khanda', 'chainmail', 'horse'],
    monastery: ['tulsi', 'kheer', 'ladoo', 'vest'],
    fishing: ['ladoo', 'kheer', 'tulsi', 'talwar'],
    ashram: ['tulsi', 'ladoo'],
};

const SKILLS = {
    vajra: { name: 'Vajra Strike', cost: 5, desc: 'A thunderous blow, 1.8x damage' },
    pranayama: { name: 'Pranayama', cost: 6, desc: 'Breathe deep and heal your wounds' },
    rockets: { name: 'Rocket Barrage', cost: 8, desc: 'Iron-cased rockets, 2.5x damage that ignores armour' },
};

// ---------- Game state ----------

let entities = [];
let player;
let flags;
let explored = null;
let ui = { dialog: null, battle: null, shop: null, menu: false, ending: false, newWorld: false };
let lastPlace = null;
let toastTimer = null;
let moveReadyAt = 0;
let lastHint = 0;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const $ = id => document.getElementById(id);

function newPlayer(home) {
    return {
        x: home.x, y: home.y + 1, rx: home.x, ry: home.y + 1,
        lvl: 1, xp: 0, hp: 40, prana: 12, gold: 30,
        weapon: 'lathi', armor: 'kurta', owned: ['lathi', 'kurta'],
        items: { ladoo: 3 }, skills: ['vajra'], steps: 0,
        rank: 0, renown: 0, knowledge: 0, squad: [], soldierSeq: 0, research: [],
        provinces: {},
        day: 1, time: 0.3, weather: 'clear',
        grain: 40, tax: 'fair', ministers: {}, edicts: [], stations: [home.id], horse: false, mounted: false, petition: null,
    };
}

function newProvince(s) {
    return { ...Object.fromEntries(Object.keys(BUILDINGS).map(b => [b, 0])), owned: !!s.home, favour: s.home ? 100 : 0, mood: 60, focus: 'agriculture', farm: null, plan: {} };
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

// ---------- Places ----------

function settlementById(id) {
    return WORLD.settlements.find(s => s.id === id);
}

function settlementAt(x, y) {
    return WORLD.settlements.find(s => Math.hypot(s.x - x, s.y - y) <= s.r + 1.5);
}

function biomeAt(x, y) {
    return inMap(x, y) ? biome[idx(x, y)] : 'peak';
}

function placeName(x, y) {
    const s = settlementAt(x, y);
    if (s) return s.name;
    return BIOMES[biomeAt(x, y)].name;
}

function compass(fx, fy, tx, ty) {
    const a = Math.atan2(ty - fy, tx - fx);
    return ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'][((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}

function walkable(x, y) {
    return inMap(x, y) && ground[idx(x, y)] !== '~' && ground[idx(x, y)] !== 'o' && !objects[idx(x, y)];
}

function entityAt(x, y) {
    return entities.find(e => e.x === x && e.y === y);
}

function occupied(x, y) {
    return (player.x === x && player.y === y) || !!entityAt(x, y);
}

function reveal(x, y, r = 8) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r || !inMap(x + dx, y + dy)) continue;
        explored[idx(x + dx, y + dy)] = 1;
    }
}

function encodeExplored() {
    let out = '';
    for (let i = 0; i < explored.length; i += 6) {
        let v = 0;
        for (let b = 0; b < 6; b++) v |= (explored[i + b] ? 1 : 0) << b;
        out += String.fromCharCode(48 + v);
    }
    return out;
}

function decodeExplored(str) {
    explored = new Uint8Array(MAP_W * MAP_H);
    if (!str) return;
    for (let k = 0; k < str.length; k++) {
        const v = str.charCodeAt(k) - 48;
        for (let b = 0; b < 6; b++) if (v & (1 << b)) explored[k * 6 + b] = 1;
    }
}

// ---------- People and creatures ----------

function spawnStatic() {
    entities = entities.filter(e => e.foe && !e.boss);
    for (const s of WORLD.settlements) {
        for (const n of s.npcs) entities.push({ npc: n.id, role: n.role, settlement: s.id, name: n.name, female: n.female, look: n.look, x: n.x, y: n.y, rx: n.x, ry: n.y });
    }
    for (const l of WORLD.lairs) {
        if (flags.cleared[l.id] !== undefined) continue;
        const kind = LAIR_TYPES[l.type].boss;
        const foe = makeFoe(kind, l.tier, true);
        entities.push({ kind, foe, boss: true, lair: l.id, x: l.x, y: l.y, rx: l.x, ry: l.y });
    }
}

const ENEMY_CAP = 12;

function spawnEnemy() {
    for (let tries = 0; tries < 30; tries++) {
        const a = Math.random() * Math.PI * 2;
        const d = rand(9, 19);
        const x = Math.round(player.x + Math.cos(a) * d);
        const y = Math.round(player.y + Math.sin(a) * d);
        if (!walkable(x, y) || occupied(x, y) || ground[idx(x, y)] === 'p') continue;
        if (WORLD.settlements.some(s => Math.hypot(s.x - x, s.y - y) < s.r + 4)) continue;
        const b = biomeAt(x, y);
        const table = BIOMES[b].spawn;
        if (!table) continue;
        const kind = pick(table);
        entities.push({ kind, foe: makeFoe(kind, tierAt(x, y)), region: b, x, y, rx: x, ry: y, nextMove: performance.now() + rand(400, 1400), stunUntil: 0 });
        return;
    }
}

function populate() {
    // Creatures live near the hero: far ones wander off, new ones appear just out of sight.
    entities = entities.filter(e => !e.region || Math.hypot(e.x - player.x, e.y - player.y) < 28);
    const cap = Math.round(ENEMY_CAP * (player.edicts.includes('ahimsa') ? 0.5 : 1));
    const n = entities.filter(e => e.region).length;
    for (let i = n; i < cap && i < n + 2; i++) spawnEnemy();
}

// ---------- Input and movement ----------

const held = new Set();
const KEYS = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function uiOpen() {
    return !!(ui.dialog || ui.battle || ui.shop || ui.menu || ui.ending || ui.newWorld);
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
        if (ent.npc) talkTo(ent);
        else encounter(ent);
        return;
    }
    if (!walkable(nx, ny)) {
        if (inMap(nx, ny) && now - lastHint > 2500) {
            const g = ground[idx(nx, ny)];
            const o = objects[idx(nx, ny)];
            const hint = g === 'o' ? 'The sea stretches away. Follow the coast.'
                : g === '~' ? 'Water blocks the way. Look for a bridge.'
                : o === 'M' ? 'Sheer peaks block the way. Roads find the passes.'
                : null;
            if (hint) { toast(hint); lastHint = now; }
        }
        return;
    }
    trail.unshift({ x: player.x, y: player.y });
    if (trail.length > 14) trail.length = 14;
    player.x = nx;
    player.y = ny;
    player.steps++;
    reveal(nx, ny);
    const scroll = WORLD.scrolls.find(sc => sc.x === nx && sc.y === ny && !flags.scrolls.includes(sc.id));
    if (scroll) { held.clear(); collectScroll(scroll); }
    if (player.steps % 8 === 0) player.prana = Math.min(stats().maxPrana, player.prana + 1);
    if (player.steps % 12 === 0) save();
    discoverStations();

    const here = settlementAt(nx, ny);
    const place = here ? here.id : biomeAt(nx, ny);
    if (place !== lastPlace) {
        if (lastPlace !== null && place !== 'water') showBanner(placeName(nx, ny));
        lastPlace = place;
    }
}

function encounter(ent) {
    if (ent.boss) {
        say(lines(ent.foe.name, BOSS_KINDS[ent.kind].intro), () => startBattle(ent));
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
        if (dist <= 5 && !settlementAt(player.x, player.y) && Math.random() < 0.7) {
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
            if (walkable(nx, ny) && !entityAt(nx, ny) && !WORLD.settlements.some(s => Math.hypot(s.x - nx, s.y - ny) < s.r + 3)) {
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
