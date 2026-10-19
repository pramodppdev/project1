'use strict';

// ---------- Procedural world generation ----------
// A world is fully determined by its seed and size: elevation, moisture and
// temperature noise decide the biomes, rivers run downhill to the sea or a lake,
// settlements are spread across good land and joined by roads, and lairs, fields
// and palm-leaf manuscripts are scattered over the map.

let MAP_W = 96;
let MAP_H = 96;
let ground = [];
let objects = [];
let biome = [];
let fieldOwner = [];
let WORLD = null;

const WORLD_SIZES = { small: 64, medium: 96, large: 128 };

const BIOMES = {
    grassland: { name: 'Grasslands', spawn: ['boar', 'boar', 'jackal', 'dacoit'], map: '#86a84e' },
    forest: { name: 'Forest', spawn: ['dacoit', 'cobra', 'tiger', 'boar'], map: '#3f6b33' },
    jungle: { name: 'Jungle', spawn: ['tiger', 'cobra', 'leopard'], map: '#2a5428' },
    savanna: { name: 'Scrubland', spawn: ['jackal', 'boar', 'raider'], map: '#b8a760' },
    desert: { name: 'Desert', spawn: ['scorpion', 'scorpion', 'raider'], map: '#e2c27d' },
    badlands: { name: 'Red plateau', spawn: ['dacoit', 'jackal', 'raider'], map: '#b0653a' },
    snow: { name: 'High mountains', spawn: ['snowleopard', 'scout'], map: '#e6ecf0' },
    marsh: { name: 'Marshes', spawn: ['croc', 'cobra'], map: '#5f7f50' },
    beach: { name: 'Coast', spawn: ['croc', 'jackal'], map: '#efdcaa' },
    water: { name: 'Lake', map: '#3b86c4' },
    ocean: { name: 'Sea', map: '#255a8a' },
    peak: { name: 'Peaks', map: '#8a8580' },
};

const GROUND_OF = { grassland: '.', forest: 'f', jungle: 'j', savanna: 'd', desert: 's', badlands: 'b', snow: 'n', marsh: 'q', beach: 'e', water: '~', ocean: 'o', peak: 'n' };

const idx = (x, y) => y * MAP_W + x;
const inMap = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

