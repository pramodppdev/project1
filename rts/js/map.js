'use strict';

// ---------- Strategy map: bases, resources, occupancy and pathfinding ----------

let occ = null;          // building id occupying each tile (0 = none)
let resLeft = null;      // remaining amount for resource tiles (trees, mines, bushes)

function tileRes(i) {
    const r = RESOURCE_OBJECTS[objects[i]];
    if (!r) return null;
    if (!resLeft.has(i)) resLeft.set(i, r.amount);
    return { res: r.res, left: resLeft.get(i) };
}

function takeRes(i, amt) {
    const r = tileRes(i);
    if (!r) return 0;
    const got = Math.min(amt, r.left);
    const left = r.left - got;
    if (left <= 0.01) {
        resLeft.delete(i);
        objects[i] = '';
        vegDirty = true;
    } else {
        resLeft.set(i, left);
    }
    return got;
}

function passable(x, y) {
    if (!inMap(x, y)) return false;
    const i = idx(x, y);
    const g = ground[i];
    if (g === '~' || g === 'o' || objects[i]) return false;
    const b = occ[i];
    if (b) {
        const e = G.ents.get(b);
        if (e && !(e.def.walkable && e.built) && !(e.def.gate && e.built && friendly(G.pathOwner, e.owner))) return false;
    }
    return true;
}

function buildable(x, y) {
    if (!inMap(x, y) || x < 2 || y < 2 || x > MAP_W - 3 || y > MAP_H - 3) return false;
    const i = idx(x, y);
    return ground[i] !== '~' && ground[i] !== 'o' && ground[i] !== '=' && !objects[i] && !occ[i];
}

function footprintFree(type, tx, ty) {
    const n = BUILDING_TYPES[type].size;
    for (let y = ty; y < ty + n; y++) for (let x = tx; x < tx + n; x++) {
        if (!buildable(x, y)) return false;
        for (const u of unitsNearTile(x, y)) if (Math.abs(u.x - x) < 0.6 && Math.abs(u.y - y) < 0.6 && u.def.cls !== 'animal') return false;
    }
    return true;
}

// ---------- Map setup ----------

function clearArea(cx, cy, r, base) {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
        if (!inMap(x, y) || (x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        const i = idx(x, y);
        objects[i] = '';
        if (ground[i] === '~' || ground[i] === 'o') { ground[i] = base; biome[i] = 'grassland'; }
        if (biome[i] === 'peak') biome[i] = 'snow';
    }
}

function freeSpot(x, y) {
    return inMap(x, y) && x > 2 && y > 2 && x < MAP_W - 3 && y < MAP_H - 3 && !objects[idx(x, y)] && !['~', 'o', '=', 'p'].includes(ground[idx(x, y)]);
}

function placeCluster(rng, cx, cy, ch, count, avoid) {
    const out = [];
    const queue = [[cx, cy]];
    const seen = new Set();
    while (queue.length && out.length < count) {
        const [x, y] = queue.shift();
        const k = `${x},${y}`;
        if (seen.has(k)) continue;
        seen.add(k);
        if (freeSpot(x, y) && !avoid.some(([ax, ay, r]) => Math.hypot(ax - x, ay - y) < r)) {
            objects[idx(x, y)] = ch;
            out.push([x, y]);
        }
        if (seen.size > 200) break;
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]].sort(() => rng() - 0.5)) queue.push([x + dx, y + dy]);
    }
    return out;
}

function ringPoint(rng, cx, cy, dmin, dmax, avoid) {
    for (let t = 0; t < 60; t++) {
        const a = rng() * Math.PI * 2;
        const d = dmin + rng() * (dmax - dmin);
        const x = Math.round(cx + Math.cos(a) * d);
        const y = Math.round(cy + Math.sin(a) * d);
        if (freeSpot(x, y) && !avoid.some(([ax, ay, r]) => Math.hypot(ax - x, ay - y) < r)) return [x, y];
    }
    return [Math.round(cx + dmin), cy];
}

function woodNear(cx, cy, r) {
    let n = 0;
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
        if (inMap(x, y) && RESOURCE_OBJECTS[objects[idx(x, y)]] && RESOURCE_OBJECTS[objects[idx(x, y)]].res === 'wood') n++;
    }
    return n;
}

