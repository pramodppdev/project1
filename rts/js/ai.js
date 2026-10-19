'use strict';

// ---------- Computer kingdoms ----------

const AI_LEVELS = {
    easy: { eco: 0.75, vills: 24, firstAttack: 720, wave: 7, gap: 240, techs: 0.3 },
    normal: { eco: 1, vills: 40, firstAttack: 480, wave: 10, gap: 200, techs: 0.7 },
    hard: { eco: 1.25, vills: 55, firstAttack: 330, wave: 13, gap: 160, techs: 1 },
};

function newAI(p, difficulty) {
    const L = AI_LEVELS[difficulty] || AI_LEVELS.normal;
    return { ...L, level: difficulty, nextAttack: L.firstAttack, waves: 0, attacking: false, target: null, capture: null, peaceUntil: L.firstAttack * 0.6, maxWars: difficulty === 'hard' ? 2 : 1, warLust: difficulty === 'easy' ? 0.15 : difficulty === 'hard' ? 0.45 : 0.3 };
}

function aiNewUnit(p, u) {
    if (u.def.cls === 'villager') return;
    const [sx, sy] = p.start;
    const [ex, ey] = enemyDirection(p);
    cmdMove([u], sx + ex * 6, sy + ey * 6);
}

function enemyDirection(p) {
    const [sx, sy] = p.start;
    const dx = MAP_W / 2 - sx;
    const dy = MAP_H / 2 - sy;
    const d = Math.hypot(dx, dy) || 1;
    return [dx / d, dy / d];
}

function aiMine(p) {
    const out = { vills: [], kids: [], army: [], buildings: [], tc: null, byType: {}, pending: {} };
    for (const e of G.ents.values()) {
        if (e.owner !== p.id || e.dead) continue;
        if (e.kind === 'unit') (e.def.cls === 'villager' ? (canWork(e) ? out.vills : out.kids) : out.army).push(e);
        else {
            out.buildings.push(e);
            out.byType[e.type] = (out.byType[e.type] || 0) + 1;
            if (!e.built) out.pending[e.type] = (out.pending[e.type] || 0) + 1;
            if (e.type === 'tc' && (!out.tc || e.built)) out.tc = e;
            if (e.type === 'village' && !out.village) out.village = e;
        }
    }
    if (!out.tc && out.village) out.tc = out.village;
    return out;
}

function aiSpot(p, type, near, dmin, dmax) {
    const n = BUILDING_TYPES[type].size;
    const pad = type === 'farm' || type === 'tower' ? 0 : 1;
    const [cx, cy] = near;
    for (let d = dmin; d <= dmax; d++) {
        const tries = [];
        for (let k = 0; k < 16 + d * 4; k++) {
            const a = (k / (16 + d * 4)) * Math.PI * 2 + p.id;
            tries.push([Math.round(cx + Math.cos(a) * d - n / 2), Math.round(cy + Math.sin(a) * d - n / 2)]);
        }
        for (const [tx, ty] of tries) {
            if (!footprintFree(type, tx, ty)) continue;
            let ok = true;
            for (let y = ty - pad; y < ty + n + pad && ok; y++) for (let x = tx - pad; x < tx + n + pad; x++) {
                if (!inMap(x, y) || occ[idx(x, y)] || (pad && objects[idx(x, y)] && !RESOURCE_OBJECTS[objects[idx(x, y)]])) { ok = false; break; }
            }
            if (ok) return [tx, ty];
        }
    }
    return null;
}

function aiBuild(p, me, type, near, dmin = 3, dmax = 14, builders = 1) {
    const def = BUILDING_TYPES[type];
    if (def.age > p.age || !canAfford(p.id, def.cost)) return false;
    const spot = aiSpot(p, type, near || [me.tc.x, me.tc.y], dmin, dmax) || (near ? null : aiSpot(p, type, [me.tc.x, me.tc.y], dmax, dmax + 10));
    if (!spot) return 'nospot';
    const free = me.vills.filter(v => (!v.task || v.task.type === 'gather') && !isChild(v)).sort((a, b) => Math.hypot(a.x - spot[0], a.y - spot[1]) - Math.hypot(b.x - spot[0], b.y - spot[1]));
    const crew = free.slice(0, builders);
    if (!crew.length) return false;
    return !!tryPlace(p.id, type, spot[0], spot[1], crew);
}

