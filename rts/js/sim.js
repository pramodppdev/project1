'use strict';

// ---------- Simulation ----------

let G = null;
let vegDirty = false;

function shuffled(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function newGame(opts) {
    const n = 1 + opts.opponents;
    G = { time: 0, ents: new Map(), nextId: 1, players: [], human: 0, over: null, messages: [], revealAll: false, grid: new Map(), opts, alertAt: 0, housedAt: 0, fogClock: 0, aiClock: 0, scanClock: 0, projectiles: [], booms: [] };
    fogVisible = null;
    const starts = setupMap(opts.seed, opts.size, n);
    const rng = WORLD.rng;
    const others = shuffled(Object.keys(CIVS).filter(k => k !== opts.civ), rng);
    for (let p = 0; p < n; p++) {
        const civ = p === 0 ? opts.civ : others[(p - 1) % others.length];
        G.players.push({
            id: p, civ, name: p === 0 ? `${CIVS[civ].name} (you)` : `${CIVS[civ].name} of ${CIVS[civ].leader}`, color: CIVS[civ].color,
            res: { ...START_RES }, age: 0, techs: [], defeated: false, start: starts[p],
            ai: p === 0 ? null : newAI(p, opts.difficulty), stats: { gathered: 0, killed: 0, lost: 0, built: 0, born: 0 },
        });
        initLife(G.players[p]);
        const [sx, sy] = starts[p];
        const tc = placeBuilding(p, 'tc', sx - 1, sy - 1, true);
        // The founding family: a married couple and the husband's younger brother.
        const man = spawnUnit(p, 'villager', sx - 1, sy + 2.3, { female: false, age: 27, skills: { wood: 20, build: 10 } });
        const fam = familyOf(man);
        const wife = spawnUnit(p, 'villager', sx, sy + 2.3, { female: true, age: 24, family: fam.id, skills: { food: 22 } });
        spawnUnit(p, 'villager', sx + 1, sy + 2.3, { female: false, age: 18, family: fam.id, skills: { gold: 12 } });
        man.person.spouse = wife.id;
        wife.person.spouse = man.id;
        fam.home = tc.id;
        fam.name = `${man.person.name} and ${wife.person.name}'s household`;
        const herd = ringPoint(rng, sx, sy, 7, 10, [[sx, sy, 5]]);
        for (let k = 0; k < 4; k++) spawnUnit(-1, 'deer', herd[0] + (k % 2) * 0.8, herd[1] + Math.floor(k / 2) * 0.8);
        const boar = ringPoint(rng, sx, sy, 11, 14, [[sx, sy, 8]]);
        spawnUnit(-1, 'boar', boar[0], boar[1]);
    }
    // Wild herds roam the open country.
    for (let k = 0; k < Math.round((MAP_W * MAP_H) / 900); k++) {
        const x = 4 + Math.floor(rng() * (MAP_W - 8));
        const y = 4 + Math.floor(rng() * (MAP_H - 8));
        if (!passable(x, y) || starts.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < 12)) continue;
        for (let d = 0; d < 3; d++) if (passable(x + d, y)) spawnUnit(-1, k % 4 === 0 ? 'boar' : 'deer', x + d, y);
    }
    updateFog();
    say(`You lead the ${CIVS[opts.civ].name}. ${CIVS[opts.civ].bonus}`, 'info');
}

function makeEnt(o) {
    o.id = G.nextId++;
    G.ents.set(o.id, o);
    return o;
}

function player(owner) {
    return G.players[owner];
}

function hasTech(owner, t) {
    return owner >= 0 && G.players[owner].techs.includes(t);
}

function say(text, kind = '') {
    G.messages.push({ text, kind, t: G.time });
    if (G.messages.length > 6) G.messages.shift();
}

// ---------- Stats with civilisation bonuses and technologies ----------

function unitHpMult(owner, type) {
    if (owner < 0) return 1;
    const cls = UNIT_TYPES[type].cls;
    let m = hasTech(owner, 'ayurveda') ? 1.2 : 1;
    if (player(owner).civ === 'rajput' && (cls === 'cavalry' || cls === 'elephant')) m *= 1.15;
    return m;
}

function unitCost(owner, type) {
    const def = UNIT_TYPES[type];
    const cheap = player(owner).civ === 'maratha' && ['infantry', 'cavalry', 'archer'].includes(def.cls);
    return Object.fromEntries(Object.entries(def.cost).map(([k, v]) => [k, Math.round(v * (cheap ? 0.85 : 1))]));
}

function unitAtk(u) {
    let a = u.def.atk;
    if (u.owner < 0) return a;
    if (u.person) a *= (1 + rankOf(u) * 0.1) * (u.def.cls === 'villager' ? 1 + u.person.skills.fight / 60 : 1) * (isChild(u) ? 0.4 : 1);
    if (hasTech(u.owner, 'wootz') && ['infantry', 'cavalry', 'elephant'].includes(u.def.cls)) a += 2;
    if (hasTech(u.owner, 'dhanurveda') && u.def.missile === 'arrow') a += 1;
    return a;
}

function unitRange(u) {
    let r = u.def.range;
    if (u.owner >= 0 && hasTech(u.owner, 'dhanurveda') && u.def.missile === 'arrow') r += 1;
    return r;
}

function armourOf(e, pierce) {
    if (e.kind === 'building') return pierce ? 6 : 2;
    let a = e.def.arm[pierce ? 1 : 0];
    if (e.owner >= 0 && hasTech(e.owner, 'ironarmour') && e.def.cls !== 'villager' && e.def.cls !== 'siege') a += 1;
    return a;
}