function mulberry32(seed) {
    return function () {
        seed |= 0;
        seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function lattice(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise2(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = lattice(xi, yi);
    const b = lattice(xi + 1, yi);
    const c = lattice(xi, yi + 1);
    const d = lattice(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y) {
    return noise2(x, y) * 0.5 + noise2(x * 2.03 + 5.2, y * 2.03 + 9.1) * 0.27 + noise2(x * 4.1 + 11.7, y * 4.1 + 3.3) * 0.15 + noise2(x * 8.3 + 1.9, y * 8.3 + 7.4) * 0.08;
}

// ---------- Names ----------

const NAME_PARTS = {
    start: ['Ram', 'Sita', 'Kesar', 'Chandan', 'Indra', 'Sona', 'Hari', 'Dev', 'Moti', 'Hira', 'Gauri', 'Lal', 'Neel', 'Amba', 'Kanak', 'Bel', 'Tulsi', 'Kamal', 'Surya', 'Chandra', 'Mohan', 'Nand', 'Bhav', 'Vijay', 'Kusum', 'Padma', 'Shanti', 'Ratan', 'Jai', 'Basant', 'Sagar', 'Prem', 'Megh', 'Arun', 'Dhan', 'Sundar', 'Madhu', 'Nila', 'Rang', 'Champa'],
    village: ['pur', 'gaon', 'pura', 'khera', 'wadi', 'palli', 'halli', 'ganj', 'nagar'],
    town: ['nagar', 'abad', 'ganj', 'pur', 'pet'],
    fort: ['garh', 'kot', 'durg', 'sar'],
    monastery: ['ling', 'gang', 'thang', 'tse'],
    fishing: ['bandar', 'kudi', 'patnam', 'kadavu'],
    ashram: ['van', 'kunj', 'dham', 'ashram'],
    givenM: ['Ramesh', 'Mohan', 'Gopal', 'Suresh', 'Arjan', 'Bhola', 'Kishan', 'Raghu', 'Shankar', 'Dinesh', 'Mahesh', 'Ravi', 'Ashok', 'Vikram', 'Hamid', 'Iqbal', 'Joseph', 'Gurdeep', 'Tenzin', 'Karma', 'Murugan', 'Venkat', 'Balwant', 'Prakash'],
    givenF: ['Kamala', 'Sarita', 'Meena', 'Lakshmi', 'Radha', 'Savitri', 'Farida', 'Zainab', 'Gurpreet', 'Pema', 'Anjali', 'Kaveri', 'Shobha', 'Usha', 'Parvati', 'Leela'],
};

function makeName(rng, kind) {
    const p = NAME_PARTS.start[Math.floor(rng() * NAME_PARTS.start.length)];
    const list = NAME_PARTS[kind] || NAME_PARTS.village;
    const s = list[Math.floor(rng() * list.length)];
    return p + s;
}

function personName(rng, female) {
    const list = female ? NAME_PARTS.givenF : NAME_PARTS.givenM;
    return list[Math.floor(rng() * list.length)];
}

// ---------- Generation ----------

function generateWorld(seed, sizeKey = 'medium', opts = {}) {
    const size = WORLD_SIZES[sizeKey] || 96;
    MAP_W = MAP_H = size;
    const N = size * size;
    const rng = mulberry32(seed);
    const off = () => rng() * 1000;
    const [eox, eoy, mox, moy, tox, toy] = [off(), off(), off(), off(), off(), off()];
    const scale = 1 / Math.max(11, size / 6.5);
    const coast = ['south', 'west', 'east', 'south', 'none'][Math.floor(rng() * 5)];
    const northRange = rng() < 0.75;

    const elev = new Float32Array(N);
    const moist = new Float32Array(N);
    const temp = new Float32Array(N);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let e = (fbm(x * scale + eox, y * scale + eoy) - 0.5) * 1.6 + 0.5;
            const edge = { south: (size - 1 - y), west: x, east: (size - 1 - x), none: size }[coast];
            if (coast !== 'none') e -= Math.max(0, 1 - edge / (size * 0.28)) * 0.42;
            if (northRange) e += Math.max(0, 0.25 - y / size) * 1.4;
            let m = (fbm(x * scale * 1.1 + mox, y * scale * 1.1 + moy) - 0.5) * 1.9 + 0.5;
            if (coast !== 'none') m += Math.max(0, 1 - edge / (size * 0.35)) * 0.15;
            const t = 0.25 + 0.8 * (y / size) + (fbm(x * scale * 0.6 + tox, y * scale * 0.6 + toy) - 0.5) * 0.4 - Math.max(0, e - 0.6) * 1.3;
            elev[idx(x, y)] = e;
            moist[idx(x, y)] = m;
            temp[idx(x, y)] = t;
        }
    }

    ground = new Array(N);
    objects = new Array(N).fill('');
    biome = new Array(N);
    fieldOwner = new Array(N).fill(null);

    // Low land touching the map edge becomes sea; enclosed low land becomes lakes.
    const low = i => elev[i] < 0.3;
    const lake = i => elev[i] < 0.26;
    const sea = new Uint8Array(N);
    const queue = [];
    for (let i = 0; i < N; i++) {
        const x = i % size;
        const y = Math.floor(i / size);
        if ((x === 0 || y === 0 || x === size - 1 || y === size - 1) && low(i)) { sea[i] = 1; queue.push(i); }
    }
    while (queue.length) {
        const i = queue.pop();
        const x = i % size;
        const y = Math.floor(i / size);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx;
            const ny = y + dy;
            if (!inMap(nx, ny)) continue;
            const j = idx(nx, ny);
            if (!sea[j] && low(j)) { sea[j] = 1; queue.push(j); }
        }
    }

    const nearSea = (x, y, r) => {
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            if (inMap(x + dx, y + dy) && sea[idx(x + dx, y + dy)]) return true;
        }
        return false;
    };

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = idx(x, y);
            const e = elev[i];
            const m = moist[i];
            const t = temp[i];
            let b;
            let o = '';
            const r = rng();
            if (sea[i]) b = 'ocean';
            else if (lake(i)) b = 'water';
            else if (e > 0.8) { b = 'peak'; o = 'M'; }
            else if (t < 0.3) { b = 'snow'; if (r < 0.2) o = 'P'; }
            else if (e < 0.37 && nearSea(x, y, 1)) { b = 'beach'; if (r < 0.1) o = 'L'; }
            else if (m > 0.7 && e < 0.43) { b = 'marsh'; if (r < 0.12) o = 'G'; else if (r < 0.2) b = 'water'; }
            else if (m < 0.28) {
                if (t > 0.55) { b = 'desert'; if (r < 0.03) o = 'c'; else if (r < 0.045) o = 'k'; }
                else { b = 'badlands'; if (r < 0.07) o = 'k'; else if (r < 0.09) o = 'c'; }
            } else if (m < 0.4) {
                if (e > 0.56) { b = 'badlands'; if (r < 0.07) o = 'k'; else if (r < 0.09) o = 'c'; }
                else { b = 'savanna'; if (r < 0.06) o = 'c'; }
            } else if (m < 0.55) { b = 'grassland'; if (r < 0.04) o = 'T'; }
            else if (m < 0.7 || t < 0.55) { b = 'forest'; if (r < 0.32) o = 'T'; else if (r < 0.36) o = 'Y'; }
            else { b = 'jungle'; if (r < 0.28) o = 'J'; else if (r < 0.36) o = 'T'; else if (r < 0.43) o = 'Y'; }
            if (b === 'beach' && o === '' && rng() < 0.03) o = 'L';
            biome[i] = b;
            ground[i] = GROUND_OF[b];
            objects[i] = o;
        }
    }

    carveRivers(rng, elev, size);

    // A ring of impassable land (or open sea) keeps travellers on the map.
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (x > 1 && y > 1 && x < size - 2 && y < size - 2) continue;
            const i = idx(x, y);
            if (ground[i] === 'o' || ground[i] === '~') continue;
            objects[i] = biome[i] === 'beach' || biome[i] === 'desert' ? 'k' : biome[i] === 'snow' || biome[i] === 'peak' || biome[i] === 'badlands' ? 'M' : 'T';
        }
    }

    // Strategy maps only need the land itself; the RTS game places its own bases and resources.
    if (opts.terrainOnly) {
        WORLD = { seed, sizeKey, size, coast, northRange, settlements: [], lairs: [], scrolls: [], home: null, rng, elev };
        return WORLD;
    }

    const settlements = placeSettlements(rng, size, elev);
    const lairs = placeLairs(rng, size, settlements);
    connectRoads(settlements, lairs);
    for (const s of settlements) layoutSettlement(s, rng);
    for (const l of lairs) layoutLair(l, rng);
    const reach = reachableFrom(settlements.find(s => s.home));
    const scrolls = placeScrolls(rng, size, settlements, reach);

    const home = settlements.find(s => s.home);
    WORLD = { seed, sizeKey, size, coast, northRange, settlements, lairs, scrolls, home };
    return WORLD;
}