function aiThink(p) {
    const ai = p.ai;
    const me = aiMine(p);
    if (!me.tc) {
        // Without a town center, rebuild one if possible; otherwise fight on.
        if (me.vills.length && p.age >= 2 && canAfford(p.id, BUILDING_TYPES.tc.cost)) {
            me.tc = { x: p.start[0], y: p.start[1] };
            aiBuild(p, me, 'tc', p.start, 0, 10, 3);
        }
        aiMilitary(p, me);
        return;
    }
    const r = p.res;
    const pop = popOf(p.id);
    const saving = !ageReady(p.id) && AGES[p.age + 1] && me.vills.length >= [16, 24, 28][p.age];
    const reserveAge = saving ? AGES[p.age + 1].cost : null;
    ai.saving = !!saving;

    // Villagers (paused while saving up for the next age, unless food is plentiful).
    const villOk = !saving || canAffordAfter(p, UNIT_TYPES.villager.cost, reserveAge);
    if (me.vills.length < ai.vills && villOk && !me.tc.queue.length && me.tc.built) enqueue(me.tc, { unit: 'villager' });

    // Houses ahead of need.
    const housesPending = me.pending.house || 0;
    if (pop.cap < POP_MAX && pop.cap - pop.used < 3 + me.buildings.filter(b => b.def.trains && b.built).length && housesPending < 1 + (pop.used > 20 ? 1 : 0)) aiBuild(p, me, 'house', null, 5, 16);

    // Storehouses beside distant wood and gold.
    for (const res of ['wood', 'gold']) {
        const tile = nearestResTile(res, me.tc.x, me.tc.y, res === 'gold' ? 34 : 18);
        if (tile < 0) continue;
        const tx = tile % MAP_W;
        const ty = Math.floor(tile / MAP_W);
        const drop = nearestDrop(p.id, res, tx, ty);
        const far = !drop || Math.hypot(drop.x - tx, drop.y - ty) > 7;
        if (far && !me.pending.storehouse && me.vills.length >= 6 && r.wood >= 100) aiBuild(p, me, 'storehouse', [tx, ty], 2, 6);
    }

    // Farms come first once the wild food runs out.
    const shares = aiShares(p);
    const foodVills = me.vills.filter(v => v.task && (v.task.res === 'food' || (v.task.type === 'build' && G.ents.get(v.task.ent)?.type === 'farm'))).length;
    const wild = nearestResTile('food', me.tc.x, me.tc.y, 10) >= 0 || [...G.ents.values()].some(e => !e.dead && (e.kind === 'carcass' && e.food > 0 || e.type === 'deer') && Math.hypot(e.x - me.tc.x, e.y - me.tc.y) < 14);
    const freeFarm = me.buildings.some(b => b.type === 'farm' && b.built && b.food > 0 && !farmTaken(b, null));
    let farmFirst = false;
    if (!wild && !freeFarm && foodVills < shares.food * me.vills.length - 1) {
        farmFirst = true;
        const spot = aiSpot(p, 'farm', [me.tc.x, me.tc.y], 3, 10);
        const v = me.vills.find(v => v.task && v.task.type === 'gather' && v.task.res !== 'food' && !isChild(v)) || me.vills.find(v => !v.task && !isChild(v));
        if (spot && v && canAfford(p.id, BUILDING_TYPES.farm.cost)) tryPlace(p.id, 'farm', spot[0], spot[1], [v]);
    }

    // Buildings for each age.
    const want = [['barracks', 0, 9], ['storehouse', 0, 7], ['shmashan', 0, 11], ['well', 0, 14], ['thana', 0, 16], ['panchayat', 1, 0], ['karyalaya', 1, 0], ['range', 1, 0], ['university', 1, 0], ['stable', 1, 0], ['temple', 1, 0], ['gurukul', 1, 0], ['tower', 1, 0], ['gajashala', 2, 0], ['workshop', 2, 0], ['barracks', 2, 0], ['tower', 2, 0]];
    const seen = {};
    for (const [type, age, vills] of farmFirst ? [] : want) {
        seen[type] = (seen[type] || 0) + 1;
        if (p.age < age || me.vills.length < vills) continue;
        if ((me.byType[type] || 0) >= seen[type]) continue;
        if (me.pending[type]) break;
        const res = aiBuild(p, me, type, type === 'tower' ? towerSpot(p) : null, type === 'tower' ? 0 : 4, 16, 2);
        if (res === 'nospot') continue;
        break;
    }

    // Spend spare stone on watch towers facing the enemy.
    if (!farmFirst && p.age >= 1 && p.res.stone > 350 && (me.byType.tower || 0) < 6 && !me.pending.tower) aiBuild(p, me, 'tower', towerSpot(p), 0, 8, 1);

    // Age up as soon as the town can afford it.
    if (reserveAge && me.tc.built && !me.tc.queue.some(q => q.age) && canAfford(p.id, AGES[p.age + 1].cost)) {
        if (me.tc.queue.length) cancelQueue(me.tc, me.tc.queue.length - 1);
        enqueue(me.tc, { age: true });
    }

    // Technologies.
    if (Math.random() < ai.techs) {
        for (const b of me.buildings) {
            if (!b.built || b.queue.length) continue;
            const options = Object.entries(TECHS).filter(([k, t]) => t.at === b.type && t.age <= p.age && !hasTech(p.id, k));
            for (const [k, t] of options) {
                if (reserveAge && !canAffordAfter(p, t.cost, AGES[p.age + 1].cost)) continue;
                if (enqueue(b, { tech: k })) break;
            }
        }
    }

    aiAssign(p, me);
    aiMilitary(p, me, farmFirst ? { ...(reserveAge || {}), wood: Math.max(60, (reserveAge || {}).wood || 0) } : reserveAge);
}

