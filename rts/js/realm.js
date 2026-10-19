'use strict';

// ---------- Realm: diplomacy, settlements, threats and defence, elections and schooling ----------

// ---------- Relations between kingdoms ----------

function initRelations(n) {
    G.rel = Array.from({ length: n }, () => Array(n).fill('neutral'));
    G.opinion = Array.from({ length: n }, () => Array(n).fill(0));
    G.offers = [];
    for (let k = 0; k < n; k++) G.rel[k][k] = 'self';
}

function relation(a, b) {
    if (a === b) return 'self';
    if (a < 0 || b < 0 || !G.rel) return 'none';
    return G.rel[a][b];
}

function friendly(a, b) {
    return a === b || (a >= 0 && b >= 0 && relation(a, b) === 'ally');
}

function areEnemies(a, b) {
    return a >= 0 && b >= 0 && a !== b && relation(a, b) === 'enemy';
}

function setRelation(a, b, r) {
    if (a === b || a < 0 || b < 0) return;
    G.rel[a][b] = r;
    G.rel[b][a] = r;
    G.offers = G.offers.filter(o => !((o.from === a && o.to === b) || (o.from === b && o.to === a)));
}

function kingdomName(p) {
    return p.id === G.human ? 'your kingdom' : CIVS[p.civ].name;
}

function declareWar(a, b, quiet) {
    if (relation(a, b) === 'enemy' || a === b) return;
    setRelation(a, b, 'enemy');
    G.opinion[b][a] -= 60;
    const pa = player(a);
    const pb = player(b);
    const text = `${a === G.human ? 'You declare' : `${CIVS[pa.civ].name} declares`} war on ${b === G.human ? 'you' : CIVS[pb.civ].name}!`;
    if (!quiet) chronicleAll(text, a === G.human || b === G.human ? 'bad' : 'info');
    // Allies stand by each other.
    for (const q of G.players) {
        if (q.defeated || q.id === a || q.id === b) continue;
        if (relation(q.id, b) === 'ally' && relation(q.id, a) !== 'enemy') {
            setRelation(q.id, a, 'enemy');
            chronicleAll(`${q.id === G.human ? 'You join' : `${CIVS[q.civ].name} joins`} the war to defend ${b === G.human ? 'you' : CIVS[pb.civ].name}.`, q.id === G.human || a === G.human ? 'bad' : 'info');
        }
    }
}

function makePeace(a, b) {
    if (relation(a, b) !== 'enemy') return;
    setRelation(a, b, 'neutral');
    chronicleAll(`${a === G.human || b === G.human ? 'You make' : `${CIVS[player(a).civ].name} and ${CIVS[player(b).civ].name} make`} peace${a === G.human ? ` with ${CIVS[player(b).civ].name}` : b === G.human ? ` with ${CIVS[player(a).civ].name}` : ''}.`, 'good');
}

function makeAlliance(a, b) {
    setRelation(a, b, 'ally');
    G.opinion[a][b] += 20;
    G.opinion[b][a] += 20;
    chronicleAll(`${a === G.human || b === G.human ? `You and ${CIVS[player(a === G.human ? b : a).civ].name} are` : `${CIVS[player(a).civ].name} and ${CIVS[player(b).civ].name} are`} now allies.`, 'good');
}

// Things everyone hears about go into every chronicle, but the human only sees what concerns them.
function chronicleAll(text, kind) {
    for (const p of G.players) {
        p.chronicle.unshift({ text, kind, t: G.time });
        if (p.chronicle.length > 80) p.chronicle.pop();
    }
    say(text, kind);
}

function strength(owner) {
    let s = 0;
    for (const e of G.ents.values()) if (e.owner === owner && !e.dead && e.kind === 'unit' && e.def.cls !== 'villager') s += e.def.hp / 60;
    return s + settlementsOf(owner).length * 3;
}

function settlementsOf(owner) {
    return [...G.ents.values()].filter(e => e.owner === owner && !e.dead && (e.type === 'village' || (e.type === 'tc' && e.built)));
}

function realmTitle(owner) {
    const n = settlementsOf(owner).length;
    let t = REALM_TITLES[0];
    for (const r of REALM_TITLES) if (n >= r[0]) t = r;
    return { realm: t[1], ruler: t[2], n };
}