function carveRivers(rng, elev, size) {
    const sources = [];
    for (let tries = 0; tries < 400 && sources.length < 3 + Math.floor(size / 32); tries++) {
        const x = 3 + Math.floor(rng() * (size - 6));
        const y = 3 + Math.floor(rng() * (size - 6));
        const e = elev[idx(x, y)];
        if (e > 0.6 && e < 0.76 && ground[idx(x, y)] !== '~' && ground[idx(x, y)] !== 'o') sources.push([x, y]);
    }
    for (const [sx, sy] of sources) {
        let x = sx;
        let y = sy;
        const seen = new Set();
        for (let step = 0; step < size * 3; step++) {
            const i = idx(x, y);
            if (ground[i] === 'o' || (ground[i] === '~' && step > 0 && !seen.has(i))) break;
            seen.add(i);
            ground[i] = '~';
            biome[i] = 'water';
            objects[i] = '';
            let best = null;
            let bestE = Infinity;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx;
                const ny = y + dy;
                if (!inMap(nx, ny) || seen.has(idx(nx, ny))) continue;
                const ne = elev[idx(nx, ny)] + rng() * 0.02;
                if (ne < bestE) { bestE = ne; best = [nx, ny]; }
            }
            if (!best) break;
            if (bestE > elev[i] + 0.015) {
                // A basin: let a small lake form and stop.
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    if (inMap(x + dx, y + dy)) { ground[idx(x + dx, y + dy)] = '~'; biome[idx(x + dx, y + dy)] = 'water'; objects[idx(x + dx, y + dy)] = ''; }
                }
                break;
            }
            elev[idx(best[0], best[1])] = Math.min(elev[idx(best[0], best[1])], elev[i]);
            [x, y] = best;
        }
    }
}

