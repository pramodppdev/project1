'use strict';

// ---------- HUD, toasts, banners ----------

function setMeter(barId, textId, value, max) {
    $(barId).style.width = `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
    $(textId).textContent = `${Math.max(0, value)} / ${max}`;
}

function objective() {
    const owned = unlockedProvinces().length;
    const next = RANKS[player.rank + 1];
    if (!next) return 'You rule as Samrat. Explore, build and master every science.';
    const needP = rankNeeds(next);
    if (owned < needP) return `Win the loyalty of more settlements to become ${next.title}: ${owned} of ${needP}. Help them, clear nearby lairs, then talk to their headmen.`;
    if (player.renown < next.renown) return `Earn renown to become ${next.title}: ${player.renown} of ${next.renown}. Clear lairs, find manuscripts and build up your realm.`;
    return `You are ready to become ${next.title}.`;
}

function renderHud() {
    const s = stats();
    $('hud-level').textContent = `Lv ${player.lvl}`;
    setMeter('hud-hp-bar', 'hud-hp', player.hp, s.maxHp);
    setMeter('hud-prana-bar', 'hud-prana', player.prana, s.maxPrana);
    $('hud-gold').textContent = player.gold;
    $('hud-know').textContent = player.knowledge;
    $('hud-rank').textContent = `${RANKS[player.rank].title} · ${RANKS[player.rank].local}`;
    $('hud-time').textContent = `Day ${player.day} · ${season().name} · ${dayPhase().label}${player.weather === 'rain' ? ' · Rain' : ''}`;
    $('hud-grain').textContent = player.grain;
    $('ride-btn').hidden = !player.horse;
    $('ride-btn').textContent = player.mounted ? 'Dismount' : 'Ride';
    $('quest').innerHTML = `<b>Goal</b>${objective()}`;
    drawMinimap();
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

function say(lines, onEnd, choices) {
    ui.dialog = { lines, i: 0, onEnd, choices };
    held.clear();
    renderDialog();
}

function renderDialog() {
    const el = $('dialog');
    if (!ui.dialog) { el.hidden = true; return; }
    const line = ui.dialog.lines[ui.dialog.i];
    $('dialog-name').textContent = line.name;
    $('dialog-text').textContent = line.text;
    const lastLine = ui.dialog.i === ui.dialog.lines.length - 1;
    const choices = lastLine && ui.dialog.choices;
    $('dialog-next').textContent = lastLine ? 'Close ▸' : 'Continue ▸';
    $('dialog-next').hidden = !!choices;
    $('dialog-choices').innerHTML = choices ? choices.map((c, i) => `<button data-choice="${i}" ${c.disabled ? 'disabled' : ''}>${c.label}</button>`).join('') : '';
    el.hidden = false;
    (choices ? $('dialog-choices').querySelector('button:not([disabled])') : $('dialog-next'))?.focus({ preventScroll: true });
}

function chooseDialog(i) {
    const d = ui.dialog;
    if (!d || !d.choices || d.i !== d.lines.length - 1) return;
    const c = d.choices[i];
    if (!c || c.disabled) return;
    ui.dialog = null;
    renderDialog();
    c.run();
    save();
    renderHud();
}

function advanceDialog() {
    if (!ui.dialog) return;
    if (ui.dialog.choices && ui.dialog.i === ui.dialog.lines.length - 1) return;
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

const ROLE_TITLE = {
    headman: st => HEAD_TITLE[st.type],
    merchant: () => 'Merchant',
    trader: () => 'Trader',
    healer: st => (st.type === 'monastery' ? 'Amchi' : 'Vaidya'),
    recruiter: () => 'Havaldar',
    carter: () => 'Cart driver',
    guru: () => 'Guru',
};

function npcTitle(e) {
    return `${ROLE_TITLE[e.role](settlementById(e.settlement))} ${e.name}`;
}

function hasNews(e) {
    if (!e || !e.role) return false;
    const p = player.provinces[e.settlement];
    if (e.role === 'headman') return (!p.owned && !claimLock(e.settlement)) || (p.owned && !!player.petition && player.petition.prov === e.settlement);
    if (e.role === 'guru') return !flags.taught[e.settlement];
    return false;
}

function moodWord(v) {
    return v >= 75 ? 'joyful' : v >= 55 ? 'content' : v >= 35 ? 'uneasy' : v >= 20 ? 'angry' : 'close to revolt';
}

function journey(d) {
    return d < 14 ? 'a short walk' : d < 32 ? "half a day's walk" : 'a long journey';
}

function talkTo(e) {
    const st = settlementById(e.settlement);
    const p = player.provinces[st.id];
    const n = npcTitle(e);
    switch (e.role) {
        case 'headman':
            talkHeadman(st, p, n);
            break;
        case 'merchant':
        case 'trader':
            say(lines(n, pick(['Fresh stock today, traveller!', 'Good prices for good people.', `The finest goods in ${st.name}.`])), () => openShop(`shop:${st.id}:${e.role}`));
            break;
        case 'healer':
            say(lines(n, st.type === 'monastery' ? 'Drink this herb tea and rest by the fire.' : 'Sit. A little neem, a little turmeric, and plenty of rest.'), () => {
                const s = stats();
                player.hp = s.maxHp;
                player.prana = s.maxPrana;
                addFavour(st.id, 2);
                if (hasResearch('ayurveda')) {
                    for (const sol of player.squad) sol.hp = unitMaxHp(sol.type);
                    toast('You and your squad are fully healed');
                } else {
                    toast('Health and prana restored. Research Ayurveda so healers can treat your soldiers too.');
                }
            });
            break;
        case 'recruiter':
            say(lines(n, 'Gold for soldiers, and soldiers who never run.'), () => openShop('recruit'));
            break;
        case 'carter':
            say(lines(n, 'Ram ram! My bullocks know every road. Where shall we go?'), () => openShop(`travel:${st.id}`));
            break;
        case 'guru':
            if (!flags.taught[st.id]) {
                flags.taught[st.id] = true;
                const learn = !player.skills.includes('pranayama');
                say(lines(n,
                    'Peace, young warrior. You carry much restlessness in your shoulders.',
                    learn ? 'Sit and breathe with me. In through the nose, hold, and out slowly. You have learned Pranayama. In battle it will heal your wounds.' : 'You already know the breath. Let me share my notes instead.',
                    'Knowledge is the sharpest weapon. Palm-leaf manuscripts lie scattered across the land. Gather them, and let your scholars study.'),
                () => { if (learn) player.skills.push('pranayama'); player.knowledge += 15; toast(learn ? 'Learned Pranayama and received 15 knowledge' : 'Received 15 knowledge'); });
            } else {
                say(lines(n, pick(['Strength without patience is a river without banks.', 'One who conquers himself is greater than one who conquers a thousand.', 'Every journey across the land is also a journey within.'])));
            }
            break;
        default:
            break;
    }
}

function talkHeadman(st, p, n) {
    if (p.owned) {
        const choices = [];
        if (player.petition && player.petition.prov === st.id) choices.push({ label: 'Hear the petition', run: () => { player.petition.shown = true; petitionDialog(); } });
        choices.push({ label: 'Open the Durbar', run: () => { openMenu(); menuTab = 'rajya'; renderMenu(); } });
        choices.push({ label: 'Farewell', run: () => {} });
        say(lines(n, `${st.name} is loyal to you. The people are ${moodWord(p.mood)}.`), null, choices);
        return;
    }
    const threat = nearestThreat(st.id);
    const lock = claimLock(st.id);
    const greet = p.favour < 30 ? `We do not know you, stranger. ${st.name} looks after itself.`
        : p.favour < 100 ? `You have helped ${st.name}. The people speak your name.`
        : `${st.name} trusts you completely.`;
    say(lines(n, `${greet} Trust: ${Math.round(p.favour)} of 100.`), null, [
        { label: 'Offer a gift of 40 gold (+25 trust)', disabled: player.gold < 40, run: () => { player.gold -= 40; addFavour(st.id, 25); say(lines(n, `${st.name} thanks you. Trust is now ${Math.round(p.favour)} of 100.`)); } },
        { label: 'Ask what troubles them', run: () => say(lines(n, threat ? `A ${threat.name.toLowerCase()} lies ${journey(Math.hypot(threat.x - st.x, threat.y - st.y))} to the ${compass(st.x, st.y, threat.x, threat.y)}. Clear it and we will be in your debt.` : 'The roads are quiet, thanks to brave travellers. Gifts and trade will win our trust.')) },
        { label: lock ? `Ask ${st.name} to join your realm (${lock})` : `Ask ${st.name} to join your realm`, disabled: !!lock, run: () => { claim(st.id); say(lines(n, `From today ${st.name} is part of your realm. The ${council(st.id).body} will serve you.`)); } },
        { label: 'Farewell', run: () => {} },
    ]);
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
        player.hp = Math.min(s.maxHp, player.hp + Math.round(it.hp * (hasResearch('ayurveda') ? 1.5 : 1)));
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
    const def = ent.foe;
    ui.battle = { ent, def, hp: def.hp, maxHp: def.hp, turn: 0, busy: false, charging: false, done: false, menu: 'main' };
    held.clear();
    $('battle-log').innerHTML = '';
    $('foe').classList.toggle('boss', !!def.boss);
    $('frame').classList.add('in-battle');
    facePair(ent);
    battleClearing = { x: (player.x + ent.x) / 2, z: Math.max(player.y, ent.y), r: def.boss ? 3 : 2 };
    player.mounted = false;
    blog(def.boss ? `${def.name} stands before you!` : `A ${def.name} attacks!`);
    ui.battle.night = dayPhase().night;
    ui.battle.atkMult = ui.battle.night && !hasResearch('jyotisha') ? 1.15 : 1;
    if (ui.battle.night) {
        blog(hasResearch('jyotisha') ? 'A night battle. Your astronomers know these stars, so there is no danger, and the spoils are richer.' : 'A night battle! Enemies hit 15% harder in the dark, but the spoils are 25% richer.', 'bad');
    }
    if (player.squad.length) blog(`Your squad of ${player.squad.length} forms up behind you.`);
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
        player.hp = Math.min(s.maxHp, player.hp + Math.round(s.maxHp * (hasResearch('yoga') ? 0.6 : 0.4)));
        blog(`You breathe deeply and recover ${player.hp - before} health.`, 'good');
        floatText(player, `+${player.hp - before}`, '#8fd18a', 1.6);
    } else if (act === 'rockets') {
        if (player.prana < SKILLS.rockets.cost) return;
        player.prana -= SKILLS.rockets.cost;
        const dmg = Math.round(s.atk * 2.5 * rand(0.9, 1.1));
        b.hp -= dmg;
        blog(`Rocket Barrage! Iron-cased rockets scream across the sky for ${dmg} damage.`, 'gold');
        shake('foe');
        fxAttack(true, `-${dmg}`, '#ff9a3a');
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

    if (b.hp > 0) squadAttack();
    if (b.hp <= 0) return winBattle();
    b.busy = true;
    renderBattle();
    setTimeout(foeTurn, 650);
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
    const atk = b.def.atk * mult * b.atkMult;
    if (mult === 1 && player.squad.length && Math.random() < 0.3) {
        const s = pick(player.squad);
        const dmg = damage(atk * 0.75, 2 + player.rank);
        blog(`The ${b.def.name} attacks your ${UNITS[s.type].name} for ${dmg} damage.`, 'bad');
        hurtSoldier(s, dmg);
    } else {
        const dmg = damage(atk, stats().def);
        player.hp -= dmg;
        blog(mult > 1 ? `${b.def.name} unleashes a devastating blow for ${dmg} damage!` : `The ${b.def.name} hits you for ${dmg} damage.`, 'bad');
        fxAttack(false, `-${dmg}`, '#ff8a75');
        if (mult > 1) {
            for (const s of [...player.squad]) hurtSoldier(s, damage(atk * 0.45, 2 + player.rank));
            if (player.squad.length) blog('The shockwave tears through your squad!', 'bad');
        }
    }
    b.busy = false;
    if (player.hp <= 0) return loseBattle();
    renderBattle();
}

function squadAttack() {
    const b = ui.battle;
    if (!player.squad.length) return;
    let total = 0;
    for (const sol of player.squad) {
        total += Math.max(1, Math.round(UNITS[sol.type].atk * squadMult() * rand(0.8, 1.2) - b.def.def * 0.4));
    }
    b.hp -= total;
    blog(`Your squad strikes for ${total} damage.`);
    fxSquad();
    setTimeout(() => floatText(b.ent, `-${total}`, '#9fd3f0', b.def.boss ? 2.2 : 1.1), 220);
}

function hurtSoldier(sol, dmg) {
    sol.hp -= dmg;
    const f = followers.get(sol.id);
    if (f) f.m.flashUntil = performance.now() + 300;
    if (sol.hp > 0) return;
    if (hasResearch('surgery') && Math.random() < 0.6) {
        sol.hp = 1;
        blog(`Your ${UNITS[sol.type].name} falls, but Sushruta's surgery saves their life.`, 'good');
        return;
    }
    player.squad = player.squad.filter(x => x !== sol);
    blog(`Your ${UNITS[sol.type].name} has fallen in battle.`, 'bad');
}

