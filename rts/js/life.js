'use strict';

// ---------- Village life: people, families, ageing, skills, mood, festivals and last rites ----------

function initLife(p) {
    p.mood = 60;
    p.moodParts = [];
    p.families = new Map();
    p.nextFamily = 1;
    p.usedNames = new Set();
    p.unhonoured = [];
    p.grief = [];
    p.events = [];
    p.festival = null;
    p.prices = { food: 100, wood: 100, stone: 120 };
    p.mukhiya = null;
    p.fallenTally = 0;
    p.fallenAt = 0;
    p.chronicle = [];
}

function chronicle(owner, text, kind = '') {
    const p = player(owner);
    p.chronicle.unshift({ text, kind, t: G.time });
    if (p.chronicle.length > 60) p.chronicle.pop();
    if (owner === G.human) say(text, kind);
}

function pickName(owner, female) {
    const p = player(owner);
    const list = NAMES[female ? 'f' : 'm'];
    const rng = Math.random;
    for (let k = 0; k < 30; k++) {
        const n = list[Math.floor(rng() * list.length)];
        if (!p.usedNames.has(n)) { p.usedNames.add(n); return n; }
    }
    let n = 2;
    const base = list[Math.floor(rng() * list.length)];
    while (p.usedNames.has(`${base} ${n}`)) n++;
    p.usedNames.add(`${base} ${n}`);
    return `${base} ${n}`;
}

function newFamily(owner, founder) {
    const p = player(owner);
    const f = { id: p.nextFamily++, owner, name: `${founder}'s household`, members: new Set(), home: null, lastBirth: -999 };
    p.families.set(f.id, f);
    return f;
}

function ageOf(u) {
    return u.person ? (G.time - u.person.born) / YEAR : 30;
}

function isChild(u) {
    return !!u.person && ageOf(u) < ADULT_AGE;
}

function canWork(u) {
    if (!u.person) return true;
    const st = stageOf(u);
    return st === 'adult' || st === 'child';
}

// Every soldier and villager is a person; siege engines are not.
function attachPerson(u, opts = {}) {
    if (u.owner < 0 || u.def.cls === 'siege' || u.def.cls === 'animal') return;
    const military = u.def.cls !== 'villager';
    const female = opts.female ?? (military ? Math.random() < 0.18 : Math.random() < 0.5);
    const age = opts.age ?? (military ? 17 + Math.random() * 12 : 16 + Math.random() * 14);
    const person = { name: pickName(u.owner, female), female, born: G.time - age * YEAR, family: null, spouse: null, skills: { food: 0, wood: 0, stone: 0, gold: 0, build: 0, fight: military ? 15 : 0 }, kills: 0, parents: opts.parents || null };
    if (opts.skills) for (const k of Object.keys(opts.skills)) person.skills[k] = opts.skills[k];
    u.person = person;
    const fam = opts.family ? player(u.owner).families.get(opts.family) : newFamily(u.owner, person.name);
    joinFamily(u, fam);
    growBody(u);
}

function joinFamily(u, fam) {
    const old = u.person.family && player(u.owner).families.get(u.person.family);
    if (old) {
        old.members.delete(u.id);
        if (!old.members.size) player(u.owner).families.delete(old.id);
    }
    fam.members.add(u.id);
    u.person.family = fam.id;
}

function familyOf(u) {
    return u.person && u.person.family ? player(u.owner).families.get(u.person.family) : null;
}

function familyHead(f) {
    let best = null;
    for (const id of f.members) {
        const m = G.ents.get(id);
        if (!m || m.dead || isChild(m)) continue;
        if (!best || ageOf(m) > ageOf(best)) best = m;
    }
    return best;
}

// Children are small and frail; they grow into full strength.
function growBody(u) {
    const a = ageOf(u);
    const k = a >= ADULT_AGE ? 1 : 0.35 + 0.65 * (a / ADULT_AGE);
    const full = Math.round(u.def.hp * unitHpMult(u.owner, u.type));
    const maxHp = Math.max(6, Math.round(full * k));
    if (maxHp !== u.maxHp) {
        u.hp = Math.max(1, Math.round(u.hp * maxHp / (u.maxHp || maxHp)));
        u.maxHp = maxHp;
    }
    u.scale = a >= ADULT_AGE ? 1 : 0.5 + 0.5 * (a / ADULT_AGE);
}