function clearOf(x, y, r, test) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (!inMap(x + dx, y + dy) || test(idx(x + dx, y + dy))) return false;
    }
    return true;
}

function placeSettlements(rng, size, elev) {
    const target = Math.max(5, Math.round((size * size) / 900));
    const minDist = size * 0.15;
    const out = [];
    const counts = { ashram: 0 };
    for (let tries = 0; tries < 3000 && out.length < target; tries++) {
        const x = 7 + Math.floor(rng() * (size - 14));
        const y = 7 + Math.floor(rng() * (size - 14));
        const b = biome[idx(x, y)];
        if (['ocean', 'water', 'peak', 'marsh', 'beach'].includes(b)) continue;
        if (out.some(s => Math.hypot(s.x - x, s.y - y) < minDist)) continue;
        if (!clearOf(x, y, 4, i => ground[i] === '~' || ground[i] === 'o' || objects[i] === 'M')) continue;
        const coastal = !clearOf(x, y, 9, i => ground[i] === 'o');
        let type;
        if (b === 'snow') type = 'monastery';
        else if (coastal) type = 'fishing';
        else if (b === 'desert' || b === 'badlands') type = rng() < 0.6 ? 'fort' : 'village';
        else if ((b === 'forest' || b === 'jungle') && counts.ashram < 2 && rng() < 0.35) type = 'ashram';
        else if (b === 'grassland' || b === 'savanna') type = rng() < 0.45 ? 'town' : 'village';
        else type = 'village';
        if (type === 'ashram') counts.ashram++;
        out.push({ id: `s${out.length}`, x, y, type, biome: b, name: makeName(rng, type) });
    }
    if (!out.length) {
        // A world with no good land still needs a home: clear one in the middle.
        const x = Math.floor(size / 2);
        const y = Math.floor(size / 2);
        for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
            const i = idx(x + dx, y + dy);
            ground[i] = '.';
            biome[i] = 'grassland';
            objects[i] = '';
        }
        out.push({ id: 's0', x, y, type: 'village', biome: 'grassland', name: makeName(rng, 'village') });
    }
    // Home is the farming village nearest the middle of good land.
    const good = out.filter(s => ['grassland', 'forest', 'savanna', 'jungle'].includes(s.biome) && s.type !== 'ashram');
    const pool = good.length ? good : out;
    pool.sort((a, b) => Math.hypot(a.x - size / 2, a.y - size / 2) - Math.hypot(b.x - size / 2, b.y - size / 2));
    const home = pool[0];
    home.home = true;
    home.type = 'village';
    if (!out.some(s => s.type === 'ashram')) home.guru = true;
    for (const s of out) {
        s.r = { village: 4, town: 5, fort: 5, monastery: 3, fishing: 3, ashram: 2 }[s.type];
        s.dist = Math.hypot(s.x - home.x, s.y - home.y);
    }
    return out;
}

function placeLairs(rng, size, settlements) {
    const target = Math.max(4, Math.round((size * size) / 1100));
    const out = [];
    for (let tries = 0; tries < 3000 && out.length < target; tries++) {
        const x = 4 + Math.floor(rng() * (size - 8));
        const y = 4 + Math.floor(rng() * (size - 8));
        const b = biome[idx(x, y)];
        if (['ocean', 'water', 'peak'].includes(b)) continue;
        if (settlements.some(s => Math.hypot(s.x - x, s.y - y) < 11)) continue;
        if (out.some(l => Math.hypot(l.x - x, l.y - y) < 9)) continue;
        if (!clearOf(x, y, 2, i => ground[i] === '~' || ground[i] === 'o' || objects[i] === 'M')) continue;
        out.push(makeLair(rng, x, y, b, out.length, settlements));
    }
    return out;
}