function gatherMult(owner, res, farm) {
    const p = player(owner);
    let m = 1;
    if (p.civ === 'chola' && res === 'food') m *= 1.15;
    if (p.civ === 'maurya' && (res === 'gold' || res === 'stone')) m *= 1.15;
    if (res === 'wood' && hasTech(owner, 'bowsaw')) m *= 1.2;
    if ((res === 'gold' || res === 'stone') && hasTech(owner, 'mining')) m *= 1.2;
    if (farm && hasTech(owner, 'plough')) m *= 1.15;
    if (farm && hasTech(owner, 'stepwell')) m *= 1.2;
    if (hasTech(owner, 'ganita')) m *= 1.1;
    if (hasTech(owner, 'nalanda')) m *= 1.15;
    if (p.ai) m *= p.ai.eco;
    return m;
}

function buildMult(owner) {
    let m = player(owner).civ === 'vijayanagara' ? 1.2 : 1;
    if (hasTech(owner, 'nalanda')) m *= 1.15;
    return m;
}

function canAfford(owner, cost) {
    const r = player(owner).res;
    return Object.entries(cost).every(([k, v]) => r[k] >= v);
}

function pay(owner, cost, sign = 1) {
    const r = player(owner).res;
    for (const [k, v] of Object.entries(cost)) r[k] -= v * sign;
}

function popOf(owner) {
    let used = 0;
    let cap = 0;
    for (const e of G.ents.values()) {
        if (e.owner !== owner || e.dead) continue;
        if (e.kind === 'unit') used++;
        else if (e.kind === 'building') {
            if (e.built && e.def.pop) cap += e.def.pop + (e.type === 'house' && hasTech(owner, 'pucca') ? 3 : 0);
            if (e.queue.length && e.queue[0].unit) used++;
        }
    }
    return { used, cap: Math.min(POP_MAX + (hasTech(owner, 'nalanda') ? 25 : 0), cap) };
}

function ageReady(owner) {
    const p = player(owner);
    const next = AGES[p.age + 1];
    if (!next) return 'Highest age reached';
    let n = 0;
    for (const e of G.ents.values()) if (e.owner === owner && e.kind === 'building' && e.built && !e.dead && (e.def.counts || e.type === 'storehouse') && e.def.age <= p.age) n++;
    if (n < next.needs) return `Needs ${next.needs} buildings from this age (${n} built)`;
    return null;
}

// ---------- Entities ----------

function spawnUnit(owner, type, x, y, opts) {
    const def = UNIT_TYPES[type];
    const hp = Math.round(def.hp * unitHpMult(owner, type));
    const u = makeEnt({ kind: 'unit', type, def, owner, x, y, hp, maxHp: hp, path: [], task: null, cooldown: 0, carry: null, facing: Math.random() * 6, moving: false, radius: def.radius || 0.28, born: G.time });
    if (owner >= 0) attachPerson(u, opts);
    if (owner >= 0 && opts && opts.age === 0) player(owner).stats.born++;
    return u;
}

function placeBuilding(owner, type, tx, ty, done) {
    const def = BUILDING_TYPES[type];
    const n = def.size;
    const hp = Math.round(def.hp * (owner >= 0 && player(owner).civ === 'vijayanagara' ? 1.25 : 1) * (owner >= 0 ? upgradeHpMult(owner, type) : 1));
    const e = makeEnt({ kind: 'building', type, def, owner, tx, ty, x: tx + (n - 1) / 2, y: ty + (n - 1) / 2, hp: done ? hp : 1, maxHp: hp, built: !!done, progress: done ? 1 : 0, queue: [], rally: null, cooldown: 0, food: def.food || 0, radius: n / 2 });
    for (let y = ty; y < ty + n; y++) for (let x = tx; x < tx + n; x++) occ[idx(x, y)] = e.id;
    if (done) onBuilt(e);
    return e;
}

function upgradeHpMult(owner, type) {
    if (type === 'house' && hasTech(owner, 'pucca')) return 2;
    if ((type === 'tc' || type === 'tower') && hasTech(owner, 'fortified')) return 1.5;
    return 1;
}

function onBuilt(b) {
    b.built = true;
    b.progress = 1;
    if (b.type === 'farm') b.food = BUILDING_TYPES.farm.food * (hasTech(b.owner, 'plough') ? 1.5 : 1);
    if (b.owner >= 0) player(b.owner).stats.built++;
    // Units standing inside a finished footprint step out of it.
    for (const u of G.ents.values()) {
        if (u.kind !== 'unit' || b.def.walkable) continue;
        if (u.x > b.tx - 0.5 && u.x < b.tx + b.def.size - 0.5 && u.y > b.ty - 0.5 && u.y < b.ty + b.def.size - 0.5) {
            const [x, y] = nearestPassable(b.tx - 1, b.ty - 1);
            u.x = x;
            u.y = y;
            u.path = [];
        }
    }
}

function kill(e, src, cause) {
    if (e.dead) return;
    e.dead = true;
    e.deadAt = G.time;
    e.path = [];
    if (e.person) onPersonDeath(e, cause || 'battle');
    if (src && src.person && !src.dead && e.kind === 'unit' && e.owner >= 0 && e.owner !== src.owner) {
        const before = rankOf(src);
        src.person.kills++;
        gainSkill(src, 'fight', 4);
        const after = rankOf(src);
        if (after > before && src.owner === G.human) chronicle(src.owner, `${src.person.name} is promoted to ${RANKS[after][1]} for bravery in battle.`, 'good');
    }
    if (e.owner >= 0) player(e.owner).stats.lost++;
    if (src && src.owner >= 0 && e.owner !== src.owner && e.owner >= 0) player(src.owner).stats.killed++;
    if (e.kind === 'unit' && e.def.cls === 'animal') {
        makeEnt({ kind: 'carcass', type: e.type, def: { name: `${e.def.name} (carcass)`, sight: 0 }, owner: -1, x: e.x, y: e.y, food: e.def.food, radius: 0.3 });
    }
    if (e.kind === 'building') {
        for (let y = e.ty; y < e.ty + e.def.size; y++) for (let x = e.tx; x < e.tx + e.def.size; x++) if (occ[idx(x, y)] === e.id) occ[idx(x, y)] = 0;
        if (e.owner >= 0) for (const q of e.queue) pay(e.owner, q.cost, -1);
        e.queue = [];
    }
    if (e.owner === G.human && e.kind === 'building') say(`Your ${e.def.name.toLowerCase()} was destroyed!`, 'bad');
    checkDefeat();
}