// What a kingdom thinks of another: shared enemies, gifts and grudges.
function opinionOf(a, b) {
    let o = G.opinion[a][b];
    for (const q of G.players) if (!q.defeated && areEnemies(a, q.id) && areEnemies(b, q.id)) o += 25;
    if (areEnemies(a, b)) o -= 40;
    const sa = strength(a);
    const sb = strength(b);
    if (sb > sa * 1.5) o += 10;
    return Math.round(o);
}

// The human asks a computer kingdom for something; the answer depends on its opinion.
function propose(from, to, what) {
    const op = opinionOf(to, from);
    if (what === 'alliance') {
        if (relation(from, to) === 'enemy') return 'They will not ally with someone they are at war with. Make peace first.';
        if (op >= 15) { makeAlliance(from, to); return null; }
        return `${CIVS[player(to).civ].name} declines (opinion ${op}). Gifts and common enemies win friends.`;
    }
    if (what === 'peace') {
        const tired = G.time - (G.warSince && G.warSince[`${Math.min(from, to)},${Math.max(from, to)}`] || 0) > 240;
        const losing = strength(to) < strength(from) * 0.8;
        if (op >= -30 || losing || tired) { makePeace(from, to); return null; }
        return `${CIVS[player(to).civ].name} refuses peace (opinion ${op}).`;
    }
    return 'Unknown proposal.';
}

function sendTribute(from, to, res, amount) {
    const p = player(from);
    if (p.res[res] < amount) return false;
    p.res[res] -= amount;
    player(to).res[res] += amount;
    G.opinion[to][from] += Math.round(amount / 10);
    return true;
}

// Computer kingdoms choose friends and foes.
function aiDiplomacy(p) {
    const ai = p.ai;
    if (G.time < ai.peaceUntil) return;
    const others = G.players.filter(q => q.id !== p.id && !q.defeated);
    const wars = others.filter(q => areEnemies(p.id, q.id));
    const dist = q => Math.hypot(q.start[0] - p.start[0], q.start[1] - p.start[1]);
    // War: pick on a neighbour that is not a friend, preferring the weak.
    if (wars.length < ai.maxWars && Math.random() < ai.warLust) {
        const near = others.filter(q => relation(p.id, q.id) === 'neutral').sort((a, b) => dist(a) - dist(b)).slice(0, 3);
        const target = near.sort((a, b) => strength(a.id) - strength(b.id) + (opinionOf(p.id, a.id) - opinionOf(p.id, b.id)) * 0.3)[0];
        if (target && opinionOf(p.id, target.id) < 30 && (target.id !== G.human || G.time > ai.firstAttack * 0.8)) {
            declareWar(p.id, target.id);
            G.warSince = G.warSince || {};
            G.warSince[`${Math.min(p.id, target.id)},${Math.max(p.id, target.id)}`] = G.time;
        }
    }
    // Alliance: befriend a neighbour that shares an enemy.
    if (Math.random() < 0.25) {
        const allies = q => G.players.filter(r => !r.defeated && relation(q.id, r.id) === 'ally').length;
        const cand = allies(p) >= 2 ? null : others.filter(q => relation(p.id, q.id) === 'neutral' && opinionOf(p.id, q.id) >= 15 && (q.id === G.human || allies(q) < 2)).sort((a, b) => dist(a) - dist(b))[0];
        if (cand) {
            if (cand.id === G.human) {
                if (!G.offers.some(o => o.from === p.id)) {
                    G.offers.push({ from: p.id, to: G.human, what: 'alliance', t: G.time });
                    say(`${CIVS[p.civ].name} offers you an alliance. Open Kingdoms to answer.`, 'info');
                }
            } else if (opinionOf(cand.id, p.id) >= 10) makeAlliance(p.id, cand.id);
        }
    }
    // Peace: tired of a long war, or losing it.
    for (const q of wars) {
        const key = `${Math.min(p.id, q.id)},${Math.max(p.id, q.id)}`;
        const long = G.time - ((G.warSince || {})[key] || 0) > 420;
        const losing = strength(p.id) < strength(q.id) * 0.5;
        if ((long || losing) && Math.random() < 0.3) {
            if (q.id === G.human) {
                if (!G.offers.some(o => o.from === p.id && o.what === 'peace')) {
                    G.offers.push({ from: p.id, to: G.human, what: 'peace', t: G.time });
                    say(`${CIVS[p.civ].name} asks for peace. Open Kingdoms to answer.`, 'info');
                }
            } else if (Math.random() < 0.5) makePeace(p.id, q.id);
        }
    }
}