function skillLevel(v) {
    let name = SKILL_LEVELS[0][1];
    for (const [min, n] of SKILL_LEVELS) if (v >= min) name = n;
    return name;
}

function rankOf(u) {
    let r = 0;
    RANKS.forEach(([min], k) => { if ((u.person ? u.person.kills : 0) >= min) r = k; });
    return r;
}

function bestSkill(u) {
    if (!u.person) return null;
    return Object.entries(u.person.skills).sort((a, b) => b[1] - a[1])[0];
}

function gainSkill(u, key, amount) {
    const p = u.person;
    if (!p) return;
    const a = ageOf(u);
    const learn = a < ADULT_AGE ? 1.7 : a >= ELDER_AGE ? 0.6 : 1;
    const before = p.skills[key];
    p.skills[key] = Math.min(100, before + amount * learn * (1 - before / 125));
    const lb = skillLevel(before);
    const la = skillLevel(p.skills[key]);
    if (la !== lb) {
        if (u.owner === G.human) {
            floatText(u.x, u.y, `${la} ${SKILL_WORD[key]}`, '#ffd34a');
            if (la === 'Expert' || la === 'Master') chronicle(u.owner, `${p.name} has become ${la === 'Expert' ? 'an' : 'a'} ${la} ${SKILL_WORD[key]}.`, 'good');
        }
    }
}

// How much better (or worse) this person works because of skill, age and the town's mood.
function personWorkMult(u, key) {
    let m = 1;
    if (u.person) {
        const a = ageOf(u);
        m *= 1 + (u.person.skills[key] || 0) * 0.006;
        if (a < ADULT_AGE) m *= 0.45;
        else if (a >= ELDER_AGE + 10) m *= 0.8;
        const pl = player(u.owner);
        if (pl.mukhiya === u.id) m *= 1.1;
        if (u.person.lead) m *= 1 + Math.min(20, u.person.lead) * 0.003;
    }
    if (u.owner >= 0) m *= moodMult(u.owner);
    return m;
}

function moodMult(owner) {
    const p = player(owner);
    let m = 0.85 + p.mood * 0.003;
    if (p.mukhiya) m *= 1.05;
    return m;
}

function floatText(x, y, text, color) {
    if (!G.floats) G.floats = [];
    G.floats.push({ x, y, text, color, t: G.time });
    if (G.floats.length > 40) G.floats.shift();
}

// ---------- Death and last rites ----------

function onPersonDeath(u, cause) {
    const pl = player(u.owner);
    const fam = familyOf(u);
    const p = u.person;
    if (fam) {
        fam.members.delete(u.id);
        if (!fam.members.size) pl.families.delete(fam.id);
    }
    if (p.spouse) {
        const s = G.ents.get(p.spouse);
        if (s && s.person) s.person.spouse = null;
    }
    if (pl.mukhiya === u.id) pl.mukhiya = null;
    pl.grief.push(G.time);
    const ground = [...G.ents.values()].find(e => e.owner === u.owner && e.type === 'shmashan' && e.built && !e.dead);
    if (ground) {
        ground.pyreUntil = Math.max(ground.pyreUntil || 0, G.time) + 12;
    } else {
        pl.unhonoured.push(G.time);
    }
    const a = Math.floor(ageOf(u));
    if (cause === 'age') {
        chronicle(u.owner, `${p.name} (${a}) has passed away peacefully.${ground ? ' The family performs the last rites at the cremation ground.' : ' With no cremation ground, the family cannot give proper last rites.'}`, ground ? '' : 'bad');
    } else if (u.owner === G.human) {
        pl.fallenTally++;
        if (G.time - pl.fallenAt > 8) {
            pl.fallenAt = G.time;
            const n = pl.fallenTally;
            pl.fallenTally = 0;
            chronicle(u.owner, n === 1 ? `${p.name}${isChild(u) ? ', a child,' : ''} has been killed.${ground ? '' : ' Build a cremation ground to honour the dead.'}` : `${n} of your people have fallen.${ground ? ' Their pyres burn at the cremation ground.' : ' Build a cremation ground to honour the dead.'}`, 'bad');
        }
    }
}