function checkDefeat() {
    for (const p of G.players) {
        if (p.defeated) continue;
        let tc = 0;
        let vill = 0;
        let army = 0;
        for (const e of G.ents.values()) {
            if (e.owner !== p.id || e.dead) continue;
            if (e.type === 'tc') tc++;
            else if (e.type === 'villager') vill++;
            else if (e.kind === 'unit') army++;
        }
        if (!tc && !vill && (!army || p.id === G.human)) {
            p.defeated = true;
            say(p.id === G.human ? 'Your kingdom has fallen.' : `${p.name} has been defeated!`, p.id === G.human ? 'bad' : 'good');
            for (const e of G.ents.values()) if (e.owner === p.id && !e.dead && p.id !== G.human) kill(e, null);
        }
    }
    if (G.over) return;
    if (player(G.human).defeated) G.over = 'defeat';
    else if (G.players.every(p => p.id === G.human || p.defeated)) G.over = 'victory';
}

// ---------- Geometry helpers ----------

function distToEnt(u, e) {
    if (e.kind === 'building') {
        const n = e.def.size;
        const dx = Math.max(e.tx - 0.5 - u.x, 0, u.x - (e.tx + n - 0.5));
        const dy = Math.max(e.ty - 0.5 - u.y, 0, u.y - (e.ty + n - 0.5));
        return Math.hypot(dx, dy);
    }
    return Math.max(0, Math.hypot(e.x - u.x, e.y - u.y) - (e.radius || 0.3));
}

function distToTile(u, i) {
    const tx = i % MAP_W;
    const ty = Math.floor(i / MAP_W);
    const dx = Math.max(tx - 0.5 - u.x, 0, u.x - (tx + 0.5));
    const dy = Math.max(ty - 0.5 - u.y, 0, u.y - (ty + 0.5));
    return Math.hypot(dx, dy);
}

function goalsFor(target) {
    if (target.kind === 'building') {
        if (target.def.walkable && target.built) {
            const out = [];
            for (let y = target.ty; y < target.ty + target.def.size; y++) for (let x = target.tx; x < target.tx + target.def.size; x++) out.push([x, y]);
            return out;
        }
        return ringAround(target.tx, target.ty, target.def.size);
    }
    const rx = Math.round(target.x);
    const ry = Math.round(target.y);
    const out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (passable(rx + dx, ry + dy)) out.push([rx + dx, ry + dy]);
    return out.length ? out : [nearestPassable(rx, ry)];
}

function pathToward(u, goals, hx, hy, key) {
    // Do not search the same route again and again when it keeps failing.
    if (u.pathKey === key && G.time - u.pathAt < 1 && !u.path.length) return;
    u.path = pathTo(u.x, u.y, goals, hx, hy) || [];
    u.pathKey = key;
    u.pathAt = G.time;
}

// Close the last gap to a moving or diagonal target that the tile path cannot.
function approach(u, e, goals, key) {
    pathToward(u, goals, Math.round(e.x), Math.round(e.y), key);
    if (!u.path.length && passable(Math.round(e.x), Math.round(e.y))) u.path = [[e.x, e.y]];
}

function unitsNearTile(x, y) {
    return G.grid.get(idx(Math.round(x), Math.round(y))) || [];
}

function nearestResTile(res, x, y, r) {
    let best = -1;
    let bd = Infinity;
    for (let yy = Math.round(y) - r; yy <= Math.round(y) + r; yy++) for (let xx = Math.round(x) - r; xx <= Math.round(x) + r; xx++) {
        if (!inMap(xx, yy)) continue;
        const i = idx(xx, yy);
        const ro = RESOURCE_OBJECTS[objects[i]];
        if (!ro || ro.res !== res) continue;
        if (!ringAround(xx, yy, 1).length) continue;
        const d = Math.hypot(xx - x, yy - y);
        if (d < bd) { bd = d; best = i; }
    }
    return best;
}

function nearestDrop(owner, res, x, y) {
    let best = null;
    let bd = Infinity;
    for (const e of G.ents.values()) {
        if (e.owner !== owner || e.dead || e.kind !== 'building' || !e.built || !e.def.drop || !e.def.drop.includes(res)) continue;
        const d = Math.hypot(e.x - x, e.y - y);
        if (d < bd) { bd = d; best = e; }
    }
    return best;
}

function isEnemy(a, b) {
    return b.owner !== a.owner && b.owner >= 0 && a.owner >= 0 && !b.dead;
}

// ---------- Commands (used by the player interface and the AI) ----------

function cmdMove(units, x, y) {
    const n = units.length;
    const cols = Math.ceil(Math.sqrt(n));
    units.forEach((u, k) => {
        const ox = (k % cols - (cols - 1) / 2) * 0.8;
        const oy = (Math.floor(k / cols) - (Math.ceil(n / cols) - 1) / 2) * 0.8;
        const [gx, gy] = nearestPassable(x + ox, y + oy);
        u.task = { type: 'move', x: gx, y: gy, tries: 0 };
        pathToward(u, [[gx, gy]], gx, gy, `m${gx},${gy}`);
    });
}

function cmdAttack(units, target) {
    for (const u of units) {
        if (!canWork(u)) continue;
        if (u.def.cls === 'villager' && target.def.cls === 'animal') { u.task = { type: 'gather', ent: target.id, res: 'food', hunt: true }; continue; }
        if (u.def.onlyBuildings && target.kind !== 'building') continue;
        u.task = { type: 'attack', ent: target.id };
        u.path = [];
    }
}