const LAIR_TYPES = {
    camp: { boss: 'chief', name: 'Bandit camp' },
    nest: { boss: 'queen', name: 'Scorpion nest' },
    cave: { boss: 'rakshasa', name: 'Rakshasa cave' },
    den: { boss: 'maneater', name: "Man-eater's den" },
    croc: { boss: 'mugger', name: 'Mugger pool' },
};

function makeLair(rng, x, y, b, n, settlements) {
    const type = b === 'desert' ? (rng() < 0.6 ? 'nest' : 'camp')
        : b === 'snow' ? 'cave'
        : b === 'jungle' ? 'den'
        : b === 'forest' ? (rng() < 0.5 ? 'den' : 'camp')
        : b === 'marsh' || b === 'beach' ? 'croc'
        : 'camp';
    const home = settlements.find(s => s.home);
    const near = settlements.slice().sort((a, c) => Math.hypot(a.x - x, a.y - y) - Math.hypot(c.x - x, c.y - y))[0];
    return { id: `l${n}`, x, y, type, biome: b, tier: Math.min(4, tierAt(x, y, home) + 1), near: near.id, name: `${LAIR_TYPES[type].name} near ${near.name}` };
}

function tierAt(x, y, home = WORLD && WORLD.home) {
    const d = Math.hypot(x - home.x, y - home.y);
    const step = MAP_W * 0.15;
    let t = Math.max(0, Math.floor((d - 7) / step));
    if (biome[idx(x, y)] === 'snow') t++;
    return Math.min(4, t);
}

// ---------- Roads ----------

function stepCost(i) {
    const g = ground[i];
    const o = objects[i];
    if (g === 'o') return 40;
    if (o === 'W' || o === 'H' || o === 'K' || o === 'w' || o === 'X' || o === 'g') return Infinity;
    if (g === 'p' || g === '=') return 0.6;
    let c = { '.': 1, d: 1.1, s: 1.4, b: 1.3, f: 1.5, j: 1.9, n: 2, q: 2.6, e: 1.2, a: 1.2, '~': 7 }[g] || 1.5;
    if (o === 'M') c += 14;
    else if (o) c += 1.2;
    return c;
}

function findPath(ax, ay, bx, by) {
    const N = MAP_W * MAP_H;
    const dist = new Float32Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const open = [[0, idx(ax, ay)]];
    dist[idx(ax, ay)] = 0;
    const goal = idx(bx, by);
    // A small binary heap keeps the search fast on big maps.
    const push = (item) => {
        open.push(item);
        let i = open.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (open[p][0] <= open[i][0]) break;
            [open[p], open[i]] = [open[i], open[p]];
            i = p;
        }
    };
    const popMin = () => {
        const top = open[0];
        const last = open.pop();
        if (open.length) {
            open[0] = last;
            let i = 0;
            for (;;) {
                const l = i * 2 + 1;
                const r = l + 1;
                let m = i;
                if (l < open.length && open[l][0] < open[m][0]) m = l;
                if (r < open.length && open[r][0] < open[m][0]) m = r;
                if (m === i) break;
                [open[m], open[i]] = [open[i], open[m]];
                i = m;
            }
        }
        return top;
    };
    while (open.length) {
        const [, cur] = popMin();
        if (cur === goal) break;
        const cx = cur % MAP_W;
        const cy = Math.floor(cur / MAP_W);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 2 || ny < 2 || nx > MAP_W - 3 || ny > MAP_H - 3) continue;
            const j = idx(nx, ny);
            const c = j === goal ? 1 : stepCost(j);
            if (c === Infinity) continue;
            const nd = dist[cur] + c;
            if (nd < dist[j]) {
                dist[j] = nd;
                prev[j] = cur;
                push([nd + Math.abs(nx - bx) + Math.abs(ny - by), j]);
            }
        }
    }
    if (prev[goal] === -1) return null;
    const path = [];
    for (let c = goal; c !== -1; c = prev[c]) path.push(c);
    return path.reverse();
}