function winBattle() {
    const b = ui.battle;
    b.hp = 0;
    b.done = true;
    b.won = true;
    entities = entities.filter(e => e !== b.ent);
    blog(`The ${b.def.name} is defeated!`, 'good');
    const spoils = b.night ? 1.25 : 1;
    const xp = Math.round(b.def.xp * spoils);
    const gold = Math.round(b.def.gold * goldMult() * spoils);
    const renown = b.def.boss ? 40 + 30 * b.def.tier : Math.ceil(b.def.xp / 6);
    const know = b.def.boss ? 10 : 1;
    player.xp += xp;
    player.gold += gold;
    player.knowledge += know;
    blog(`You gain ${xp} experience, ${gold} gold, ${renown} renown and ${know} knowledge.`, 'gold');
    player.prana = Math.min(stats().maxPrana, player.prana + 2);
    while (player.xp >= xpToNext(player.lvl)) {
        player.xp -= xpToNext(player.lvl);
        player.lvl++;
        const s = stats();
        player.hp = s.maxHp;
        player.prana = s.maxPrana;
        blog(`Level up! You are now level ${player.lvl}. Health and prana restored.`, 'gold');
    }
    if (b.def.boss) {
        lairCleared(b.ent.lair);
        blog('The lair is cleared. Nearby settlements will hear of this.', 'good');
    }
    gainRenown(renown);
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
    if (b.lost) {
        const s = stats();
        const lostGold = Math.floor(player.gold / 2);
        player.gold -= lostGold;
        player.hp = s.maxHp;
        player.prana = s.maxPrana;
        const homes = unlockedProvinces().map(settlementById);
        homes.sort((p1, p2) => Math.hypot(p1.x - player.x, p1.y - player.y) - Math.hypot(p2.x - player.x, p2.y - player.y));
        const safe = homes[0] || WORLD.home;
        player.x = player.rx = safe.x;
        player.y = player.ry = safe.y + 1;
        lastPlace = safe.id;
        trail = [];
        say(lines('A passing healer', `Travellers carried you to ${safe.name}. You lost ${lostGold} gold on the road, but you will live. Rest, then try again.`));
    } else if (b.won && b.def.boss) {
        const l = WORLD.lairs.find(q => q.id === b.ent.lair);
        say(lines('Veer', `The ${b.def.name} is beaten and the ${LAIR_TYPES[l.type].name.toLowerCase()} is cleared. ${settlementById(l.near).name} will be grateful.`));
    }
    save();
    renderHud();
}