function setupMap(seed, sizeKey, nPlayers) {
    generateWorld(seed, sizeKey, { terrainOnly: true });
    const rng = WORLD.rng;
    const N = MAP_W * MAP_H;
    occ = new Int32Array(N);
    resLeft = new Map();
    const starts = [];
    const good = (x, y) => {
        if (x < 10 || y < 10 || x > MAP_W - 11 || y > MAP_H - 11) return false;
        let bad = 0;
        for (let yy = -5; yy <= 5; yy += 2) for (let xx = -5; xx <= 5; xx += 2) {
            const i = idx(x + xx, y + yy);
            if (ground[i] === '~' || ground[i] === 'o' || objects[i] === 'M') bad++;
        }
        return bad <= 3;
    };
    if (nPlayers <= 4) {
        const a0 = rng() * Math.PI * 2;
        for (let p = 0; p < nPlayers; p++) {
            const a = a0 + (p / nPlayers) * Math.PI * 2;
            const tx = Math.round(MAP_W / 2 + Math.cos(a) * MAP_W * 0.31);
            const ty = Math.round(MAP_H / 2 + Math.sin(a) * MAP_H * 0.31);
            let best = [tx, ty];
            let bestScore = -Infinity;
            for (let dy = -14; dy <= 14; dy++) for (let dx = -14; dx <= 14; dx++) {
                const x = tx + dx;
                const y = ty + dy;
                if (x < 9 || y < 9 || x > MAP_W - 10 || y > MAP_H - 10) continue;
                let bad = 0;
                for (let yy = -6; yy <= 6; yy++) for (let xx = -6; xx <= 6; xx++) {
                    const i = idx(x + xx, y + yy);
                    if (ground[i] === '~' || ground[i] === 'o' || objects[i] === 'M') bad++;
                }
                const score = -bad * 10 - Math.hypot(dx, dy);
                if (score > bestScore) { bestScore = score; best = [x, y]; }
            }
            starts.push(best);
        }
    } else {
        // Many kingdoms: spread capitals over the land, each as far as possible from the others.
        const cands = [];
        for (let y = 10; y < MAP_H - 10; y += 3) for (let x = 10; x < MAP_W - 10; x += 3) if (good(x, y)) cands.push([x, y]);
        let first = cands[Math.floor(rng() * cands.length)];
        starts.push(first);
        const dmin = cands.map(([x, y]) => Math.hypot(x - first[0], y - first[1]));
        while (starts.length < nPlayers && cands.length) {
            let bi = 0;
            for (let k = 1; k < cands.length; k++) if (dmin[k] > dmin[bi]) bi = k;
            const pick = cands[bi];
            starts.push(pick);
            for (let k = 0; k < cands.length; k++) dmin[k] = Math.min(dmin[k], Math.hypot(cands[k][0] - pick[0], cands[k][1] - pick[1]));
        }
    }
    for (const [x, y] of starts) clearArea(x, y, 7, '.');

    // Roads join each capital to its nearest neighbours so no army is ever cut off.
    const joined = new Set();
    const road = (a, b) => {
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        if (joined.has(key)) return;
        joined.add(key);
        const path = findPath(starts[a][0], starts[a][1], starts[b][0], starts[b][1]);
        if (path) carvePath(path);
    };
    for (let p = 0; p < nPlayers; p++) {
        const order = starts.map((s2, q) => [q, Math.hypot(s2[0] - starts[p][0], s2[1] - starts[p][1])]).filter(([q]) => q !== p).sort((a, b) => a[1] - b[1]);
        for (const [q] of order.slice(0, nPlayers <= 4 ? nPlayers - 1 : 2)) road(p, q);
    }
    if (nPlayers <= 4) {
        const center = [Math.floor(MAP_W / 2), Math.floor(MAP_H / 2)];
        for (const [x, y] of starts) {
            const path = findPath(x, y, center[0], center[1]);
            if (path) carvePath(path);
        }
    }

    for (const [x, y] of starts) {
        const avoid = [[x, y, 4.5]];
        const berries = ringPoint(rng, x, y, 5, 6.5, avoid);
        placeCluster(rng, berries[0], berries[1], '*', 6, avoid);
        const gold = ringPoint(rng, x, y, 8, 10, avoid.concat([[berries[0], berries[1], 4]]));
        placeCluster(rng, gold[0], gold[1], '$', 6, avoid);
        const stone = ringPoint(rng, x, y, 8, 10, avoid.concat([[gold[0], gold[1], 5]]));
        placeCluster(rng, stone[0], stone[1], '%', 5, avoid);
        const gold2 = ringPoint(rng, x, y, 13, 16, avoid);
        placeCluster(rng, gold2[0], gold2[1], '$', 5, avoid);
        if (woodNear(x, y, 12) < 40) {
            const wood = ringPoint(rng, x, y, 7, 10, avoid.concat([[gold[0], gold[1], 4], [stone[0], stone[1], 4]]));
            const tree = biome[idx(x, y)] === 'desert' ? 'L' : biome[idx(x, y)] === 'snow' ? 'P' : 'T';
            placeCluster(rng, wood[0], wood[1], tree, 26, avoid);
        }
    }
    // Independent villages waiting to be won over.
    const villages = [];
    const want = Math.max(nPlayers + 2, Math.round((MAP_W * MAP_H) / 1500));
    for (let tries = 0; tries < want * 60 && villages.length < want; tries++) {
        const x = 8 + Math.floor(rng() * (MAP_W - 16));
        const y = 8 + Math.floor(rng() * (MAP_H - 16));
        if (!good(x, y)) continue;
        if (starts.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < 16)) continue;
        if (villages.some(([vx, vy]) => Math.hypot(vx - x, vy - y) < 13)) continue;
        clearArea(x, y, 4, '.');
        villages.push([x, y]);
        // Each village has its own fields of berries and a grove.
        const avoid = [[x, y, 3.5]];
        const b2 = ringPoint(rng, x, y, 4, 6, avoid);
        placeCluster(rng, b2[0], b2[1], '*', 4, avoid);
    }
    // Join villages to the nearest capital road network.
    for (const [x, y] of villages) {
        let best = 0;
        let bd = Infinity;
        starts.forEach(([sx, sy], k) => { const d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = k; } });
        if (bd < 60) { const path = findPath(x, y, starts[best][0], starts[best][1]); if (path) carvePath(path); }
    }
    G.villageSpots = villages;

    // Contested riches out in the wild.
    const extra = Math.round((MAP_W * MAP_H) / 1300);
    for (let k = 0; k < extra; k++) {
        const x = 6 + Math.floor(rng() * (MAP_W - 12));
        const y = 6 + Math.floor(rng() * (MAP_H - 12));
        if (starts.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < 14)) continue;
        placeCluster(rng, x, y, k % 3 === 2 ? '%' : '$', 5, []);
    }
    return starts;
}