function carvePath(path) {
    for (const i of path) {
        if (ground[i] === '~' || ground[i] === 'o') { ground[i] = '='; objects[i] = ''; continue; }
        if (ground[i] === '=' || ground[i] === 'a') continue;
        ground[i] = 'p';
        objects[i] = '';
    }
}

function connectRoads(settlements, lairs) {
    // Prim's algorithm joins every settlement, then a few extra roads add loops.
    const inTree = [settlements[0]];
    const rest = settlements.slice(1);
    const edges = [];
    while (rest.length) {
        let best = null;
        for (const a of inTree) for (const b of rest) {
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (!best || d < best.d) best = { a, b, d };
        }
        edges.push(best);
        inTree.push(best.b);
        rest.splice(rest.indexOf(best.b), 1);
    }
    const extra = settlements.flatMap((a, i) => settlements.slice(i + 1).map(b => ({ a, b, d: Math.hypot(a.x - b.x, a.y - b.y) })))
        .filter(e => !edges.some(f => (f.a === e.a && f.b === e.b) || (f.a === e.b && f.b === e.a)))
        .sort((p, q) => p.d - q.d)
        .slice(0, Math.ceil(settlements.length / 3));
    for (const e of [...edges, ...extra]) {
        const path = findPath(e.a.x, e.a.y, e.b.x, e.b.y);
        if (path) carvePath(path);
    }
    // Every lair also gets a faint trail from its nearest road, so all of them can be reached.
    for (const l of lairs) {
        const s = settlements.find(q => q.id === l.near);
        const path = findPath(l.x, l.y, s.x, s.y);
        if (path) carvePath(path.slice(0, Math.max(1, path.length - 1)));
    }
}

// ---------- Settlement and lair layout ----------

function setTile(x, y, g, o = '') {
    if (!inMap(x, y)) return;
    const i = idx(x, y);
    if (g) { ground[i] = g; biome[i] = biome[i] === 'water' ? 'grassland' : biome[i]; }
    objects[i] = o;
}

function freeTile(x, y) {
    return inMap(x, y) && ground[idx(x, y)] !== '~' && ground[idx(x, y)] !== 'o' && ground[idx(x, y)] !== '=' && !objects[idx(x, y)];
}

function buildable(x, y) {
    return freeTile(x, y) && ground[idx(x, y)] !== 'p' && ground[idx(x, y)] !== 'a';
}