function cmdGatherTile(units, i) {
    const ro = RESOURCE_OBJECTS[objects[i]];
    if (!ro) return;
    const workers = units.filter(u => u.def.cls === 'villager' && canWork(u));
    // A group spreads over the trees, stones or bushes next to the one clicked.
    const tx = i % MAP_W;
    const ty = Math.floor(i / MAP_W);
    const spots = [];
    for (let y = ty - 3; y <= ty + 3; y++) for (let x = tx - 3; x <= tx + 3; x++) {
        if (!inMap(x, y)) continue;
        const j = idx(x, y);
        const r = RESOURCE_OBJECTS[objects[j]];
        if (r && r.res === ro.res && ringAround(x, y, 1).length) spots.push({ j, d: Math.hypot(x - tx, y - ty), n: 0 });
    }
    if (!spots.length) spots.push({ j: i, d: 0, n: 0 });
    for (const u of workers) {
        spots.sort((a, b) => a.n - b.n || a.d - b.d);
        const sp = spots[0];
        sp.n += workers.length > 6 ? 0.5 : 1;
        u.task = { type: 'gather', tile: sp.j, res: ro.res };
        u.path = [];
    }
}

function cmdGatherEnt(units, e) {
    for (const u of units) if (u.def.cls === 'villager' && canWork(u)) { u.task = { type: 'gather', ent: e.id, res: 'food', hunt: e.kind === 'unit' }; u.path = []; }
}

function cmdBuild(units, b) {
    for (const u of units) if (u.def.cls === 'villager' && !isChild(u)) { u.task = { type: 'build', ent: b.id }; u.path = []; }
}

function cmdDrop(units, b) {
    for (const u of units) if (u.def.cls === 'villager' && u.carry) { u.task = { type: 'gather', res: u.carry.res, returning: true, tile: u.lastTile, ent: u.lastEnt }; u.path = []; }
}

function tryPlace(owner, type, tx, ty, builders) {
    const def = BUILDING_TYPES[type];
    if (def.age > player(owner).age || !canAfford(owner, def.cost) || !footprintFree(type, tx, ty)) return null;
    pay(owner, def.cost);
    const b = placeBuilding(owner, type, tx, ty, false);
    cmdBuild(builders, b);
    return b;
}

function enqueue(b, item) {
    const owner = b.owner;
    let cost;
    let time;
    if (item.unit) {
        const def = UNIT_TYPES[item.unit];
        if (def.age > player(owner).age || (def.tech && !hasTech(owner, def.tech))) return false;
        cost = unitCost(owner, item.unit);
        time = def.time;
    } else if (item.tech) {
        const t = TECHS[item.tech];
        if (hasTech(owner, item.tech) || t.age > player(owner).age || G.ents.size && [...G.ents.values()].some(e => e.owner === owner && e.kind === 'building' && e.queue.some(q => q.tech === item.tech))) return false;
        cost = t.cost;
        time = t.time;
    } else if (item.age) {
        if (ageReady(owner) || [...G.ents.values()].some(e => e.owner === owner && e.kind === 'building' && e.queue.some(q => q.age))) return false;
        cost = AGES[player(owner).age + 1].cost;
        time = AGES[player(owner).age + 1].time;
    }
    if (b.queue.length >= 6 || !canAfford(owner, cost)) return false;
    pay(owner, cost);
    b.queue.push({ ...item, cost, time, t: 0 });
    return true;
}

function cancelQueue(b, k) {
    const q = b.queue[k];
    if (!q) return;
    pay(b.owner, q.cost, -1);
    b.queue.splice(k, 1);
}

// ---------- Per-frame update ----------

function step(dt) {
    if (G.over) return;
    G.time += dt;
    G.grid = new Map();
    for (const e of G.ents.values()) {
        if (e.kind !== 'unit' || e.dead) continue;
        const k = idx(Math.round(e.x), Math.round(e.y));
        if (!G.grid.has(k)) G.grid.set(k, []);
        G.grid.get(k).push(e);
    }
    G.scanClock += dt;
    const scan = G.scanClock > 0.5;
    if (scan) G.scanClock = 0;
    for (const e of [...G.ents.values()]) {
        if (e.dead) {
            if (G.time - e.deadAt > 4) G.ents.delete(e.id);
            continue;
        }
        if (e.kind === 'unit') updateUnit(e, dt, scan);
        else if (e.kind === 'building') updateBuilding(e, dt, scan);
        else if (e.kind === 'carcass' && e.food <= 0) G.ents.delete(e.id);
    }
    separate();
    updateProjectiles(dt);
    lifeTick(dt);
    G.fogClock += dt;
    if (G.fogClock > 0.25) { G.fogClock = 0; updateFog(); }
    G.aiClock += dt;
    if (G.aiClock > 1) {
        G.aiClock = 0;
        for (const p of G.players) if (p.ai && !p.defeated) aiThink(p);
    }
}

// Keep people from standing inside each other without ever letting them block one another:
// walkers pass through each other, idle people step aside for walkers, and only people
// standing still are spread apart evenly.
function separate() {
    for (const [k, list] of G.grid) {
        const kx = k % MAP_W;
        const ky = Math.floor(k / MAP_W);
        // Also compare with the cells to the right and below so overlaps across tile edges count.
        const near = list.concat(G.grid.get(idx(kx + 1, ky)) || [], G.grid.get(idx(kx, ky + 1)) || [], G.grid.get(idx(kx + 1, ky + 1)) || []);
        if (near.length < 2) continue;
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < near.length; j++) {
            const a = list[i];
            const b = near[j];
            if (a === b) continue;
            const am = a.path.length > 0;
            const bm = b.path.length > 0;
            if (am && bm) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d = Math.hypot(dx, dy) || 0.01;
            const min = (a.radius + b.radius) * 0.85;
            if (d >= min) continue;
            let nx = dx / d;
            let ny = dy / d;
            if (d < 0.02) { const r = ((a.id * 7 + b.id * 13) % 628) / 100; nx = Math.cos(r); ny = Math.sin(r); }
            const gap = min - d;
            const settled = u => u.working || (u.task && u.task.type === 'build' && !u.path.length);
            if (am || bm) {
                // A walker passes; an idle bystander shuffles aside, a busy worker is left alone.
                const still = am ? b : a;
                if (settled(still)) continue;
                const sgn = still === b ? 1 : -1;
                nudge(still, nx * sgn, ny * sgn, gap * 0.35);
            } else {
                nudge(a, -nx, -ny, gap * 0.5);
                nudge(b, nx, ny, gap * 0.5);
            }
        }
    }
}