function canAffordAfter(p, cost, keep) {
    return RES_KEYS.every(k => p.res[k] - (cost[k] || 0) >= (keep[k] || 0));
}

function towerSpot(p) {
    const [sx, sy] = p.start;
    const [ex, ey] = enemyDirection(p);
    return [Math.round(sx + ex * 9 + (Math.random() - 0.5) * 8), Math.round(sy + ey * 9 + (Math.random() - 0.5) * 8)];
}

function aiShares(p) {
    const shares = p.age === 0 ? { food: 0.55, wood: 0.37, gold: 0.05, stone: 0.03 }
        : p.age === 1 ? { food: 0.46, wood: 0.31, gold: 0.2, stone: 0.03 }
            : { food: 0.42, wood: 0.25, gold: 0.27, stone: 0.06 };
    // Stop piling up what is not being spent.
    const next = AGES[p.age + 1];
    for (const k of RES_KEYS) {
        const need = next && next.cost ? next.cost[k] || 0 : 0;
        if (p.res[k] > Math.max(400, need + 150)) shares[k] *= 0.15;
    }
    const total = RES_KEYS.reduce((a, k) => a + shares[k], 0);
    for (const k of RES_KEYS) shares[k] /= total;
    return shares;
}

function aiAssign(p, me) {
    const shares = aiShares(p);
    const count = { food: 0, wood: 0, gold: 0, stone: 0 };
    const idle = [];
    for (const v of me.vills) {
        if (v.task && v.task.type === 'build') continue;
        if (v.task && v.task.type === 'gather') count[v.task.res]++;
        else idle.push(v);
    }
    // Rebalance: move one villager from the most over-staffed job when another job is starving.
    const n = me.vills.length;
    const deficit = k => shares[k] * n - count[k];
    if (!idle.length && n > 8) {
        const most = RES_KEYS.reduce((a, b) => (deficit(a) < deficit(b) ? a : b));
        const least = RES_KEYS.reduce((a, b) => (deficit(a) > deficit(b) ? a : b));
        if (deficit(least) > 1.5 && deficit(most) < -1.5) {
            const v = me.vills.find(v => v.task && v.task.type === 'gather' && v.task.res === most);
            if (v) { count[most]--; v.task = null; idle.push(v); }
        }
    }
    for (const v of idle) {
        const order = RES_KEYS.slice().sort((a, b) => deficit(b) - deficit(a));
        for (const res of order) {
            if (aiGather(p, me, v, res)) { count[res]++; break; }
        }
    }
}