function answerOffer(o, yes) {
    G.offers = G.offers.filter(x => x !== o);
    if (!yes) { G.opinion[o.from][o.to] -= 10; return; }
    if (o.what === 'alliance') makeAlliance(o.from, o.to);
    else if (o.what === 'peace') makePeace(o.from, o.to);
}

// ---------- Settlements: villages, towns and cities ----------

function placeName(rng) {
    return PLACE_START[Math.floor(rng() * PLACE_START.length)] + PLACE_END[Math.floor(rng() * PLACE_END.length)];
}

function foundVillages() {
    const used = new Set();
    for (const [x, y] of G.villageSpots || []) {
        const tx = x - 1;
        const ty = y - 1;
        if (!footprintFree('village', tx, ty)) continue;
        const v = placeBuilding(-2, 'village', tx, ty, true);
        let name = placeName(WORLD.rng);
        while (used.has(name)) name = placeName(WORLD.rng);
        used.add(name);
        v.name = name;
        v.level = WORLD.rng() < 0.25 ? 2 : 1;
        setSettlementLevel(v, v.level);
        v.capture = null;
        v.militia = 4 + v.level * 3;
        v.people = 20 + Math.floor(WORLD.rng() * 40) * v.level;
    }
}

function setSettlementLevel(v, level) {
    v.level = level;
    const L = SETTLEMENT_LEVELS[level];
    const ratio = v.hp / v.maxHp || 1;
    v.maxHp = L.hp;
    v.hp = Math.round(L.hp * ratio);
}

function settlementName(v) {
    return `${v.name} (${SETTLEMENT_LEVELS[v.level].name})`;
}

function developSettlement(owner, v) {
    const next = SETTLEMENT_LEVELS[v.level + 1];
    if (!next || v.owner !== owner) return 'This settlement cannot grow further.';
    if (player(owner).age < next.age) return `Requires the ${AGES[next.age].name}.`;
    if (!canAfford(owner, next.cost)) return 'Not enough resources.';
    pay(owner, next.cost);
    setSettlementLevel(v, v.level + 1);
    v.people += 40;
    chronicle(owner, `${v.name} grows into a ${next.name.toLowerCase()}!`, 'good');
    return null;
}

// Soldiers standing in a settlement win it over unless its defenders hold them off.
function updateSettlements(dt) {
    for (const v of G.ents.values()) {
        if (v.type !== 'village' || v.dead) continue;
        const L = SETTLEMENT_LEVELS[v.level];
        const R = 5.5;
        const by = new Map();
        for (const u of nearbyEnts(v.x, v.y, R)) {
            if (u.kind !== 'unit' || u.dead || u.owner < 0 || u.def.cls === 'villager' || u.def.cls === 'siege') continue;
            if (Math.hypot(u.x - v.x, u.y - v.y) > R) continue;
            by.set(u.owner, (by.get(u.owner) || 0) + 1);
        }
        let defenders = v.owner >= 0 ? (by.get(v.owner) || 0) : 0;
        for (const [o, n] of by) if (o !== v.owner && v.owner >= 0 && friendly(o, v.owner)) defenders += n;
        // Who is trying to take it: independent villages can be taken by anyone, owned ones only by enemies.
        let attacker = -1;
        let force = 0;
        for (const [o, n] of by) {
            if (o === v.owner || (v.owner >= 0 && !areEnemies(o, v.owner))) continue;
            if (n > force) { force = n; attacker = o; }
        }
        if (v.owner < 0) v.militia = Math.min(4 + v.level * 3, v.militia + dt * 0.05);
        if (attacker >= 0 && !defenders) {
            if (!v.capture || v.capture.owner !== attacker) v.capture = { owner: attacker, p: 0 };
            const resist = v.owner < 0 ? v.militia : 2 + v.level * 2;
            v.capture.p += dt * Math.max(0.6, force * 2.2 - resist * 0.8) * (v.owner < 0 ? 1.3 : 1);
            if (v.owner < 0) v.militia = Math.max(0, v.militia - dt * force * 0.05);
            if (v.capture.p >= 100) captureSettlement(v, attacker);
        } else if (v.capture) {
            v.capture.p -= dt * (defenders ? 8 : 3);
            if (v.capture.p <= 0) v.capture = null;
        }
        // Towns and cities shoot arrows at enemies of their owner, and independents at anyone taking them.
        v.cooldown = (v.cooldown || 0) - dt;
        if ((L.arrows || v.owner < 0) && v.cooldown <= 0) {
            const range = 6;
            const targets = [];
            for (const u of nearbyEnts(v.x, v.y, range + 1)) {
                if (u.kind !== 'unit' || u.dead || u.owner < 0) continue;
                const hostile = v.owner < 0 ? (v.capture && u.owner === v.capture.owner && u.def.cls !== 'villager') : areEnemies(v.owner, u.owner);
                if (hostile && Math.hypot(u.x - v.x, u.y - v.y) < range) targets.push(u);
            }
            if (targets.length) {
                v.cooldown = 2;
                const shots = v.owner < 0 ? 1 + (v.level > 1 ? 1 : 0) : L.arrows;
                for (let k = 0; k < shots; k++) {
                    const t = targets[k % targets.length];
                    G.projectiles.push({ x: v.x, y: v.y, z: 2, src: v, srcOwner: v.owner, target: t, kind: 'arrow', speed: 11, dmg: Math.max(1, 4 - armourOf(t, true)), splash: 0 });
                }
            }
        }
        // Tribute flows to the owner.
        if (v.owner >= 0) {
            const k = L.tribute * dt * (civKind(v.owner) === 'trade' ? 1.3 : 1) * (realmTitle(v.owner).realm === 'Empire' ? 1.1 : 1);
            const r = player(v.owner).res;
            r.food += 0.35 * k;
            r.wood += 0.25 * k;
            r.gold += 0.15 * k;
        }
    }
}