function showEnding() {
    ui.ending = true;
    held.clear();
    $('ending-title').textContent = 'Samrat Veer';
    $('ending-text').textContent = `The people of ${unlockedProvinces().length} settlements crown you Samrat, Emperor of the land. You began as the Nayak of a village militia in ${WORLD.home.name}. Now you command ${player.squad.length} soldiers and have mastered ${player.research.length} sciences. The world is still yours to explore.`;
    $('ending').hidden = false;
}

// ---------- Shop and menu ----------

function openShop(key) {
    ui.shop = key;
    held.clear();
    renderShop();
    $('shop').hidden = false;
}

const UNIT_ICON = { paidal: '🛡️', archer: '🏹', cavalry: '🐎', elephant: '🐘' };

function renderRecruit() {
    $('shop-title').textContent = 'Recruit soldiers';
    $('shop-gold').textContent = `${player.gold} · squad ${player.squad.length} of ${squadCap()}`;
    $('shop-list').innerHTML = Object.entries(UNITS).map(([k, u]) => {
        const lock = recruitLock(k);
        return `<li><span class="ico">${UNIT_ICON[k]}</span><span class="what"><b>${u.name}</b><small>${u.role} · attack ${u.atk}, health ${unitMaxHp(k)} · wage ${u.wage} gold a day${lock ? ` · ${lock}` : ''}</small></span>
            <button data-recruit="${k}" ${lock ? 'disabled' : ''}>Recruit · ${recruitCost(k)}</button></li>`;
    }).join('');
}