// A person who leaves the kingdom simply walks out of the family's life.
function leaveKingdom(u) {
    const pl = player(u.owner);
    const fam = familyOf(u);
    if (fam) { fam.members.delete(u.id); if (!fam.members.size) pl.families.delete(fam.id); }
    if (u.person && u.person.spouse) { const s = G.ents.get(u.person.spouse); if (s && s.person) s.person.spouse = null; }
    if (pl.mukhiya === u.id) pl.mukhiya = null;
    u.person = null;
    kill(u, null);
}

// ---------- Yearly life: growing up, marriage, birth, old age ----------

function freeHome(owner) {
    const taken = new Set([...player(owner).families.values()].map(f => f.home).filter(Boolean));
    for (const e of G.ents.values()) {
        if (e.owner === owner && !e.dead && e.built && e.type === 'house' && !taken.has(e.id)) return e;
    }
    return null;
}

function tryMarriages(pl) {
    const singles = { m: [], f: [] };
    for (const e of G.ents.values()) {
        if (e.owner !== pl.id || e.dead || !e.person || e.person.spouse) continue;
        const a = ageOf(e);
        if (a < 18 || a > 48) continue;
        singles[e.person.female ? 'f' : 'm'].push(e);
    }
    if (!singles.m.length || !singles.f.length) return;
    const groom = singles.m[Math.floor(Math.random() * singles.m.length)];
    const bride = singles.f.find(f => f.person.family !== groom.person.family && Math.abs(ageOf(f) - ageOf(groom)) < 14);
    if (!bride) return;
    const home = freeHome(pl.id);
    if (!home) {
        if (pl.id === G.human && G.time - (pl.homeHintAt || -999) > 90) {
            pl.homeHintAt = G.time;
            say(`${groom.person.name} and ${bride.person.name} wish to marry. Build a house for them.`, 'info');
        }
        return;
    }
    const fam = newFamily(pl.id, groom.person.name);
    fam.name = `${groom.person.name} and ${bride.person.name}'s household`;
    fam.home = home.id;
    joinFamily(groom, fam);
    joinFamily(bride, fam);
    groom.person.spouse = bride.id;
    bride.person.spouse = groom.id;
    pl.events.push({ until: G.time + 40, mood: 6, name: 'Wedding' });
    home.celebrateUntil = G.time + 15;
    chronicle(pl.id, `Wedding! ${groom.person.name} and ${bride.person.name} are married and move into a new house.`, 'good');
}

function tryBirths(pl) {
    const pop = popOf(pl.id);
    for (const fam of pl.families.values()) {
        if (!fam.home) continue;
        const home = G.ents.get(fam.home);
        if (!home || home.dead) { fam.home = null; continue; }
        let wife = null;
        for (const id of fam.members) {
            const m = G.ents.get(id);
            if (m && !m.dead && m.person.female && m.person.spouse && G.ents.get(m.person.spouse) && !G.ents.get(m.person.spouse).dead) wife = m;
        }
        if (!wife) continue;
        const a = ageOf(wife);
        if (a < 18 || a > 42 || fam.members.size >= 7 || G.time - fam.lastBirth < 2.5 * YEAR) continue;
        const chance = 0.5 * (4 / YEAR) * (pl.mood / 60);
        if (Math.random() > chance) continue;
        if (pop.used >= pop.cap || pl.res.food < 50) continue;
        pl.res.food -= 50;
        fam.lastBirth = G.time;
        const husband = G.ents.get(wife.person.spouse);
        const [x, y] = nearestPassable(home.x, home.y + home.def.size / 2 + 0.6);
        const child = spawnUnit(pl.id, 'villager', x, y, { age: 0, family: fam.id, parents: [husband.person.name, wife.person.name] });
        pop.used++;
        if (pl.id === G.human) floatText(x, y, 'A child is born', '#ffb0d0');
        chronicle(pl.id, `A ${child.person.female ? 'daughter' : 'son'}, ${child.person.name}, is born to ${husband.person.name} and ${wife.person.name}.`, 'good');
        pl.events.push({ until: G.time + 30, mood: 4, name: 'New child' });
    }
}