// Move a little in a direction, or sideways if that way is blocked.
function nudge(u, nx, ny, amt) {
    for (const [ax, ay] of [[nx, ny], [-ny, nx], [ny, -nx]]) {
        const x = u.x + ax * amt;
        const y = u.y + ay * amt;
        if (passable(Math.round(x), Math.round(y))) { u.x = x; u.y = y; return; }
    }
}

function moveAlong(u, dt) {
    if (!u.path.length) { u.moving = false; return; }
    const [tx, ty] = u.path[0];
    if (!passable(tx, ty) && u.path.length > 1) { u.path = []; u.moving = false; u.blocked = true; return; }
    const dx = tx - u.x;
    const dy = ty - u.y;
    const d = Math.hypot(dx, dy);
    const onRoad = ground[idx(Math.round(u.x), Math.round(u.y))] === 'p';
    let sp = u.def.speed * (onRoad ? 1.15 : 1) * dt;
    if (u.owner >= 0 && hasTech(u.owner, 'roads')) sp *= 1.1;
    if (u.person) { const a = ageOf(u); if (a < ADULT_AGE) sp *= 0.8; else if (a > ELDER_AGE + 8) sp *= 0.85; }
    u.facing = Math.atan2(dx, dy);
    u.moving = true;
    // Notice when a walker makes no headway and find it a fresh route.
    if (!u.stuck || u.stuck.wp !== u.path.length) u.stuck = { wp: u.path.length, best: d, t: G.time };
    else if (d < u.stuck.best - 0.05) { u.stuck.best = d; u.stuck.t = G.time; }
    else if (G.time - u.stuck.t > 1.2) {
        u.stuck = null;
        const goal = u.path[u.path.length - 1];
        u.path = pathTo(u.x, u.y, [goal], goal[0], goal[1], 3000) || [];
        if (!u.path.length) { u.moving = false; return; }
        return;
    }
    if (d <= sp) {
        u.x = tx;
        u.y = ty;
        u.path.shift();
    } else {
        u.x += (dx / d) * sp;
        u.y += (dy / d) * sp;
    }
}

function faceTo(u, x, y) {
    u.facing = Math.atan2(x - u.x, y - u.y);
}

function updateUnit(u, dt, scan) {
    u.cooldown -= dt;
    u.working = null;
    if (u.def.cls === 'animal') return updateAnimal(u, dt);
    if (u.person && ageOf(u) < WORK_AGE) return toddle(u, dt);
    const t = u.task;
    if (!t) {
        if (scan && u.def.cls !== 'villager') autoTarget(u);
        moveAlong(u, dt);
        return;
    }
    if (t.type === 'move') {
        if (!u.path.length) {
            if (t.x !== undefined && Math.hypot(t.x - u.x, t.y - u.y) > 0.9 && t.tries++ < 3) {
                const [gx, gy] = nearestPassable(t.x, t.y);
                u.path = pathTo(u.x, u.y, [[gx, gy]], gx, gy) || [];
            } else u.task = null;
        }
    } else if (t.type === 'attack') {
        doAttack(u, t);
    } else if (t.type === 'gather') {
        doGather(u, t);
    } else if (t.type === 'build') {
        doBuild(u, t, dt);
    }
    if (u.task && u.task.type === 'gather' && u.working) gatherTick(u, dt);
    moveAlong(u, dt);
}

function autoTarget(u) {
    const sight = u.def.sight + 1;
    let best = null;
    let bd = Infinity;
    for (const e of G.ents.values()) {
        if (!isEnemy(u, e) || e.kind === 'carcass') continue;
        if (u.def.onlyBuildings && e.kind !== 'building') continue;
        const d = distToEnt(u, e) + (e.kind === 'building' ? 3 : 0);
        if (d < sight && d < bd) { bd = d; best = e; }
    }
    if (best) u.task = { type: 'attack', ent: best.id, auto: true };
}

function doAttack(u, t) {
    const e = G.ents.get(t.ent);
    if (!e || e.dead) {
        u.task = null;
        u.path = [];
        if (u.def.cls !== 'villager') autoTarget(u);
        return;
    }
    const range = unitRange(u);
    if (distToEnt(u, e) <= range + 0.15) {
        u.path = [];
        faceTo(u, e.x, e.y);
        if (u.cooldown <= 0) {
            u.cooldown = u.def.rate;
            strike(u, e);
        }
    } else if (!u.path.length || (e.kind === 'unit' && G.time - u.pathAt > 1.2)) {
        if (t.auto && distToEnt(u, e) > u.def.sight + 4) { u.task = null; return; }
        if (e.kind === 'unit') approach(u, e, goalsFor(e), `a${e.id}`);
        else pathToward(u, goalsFor(e), Math.round(e.x), Math.round(e.y), `a${e.id}`);
    }
}

function damageOf(src, e, pierce) {
    const atk = src.kind === 'building' ? src.def.atk + (hasTech(src.owner, 'dhanurveda') ? 1 : 0) + (hasTech(src.owner, 'fortified') ? 2 : 0) : unitAtk(src);
    const cls = e.kind === 'building' ? 'building' : e.def.cls;
    const bonus = (src.def.bonus && src.def.bonus[cls]) || 1;
    return Math.max(1, atk * bonus - armourOf(e, pierce));
}