function aiGather(p, me, v, res) {
    if (res === 'food') {
        // Hunt, then berries, then farms.
        let best = null;
        let bd = 14;
        for (const e of nearbyEnts(me.tc.x, me.tc.y, 14)) {
            if (e.dead) continue;
            const ok = (e.kind === 'carcass' && e.food > 0) || (e.kind === 'unit' && e.def.cls === 'animal' && e.type === 'deer');
            if (!ok) continue;
            const d = Math.hypot(e.x - me.tc.x, e.y - me.tc.y);
            if (d < bd) { bd = d; best = e; }
        }
        if (best) { cmdGatherEnt([v], best); return true; }
        const berry = nearestResTile('food', me.tc.x, me.tc.y, 10);
        if (berry >= 0) { cmdGatherTile([v], berry); return true; }
        const farm = me.buildings.find(b => b.type === 'farm' && b.built && b.food > 0 && !farmTaken(b, v));
        if (farm) { cmdGatherEnt([v], farm); return true; }
        if (!isChild(v) && canAfford(p.id, BUILDING_TYPES.farm.cost)) {
            const spot = aiSpot(p, 'farm', [me.tc.x, me.tc.y], 3, 9);
            if (spot && tryPlace(p.id, 'farm', spot[0], spot[1], [v])) return true;
        }
        return false;
    }
    let from = [v.x, v.y];
    const drop = nearestDrop(p.id, res, v.x, v.y);
    if (drop) from = [drop.x, drop.y];
    for (const r of [8, 16, 28, 45]) {
        const tile = nearestResTile(res, from[0], from[1], r);
        if (tile >= 0) { cmdGatherTile([v], tile); return true; }
    }
    return false;
}