function ageing(pl) {
    for (const e of G.ents.values()) {
        if (e.owner !== pl.id || e.dead || !e.person) continue;
        const a = ageOf(e);
        const wasChild = e.scale !== undefined && e.scale < 1;
        growBody(e);
        if (wasChild && e.scale === 1) chronicle(pl.id, `${e.person.name} has come of age and joins the work of the village.`, 'info');
        // Toddlers stay close to home.
        if (a < WORK_AGE && e.task) { e.task = null; e.path = []; }
        if (a > 60 && Math.random() < Math.min(0.5, (a - 60) * 0.04) * (2 / YEAR)) kill(e, null, 'age');
    }
}

function updateMood(pl, dt) {
    const parts = [['Daily life', 50]];
    const has = t => (G.typeCount && G.typeCount[pl.id] && G.typeCount[pl.id][t]) || 0;
    const temples = has('temple');
    if (temples) parts.push(['Temple', 8]);
    const wells = Math.min(3, has('well'));
    if (wells) parts.push(['Wells', wells * 3]);
    if (has('panchayat')) parts.push(['Village council', 5]);
    if (pl.res.food > 300) parts.push(['Full granary', 5]);
    else if (pl.res.food < 30) parts.push(['Hunger', -10]);
    const pop = popOf(pl.id);
    if (pop.cap && pop.used >= pop.cap) parts.push(['Crowded homes', -5]);
    pl.unhonoured = pl.unhonoured.filter(t => G.time - t < 180);
    if (pl.unhonoured.length) parts.push(['Dead without last rites', -Math.min(20, pl.unhonoured.length * 4)]);
    pl.grief = pl.grief.filter(t => G.time - t < 90);
    if (pl.grief.length) parts.push(['Mourning', -Math.min(15, Math.round(pl.grief.length * 1.5))]);
    pl.events = pl.events.filter(ev => ev.until > G.time);
    for (const ev of pl.events) parts.push([ev.name, ev.mood]);
    if (pl.festival) parts.push([pl.festival.name, Math.round(pl.festival.mood * (temples ? 1 : 0.5) * (hasTech(pl.id, 'utsav') ? 1.4 : 1))]);
    const target = Math.max(0, Math.min(100, parts.reduce((s, [, v]) => s + v, 0)));
    pl.moodParts = parts;
    pl.moodTarget = target;
    pl.mood += Math.sign(target - pl.mood) * Math.min(Math.abs(target - pl.mood), dt * 1.5);
}

function updateFestival(pl) {
    const yearT = (G.time / FESTIVAL_CYCLE) % 1;
    const year = Math.floor(G.time / FESTIVAL_CYCLE);
    const len = (hasTech(pl.id, 'utsav') ? 50 : 25) / FESTIVAL_CYCLE;
    if (pl.festival && (yearT > pl.festival.at + len || yearT < pl.festival.at)) pl.festival = null;
    if (pl.festival) return;
    for (const f of FESTIVALS) {
        if (yearT >= f.at && yearT < f.at + len && pl.lastFestival !== `${year}:${f.name}`) {
            pl.lastFestival = `${year}:${f.name}`;
            if (G.time < 30) return;
            pl.festival = f;
            const temple = [...G.ents.values()].some(e => e.owner === pl.id && e.type === 'temple' && e.built && !e.dead);
            let gift = '';
            if (f.kind === 'harvest') {
                const farms = [...G.ents.values()].filter(e => e.owner === pl.id && e.type === 'farm' && e.built && !e.dead).length;
                const food = 30 + farms * 15;
                pl.res.food += food;
                gift = ` The harvest brings ${food} food.`;
            } else if (f.kind === 'lights' && temple) {
                pl.res.gold += 60;
                gift = ' Offerings bring 60 gold.';
            }
            chronicle(pl.id, `${f.name} (${f.local}) begins! ${f.text}${gift}${temple ? '' : ' A temple would make the celebration grander.'}`, 'info');
            return;
        }
    }
}