function strike(u, e) {
    if (u.def.missile) {
        G.projectiles.push({ x: u.x, y: u.y, z: 0.9, src: u, srcOwner: u.owner, target: e, kind: u.def.missile, speed: u.def.missile === 'rocket' ? 7 : 11, dmg: damageOf(u, e, true), splash: u.def.splash || 0 });
    } else {
        applyDamage(e, damageOf(u, e, false), u);
    }
    u.attackAnim = G.time;
}

function applyDamage(e, d, src) {
    if (e.dead) return;
    e.hp -= d;
    e.hitAt = G.time;
    if (e.owner === G.human && src && src.owner !== G.human && G.time - G.alertAt > 12) {
        G.alertAt = G.time;
        say(e.kind === 'building' ? `Your ${e.def.name.toLowerCase()} is under attack!` : 'Your people are under attack!', 'bad');
        G.alertPos = [e.x, e.y];
    }
    if (e.hp <= 0) { kill(e, src); return; }
    // Soldiers fight back; animals flee or charge.
    if (e.kind === 'unit' && src && src.kind === 'unit' && !src.dead) {
        if (e.def.cls === 'animal') {
            if (e.def.aggressive) e.task = { type: 'attack', ent: src.id };
            else e.flee = { x: e.x + (e.x - src.x) * 3, y: e.y + (e.y - src.y) * 3 };
        } else if (e.def.cls !== 'villager' && (!e.task || e.task.type === 'move' && !e.path.length || !e.task)) {
            e.task = { type: 'attack', ent: src.id, auto: true };
        }
    }
}

function updateProjectiles(dt) {
    for (const p of G.projectiles) {
        const tx = p.target.x;
        const ty = p.target.y;
        const dx = tx - p.x;
        const dy = ty - p.y;
        const d = Math.hypot(dx, dy);
        const sp = p.speed * dt;
        if (d <= sp || p.target.dead) {
            p.done = true;
            if (!p.target.dead) applyDamage(p.target, p.dmg, p.src.dead ? null : p.src);
            if (p.splash) {
                for (const e of G.ents.values()) {
                    if (e === p.target || e.dead || e.owner === p.srcOwner || e.owner < 0 || e.kind === 'carcass') continue;
                    if (Math.hypot(e.x - tx, e.y - ty) < p.splash + (e.radius || 0)) applyDamage(e, p.dmg * 0.5, null);
                }
                p.boom = true;
            }
            continue;
        }
        p.x += (dx / d) * sp;
        p.y += (dy / d) * sp;
        p.h = Math.sin(Math.min(1, p.flown = (p.flown || 0) + sp) * Math.PI) * 0.6;
    }
    G.booms = G.booms.filter(b => G.time - b.t < 0.6);
    for (const p of G.projectiles) if (p.done && p.boom) G.booms.push({ x: p.target.x, y: p.target.y, t: G.time });
    G.projectiles = G.projectiles.filter(p => !p.done);
}

function updateAnimal(u, dt) {
    if (u.flee) {
        const [gx, gy] = nearestPassable(u.flee.x, u.flee.y);
        pathToward(u, [[gx, gy]], gx, gy, 'flee');
        u.flee = null;
    }
    if (u.task && u.task.type === 'attack') { doAttack(u, u.task); moveAlong(u, dt); return; }
    if (!u.path.length && Math.random() < dt * 0.08) {
        const [gx, gy] = nearestPassable(u.x + (Math.random() - 0.5) * 6, u.y + (Math.random() - 0.5) * 6);
        pathToward(u, [[gx, gy]], gx, gy, 'wander');
    }
    moveAlong(u, u.pathKey === 'wander' ? dt * 0.5 : dt);
}

// Little children play near their home.
function toddle(u, dt) {
    if (!u.path.length && Math.random() < dt * 0.15) {
        const fam = familyOf(u);
        const home = fam && fam.home && G.ents.get(fam.home);
        const cx = home && !home.dead ? home.x : u.x;
        const cy = home && !home.dead ? home.y + home.def.size / 2 + 1 : u.y;
        const [gx, gy] = nearestPassable(cx + (Math.random() - 0.5) * 4, cy + (Math.random() - 0.5) * 3);
        pathToward(u, [[gx, gy]], gx, gy, `toddle${gx},${gy}`);
    }
    moveAlong(u, dt * 0.6);
}

// ---------- Villager work ----------