function captureSettlement(v, owner) {
    const prev = v.owner;
    v.owner = owner;
    v.capture = null;
    v.queue = [];
    v.rally = null;
    v.militia = 0;
    v.hp = Math.max(v.hp, v.maxHp * 0.5);
    const who = owner === G.human ? 'You' : CIVS[player(owner).civ].name;
    const from = prev >= 0 ? ` from ${prev === G.human ? 'you' : CIVS[player(prev).civ].name}` : '';
    chronicleAll(`${who} ${owner === G.human ? 'win' : 'wins'} ${settlementName(v)}${from}!`, owner === G.human ? 'good' : prev === G.human ? 'bad' : 'info');
    if (prev >= 0) G.opinion[prev][owner] -= 30;
    updateTerritory();
    checkDefeat();
}

// An unhappy realm may lose its villages to revolt.
function settlementUnrest(pl) {
    if (pl.mood > 25) return;
    const mine = [...G.ents.values()].filter(e => e.type === 'village' && e.owner === pl.id);
    if (!mine.length || Math.random() > 0.15) return;
    const v = mine[Math.floor(Math.random() * mine.length)];
    v.owner = -2;
    v.militia = 4 + v.level * 3;
    chronicle(pl.id, `${settlementName(v)} rises in revolt against your unhappy rule and declares itself free!`, 'bad');
    updateTerritory();
}

// ---------- Spatial lookup ----------

const CELL = 8;

function rebuildCells() {
    const cells = new Map();
    for (const e of G.ents.values()) {
        if (e.dead && e.kind !== 'unit') continue;
        const k = Math.floor(e.x / CELL) * 1024 + Math.floor(e.y / CELL);
        let list = cells.get(k);
        if (!list) { list = []; cells.set(k, list); }
        list.push(e);
    }
    G.cells = cells;
}

function nearbyEnts(x, y, r) {
    const out = [];
    if (!G.cells) return out;
    const x0 = Math.floor((x - r) / CELL);
    const x1 = Math.floor((x + r) / CELL);
    const y0 = Math.floor((y - r) / CELL);
    const y1 = Math.floor((y + r) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
        const list = G.cells.get(cx * 1024 + cy);
        if (list) for (const e of list) out.push(e);
    }
    return out;
}

// ---------- Threats and defence ----------