function layoutSettlement(s, rng) {
    const { x, y, r } = s;
    const base = s.biome === 'snow' ? 'n' : s.biome === 'desert' ? 's' : s.biome === 'badlands' ? 'b' : '.';
    for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) {
        if (dx * dx + dy * dy > (r + 1.2) * (r + 1.2)) continue;
        const tx = x + dx;
        const ty = y + dy;
        if (!inMap(tx, ty) || ground[idx(tx, ty)] === 'o') continue;
        const g = ground[idx(tx, ty)];
        if (g === 'p' || g === '=') { objects[idx(tx, ty)] = ''; continue; }
        setTile(tx, ty, g === '~' ? base : (dx * dx + dy * dy <= 2 ? 'p' : base));
        biome[idx(tx, ty)] = s.biome;
    }
    const houses = { village: 7, town: 11, fort: 5, monastery: 5, fishing: 6, ashram: 2 }[s.type];
    const ring = Math.max(2, r - 1);
    let placed = 0;
    for (let k = 0; k < 40 && placed < houses; k++) {
        const a = rng() * Math.PI * 2;
        const d = ring - rng() * 1.2 + (s.type === 'town' ? rng() * 1.5 : 0);
        const hx = Math.round(x + Math.cos(a) * d);
        const hy = Math.round(y + Math.sin(a) * d);
        if (Math.abs(hx - x) <= 1 && Math.abs(hy - y) <= 1) continue;
        if (!buildable(hx, hy)) continue;
        objects[idx(hx, hy)] = 'H';
        placed++;
    }
    const temple = s.type === 'monastery' ? 'g' : 'K';
    if (buildable(x, y - 2)) objects[idx(x, y - 2)] = temple;
    else if (buildable(x - 2, y)) objects[idx(x - 2, y)] = temple;
    else if (buildable(x + 2, y)) objects[idx(x + 2, y)] = temple;
    if (s.type !== 'ashram' && buildable(x + 2, y + 1)) objects[idx(x + 2, y + 1)] = 'w';
    if (s.type === 'town') for (const [mx, my] of [[x - 1, y + 2], [x + 1, y + 2], [x + 2, y - 1]]) if (buildable(mx, my)) objects[idx(mx, my)] = 'V';
    if (s.type === 'fort') {
        const R = r;
        for (let k = -R; k <= R; k++) {
            for (const [wx, wy] of [[x + k, y - R], [x + k, y + R], [x - R, y + k], [x + R, y + k]]) {
                if (!inMap(wx, wy)) continue;
                const gate = wx === x || wy === y || ground[idx(wx, wy)] === 'p' || ground[idx(wx, wy)] === '=';
                if (gate) { if (ground[idx(wx, wy)] !== '=') setTile(wx, wy, 'p', ''); continue; }
                objects[idx(wx, wy)] = Math.abs(k) === R ? 'X' : 'W';
            }
        }
    }
    if (s.type === 'fishing') {
        s.boats = [];
        for (let k = 0; k < 40 && s.boats.length < 3; k++) {
            const bx = x + Math.round((rng() - 0.5) * 16);
            const by = y + Math.round((rng() - 0.5) * 16);
            if (inMap(bx, by) && ground[idx(bx, by)] === 'o') s.boats.push([bx, by]);
        }
    }

    // Townsfolk stand around the open square.
    const roles = { village: ['headman', 'merchant', 'healer', 'carter'], town: ['headman', 'merchant', 'healer', 'recruiter', 'carter', 'trader'], fort: ['headman', 'merchant', 'recruiter', 'carter'], monastery: ['headman', 'healer', 'merchant', 'carter'], fishing: ['headman', 'merchant', 'healer', 'carter'], ashram: ['guru', 'healer', 'carter'] }[s.type].slice();
    if (s.guru) roles.push('guru');
    if (s.home) roles.push('recruiter');
    const spots = [];
    for (let rr = 1; rr <= r + 1 && spots.length < roles.length + 2; rr++) {
        for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue;
            if ((dx === 0 && dy === 0) || dx === 0 || dy === 0) continue;
            const tx = x + dx;
            const ty = y + dy;
            if (freeTile(tx, ty) && !spots.some(([a, b]) => Math.abs(a - tx) + Math.abs(b - ty) < 2)) spots.push([tx, ty]);
        }
    }
    s.npcs = roles.map((role, i) => {
        const [nx, ny] = spots[i] || [x + i - 2, y + 1];
        const female = role === 'healer' ? rng() < 0.7 : rng() < 0.3;
        return { id: `${s.id}:${role}`, role, x: nx, y: ny, female, name: personName(rng, female), look: Math.floor(rng() * 1e6) };
    });
    const cartSpot = spots[roles.length] || [x + 1, y + 2];
    s.cart = [cartSpot[0] + 0.3, cartSpot[1] + 0.2];

    // Fields: rectangular plots just outside the settlement on workable land.
    s.fieldTiles = 0;
    if (s.type !== 'monastery' || rng() < 0.6) {
        const plots = { village: 3, town: 3, fort: 2, monastery: 1, fishing: 1, ashram: 1 }[s.type];
        for (let k = 0, made = 0; k < 60 && made < plots; k++) {
            const a = rng() * Math.PI * 2;
            const d = r + 2.5 + rng() * 2;
            const fx = Math.round(x + Math.cos(a) * d) - 2;
            const fy = Math.round(y + Math.sin(a) * d) - 1;
            let ok = true;
            for (let ty = fy; ty < fy + 3 && ok; ty++) for (let tx = fx; tx < fx + 4 && ok; tx++) {
                if (!inMap(tx, ty) || tx < 3 || ty < 3 || tx > MAP_W - 4 || ty > MAP_H - 4) ok = false;
                else if (['~', 'o', '=', 'p'].includes(ground[idx(tx, ty)]) || ['H', 'K', 'W', 'X', 'M', 'g', 'w', 'V'].includes(objects[idx(tx, ty)]) || fieldOwner[idx(tx, ty)]) ok = false;
            }
            if (!ok) continue;
            for (let ty = fy; ty < fy + 3; ty++) for (let tx = fx; tx < fx + 4; tx++) {
                ground[idx(tx, ty)] = 'a';
                objects[idx(tx, ty)] = '';
                fieldOwner[idx(tx, ty)] = s.id;
                s.fieldTiles++;
            }
            made++;
        }
    }
    if (s.biome === 'desert') for (let k = 0; k < 6; k++) {
        const px = x + Math.round((rng() - 0.5) * (r * 2 + 4));
        const py = y + Math.round((rng() - 0.5) * (r * 2 + 4));
        if (freeTile(px, py) && ground[idx(px, py)] !== 'p' && ground[idx(px, py)] !== 'a' && Math.hypot(px - x, py - y) > 2) objects[idx(px, py)] = 'L';
    }
}