function doGather(u, t) {
    const cap = CARRY;
    if (u.carry && (u.carry.amt >= cap - 0.01 || t.returning)) {
        t.returning = true;
        const drop = nearestDrop(u.owner, u.carry.res, u.x, u.y);
        if (!drop) { u.task = null; return; }
        if (distToEnt(u, drop) <= 0.8) {
            const p = player(u.owner);
            p.res[u.carry.res] += u.carry.amt;
            if (u.owner === G.human && u.carry.amt >= 1) floatText(u.x, u.y, `+${Math.round(u.carry.amt)} ${u.carry.res}`, { food: '#ffb4a0', wood: '#e0c090', stone: '#d8d8d0', gold: '#ffd34a' }[u.carry.res]);
            p.stats.gathered += u.carry.amt;
            u.carry = null;
            t.returning = false;
            u.path = [];
            return;
        }
        if (!u.path.length || u.pathKey !== `d${drop.id}`) pathToward(u, goalsFor(drop), Math.round(drop.x), Math.round(drop.y), `d${drop.id}`);
        return;
    }
    if (t.ent !== undefined && t.ent !== null) {
        const e = G.ents.get(t.ent);
        const gone = !e || (e.kind === 'building' && (e.dead || e.food <= 0)) || (e.kind === 'carcass' && e.food <= 0);
        if (gone) {
            if (e && e.kind === 'building' && !e.dead && e.food <= 0 && reseed(e)) return;
            const near = nearestCarcassOrFarm(u);
            if (near) { t.ent = near.id; return; }
            if (u.carry) { t.returning = true; return; }
            u.task = null;
            return;
        }
        if (e.kind === 'unit') {
            // Hunting: bring the animal down first.
            if (e.dead) {
                const c = [...G.ents.values()].find(c => c.kind === 'carcass' && c.food > 0 && Math.hypot(c.x - e.x, c.y - e.y) < 0.2);
                if (c) t.ent = c.id; else u.task = null;
                return;
            }
            if (distToEnt(u, e) <= 0.8) {
                u.path = [];
                faceTo(u, e.x, e.y);
                if (u.cooldown <= 0) { u.cooldown = 1.2; strike(u, e); }
                if (e.dead || e.hp <= 0) {
                    const c = [...G.ents.values()].find(c => c.kind === 'carcass' && Math.hypot(c.x - e.x, c.y - e.y) < 0.2);
                    if (c) t.ent = c.id;
                }
            } else if (!u.path.length || G.time - u.pathAt > 1.5) {
                approach(u, e, goalsFor(e), `h${e.id}`);
            }
            return;
        }
        const inside = e.kind === 'building' && u.x > e.tx - 0.6 && u.x < e.tx + e.def.size - 0.4 && u.y > e.ty - 0.6 && u.y < e.ty + e.def.size - 0.4;
        if (inside || distToEnt(u, e) <= (e.kind === 'carcass' ? 1.3 : 0.8)) {
            u.path = [];
            u.working = { ent: e, res: 'food', farm: e.kind === 'building' };
            u.lastEnt = e.id;
            faceTo(u, e.x, e.y);
        } else if (!u.path.length) {
            if (e.kind === 'carcass') approach(u, e, goalsFor(e), `g${e.id}`);
            else pathToward(u, goalsFor(e), Math.round(e.x), Math.round(e.y), `g${e.id}`);
        }
        return;
    }
    if (t.tile === undefined || t.tile < 0 || !objects[t.tile] || !RESOURCE_OBJECTS[objects[t.tile]]) {
        const next = nearestResTile(t.res, u.x, u.y, 7);
        if (next >= 0) { t.tile = next; u.path = []; return; }
        if (u.carry) { t.returning = true; return; }
        u.task = null;
        return;
    }
    if (distToTile(u, t.tile) <= 0.75) {
        u.path = [];
        u.working = { tile: t.tile, res: t.res };
        u.lastTile = t.tile;
        faceTo(u, t.tile % MAP_W, Math.floor(t.tile / MAP_W));
    } else if (!u.path.length || u.pathKey !== `t${t.tile}`) {
        const tx = t.tile % MAP_W;
        const ty = Math.floor(t.tile / MAP_W);
        const goals = ringAround(tx, ty, 1);
        if (!goals.length) { t.tile = -1; return; }
        pathToward(u, goals, tx, ty, `t${t.tile}`);
        if (!u.path.length && distToTile(u, t.tile) > 0.75) {
            if (u.blockedAt && G.time - u.blockedAt < 2) { t.tile = -1; u.blockedAt = 0; } else u.blockedAt = G.time;
        }
    }
}

function gatherTick(u, dt) {
    const w = u.working;
    const res = w.res;
    if (u.carry && u.carry.res !== res) u.carry = null;
    if (!u.carry) u.carry = { res, amt: 0 };
    let rate = (w.farm ? GATHER_RATE.farm : w.ent ? GATHER_RATE.hunt : GATHER_RATE[res]) * gatherMult(u.owner, res, w.farm) * personWorkMult(u, res);
    if (w.farm && wellNear(w.ent)) rate *= 1.1;
    gainSkill(u, res, dt * 0.09);
    let got = 0;
    if (w.tile !== undefined) got = takeRes(w.tile, rate * dt);
    else if (w.ent) { got = Math.min(rate * dt, w.ent.food); w.ent.food -= got; }
    u.carry.amt = Math.min(CARRY, u.carry.amt + got);
}

function wellNear(farm) {
    if (!farm || farm.kind !== 'building') return false;
    if (G.time - (farm.wellAt || -99) > 10) {
        farm.wellAt = G.time;
        farm.well = [...G.ents.values()].some(e => e.type === 'well' && e.owner === farm.owner && e.built && !e.dead && Math.hypot(e.x - farm.x, e.y - farm.y) < BUILDING_TYPES.well.farmBoost);
    }
    return farm.well;
}

function reseed(farm) {
    if (!canAfford(farm.owner, BUILDING_TYPES.farm.cost)) return false;
    pay(farm.owner, BUILDING_TYPES.farm.cost);
    farm.food = BUILDING_TYPES.farm.food * (hasTech(farm.owner, 'plough') ? 1.5 : 1);
    return true;
}

function nearestCarcassOrFarm(u) {
    let best = null;
    let bd = 8;
    for (const e of G.ents.values()) {
        if (e.dead) continue;
        const ok = (e.kind === 'carcass' && e.food > 0) || (e.kind === 'building' && e.owner === u.owner && e.type === 'farm' && e.built && e.food > 0 && !farmTaken(e, u));
        if (!ok) continue;
        const d = Math.hypot(e.x - u.x, e.y - u.y);
        if (d < bd) { bd = d; best = e; }
    }
    return best;
}

function farmTaken(f, except) {
    for (const u of G.ents.values()) if (u !== except && u.kind === 'unit' && !u.dead && u.task && u.task.type === 'gather' && u.task.ent === f.id) return true;
    return false;
}