// Every kingdom watches its land. When enemy soldiers come near its homes, soldiers and
// guards drop their work and gather to protect the town; others take shelter.
function updateThreats(pl) {
    const homes = [...G.ents.values()].filter(e => e.owner === pl.id && !e.dead && e.kind === 'building' && e.built && e.type !== 'wall' && e.type !== 'farm');
    const threats = [];
    const seen = new Set();
    for (const b of homes) {
        for (const u of nearbyEnts(b.x, b.y, 9)) {
            if (seen.has(u) || u.kind !== 'unit' || u.dead || !areEnemies(pl.id, u.owner) || u.def.cls === 'villager') continue;
            if (Math.hypot(u.x - b.x, u.y - b.y) > 9) continue;
            seen.add(u);
            threats.push(u);
        }
    }
    const was = pl.threat;
    if (threats.length) {
        let sx = 0;
        let sy = 0;
        for (const t of threats) { sx += t.x; sy += t.y; }
        pl.threat = { x: sx / threats.length, y: sy / threats.length, n: threats.length, at: G.time, since: was ? was.since : G.time };
        if (!was && pl.id === G.human) say(`Enemy soldiers in your land! ${threats.length} ${threats.length === 1 ? 'raider' : 'raiders'} near ${nearestPlace(pl.id, threats[0])}. Your guards and soldiers are gathering.`, 'bad');
        rallyDefenders(pl, threats);
    } else if (was && G.time - was.at > 8) {
        pl.threat = null;
        standDown(pl);
        if (pl.id === G.human) say('The danger has passed. Everyone returns to work.', 'good');
    }
}

function nearestPlace(owner, u) {
    let best = null;
    let bd = Infinity;
    for (const e of settlementsOf(owner)) { const d = Math.hypot(e.x - u.x, e.y - u.y); if (d < bd) { bd = d; best = e; } }
    return best ? (best.type === 'village' ? best.name : 'your capital') : 'your town';
}

function isDefender(u) {
    if (u.kind !== 'unit' || u.dead || !u.person && u.def.cls === 'siege') return false;
    if (u.def.cls === 'siege' || u.def.cls === 'animal') return false;
    if (u.def.cls !== 'villager') return true;
    return !!(u.guard || u.alarm) && !isChild(u);
}

function rallyDefenders(pl, threats) {
    const pick = u => threats.reduce((a, b) => (Math.hypot(a.x - u.x, a.y - u.y) < Math.hypot(b.x - u.x, b.y - u.y) ? a : b));
    for (const u of G.ents.values()) {
        if (u.owner !== pl.id || u.dead || u.kind !== 'unit') continue;
        const d = Math.hypot(u.x - pl.threat.x, u.y - pl.threat.y);
        if (isDefender(u)) {
            if (d > 45) continue;
            if (u.task && u.task.type === 'attack' && !u.task.auto) continue;
            if (u.task && u.task.type === 'attack' && u.task.defend) {
                const cur = G.ents.get(u.task.ent);
                if (cur && !cur.dead) continue;
            }
            if (u.task && !u.task.defend && !u.prevTask && (u.task.type === 'gather' || u.task.type === 'build')) u.prevTask = u.task;
            u.task = { type: 'attack', ent: pick(u).id, auto: true, defend: true };
            u.path = [];
        } else if (u.def.cls === 'villager' && d < 8 && !u.sheltering) {
            // Ordinary people run to the nearest shelter and come back later.
            const shelter = settlementsOf(pl.id).concat([...G.ents.values()].filter(e => e.owner === pl.id && e.type === 'fort' && e.built && !e.dead))
                .filter(e => Math.hypot(e.x - pl.threat.x, e.y - pl.threat.y) > 6)
                .sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y))[0];
            if (!shelter) continue;
            if (u.task && !u.prevTask && (u.task.type === 'gather' || u.task.type === 'build')) u.prevTask = u.task;
            u.sheltering = true;
            cmdMove([u], shelter.x, shelter.y + shelter.def.size / 2 + 1.5);
        }
    }
}

function standDown(pl) {
    for (const u of G.ents.values()) {
        if (u.owner !== pl.id || u.dead || u.kind !== 'unit') continue;
        const back = (u.task && u.task.defend) || u.sheltering;
        u.sheltering = false;
        if (pl.alarm) u.alarm = false;
        if (back) {
            if (u.prevTask) { u.task = u.prevTask; u.path = []; } else if (u.task && u.task.defend) u.task = null;
        }
        u.prevTask = null;
    }
    pl.alarm = false;
}