function layoutLair(l, rng) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const tx = l.x + dx;
        const ty = l.y + dy;
        if (inMap(tx, ty) && ground[idx(tx, ty)] !== '~' && ground[idx(tx, ty)] !== 'o' && ground[idx(tx, ty)] !== 'p' && ground[idx(tx, ty)] !== '=') objects[idx(tx, ty)] = '';
    }
    const put = (dx, dy, o) => { if (buildable(l.x + dx, l.y + dy)) objects[idx(l.x + dx, l.y + dy)] = o; };
    if (l.type === 'camp') { put(-1, -1, 'A'); put(1, -1, 'A'); put(0, -2, 'F'); put(-2, 1, 'A'); }
    else if (l.type === 'cave') { put(0, -1, 'C'); put(-1, -1, 'M'); put(1, -1, 'M'); put(-2, 0, 'k'); }
    else if (l.type === 'nest') { put(-1, -1, 'k'); put(1, 1, 'k'); put(2, -1, 'k'); put(-2, 1, 'k'); }
    else if (l.type === 'den') { put(-1, -1, 'k'); put(1, -1, 'k'); put(0, -2, 'k'); }
    else { put(-1, -1, 'G'); put(1, -1, 'G'); if (buildable(l.x, l.y - 2)) ground[idx(l.x, l.y - 2)] = '~'; }
}

function reachableFrom(s) {
    const seen = new Uint8Array(MAP_W * MAP_H);
    const stack = [idx(s.x, s.y)];
    seen[stack[0]] = 1;
    while (stack.length) {
        const i = stack.pop();
        const x = i % MAP_W;
        const y = Math.floor(i / MAP_W);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx;
            const ny = y + dy;
            if (!inMap(nx, ny)) continue;
            const j = idx(nx, ny);
            if (seen[j] || ground[j] === '~' || ground[j] === 'o' || objects[j]) continue;
            seen[j] = 1;
            stack.push(j);
        }
    }
    return seen;
}

function placeScrolls(rng, size, settlements, reach) {
    const out = [];
    const home = settlements.find(s => s.home);
    for (let tries = 0; tries < 4000 && out.length < SCROLL_FACTS.length; tries++) {
        const x = 3 + Math.floor(rng() * (size - 6));
        const y = 3 + Math.floor(rng() * (size - 6));
        if (!freeTile(x, y) || ground[idx(x, y)] === 'a' || !reach[idx(x, y)]) continue;
        if (Math.hypot(x - home.x, y - home.y) < 7) continue;
        if (settlements.some(s => Math.hypot(s.x - x, s.y - y) < s.r + 2)) continue;
        if (out.some(o => Math.hypot(o.x - x, o.y - y) < size * 0.12)) continue;
        out.push({ ...SCROLL_FACTS[out.length], x, y });
    }
    return out;
}