function aiMilitary(p, me, reserveAge) {
    const ai = p.ai;
    // Train soldiers from every military building, keeping enough for the next age.
    const keep = reserveAge || {};
    const cap = [5, 16, 30, 45][p.age];
    for (const b of me.buildings) {
        if (me.army.length >= cap) break;
        if (!b.built || !b.def.trains || b.type === 'tc' || b.queue.length >= 2) continue;
        const options = b.def.trains.filter(t => UNIT_TYPES[t].age <= p.age && (!UNIT_TYPES[t].tech || hasTech(p.id, UNIT_TYPES[t].tech)));
        if (b.type === 'workshop' && me.army.filter(u => u.def.cls === 'siege').length >= 3) continue;
        const pick = options[Math.floor(Math.random() * options.length)];
        if (pick && canAffordAfter(p, unitCost(p.id, pick), keep)) enqueue(b, { unit: pick });
    }

    // Under attack: the realm's alarm system rallies soldiers; ring the bell when outnumbered.
    if (p.threat) {
        if (p.threat.n > me.army.length + 2 && !p.alarm) soundAlarm(p.id, true);
        return;
    }

    // Police guards from among the villagers once there is a police post.
    if (me.byType.thana) {
        const guards = me.vills.filter(v => v.guard).length;
        const want = Math.min(6, Math.floor(me.vills.length / 8));
        if (guards < want) { const v = me.vills.find(v => !v.guard && !isChild(v)); if (v) v.guard = true; }
    }

    // Grow the realm's villages into towns and cities when rich.
    for (const v of me.buildings) {
        if (v.type !== 'village') continue;
        const next = SETTLEMENT_LEVELS[v.level + 1];
        if (next && p.age >= next.age && canAffordAfter(p, next.cost, keep) && Math.random() < 0.2) developSettlement(p.id, v);
    }

    // A fort on the border facing the nearest enemy.
    if (p.age >= 2 && !me.byType.fort && !me.pending.fort) {
        const foe = G.players.filter(q => areEnemies(p.id, q.id) && !q.defeated).sort((a, b) => Math.hypot(a.start[0] - p.start[0], a.start[1] - p.start[1]) - Math.hypot(b.start[0] - p.start[0], b.start[1] - p.start[1]))[0];
        if (foe) {
            const dx = foe.start[0] - p.start[0];
            const dy = foe.start[1] - p.start[1];
            const d = Math.hypot(dx, dy) || 1;
            aiBuild(p, me, 'fort', [Math.round(p.start[0] + dx / d * 9), Math.round(p.start[1] + dy / d * 9)], 0, 7, 3);
        }
    }

    const free = me.army.filter(u => !u.task || u.task.type === 'move' || (u.task.auto && !u.task.defend));

    // Send attack waves against kingdoms at war with us.
    if (G.time > ai.nextAttack && me.army.length >= ai.wave + ai.waves * 2) {
        const target = aiTarget(p);
        if (target) {
            ai.waves++;
            ai.nextAttack = G.time + ai.gap;
            for (const u of me.army) cmdAttack([u], target);
            ai.target = target.id;
            ai.attacking = true;
            if (target.owner === G.human) say(`${CIVS[p.civ].name} is marching on you!`, 'bad');
            return;
        }
    }
    if (ai.attacking) {
        const t = G.ents.get(ai.target);
        if (!t || t.dead || !areEnemies(p.id, t.owner)) {
            const next = aiTarget(p);
            if (next && me.army.length >= 3) { ai.target = next.id; for (const u of free) cmdAttack([u], next); }
            else ai.attacking = false;
        } else {
            for (const u of me.army) if (!u.task) cmdAttack([u], t);
        }
        return;
    }

    // Expand: march on the nearest independent or enemy-held settlement and win it over.
    const goal = ai.capture && G.ents.get(ai.capture.id);
    if (goal && (goal.owner === p.id || G.time - ai.capture.at > 180 || (goal.owner >= 0 && !areEnemies(p.id, goal.owner)))) ai.capture = null;
    if (!ai.capture && free.length >= 4 && G.time > ai.firstAttack * 0.5) {
        const homes = settlementsOf(p.id);
        let best = null;
        let bd = 55;
        for (const v of G.ents.values()) {
            if (v.type !== 'village' || v.dead || v.owner === p.id) continue;
            if (v.owner >= 0 && !areEnemies(p.id, v.owner)) continue;
            const d = Math.min(...homes.map(h => Math.hypot(h.x - v.x, h.y - v.y))) + (v.owner >= 0 ? 6 : 0) + v.level * 3;
            if (d < bd) { bd = d; best = v; }
        }
        if (best) ai.capture = { id: best.id, at: G.time };
    }
    if (ai.capture) {
        const v = G.ents.get(ai.capture.id);
        const party = free.slice(0, Math.max(4, Math.ceil(free.length * 0.75)));
        for (const u of party) if (Math.hypot(u.x - v.x, u.y - v.y) > 4 && (!u.task || u.task.type !== 'move')) cmdMove([u], v.x + (Math.random() - 0.5) * 3, v.y + 2 + (Math.random() - 0.5) * 2);
    }
}

function aiTarget(p) {
    const [sx, sy] = p.start;
    let best = null;
    let bd = Infinity;
    for (const e of G.ents.values()) {
        if (e.kind !== 'building' || e.dead || !areEnemies(p.id, e.owner) || player(e.owner).defeated || e.type === 'village' || e.type === 'wall') continue;
        // Prefer the human a little so the player always sees action.
        const d = Math.hypot(e.x - sx, e.y - sy) * (e.owner === G.human ? 0.85 : 1) + (e.type === 'tower' || e.type === 'fort' ? 10 : 0);
        if (d < bd) { bd = d; best = e; }
    }
    return best;
}