// ---------- Pathfinding (A* on the tile grid, 8 directions) ----------

const DIR8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

// Search buffers are reused between calls; a stamp marks which entries belong to the current search.
let pfG = null;
let pfPrev = null;
let pfStamp = null;
let pfClosed = null;
let pfRun = 0;
const pfHeap = [];

function pathTo(sx, sy, goals, hx, hy, maxNodes = 6000) {
    const N = MAP_W * MAP_H;
    const goalSet = new Set(goals.map(([x, y]) => idx(x, y)));
    if (!goalSet.size) return null;
    const start = idx(Math.round(sx), Math.round(sy));
    if (goalSet.has(start)) return [[Math.round(sx), Math.round(sy)]];
    if (!pfG || pfG.length !== N) { pfG = new Float32Array(N); pfPrev = new Int32Array(N); pfStamp = new Uint32Array(N); pfClosed = new Uint32Array(N); pfRun = 0; }
    const run = ++pfRun;
    const gOf = i => (pfStamp[i] === run ? pfG[i] : Infinity);
    const heap = pfHeap;
    heap.length = 0;
    const push = (f, i) => {
        heap.push([f, i]);
        let c = heap.length - 1;
        while (c > 0) {
            const p = (c - 1) >> 1;
            if (heap[p][0] <= heap[c][0]) break;
            [heap[p], heap[c]] = [heap[c], heap[p]];
            c = p;
        }
    };
    const pop = () => {
        const top = heap[0];
        const last = heap.pop();
        if (heap.length) {
            heap[0] = last;
            let c = 0;
            for (;;) {
                const l = c * 2 + 1;
                const r = l + 1;
                let m = c;
                if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
                if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
                if (m === c) break;
                [heap[m], heap[c]] = [heap[c], heap[m]];
                c = m;
            }
        }
        return top;
    };
    const h = i => {
        const dx = Math.abs((i % MAP_W) - hx);
        const dy = Math.abs(Math.floor(i / MAP_W) - hy);
        return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
    };
    pfG[start] = 0;
    pfStamp[start] = run;
    pfPrev[start] = -1;
    push(h(start), start);
    let found = -1;
    let bestI = start;
    let bestH = h(start);
    let expanded = 0;
    while (heap.length) {
        const [, cur] = pop();
        if (pfClosed[cur] === run) continue;
        pfClosed[cur] = run;
        if (goalSet.has(cur)) { found = cur; break; }
        if (++expanded > maxNodes) break;
        const cx = cur % MAP_W;
        const cy = Math.floor(cur / MAP_W);
        for (const [dx, dy, cost] of DIR8) {
            const nx = cx + dx;
            const ny = cy + dy;
            const ni = idx(nx, ny);
            if (!inMap(nx, ny) || pfClosed[ni] === run) continue;
            if (!passable(nx, ny) && !goalSet.has(ni)) continue;
            if (dx && dy && (!passable(cx + dx, cy) || !passable(cx, cy + dy))) continue;
            const ng = pfG[cur] + cost;
            if (ng < gOf(ni)) {
                pfG[ni] = ng;
                pfStamp[ni] = run;
                pfPrev[ni] = cur;
                const hh = h(ni);
                if (hh < bestH) { bestH = hh; bestI = ni; }
                push(ng + hh, ni);
            }
        }
    }
    const end = found >= 0 ? found : bestI;
    const path = [];
    for (let c = end; c !== -1 && c !== start; c = pfPrev[c]) path.push([c % MAP_W, Math.floor(c / MAP_W)]);
    return path.reverse();
}