// The alarm bell: every grown-up takes up arms until the all-clear.
function soundAlarm(owner, on) {
    const pl = player(owner);
    pl.alarm = on;
    for (const u of G.ents.values()) {
        if (u.owner !== owner || u.dead || u.kind !== 'unit' || u.def.cls !== 'villager' || isChild(u)) continue;
        u.alarm = on;
    }
    if (on) {
        chronicle(owner, 'The alarm bell rings! Every grown man and woman takes up arms.', 'bad');
        if (pl.threat) rallyDefenders(pl, [...G.ents.values()].filter(e => areEnemies(owner, e.owner) && e.kind === 'unit' && !e.dead && Math.hypot(e.x - pl.threat.x, e.y - pl.threat.y) < 12));
    } else {
        standDown(pl);
        chronicle(owner, 'All clear. The people put down their arms and return to work.', 'good');
    }
}

// ---------- Schooling ----------

function hasBuilt(owner, type) {
    const pl = player(owner);
    const key = `${type}`;
    if (!pl.builtCache || pl.builtCache.t !== Math.floor(G.time)) pl.builtCache = { t: Math.floor(G.time), m: {} };
    if (pl.builtCache.m[key] === undefined) pl.builtCache.m[key] = [...G.ents.values()].find(e => e.owner === owner && e.type === type && e.built && !e.dead) || null;
    return pl.builtCache.m[key];
}

// Where a person is in life: play, school, college or work.
function stageOf(u) {
    if (!u.person) return 'adult';
    const a = ageOf(u);
    if (a < SCHOOL_AGE) return 'infant';
    if (a < ADULT_AGE) return hasBuilt(u.owner, 'gurukul') ? 'school' : a < WORK_AGE ? 'infant' : 'child';
    if (a < COLLEGE_END && u.def.cls === 'villager' && u.person.college !== false && hasBuilt(u.owner, 'university')) return 'college';
    return 'adult';
}

function studyStream(u) {
    if (!u.person.stream) {
        const s = Object.entries(u.person.skills).filter(([k]) => k !== 'fight').sort((a, b) => b[1] - a[1] + (Math.random() - 0.5) * 6)[0];
        u.person.stream = s ? s[0] : 'food';
    }
    return u.person.stream;
}

function doStudy(u, dt, stage) {
    const place = hasBuilt(u.owner, stage === 'school' ? 'gurukul' : 'university');
    if (!place) return;
    if (distToEnt(u, place) > 1.2) {
        if (!u.path.length) pathToward(u, goalsFor(place), Math.round(place.x), Math.round(place.y), `study${place.id}`);
        moveAlong(u, dt);
        return;
    }
    u.path = [];
    u.studying = true;
    if (stage === 'school') {
        for (const k of ['food', 'wood', 'stone', 'gold', 'build']) if (u.person.skills[k] < 30) gainSkill(u, k, dt * 0.08);
    } else {
        const s = studyStream(u);
        if (u.person.skills[s] < 60) gainSkill(u, s, dt * 0.25);
        if (u.person.skills.build < 25) gainSkill(u, 'build', dt * 0.05);
    }
}

// ---------- Elections and offices ----------

function reputation(u) {
    const p = u.person;
    return Object.values(p.skills).reduce((a, b) => a + b, 0) * 0.4 + Math.min(60, ageOf(u)) * 0.5 + (p.lead || 0) + (p.kills || 0) * 2;
}

function adults(owner) {
    return [...G.ents.values()].filter(e => e.owner === owner && !e.dead && e.person && !isChild(e) && stageOf(e) === 'adult');
}

// Every grown-up votes: first for their own family's candidate, otherwise for the most respected.
function runVote(voters, candidates, weight) {
    const votes = new Map(candidates.map(c => [c.id, 0]));
    for (const v of voters) {
        let pick = candidates.find(c => c.person.family === v.person.family);
        if (!pick) {
            let best = -Infinity;
            for (const c of candidates) {
                const score = weight(c) + (Math.random() - 0.5) * 30;
                if (score > best) { best = score; pick = c; }
            }
        }
        votes.set(pick.id, votes.get(pick.id) + 1);
    }
    return candidates.map(c => ({ c, v: votes.get(c.id) })).sort((a, b) => b.v - a.v);
}