function renderTravel(from) {
    const here = settlementById(from);
    $('shop-title').textContent = 'Bullock-cart travel';
    $('shop-gold').textContent = player.gold;
    const list = player.stations.map(settlementById).sort((a, c) => Math.hypot(a.x - here.x, a.y - here.y) - Math.hypot(c.x - here.x, c.y - here.y));
    $('shop-list').innerHTML = list.map(st => {
        const lock = travelLock(from, st.id);
        const owned = player.provinces[st.id].owned ? ' · your realm' : '';
        return `<li><span class="ico">🐂</span><span class="what"><b>${st.name}</b><small>${TYPE_NAME[st.type]}${owned} · ${st.id === from ? 'you are here' : lock || `${journey(Math.hypot(st.x - here.x, st.y - here.y))} to the ${compass(here.x, here.y, st.x, st.y)}`}</small></span>
            <button data-travel="${from}:${st.id}" ${lock ? 'disabled' : ''}>${st.id === from ? 'Here' : `Travel · ${travelCost(from, st.id)}`}</button></li>`;
    }).join('') + (list.length < 2 ? '<li><span class="what"><small>Visit other settlements to add their cart stands to this list.</small></span></li>' : '');
}

function renderShop() {
    if (ui.shop === 'recruit') return renderRecruit();
    if (ui.shop.startsWith('travel:')) return renderTravel(ui.shop.slice(7));
    const [, sid, role] = ui.shop.split(':');
    const st = settlementById(sid);
    const stock = SHOP_STOCK[role === 'trader' ? 'town' : st.type];
    $('shop-title').textContent = `${st.name} ${role === 'trader' ? 'caravan' : 'bazaar'}`;
    $('shop-gold').textContent = player.gold;
    $('shop-list').innerHTML = stock.map(k => {
        if (k === 'horse') {
            return `<li><span class="ico">🐎</span><span class="what"><b>Marwari horse</b><small>Ride at twice the speed. Eats 1 grain a day.</small></span>
                <button data-buy="horse" ${player.horse || player.gold < HORSE_PRICE ? 'disabled' : ''}>${player.horse ? 'Owned' : `Buy · ${HORSE_PRICE}`}</button></li>`;
        }
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
    if (key === 'horse') {
        if (player.horse || player.gold < HORSE_PRICE) return;
        player.gold -= HORSE_PRICE;
        player.horse = true;
        player.mounted = true;
        toast('You bought a Marwari horse. Press R or the Ride button to mount and dismount.');
        save();
        renderShop();
        renderHud();
        return;
    }
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
    if (ui.shop && ui.shop.startsWith('shop:')) addFavour(ui.shop.split(':')[1], 3);
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

let menuTab = 'hero';

function renderMenu() {
    const tabs = [['hero', 'Veer'], ['squad', 'Squad'], ['research', 'Research'], ['empire', 'Empire'], ['krishi', 'Farming'], ['rajya', 'Government'], ['yatra', 'Travel'], ['naksha', 'Map']];
    const nav = `<div class="tabs" role="tablist">${tabs.map(([k, label]) =>
        `<button role="tab" data-tab="${k}" aria-selected="${menuTab === k}">${label}</button>`).join('')}</div>`;
    const body = { hero: menuHero, squad: menuSquad, research: menuResearch, empire: menuEmpire, krishi: menuKrishi, rajya: menuRajya, yatra: menuYatra, naksha: menuMap }[menuTab]();
    $('menu-body').innerHTML = nav + body;
    if (menuTab === 'naksha') drawWorldMap($('world-map'));
}

function statBox(label, value) {
    return `<div class="stat"><small>${label}</small><b>${value}</b></div>`;
}

function menuHero() {
    const s = stats();
    const items = Object.entries(player.items).filter(([, n]) => n > 0);
    return `
        <h3>Current quest</h3>
        <p>${objective()}</p>
        <h3>Veer, ${RANKS[player.rank].title}</h3>
        <div class="stats">
            ${statBox('Level', player.lvl)}
            ${statBox('Experience', `${player.xp} / ${xpToNext(player.lvl)}`)}
            ${statBox('Health', `${player.hp} / ${s.maxHp}`)}
            ${statBox('Prana', `${player.prana} / ${s.maxPrana}`)}
            ${statBox('Attack', s.atk)}
            ${statBox('Defense', s.def)}
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

function meter(value, max, cls = '') {
    return `<span class="mini-meter ${cls}"><span style="width:${Math.max(0, Math.min(100, (value / max) * 100))}%"></span></span>`;
}

function menuSquad() {
    const y = dailyYield();
    const rows = player.squad.map(sol => {
        const u = UNITS[sol.type];
        const max = unitMaxHp(sol.type);
        return `<li><span class="ico">${UNIT_ICON[sol.type]}</span><span class="what"><b>${u.name}</b><small>${u.role} · attack ${Math.round(u.atk * squadMult())} · wage ${u.wage} a day</small>${meter(sol.hp, max)}<small>${Math.max(0, sol.hp)} / ${max} health</small></span><button data-dismiss="${sol.id}">Dismiss</button></li>`;
    }).join('');
    const types = Object.entries(UNITS).map(([k, u]) => {
        const need = u.research && !hasResearch(u.research) ? `Needs ${RESEARCH[u.research].name}` : u.rank && player.rank < u.rank ? `Needs rank ${RANKS[u.rank].title}` : 'Available';
        return `<li><span class="ico">${UNIT_ICON[k]}</span><span class="what"><b>${u.name}</b><small>${u.role} · ${recruitCost(k)} gold · ${need}</small></span><span></span></li>`;
    }).join('');
    return `
        <h3>Your squad · ${player.squad.length} of ${squadCap()}</h3>
        <p class="panel-sub">Soldiers march behind you and strike after every action you take in battle. Wages cost ${y.wages} gold a day. Recruit from Havaldar Bhim in Rampur or Senapati Arjan in the desert fort.</p>
        ${rows ? `<ul class="offers">${rows}</ul>` : '<p class="panel-sub">No soldiers march with you yet.</p>'}
        <h3>Troop types</h3>
        <ul class="offers">${types}</ul>`;
}

function menuResearch() {
    const tiers = [1, 2, 3, 4].map(t => {
        const cards = Object.entries(RESEARCH).filter(([, r]) => r.tier === t).map(([k, r]) => {
            const st = researchState(k);
            const action = st === 'done' ? '<span class="tag done">Mastered</span>'
                : st === 'locked' ? `<span class="tag">Needs ${r.req.map(q => RESEARCH[q].name).join(' and ')}</span>`
                : `<button data-study="${k}" ${player.knowledge >= r.cost ? '' : 'disabled'}>Study · ${r.cost}</button>`;
            return `<li class="tech ${st}"><span class="what"><b>${r.name}</b><small class="src">${r.source}</small><small>${r.effect}</small></span>${action}</li>`;
        }).join('');
        return `<h3>Tier ${t}</h3><ul class="offers">${cards}</ul>`;
    }).join('');
    return `<p class="panel-sub">Knowledge: <b>${player.knowledge}</b>. Earn it in battle, from palm-leaf manuscripts (${flags.scrolls.length} of ${WORLD.scrolls.length} found) and from Vidyalayas in your provinces.</p>${tiers}`;
}

function menuEmpire() {
    const y = dailyYield();
    const next = RANKS[player.rank + 1];
    const ladder = RANKS.map((rk, i) => `<li class="${i === player.rank ? 'current' : i < player.rank ? 'past' : ''}"><b>${rk.title}</b><small>${rk.local} · ${rk.renown} renown · squad ${rk.squad}</small></li>`).join('');
    const nextLine = next
        ? `${player.renown} of ${next.renown} renown to become ${next.title}${rankNeeds(next) ? `, and ${rankNeeds(next)} settlements in your realm (you have ${unlockedProvinces().length})` : ''}.`
        : 'You have reached the highest rank.';
    const provs = Object.entries(PROVINCES).filter(([k]) => player.provinces[k].owned || player.stations.includes(k)).map(([k, pv]) => {
        const p = player.provinces[k];
        if (!p.owned) return `<div class="prov locked"><b>${pv.name}</b><small>${TYPE_NAME[pv.type]} · trust ${Math.round(p.favour)} of 100 · ${claimLock(k) || 'ready to join: talk to the headman'}</small></div>`;
        const rows = Object.entries(BUILDINGS).map(([bk, bd]) => {
            const cost = buildCost(k, bk);
            const pips = [1, 2, 3].map(l => `<i class="${p[bk] >= l ? 'on' : ''}"></i>`).join('');
            return `<li><span class="what"><b>${bd.name} <span class="pips">${pips}</span></b><small>${bd.kind} · ${bd.desc}</small></span>${cost === null ? '<span class="tag done">Max</span>' : `<button data-build="${k}:${bk}" ${player.gold >= cost ? '' : 'disabled'}>${p[bk] ? 'Upgrade' : 'Build'} · ${cost}</button>`}</li>`;
        }).join('');
        return `<div class="prov"><b>${pv.name}</b><small>${TYPE_NAME[pv.type]} · base tax ${pv.tax} gold a day</small><ul class="offers">${rows}</ul></div>`;
    }).join('');
    return `
        <h3>Rank</h3>
        <p>${nextLine}</p>
        ${next ? meter(player.renown - RANKS[player.rank].renown, next.renown - RANKS[player.rank].renown, 'renown') : ''}
        <ol class="ladder">${ladder}</ol>
        <h3>Treasury</h3>
        <p class="panel-sub">Day ${player.day}, ${dayPhase().label.toLowerCase()}${player.weather === 'rain' ? ', monsoon rain' : ''}. Each dawn your provinces pay <b>${y.gold}</b> gold and <b>${y.know}</b> knowledge, and your soldiers draw <b>${y.wages}</b> gold in wages.</p>
        <h3>Settlements you know</h3>
        <div class="provs">${provs || '<p class="panel-sub">Explore to find other settlements.</p>'}</div>`;
}

function moodBar(v) {
    const label = v >= 75 ? 'Joyful' : v >= 55 ? 'Content' : v >= 35 ? 'Uneasy' : v >= 20 ? 'Angry' : 'In revolt';
    return `${meter(v, 100, v >= 55 ? 'mood good' : v >= 35 ? 'mood' : 'mood bad')}<small>${label} · contentment ${Math.round(v)}</small>`;
}

function menuKrishi() {
    const s = season();
    const nextS = SEASONS[(seasonIndex() + 1) % SEASONS.length];
    const dayIn = (player.day - 1) % SEASON_DAYS;
    const provs = Object.entries(PROVINCES).filter(([k]) => player.provinces[k].owned).map(([k, pv]) => {
        const f = farm(k);
        const c = f.crop ? CROPS[f.crop] : null;
        const h = harvestYield(k);
        const plan = plannedCrop(k, nextS.key);
        const choices = cropsFor(nextS.key).map(ck => `<button class="chip" data-plan="${k}:${nextS.key}:${ck}" aria-pressed="${plan === ck}">${CROPS[ck].name}</button>`).join('');
        return `<div class="prov"><b>${pv.name}</b><small>${fieldArea(k)} plots of farmland · irrigation ${Math.round(irrigation(k) * 100)}% · ${f.rainDays} rainy day${f.rainDays === 1 ? '' : 's'} this season</small>
            <p class="crop-now">${c ? `Growing <b>${c.name}</b> (${c.local}). ${c.note}` : 'Fallow until the next sowing.'}${h ? ` Expected harvest: ${h.grain} grain${h.gold ? `, ${h.gold} gold` : ''}${h.water < 0.8 ? ' (too little water!)' : ''}.` : ''}</p>
            <small>Sow in the coming ${nextS.name} season:</small>
            <div class="chips">${choices}</div></div>`;
    }).join('');
    return `
        <h3>Season</h3>
        <p><b>${s.name}</b>, the ${s.when}. Day ${dayIn + 1} of ${SEASON_DAYS}. Harvest comes when the ${nextS.name} season begins.</p>
        <h3>Granary</h3>
        <p class="panel-sub">You hold <b>${player.grain}</b> grain. Your soldiers, horse and kitchens eat <b>${grainUse()}</b> a day. If the granary runs empty, people go hungry and soldiers desert.</p>
        <div class="menu-foot">
            <button data-grain="buy" ${player.gold >= GRAIN_PRICE.buy ? '' : 'disabled'}>Buy ${GRAIN_PRICE.lot} grain · ${GRAIN_PRICE.buy} gold</button>
            <button data-grain="sell" ${player.grain >= GRAIN_PRICE.lot ? '' : 'disabled'}>Sell ${GRAIN_PRICE.lot} grain · ${GRAIN_PRICE.sell} gold</button>
        </div>
        <h3>Fields</h3>
        <div class="provs">${provs}</div>`;
}

function menuRajya() {
    const y = dailyYield();
    const taxes = Object.entries(TAXES).map(([k, t]) => `<button class="chip" data-tax="${k}" aria-pressed="${player.tax === k}">${t.name}</button>`).join('');
    const govLocked = player.rank < GOV_RANK;
    const ministers = Object.entries(MINISTERS).map(([k, m]) => `<li><span class="what"><b>${m.post} · ${m.role}</b><small>${m.name} · ${m.effect} · salary ${m.salary} gold a day</small></span>
        <button data-minister="${k}" ${govLocked ? 'disabled' : ''}>${player.ministers[k] ? 'Dismiss' : 'Appoint'}</button></li>`).join('');
    const edictLocked = player.rank < EDICT_RANK;
    const edicts = Object.entries(EDICTS).map(([k, e]) => `<li class="${player.edicts.includes(k) ? 'tech done' : ''}"><span class="what"><b>${e.name}</b><small>${e.desc} ${e.effect}.</small></span>
        <button data-edict="${k}" ${edictLocked ? 'disabled' : ''}>${player.edicts.includes(k) ? 'Repeal' : 'Proclaim'}</button></li>`).join('');
    const councils = Object.entries(PROVINCES).filter(([k]) => player.provinces[k].owned).map(([k, pv]) => {
        const p = player.provinces[k];
        const focus = Object.entries(FOCUS).map(([fk, f]) => `<button class="chip" data-focus="${k}:${fk}" aria-pressed="${p.focus === fk}" title="${f.effect}">${f.name}</button>`).join('');
        return `<div class="prov"><b>${pv.name}</b><small>${council(k).body} · led by ${council(k).head}</small>${moodBar(p.mood)}
            <small>Council priority:</small><div class="chips">${focus}</div></div>`;
    }).join('');
    return `
        ${player.petition ? `<div class="notice"><b>A petition is waiting</b><span>The ${council(player.petition.prov).body} of ${PROVINCES[player.petition.prov].name} asks for your judgement.</span><button class="primary" data-petition="1">Hear it</button></div>` : ''}
        <h3>Revenue</h3>
        <p class="panel-sub">Land tax: <b>${TAXES[player.tax].name}</b>, ${TAXES[player.tax].share}. Heavy taxes fill the treasury but anger the people. Contentment also changes how much tax actually reaches you.</p>
        <div class="chips">${taxes}</div>
        <p class="panel-sub">Each dawn: +${y.gold} gold in taxes, -${y.wages} soldiers' wages, -${y.salaries} ministers' salaries, -${y.upkeep} for edicts.</p>
        <h3>Mantri Parishad · council of ministers</h3>
        ${govLocked ? `<p class="panel-sub">You may appoint ministers once you hold the rank of ${RANKS[GOV_RANK].title}.</p>` : ''}
        <ul class="offers">${ministers}</ul>
        <h3>Royal edicts</h3>
        <p class="panel-sub">${edictLocked ? `As ${RANKS[EDICT_RANK].title} you may proclaim up to two edicts.` : 'Up to two edicts can be in force at once.'}</p>
        <ul class="offers">${edicts}</ul>
        <h3>Local government</h3>
        <p class="panel-sub">Each province runs its own affairs through a local council. Set their priority and keep the people content. Petitions from councils arrive every few days.</p>
        <div class="provs">${councils}</div>`;
}

function menuYatra() {
    const stations = player.stations.map(settlementById).map(st => `<li><span class="ico">🐂</span><span class="what"><b>${st.name}</b><small>${TYPE_NAME[st.type]} · ${journey(Math.hypot(st.x - player.x, st.y - player.y))} to the ${compass(player.x, player.y, st.x, st.y)}</small></span><span></span></li>`).join('');
    return `
        <h3>Your horse</h3>
        <p class="panel-sub">${player.horse ? `You own a Marwari horse and are ${player.mounted ? 'riding' : 'on foot'}. Riding doubles your speed. Press R or use the Ride button.` : `Merchants in villages, towns and forts sell Marwari horses for ${HORSE_PRICE} gold. Riding doubles your speed.`}</p>
        ${player.horse ? `<div class="menu-foot"><button data-ride="1">${player.mounted ? 'Dismount' : 'Mount your horse'}</button></div>` : ''}
        <h3>Bullock carts</h3>
        <p class="panel-sub">Every settlement has a cart driver. Talk to one to travel to any settlement you have visited. Roads in your provinces make the fare cheaper.</p>
        <ul class="offers">${stations}</ul>`;
}

function closeSheet(name) {
    if (name === 'shop') ui.shop = null;
    if (name === 'menu') ui.menu = false;
    $(name).hidden = true;
    save();
    renderHud();
}

// ---------- Map ----------

const MAP_COLORS = { p: '#c9a46a', '=': '#8a5a2b', a: '#7a5a3a' };

function tileColor(i) {
    const g = ground[i];
    if (MAP_COLORS[g]) return MAP_COLORS[g];
    const o = objects[i];
    if (o === 'M') return '#8a8580';
    if (o === 'H' || o === 'K' || o === 'W' || o === 'X' || o === 'g' || o === 'V') return '#efe2c8';
    if (o === 'T' || o === 'J' || o === 'P') return shade(BIOMES[biome[i]].map, -0.08);
    return BIOMES[biome[i]].map;
}

function drawWorldMap(c, cx, cy, radius) {
    if (!c) return;
    const g = c.getContext('2d');
    const full = radius === undefined;
    const x0 = full ? 0 : cx - radius;
    const y0 = full ? 0 : cy - radius;
    const span = full ? MAP_W : radius * 2 + 1;
    const px = c.width / span;
    g.fillStyle = '#120d18';
    g.fillRect(0, 0, c.width, c.height);
    for (let y = 0; y < span; y++) {
        for (let x = 0; x < span; x++) {
            const tx = x0 + x;
            const ty = y0 + y;
            if (!inMap(tx, ty)) continue;
            const i = idx(tx, ty);
            if (!explored[i]) continue;
            g.fillStyle = tileColor(i);
            g.fillRect(Math.floor(x * px), Math.floor(y * px), Math.ceil(px), Math.ceil(px));
        }
    }
    const dot = (tx, ty, color, r, ring) => {
        const sx = (tx - x0 + 0.5) * px;
        const sy = (ty - y0 + 0.5) * px;
        if (sx < -r || sy < -r || sx > c.width + r || sy > c.height + r) return;
        g.beginPath();
        g.arc(sx, sy, r, 0, Math.PI * 2);
        g.fillStyle = color;
        g.fill();
        if (ring) { g.lineWidth = 2; g.strokeStyle = ring; g.stroke(); }
    };
    for (const l of WORLD.lairs) if (explored[idx(l.x, l.y)] && flags.cleared[l.id] === undefined) dot(l.x, l.y, '#d9442b', full ? 4 : 3, '#1a1322');
    for (const sc of WORLD.scrolls) if (explored[idx(sc.x, sc.y)] && !flags.scrolls.includes(sc.id)) dot(sc.x, sc.y, '#ffd76a', full ? 3 : 2.5);
    for (const st of WORLD.settlements) {
        if (!explored[idx(st.x, st.y)]) continue;
        dot(st.x, st.y, player.provinces[st.id].owned ? '#f29a2e' : '#f6ead2', full ? 5 : 4, '#1a1322');
        if (full) {
            g.font = '600 12px Hind, system-ui, sans-serif';
            g.textAlign = 'center';
            g.lineWidth = 3;
            g.strokeStyle = 'rgba(18,13,24,0.85)';
            const sy = (st.y - y0) * px - 7;
            g.strokeText(st.name, (st.x - x0 + 0.5) * px, sy);
            g.fillStyle = '#f6ead2';
            g.fillText(st.name, (st.x - x0 + 0.5) * px, sy);
        }
    }
    dot(player.x, player.y, '#3f8fd9', full ? 5 : 4, '#ffffff');
}

function drawMinimap() {
    const c = $('minimap');
    if (c && WORLD) drawWorldMap(c, player.x, player.y, 22);
}

function menuMap() {
    const owned = unlockedProvinces().length;
    const seen = explored.reduce((a, v) => a + v, 0);
    return `
        <p class="panel-sub">World seed <b>${WORLD.seed}</b> · ${WORLD.sizeKey} world of ${MAP_W} by ${MAP_H} · ${Math.round((seen / explored.length) * 100)}% explored · ${owned} of ${WORLD.settlements.length} settlements in your realm · ${Object.keys(flags.cleared).length} of ${WORLD.lairs.length} lairs cleared.</p>
        <div class="map-wrap"><canvas id="world-map" width="640" height="640" aria-label="Map of the explored world"></canvas></div>
        <ul class="map-legend">
            <li><i style="background:#f29a2e"></i>Your settlements</li>
            <li><i style="background:#f6ead2"></i>Other settlements</li>
            <li><i style="background:#d9442b"></i>Lairs</li>
            <li><i style="background:#ffd76a"></i>Manuscripts</li>
            <li><i style="background:#3f8fd9"></i>You</li>
        </ul>`;
}

// ---------- Save, load, start ----------

function save() {
    if (!WORLD || !player) return;
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ seed: WORLD.seed, size: WORLD.sizeKey, player, flags, explored: encodeExplored(), lairTiers: WORLD.lairs.map(l => l.tier) }));
    } catch { /* storage unavailable */ }
}

function load() {
    try {
        const data = JSON.parse(localStorage.getItem(SAVE_KEY));
        if (data && data.player && data.flags && data.seed !== undefined) return data;
    } catch { /* ignore a missing or corrupt save */ }
    return null;
}

function randomSeed() {
    return Math.floor(Math.random() * 900000) + 100000;
}

function startGame(data, seed, size) {
    generateWorld(data ? data.seed : seed, data ? data.size : size);
    if (data && data.lairTiers) data.lairTiers.forEach((t, i) => { if (WORLD.lairs[i]) WORLD.lairs[i].tier = t; });
    buildProvinces();
    player = Object.assign(newPlayer(WORLD.home), data ? data.player : {});
    player.rx = player.x;
    player.ry = player.y;
    flags = data ? data.flags : {};
    flags.scrolls = flags.scrolls || [];
    flags.cleared = flags.cleared || {};
    flags.taught = flags.taught || {};
    for (const st of WORLD.settlements) player.provinces[st.id] = { ...newProvince(st), ...(player.provinces[st.id] || {}) };
    decodeExplored(data && data.explored);
    if (!data) {
        for (let i = 0; i < 2; i++) player.squad.push({ id: ++player.soldierSeq, type: 'paidal', hp: unitMaxHp('paidal') });
    }
    reveal(player.x, player.y, 10);
    if (!unlockedProvinces().every(k => player.provinces[k].farm && player.provinces[k].farm.crop)) sowAll();
    trail = [];
    pendingCoronation = false;
    if (renderer) { clearModels(); clearFollowers(); worldDirty = true; }
    entities = [];
    spawnStatic();
    for (let i = 0; i < 6; i++) populate();
    const here = settlementAt(player.x, player.y);
    lastPlace = here ? here.id : biomeAt(player.x, player.y);
    for (const id of ['battle', 'shop', 'menu', 'ending', 'newworld']) $(id).hidden = true;
    ui = { dialog: null, battle: null, shop: null, menu: false, ending: false, newWorld: false };
    renderHud();
    save();
    if (!data) {
        say(lines('Legends of Bharat',
            `You are Veer, a young farmer of ${WORLD.home.name}. The village has made you Nayak of its militia, and two spearmen march with you.`,
            'The land is open before you: forests, deserts, mountains, rivers and coasts, with villages, towns and forts that answer to no one yet.',
            'Help settlements, clear the lairs that threaten them and win their trust. Rise from squad leader to Samrat. Press M for the Durbar and the map.'));
    } else {
        showBanner(placeName(player.x, player.y));
    }
}

// ---------- New world ----------

let newWorldSize = 'medium';

function openNewWorld(canCancel) {
    ui.newWorld = true;
    held.clear();
    $('seed-input').value = randomSeed();
    $('world-cancel').hidden = !canCancel;
    renderNewWorld();
    $('newworld').hidden = false;
}

function renderNewWorld() {
    for (const b of document.querySelectorAll('[data-size]')) b.setAttribute('aria-pressed', String(b.dataset.size === newWorldSize));
}

function beginNewWorld() {
    const seed = parseInt($('seed-input').value, 10);
    const sd = Number.isFinite(seed) && seed > 0 ? seed : randomSeed();
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    startGame(null, sd, newWorldSize);
}