function nearestPassable(x, y) {
    const rx = Math.round(x);
    const ry = Math.round(y);
    for (let r = 0; r < 8; r++) {
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            if (passable(rx + dx, ry + dy)) return [rx + dx, ry + dy];
        }
    }
    return [rx, ry];
}

// Tiles from which a unit can reach a building or resource tile.
function ringAround(tx, ty, n) {
    const out = [];
    for (let y = ty - 1; y <= ty + n; y++) for (let x = tx - 1; x <= tx + n; x++) {
        if (x >= tx && x < tx + n && y >= ty && y < ty + n) continue;
        if (passable(x, y)) out.push([x, y]);
    }
    return out;
}

// ---------- Fog of war (for the human player) ----------

let fogVisible = null;
let fogExplored = null;

function updateFog() {
    const N = MAP_W * MAP_H;
    if (!fogVisible) { fogVisible = new Uint8Array(N); fogExplored = new Uint8Array(N); }
    fogVisible.fill(0);
    const bonus = hasTech(G.human, 'jyotisha') ? 2 : 0;
    for (const e of G.ents.values()) {
        if (e.dead || e.owner < 0 || (e.owner !== G.human && relation(G.human, e.owner) !== 'ally')) continue;
        const r = (e.def.sight || 4) + bonus + (e.kind === 'building' ? e.def.size / 2 : 0);
        const cx = e.x;
        const cy = e.y;
        const r2 = r * r;
        for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
            if (!inMap(x, y) || (x - cx) ** 2 + (y - cy) ** 2 > r2) continue;
            const i = idx(x, y);
            fogVisible[i] = 1;
            fogExplored[i] = 1;
        }
    }
}

function seenByHuman(e) {
    if (e.owner === G.human || G.revealAll) return true;
    if (e.owner >= 0 && relation(G.human, e.owner) === 'ally') return true;
    const i = idx(Math.round(e.x), Math.round(e.y));
    if (e.kind === 'building') return !!fogExplored[i];
    return !!fogVisible[i];
}

// ---------- Territory ----------

let territory = null;     // owner + 1 for each tile, 0 when unclaimed

function territoryRadius(e) {
    if (e.kind !== 'building' || !e.built || e.dead || e.owner < 0) return 0;
    if (e.type === 'village') return SETTLEMENT_LEVELS[e.level].radius;
    return TERRITORY[e.type] || 0;
}

function updateTerritory() {
    const N = MAP_W * MAP_H;
    if (!territory || territory.length !== N) territory = new Uint8Array(N);
    const best = new Float32Array(N).fill(1e9);
    territory.fill(0);
    for (const e of G.ents.values()) {
        const r = territoryRadius(e);
        if (!r) continue;
        const cx = e.x;
        const cy = e.y;
        for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(MAP_H - 1, Math.ceil(cy + r)); y++) {
            for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(MAP_W - 1, Math.ceil(cx + r)); x++) {
                const d = Math.hypot(x - cx, y - cy) / r;
                if (d > 1) continue;
                const i = idx(x, y);
                if (d < best[i]) { best[i] = d; territory[i] = e.owner + 1; }
            }
        }
    }
    G.territoryAt = G.time;
}

function territoryOwner(x, y) {
    if (!territory || !inMap(x, y)) return -1;
    return territory[idx(x, y)] - 1;
}

// May this kingdom build here? Own land or unclaimed wilderness, never inside another's border.
function mayBuild(owner, type, tx, ty) {
    const n = BUILDING_TYPES[type].size;
    for (let y = ty; y < ty + n; y++) for (let x = tx; x < tx + n; x++) {
        const t = territoryOwner(x, y);
        if (t >= 0 && t !== owner) return false;
    }
    return true;
}