function holdElection(pl) {
    const people = adults(pl.id);
    if (people.length < 3) return;
    const result = { year: Math.floor(G.time / YEAR) + 1, races: [] };
    const villagers = people.filter(u => u.def.cls === 'villager');
    const mukhiyaCands = villagers.sort((a, b) => reputation(b) - reputation(a)).slice(0, 3);
    if (mukhiyaCands.length) {
        const r = runVote(people, mukhiyaCands, reputation);
        const prev = pl.mukhiya;
        pl.mukhiya = r[0].c.id;
        r[0].c.person.lead = (r[0].c.person.lead || 0) + 5;
        result.races.push({ office: 'Mukhiya', title: 'Village head', results: r.map(x => ({ id: x.c.id, name: x.c.person.name, votes: x.v })) });
        chronicle(pl.id, `Election! ${r[0].c.person.name} is ${prev === r[0].c.id ? 're-elected' : 'elected'} Mukhiya with ${r[0].v} votes${r[1] ? ` (${r[1].c.person.name}: ${r[1].v})` : ''}.`, 'good');
    }
    if (hasBuilt(pl.id, 'karyalaya')) {
        pl.officers = pl.officers || {};
        for (const [k, o] of Object.entries(OFFICES)) {
            const pool = k === 'police' ? people.filter(u => u.guard) : k === 'fight' ? people : villagers;
            const skillKey = k === 'police' ? 'fight' : k;
            const cands = pool.filter(u => u.id !== pl.mukhiya).sort((a, b) => b.person.skills[skillKey] - a.person.skills[skillKey]).slice(0, 3);
            if (!cands.length) { delete pl.officers[k]; continue; }
            const r = runVote(people, cands, c => c.person.skills[skillKey] * 1.5 + reputation(c) * 0.3);
            pl.officers[k] = r[0].c.id;
            r[0].c.person.lead = (r[0].c.person.lead || 0) + 3;
            result.races.push({ office: o.title, title: o.role, results: r.map(x => ({ id: x.c.id, name: x.c.person.name, votes: x.v })) });
        }
        if (pl.id === G.human) say(`New officers are chosen for every stream of work. See People → Government.`, 'info');
    }
    pl.lastElection = result;
    pl.nextElection = G.time + ELECTION_YEARS * YEAR;
}

function updateGovernment(pl) {
    const council = hasBuilt(pl.id, 'panchayat');
    if (!council) { pl.mukhiya = null; pl.officers = {}; pl.nextElection = null; return; }
    if (!pl.nextElection) { holdElection(pl); return; }
    // Officers who die or grow too old leave their posts until the next vote.
    for (const [k, id] of Object.entries(pl.officers || {})) { const o = G.ents.get(id); if (!o || o.dead) delete pl.officers[k]; }
    if (pl.mukhiya && (!G.ents.get(pl.mukhiya) || G.ents.get(pl.mukhiya).dead)) pl.mukhiya = null;
    if (G.time >= pl.nextElection || (!pl.mukhiya && G.time - (pl.lastVacancy || 0) > 30)) {
        if (!pl.mukhiya) pl.lastVacancy = G.time;
        holdElection(pl);
    }
}

// The officer of a stream speeds up and teaches everyone working in it.
function officerOf(owner, key) {
    const pl = player(owner);
    const id = pl.officers && pl.officers[key];
    const o = id && G.ents.get(id);
    return o && !o.dead ? o : null;
}

function officerBonus(owner, key) {
    const o = officerOf(owner, key);
    return o ? 1 + o.person.skills[key === 'police' ? 'fight' : key] * 0.0015 : 1;
}

function officeHeld(u) {
    const pl = player(u.owner);
    if (pl.mukhiya === u.id) return { key: 'mukhiya', title: 'Mukhiya', role: 'Village head' };
    for (const [k, id] of Object.entries(pl.officers || {})) if (id === u.id) return { key: k, ...OFFICES[k] };
    return null;
}

// ---------- The realm tick ----------

function realmTick(dt) {
    G.realmClock = (G.realmClock || 0) + dt;
    G.terrClock = (G.terrClock || 0) + dt;
    if (G.terrClock > 3) { G.terrClock = 0; updateTerritory(); }
    if (G.realmClock < 1) return;
    const d = G.realmClock;
    G.realmClock = 0;
    updateSettlements(d);
    for (const pl of G.players) {
        if (pl.defeated) continue;
        updateThreats(pl);
        updateGovernment(pl);
    }
    G.diploClock = (G.diploClock || 0) + d;
    if (G.diploClock > 20) {
        G.diploClock = 0;
        for (const pl of G.players) {
            if (pl.defeated) continue;
            if (pl.ai) aiDiplomacy(pl);
            settlementUnrest(pl);
        }
        G.offers = G.offers.filter(o => G.time - o.t < 120);
    }
}