function doBuild(u, t, dt) {
    const b = G.ents.get(t.ent);
    if (!b || b.dead || (b.built && b.hp >= b.maxHp)) {
        u.task = null;
        u.path = [];
        if (b && !b.dead && b.type === 'farm' && !farmTaken(b, u)) u.task = { type: 'gather', ent: b.id, res: 'food' };
        else if (b && !b.dead && b.def.drop && b.type !== 'tc') {
            const next = ['wood', 'gold', 'stone'].map(r => nearestResTile(r, b.x, b.y, 6)).find(i => i >= 0);
            if (next !== undefined) u.task = { type: 'gather', tile: next, res: RESOURCE_OBJECTS[objects[next]].res };
        }
        return;
    }
    const inside = b.def.walkable && u.x > b.tx - 0.6 && u.x < b.tx + b.def.size - 0.4 && u.y > b.ty - 0.6 && u.y < b.ty + b.def.size - 0.4;
    if (inside || distToEnt(u, b) <= 0.8) {
        u.path = [];
        faceTo(u, b.x, b.y);
        u.building = G.time;
        const rate = (dt / b.def.time) * buildMult(u.owner) * (player(u.owner).ai ? player(u.owner).ai.eco : 1) * personWorkMult(u, 'build');
        gainSkill(u, 'build', dt * 0.12);
        if (!b.built) {
            b.progress = Math.min(1, b.progress + rate);
            b.hp = Math.min(b.maxHp, b.hp + b.maxHp * rate);
            if (b.progress >= 1) onBuilt(b);
        } else {
            b.hp = Math.min(b.maxHp, b.hp + b.maxHp * rate * 0.5);
        }
    } else if (!u.path.length || u.pathKey !== `b${b.id}`) {
        pathToward(u, goalsFor(b), Math.round(b.x), Math.round(b.y), `b${b.id}`);
    }
}

// ---------- Buildings ----------

function updateBuilding(b, dt, scan) {
    if (!b.built) return;
    if (b.def.atk) {
        b.cooldown -= dt;
        if (b.cooldown <= 0) {
            const range = b.def.range + (hasTech(b.owner, 'dhanurveda') ? 1 : 0);
            let best = null;
            let bd = Infinity;
            for (const e of G.ents.values()) {
                if (e.kind !== 'unit' || !isEnemy(b, e)) continue;
                const d = Math.hypot(e.x - b.x, e.y - b.y) - b.def.size / 2;
                if (d < range && d < bd) { bd = d; best = e; }
            }
            if (best) {
                b.cooldown = b.def.rate;
                G.projectiles.push({ x: b.x, y: b.y, z: 2, src: b, srcOwner: b.owner, target: best, kind: 'arrow', speed: 11, dmg: damageOf(b, best, true), splash: 0 });
            }
        }
    }
    if (b.def.heal && scan) {
        for (const e of G.ents.values()) if (e.kind === 'unit' && e.owner === b.owner && !e.dead && e.hp < e.maxHp && Math.hypot(e.x - b.x, e.y - b.y) < b.def.heal) e.hp = Math.min(e.maxHp, e.hp + 1);
    }
    const q = b.queue[0];
    if (!q) return;
    if (q.unit) {
        const pop = popOf(b.owner);
        if (pop.used > pop.cap) {
            if (b.owner === G.human && G.time - G.housedAt > 15) { G.housedAt = G.time; say('You need more houses to train more people.', 'bad'); }
            return;
        }
    }
    q.t += dt * (player(b.owner).ai ? player(b.owner).ai.eco : 1);
    if (q.t < q.time) return;
    b.queue.shift();
    const p = player(b.owner);
    if (q.unit) {
        const out = ringAround(b.tx, b.ty, b.def.size);
        const rally = b.rally;
        out.sort((a, c) => (rally ? Math.hypot(a[0] - rally.x, a[1] - rally.y) - Math.hypot(c[0] - rally.x, c[1] - rally.y) : a[1] - c[1]));
        const [x, y] = out[0] || [b.tx + b.def.size, b.ty + b.def.size];
        const u = spawnUnit(b.owner, q.unit, x, y);
        if (rally) {
            if (rally.tile !== undefined && objects[rally.tile] && u.def.cls === 'villager') cmdGatherTile([u], rally.tile);
            else if (rally.ent && G.ents.get(rally.ent) && u.def.cls === 'villager') {
                const re = G.ents.get(rally.ent);
                if (re.type === 'farm' || re.kind === 'carcass') cmdGatherEnt([u], re);
                else if (!re.built) cmdBuild([u], re);
                else cmdMove([u], rally.x, rally.y);
            } else cmdMove([u], rally.x, rally.y);
        }
        if (p.ai) aiNewUnit(p, u);
    } else if (q.tech) {
        p.techs.push(q.tech);
        if (q.tech === 'ayurveda') for (const e of G.ents.values()) if (e.kind === 'unit' && e.owner === b.owner && !e.dead) { e.maxHp = Math.round(e.maxHp * 1.2); e.hp = Math.round(e.hp * 1.2); }
        if (q.tech === 'pucca' || q.tech === 'fortified') {
            for (const e of G.ents.values()) {
                if (e.owner !== b.owner || e.kind !== 'building' || e.dead) continue;
                const m = q.tech === 'pucca' ? (e.type === 'house' ? 2 : 1) : (e.type === 'tc' || e.type === 'tower' ? 1.5 : 1);
                e.maxHp = Math.round(e.maxHp * m);
                e.hp = Math.round(e.hp * m);
            }
        }
        if (q.tech === 'plough') for (const e of G.ents.values()) if (e.type === 'farm' && e.owner === b.owner) e.food *= 1.5;
        if (b.owner === G.human) say(`Researched ${TECHS[q.tech].name}.`, 'good');
    } else if (q.age) {
        p.age++;
        say(b.owner === G.human ? `Your people enter the ${AGES[p.age].name}!` : `${p.name} has reached the ${AGES[p.age].name}.`, b.owner === G.human ? 'good' : 'info');
    }
}