function updateCouncil(pl) {
    const council = [...G.ents.values()].some(e => e.owner === pl.id && e.type === 'panchayat' && e.built && !e.dead);
    if (!council) { pl.mukhiya = null; return; }
    const cur = pl.mukhiya && G.ents.get(pl.mukhiya);
    if (cur && !cur.dead) return;
    let best = null;
    let bs = -1;
    for (const e of G.ents.values()) {
        if (e.owner !== pl.id || e.dead || !e.person || isChild(e) || e.def.cls !== 'villager') continue;
        const s = Object.values(e.person.skills).reduce((a, b) => a + b, 0) + ageOf(e);
        if (s > bs) { bs = s; best = e; }
    }
    if (best) {
        pl.mukhiya = best.id;
        chronicle(pl.id, `The village council chooses ${best.person.name} as Mukhiya, the village head.`, 'good');
    }
}

function lifeTick(dt) {
    G.moodClock = (G.moodClock || 0) + dt;
    for (const pl of G.players) {
        if (pl.defeated) continue;
        if (hasTech(pl.id, 'arthashastra')) pl.res.gold += 0.6 * dt;
    }
    if (G.moodClock >= 0.5) {
        // Count every kingdom's finished buildings once for all the checks below.
        G.typeCount = G.players.map(() => ({}));
        for (const e of G.ents.values()) {
            if (e.kind !== 'building' || e.owner < 0 || e.dead || !e.built) continue;
            const c = G.typeCount[e.owner];
            c[e.type] = (c[e.type] || 0) + 1;
        }
        for (const pl of G.players) {
            if (pl.defeated) continue;
            updateMood(pl, G.moodClock);
            updateFestival(pl);
        }
        G.moodClock = 0;
    }
    G.lifeClock = (G.lifeClock || 0) + dt;
    if (G.lifeClock < 2) return;
    G.lifeClock = 0;
    const gurukul = new Set(G.players.filter(pl => [...G.ents.values()].some(e => e.owner === pl.id && e.type === 'gurukul' && e.built && !e.dead)).map(pl => pl.id));
    for (const pl of G.players) {
        if (pl.defeated) continue;
        ageing(pl);
        tryMarriages(pl);
        tryBirths(pl);
        // Pupils of the gurukul learn every trade a little.
        if (gurukul.has(pl.id)) {
            for (const e of G.ents.values()) {
                if (e.owner !== pl.id || e.dead || !isChild(e) || ageOf(e) < 5) continue;
                for (const k of ['food', 'wood', 'stone', 'gold', 'build']) if (e.person.skills[k] < 40) gainSkill(e, k, 0.25);
            }
        }
    }
    // Families without a home settle into any free house.
    for (const pl of G.players) {
        for (const fam of pl.families.values()) {
            if (fam.home && G.ents.get(fam.home) && !G.ents.get(fam.home).dead) continue;
            fam.home = null;
            if (fam.members.size < 2) continue;
            const h = freeHome(pl.id);
            if (h) fam.home = h.id;
        }
    }
}

// ---------- Market ----------

function trade(owner, res, buy) {
    const p = player(owner);
    const price = Math.round(p.prices[res]);
    if (buy) {
        if (p.res.gold < price) return false;
        p.res.gold -= price;
        p.res[res] += 100;
        p.prices[res] = Math.min(400, p.prices[res] + 6);
    } else {
        if (p.res[res] < 100) return false;
        p.res[res] -= 100;
        p.res.gold += Math.round(price * 0.75);
        p.prices[res] = Math.max(25, p.prices[res] - 6);
    }
    return true;
}
