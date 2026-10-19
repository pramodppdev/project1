'use strict';

// ---------- Empire: ranks, squad, research, provinces, time ----------

const DAY_SECONDS = 180;

const RANKS = [
    { title: 'Squad Leader', local: 'Nayak', renown: 0, squad: 2 },
    { title: 'Captain', local: 'Senanayak', renown: 40, squad: 3 },
    { title: 'Commander', local: 'Dalapati', renown: 120, squad: 4 },
    { title: 'General', local: 'Senapati', renown: 280, squad: 5, needs: 2 },
    { title: 'Governor', local: 'Subedar', renown: 500, squad: 6, needs: 3 },
    { title: 'King', local: 'Raja', renown: 800, squad: 7, needs: 4 },
    { title: 'Emperor', local: 'Samrat', renown: 1200, squad: 8, needs: 6 },
];

const UNITS = {
    paidal: { name: 'Paidal', role: 'Foot soldier with spear and shield', hp: 40, atk: 5, cost: 25, wage: 2 },
    archer: { name: 'Dhanurdhar', role: 'Archer with a bamboo longbow', hp: 30, atk: 8, cost: 40, wage: 3, research: 'dhanurveda' },
    cavalry: { name: 'Ashvarohi', role: 'Mounted lancer', hp: 65, atk: 11, cost: 70, wage: 5, research: 'ashva' },
    elephant: { name: 'Gajasena', role: 'Armoured war elephant', hp: 170, atk: 19, cost: 180, wage: 10, research: 'gaja', rank: 3 },
};

const RESEARCH = {
    ayurveda: { tier: 1, cost: 20, name: 'Ayurveda', source: 'Charaka Samhita', effect: 'Food heals 50% more, and the Vaidya also heals your squad.' },
    ganita: { tier: 1, cost: 25, name: 'Ganita: zero and decimals', source: 'Brahmagupta, 628 CE', effect: '+25% gold from battles and taxes.' },
    dhanurveda: { tier: 1, cost: 25, name: 'Dhanurveda', source: 'The science of archery', effect: 'Recruit Dhanurdhar archers.' },
    wootz: { tier: 2, cost: 45, req: ['ganita'], name: 'Wootz steel', source: 'South Indian crucible steel', effect: '+4 attack for you and +30% squad damage.' },
    yoga: { tier: 2, cost: 40, req: ['ayurveda'], name: 'Yoga Sutras', source: 'Patanjali', effect: '+10 maximum prana, and Pranayama heals 60%.' },
    ashva: { tier: 2, cost: 45, req: ['dhanurveda'], name: 'Ashva Shastra', source: 'Horse breeding and cavalry', effect: 'Recruit Ashvarohi cavalry.' },
    stepwell: { tier: 2, cost: 40, req: ['ganita'], name: 'Stepwell engineering', source: 'Rani ki Vav, 11th century', effect: 'Provinces pay 50% more tax.' },
    iron: { tier: 3, cost: 80, req: ['wootz'], name: 'Rust-free iron', source: 'The Iron Pillar of Delhi', effect: '+4 defense for you and +40% squad health.' },
    surgery: { tier: 3, cost: 70, req: ['yoga'], name: "Sushruta's surgery", source: 'Sushruta Samhita', effect: 'Fallen soldiers have a 60% chance to survive their wounds.' },
    gaja: { tier: 3, cost: 90, req: ['ashva'], name: 'Gaja Shastra', source: 'Training war elephants', effect: 'Recruit Gajasena war elephants (needs rank General).' },
    jyotisha: { tier: 3, cost: 70, req: ['stepwell'], name: 'Jyotisha: astronomy', source: 'Aryabhata, 499 CE', effect: 'Vidyalayas produce double knowledge, and night battles lose their danger.' },
    rockets: { tier: 4, cost: 140, req: ['iron', 'jyotisha'], name: 'Mysorean rockets', source: 'Hyder Ali and Tipu Sultan, 1780s', effect: 'New skill: Rocket Barrage.' },
    nalanda: { tier: 4, cost: 120, req: ['jyotisha', 'surgery'], name: 'Nalanda Mahavihara', source: 'Great university, 5th century CE', effect: '+2 squad size and +10% renown.' },
};

// Provinces are the world's settlements; they are rebuilt whenever a world is generated.
let PROVINCES = {};
const PROVINCE_TAX = { village: 6, fishing: 6, ashram: 3, monastery: 5, town: 12, fort: 10 };
const CLAIM_RENOWN = { village: 0, fishing: 0, ashram: 40, monastery: 100, town: 150, fort: 250 };
const TYPE_NAME = { village: 'Village', town: 'Market town', fort: 'Desert fort', monastery: 'Mountain monastery', fishing: 'Fishing village', ashram: 'Forest ashram' };

function buildProvinces() {
    PROVINCES = Object.fromEntries(WORLD.settlements.map(st => [st.id, { name: st.name, tax: PROVINCE_TAX[st.type], type: st.type }]));
}

const BUILDINGS = {
    market: { name: 'Haat', kind: 'Market', desc: '+8 gold a day per level', cost: [40, 90, 160] },
    vidyalaya: { name: 'Vidyalaya', kind: 'School', desc: '+3 knowledge a day per level', cost: [50, 110, 200] },
    barracks: { name: 'Chhavni', kind: 'Barracks', desc: '+1 squad size here, faster healing and cheaper recruits', cost: [60, 130, 220] },
    canal: { name: 'Nahar', kind: 'Canal', desc: 'Irrigates the fields: +25% water per level', cost: [45, 100, 180] },
    roads: { name: 'Sadak', kind: 'Roads', desc: '+5 gold a day from trade per level and cheaper cart travel', cost: [35, 80, 150] },
};

const SCROLL_FACTS = [
    { id: 'charaka', title: 'The Charaka Samhita', fact: 'This founding text of Ayurveda teaches that food, sleep and a disciplined life are the three pillars of good health.' },
    { id: 'panini', title: "Panini's grammar", fact: 'More than 2,000 years ago Panini wrote the Ashtadhyayi, a grammar of Sanskrit with nearly 4,000 precise rules.' },
    { id: 'chintz', title: 'Indian cotton', fact: 'Indian cotton printed with fast natural dyes such as indigo was traded across the world. The English word "chintz" comes from the Hindi word chheent.' },
    { id: 'sushruta', title: "Sushruta's surgery", fact: 'The Sushruta Samhita describes more than a hundred surgical instruments and a method for rebuilding a damaged nose.' },
    { id: 'wootz', title: 'Wootz steel', fact: 'Wootz steel was made in small clay crucibles in South India. Traders carried it west, where smiths forged it into famous Damascus blades.' },
    { id: 'zero', title: 'Brahmagupta and zero', fact: 'In 628 CE Brahmagupta wrote the first known rules for calculating with zero, such as "a number minus itself is zero".' },
    { id: 'stepwell', title: 'Rani ki Vav', fact: 'Rani ki Vav in Patan, Gujarat, is an 11th-century stepwell seven storeys deep, carved with hundreds of sculptures.' },
    { id: 'pillar', title: 'The Iron Pillar', fact: 'The Iron Pillar of Delhi has stood for about 1,600 years with very little rust, thanks to the phosphorus in its iron.' },
    { id: 'rockets', title: 'Mysorean rockets', fact: 'Hyder Ali and Tipu Sultan of Mysore fought with iron-cased rockets in the 1780s and 1790s. The British studied them to build their own Congreve rockets.' },
    { id: 'jantar', title: 'Jantar Mantar', fact: 'The Samrat Yantra at Jaipur\'s Jantar Mantar, built by Sawai Jai Singh II in the 1700s, is a giant stone sundial that tells local time to within about two seconds.' },
    { id: 'aryabhata', title: 'Aryabhata', fact: 'In 499 CE Aryabhata wrote the Aryabhatiya. He gave pi as about 3.1416 and taught that the Earth spins on its axis.' },
    { id: 'nalanda', title: 'Nalanda', fact: 'Nalanda in Bihar was one of the world\'s first great residential universities. Scholars travelled from China, Korea and Tibet to study there.' },
];

let pendingCoronation = false;
let trail = [];

const hasResearch = k => player.research.includes(k);

function unlockedProvinces() {
    return Object.keys(PROVINCES).filter(k => player.provinces[k] && player.provinces[k].owned);
}

function rankNeeds(rk) {
    return rk.needs ? Math.min(rk.needs, WORLD.settlements.length) : 0;
}

function bestBarracks() {
    return Math.max(0, ...unlockedProvinces().map(k => player.provinces[k].barracks));
}

function squadCap() {
    const barracks = unlockedProvinces().filter(k => player.provinces[k].barracks > 0).length;
    return RANKS[player.rank].squad + (hasResearch('nalanda') ? 2 : 0) + barracks;
}

function unitMaxHp(type) {
    return Math.round(UNITS[type].hp * (hasResearch('iron') ? 1.4 : 1));
}

function squadMult() {
    return 1 + 0.08 * player.rank + (hasResearch('wootz') ? 0.3 : 0) + (player.ministers.dandanayaka ? 0.15 : 0) + (player.edicts.includes('drills') ? 0.1 : 0);
}

function goldMult() {
    return hasResearch('ganita') ? 1.25 : 1;
}

function gainRenown(n) {
    player.renown += Math.round(n * (hasResearch('nalanda') ? 1.1 : 1));
    checkRank();
}

function checkRank() {
    let r = player.rank;
    while (r + 1 < RANKS.length) {
        const next = RANKS[r + 1];
        if (player.renown >= next.renown && unlockedProvinces().length >= rankNeeds(next)) r++;
        else break;
    }
    if (r <= player.rank) return;
    player.rank = r;
    const rk = RANKS[r];
    showBanner(`${rk.title} · ${rk.local}`);
    toast(`Promoted to ${rk.title}! You can now lead ${squadCap()} soldiers.`);
    if (r === RANKS.length - 1) pendingCoronation = true;
}

function dayPhase() {
    const t = player.time;
    const label = t < 0.2 ? 'Night' : t < 0.3 ? 'Dawn' : t < 0.45 ? 'Morning' : t < 0.55 ? 'Noon'
        : t < 0.7 ? 'Afternoon' : t < 0.8 ? 'Dusk' : 'Night';
    return { label, night: t < 0.22 || t > 0.78 };
}

function dailyYield() {
    let gold = 0;
    let know = 0;
    for (const k of unlockedProvinces()) {
        const p = player.provinces[k];
        let g = PROVINCES[k].tax * (hasResearch('stepwell') ? 1.5 : 1) + 8 * p.market + 5 * p.roads * (player.edicts.includes('roads') ? 1.5 : 1);
        g *= TAXES[player.tax].mult * moodFactor(k) * (p.focus === 'trade' ? 1.25 : 1);
        gold += g;
        know += 1 + 3 * p.vidyalaya * (hasResearch('jyotisha') ? 2 : 1) * (p.focus === 'learning' ? 1.5 : 1);
    }
    gold *= goldMult() * (player.rank >= 5 ? 1.25 : 1) * (player.ministers.diwan ? 1.15 : 1);
    know = know * (player.ministers.rajguru ? 1.3 : 1) + (player.edicts.includes('patronage') ? 4 : 0);
    const salaries = Object.keys(MINISTERS).reduce((a, k) => a + (player.ministers[k] ? MINISTERS[k].salary : 0), 0);
    const edictCost = { roads: 10, patronage: 8, drills: 6 };
    const upkeep = player.edicts.reduce((a, e) => a + (edictCost[e] || 0), 0);
    const wages = player.squad.reduce((a, s) => a + UNITS[s.type].wage, 0);
    return { gold: Math.round(gold), know: Math.round(know), wages, salaries, upkeep, grain: grainUse() };
}

function newDay() {
    const prevSeason = seasonIndex(player.day);
    player.day++;
    const s = season();
    player.weather = Math.random() < s.rain ? 'rain' : 'clear';
    const notes = [];
    if (seasonIndex(player.day) !== prevSeason) {
        let grain = 0;
        let gold = 0;
        for (const k of unlockedProvinces()) {
            const h = harvestYield(k);
            if (h) { grain += h.grain; gold += h.gold; }
        }
        player.grain += grain;
        player.gold += gold;
        notes.push(`Harvest brought in ${grain} grain${gold ? ` and ${gold} gold` : ''}. ${s.name} sowing begins.`);
        sowAll();
    }
    for (const k of unlockedProvinces()) if (!farm(k).crop) farm(k).crop = plannedCrop(k, s.key);
    if (player.weather === 'rain') for (const k of unlockedProvinces()) farm(k).rainDays++;

    const y = dailyYield();
    player.gold += y.gold;
    player.knowledge += y.know;
    let cost = y.wages + y.salaries + y.upkeep;
    let deserted = 0;
    while (player.gold < cost && player.squad.length) {
        cost -= UNITS[player.squad.pop().type].wage;
        deserted++;
    }
    player.gold = Math.max(0, player.gold - cost);

    if (player.grain >= y.grain) {
        player.grain -= y.grain;
    } else {
        player.grain = 0;
        for (const k of unlockedProvinces()) adjustMood(k, -5);
        if (player.squad.length) { player.squad.pop(); deserted++; }
        notes.push('The granaries are empty! People go hungry.');
    }
    for (const k of unlockedProvinces()) {
        const p = player.provinces[k];
        adjustMood(k, TAXES[player.tax].mood + (player.edicts.includes('annadan') ? 2 : 0) + (player.edicts.includes('ahimsa') ? 1 : 0) + (p.focus === 'defense' ? 1 : 0) + (p.mood < 50 ? 1 : p.mood > 70 ? -1 : 0));
        if (p.mood < 25) notes.push(`Unrest in ${PROVINCES[k].name}: tax collectors were turned away.`);
    }
    if (!player.petition && player.day % 2 === 0 && Math.random() < 0.8) queuePetition();
    const cleared = WORLD.lairs.filter(l => flags.cleared[l.id] !== undefined && player.day - flags.cleared[l.id] >= 6);
    if (cleared.length && Math.random() < 0.3) {
        const l = pick(cleared);
        delete flags.cleared[l.id];
        l.tier = Math.min(4, l.tier + 1);
        spawnStatic();
        notes.push(`Scouts report that the ${l.name.toLowerCase()} is occupied again, and stronger.`);
    }

    const heal = 5 + 10 * bestBarracks() + (player.ministers.dandanayaka ? 10 : 0);
    for (const sol of player.squad) sol.hp = Math.min(unitMaxHp(sol.type), sol.hp + heal);
    const sky = player.weather === 'rain' ? 'Rain falls on the fields.' : 'Clear skies.';
    toast(`Day ${player.day}, ${s.name} season. ${sky} +${y.gold} gold, +${y.know} knowledge, -${cost} wages and salaries, -${y.grain} grain.${deserted ? ` ${deserted} soldier${deserted > 1 ? 's' : ''} deserted!` : ''} ${notes.join(' ')}`);
    save();
}

function recruitCost(type) {
    return Math.round(UNITS[type].cost * (1 - 0.1 * bestBarracks()));
}

function recruitLock(type) {
    const u = UNITS[type];
    if (u.research && !hasResearch(u.research)) return `Research ${RESEARCH[u.research].name} first`;
    if (u.rank && player.rank < u.rank) return `Requires the rank of ${RANKS[u.rank].title}`;
    if (player.squad.length >= squadCap()) return 'Your squad is full. Rise in rank or build barracks.';
    if (player.gold < recruitCost(type)) return 'Not enough gold';
    return null;
}

function recruit(type) {
    if (recruitLock(type)) return;
    player.gold -= recruitCost(type);
    player.squad.push({ id: ++player.soldierSeq, type, hp: unitMaxHp(type) });
    toast(`A ${UNITS[type].name} joins your squad`);
}

function researchState(k) {
    if (hasResearch(k)) return 'done';
    return (RESEARCH[k].req || []).every(hasResearch) ? 'open' : 'locked';
}

function study(k) {
    const r = RESEARCH[k];
    if (researchState(k) !== 'open' || player.knowledge < r.cost) return;
    player.knowledge -= r.cost;
    player.research.push(k);
    if (k === 'rockets') player.skills.push('rockets');
    for (const s of player.squad) s.hp = Math.min(unitMaxHp(s.type), s.hp + (k === 'iron' ? Math.round(UNITS[s.type].hp * 0.4) : 0));
    toast(`Your scholars mastered ${r.name}`);
    gainRenown(10);
}

function buildCost(prov, b) {
    const lvl = player.provinces[prov][b];
    return lvl >= 3 ? null : BUILDINGS[b].cost[lvl];
}

function construct(prov, b) {
    const cost = buildCost(prov, b);
    if (cost === null || player.gold < cost) return;
    player.gold -= cost;
    player.provinces[prov][b]++;
    toast(`${BUILDINGS[b].name} in ${PROVINCES[prov].name} is now level ${player.provinces[prov][b]}`);
    gainRenown(10);
}

function collectScroll(s) {
    flags.scrolls.push(s.id);
    player.knowledge += 15;
    gainRenown(5);
    const first = flags.scrolls.length === 1;
    say(lines('Palm-leaf manuscript',
        `${s.title}. ${s.fact}`,
        first ? 'You gain 15 knowledge. Spend knowledge on new sciences in the Research tab of the menu.' : `You gain 15 knowledge. Manuscripts found: ${flags.scrolls.length} of ${WORLD.scrolls.length}.`));
}

// ---------- Seasons and agriculture ----------

const SEASON_DAYS = 3;

const SEASONS = [
    { key: 'kharif', name: 'Kharif', when: 'monsoon season, sown with the first rains', rain: 0.6 },
    { key: 'rabi', name: 'Rabi', when: 'winter season, sown after the monsoon', rain: 0.12 },
    { key: 'zaid', name: 'Zaid', when: 'short summer season between the two', rain: 0.05 },
];

const CROPS = {
    rice: { name: 'Rice', local: 'dhaan', season: 'kharif', water: 0.7, grain: 30, gold: 0, height: 0.45, young: '#7fc24f', ripe: '#d8be55', shape: 'blade', note: 'Thirsty. Needs good rain or canals.' },
    cotton: { name: 'Cotton', local: 'kapas', season: 'kharif', water: 0.4, grain: 0, gold: 45, height: 0.55, young: '#5f8f3a', ripe: '#ecebe2', shape: 'bush', note: 'Cash crop for the weavers. Sells for gold.' },
    bajra: { name: 'Pearl millet', local: 'bajra', season: 'kharif', water: 0.2, grain: 20, gold: 0, height: 0.85, young: '#6f9a40', ripe: '#b59a50', shape: 'blade', note: 'Hardy. Grows even in a weak monsoon.' },
    wheat: { name: 'Wheat', local: 'gehun', season: 'rabi', water: 0.45, grain: 32, gold: 0, height: 0.55, young: '#7fb54a', ripe: '#e0b84a', shape: 'blade', note: 'The great winter grain of the north.' },
    mustard: { name: 'Mustard', local: 'sarson', season: 'rabi', water: 0.3, grain: 8, gold: 30, height: 0.7, young: '#6aa040', ripe: '#e8d22a', shape: 'bush', note: 'Pressed for oil. Fields turn bright yellow.' },
    chana: { name: 'Chickpea', local: 'chana', season: 'rabi', water: 0.2, grain: 22, gold: 6, height: 0.35, young: '#6f9a40', ripe: '#a8a060', shape: 'bush', note: 'A pulse that needs little water.' },
    moong: { name: 'Mung bean', local: 'moong', season: 'zaid', water: 0.35, grain: 16, gold: 6, height: 0.3, young: '#5f9a3a', ripe: '#8aa04a', shape: 'bush', note: 'Quick summer pulse.' },
    melon: { name: 'Watermelon', local: 'tarbooz', season: 'zaid', water: 0.5, grain: 6, gold: 24, height: 0.25, young: '#4f8a30', ripe: '#3f7a2a', shape: 'bush', note: 'Sold in the summer markets.' },
    fodder: { name: 'Fodder', local: 'chara', season: 'zaid', water: 0.25, grain: 10, gold: 4, height: 0.4, young: '#7fb54a', ripe: '#9ab04a', shape: 'blade', note: 'Feeds cattle and horses.' },
};

const GRAIN_PRICE = { buy: 18, sell: 9, lot: 10 };
const BIOME_FARMING = { grassland: 1.2, forest: 1, jungle: 0.9, savanna: 0.85, desert: 0.55, badlands: 0.7, snow: 0.6, marsh: 1.1 };

function seasonIndex(day = player.day) {
    return Math.floor((day - 1) / SEASON_DAYS) % SEASONS.length;
}

function season(day = player.day) {
    return SEASONS[seasonIndex(day)];
}

function cropsFor(seasonKey) {
    return Object.keys(CROPS).filter(k => CROPS[k].season === seasonKey);
}

function fieldArea(prov) {
    return settlementById(prov).fieldTiles;
}

function farm(prov) {
    const p = player.provinces[prov];
    if (!p.farm) p.farm = { crop: null, rainDays: 0, days: 0, blight: 0 };
    if (!p.plan) p.plan = {};
    return p.farm;
}

function plannedCrop(prov, seasonKey) {
    const plan = player.provinces[prov].plan || {};
    return plan[seasonKey] || cropsFor(seasonKey)[0];
}

function irrigation(prov) {
    return player.provinces[prov].canal * 0.25 + (hasResearch('stepwell') ? 0.15 : 0) + (player.provinces[prov].wellBonus || 0);
}

function sowAll() {
    for (const k of unlockedProvinces()) {
        const f = farm(k);
        f.crop = plannedCrop(k, season().key);
        f.rainDays = 0;
        f.days = 0;
        f.blight = 0;
    }
}

function harvestYield(prov) {
    const f = farm(prov);
    if (!f.crop) return null;
    const c = CROPS[f.crop];
    const water = Math.min(1.2, f.rainDays / SEASON_DAYS + irrigation(prov));
    const waterFactor = water >= c.water ? 1 + Math.min(0.3, (water - c.water) * 0.3) : 0.35 + 0.65 * (water / c.water);
    let mult = waterFactor * (fieldArea(prov) / 20) * moodFactor(prov) * (BIOME_FARMING[settlementById(prov).biome] || 1);
    if (player.ministers.amatya) mult *= 1.2;
    if (player.provinces[prov].focus === 'agriculture') mult *= 1.25;
    mult *= 1 - f.blight;
    return { crop: f.crop, grain: Math.round(c.grain * mult), gold: Math.round(c.gold * mult * goldMult()), water: waterFactor };
}

function cropLook(prov) {
    if (!player.provinces[prov]) return { crop: null, stage: 0, height: 0 };
    const f = player.provinces[prov].farm;
    if (!f || !f.crop || !unlockedProvinces().includes(prov)) return { crop: null, stage: 0, height: 0 };
    const c = CROPS[f.crop];
    const dayIn = (player.day - 1) % SEASON_DAYS;
    const stage = Math.min(1, Math.round(((dayIn + player.time) / SEASON_DAYS) * 10) / 10);
    return { crop: f.crop, stage: Math.max(0.1, stage), height: c.height, young: c.young, ripe: c.ripe, shape: c.shape };
}

function setPlan(prov, seasonKey, crop) {
    player.provinces[prov].plan = player.provinces[prov].plan || {};
    player.provinces[prov].plan[seasonKey] = crop;
}

function tradeGrain(dir) {
    if (dir === 'buy' && player.gold >= GRAIN_PRICE.buy) { player.gold -= GRAIN_PRICE.buy; player.grain += GRAIN_PRICE.lot; }
    if (dir === 'sell' && player.grain >= GRAIN_PRICE.lot) { player.grain -= GRAIN_PRICE.lot; player.gold += GRAIN_PRICE.sell; }
}

function grainUse() {
    const eat = { paidal: 1, archer: 1, cavalry: 2, elephant: 5 };
    let n = player.squad.reduce((a, s) => a + eat[s.type], 0);
    if (player.horse) n += 1;
    if (player.edicts.includes('annadan')) n += 6;
    return n;
}

// ---------- Transport ----------

const HORSE_PRICE = 150;

function stepTime() {
    return player.mounted ? 85 : STEP_MS;
}

function discoverStations() {
    const s = settlementAt(player.x, player.y);
    if (!s) return;
    if (!player.stations.includes(s.id)) {
        player.stations.push(s.id);
        toast(`You reached ${s.name}. Its bullock-cart stand is now on your travel list.`);
    }
    reveal(s.x, s.y, s.r + 4);
}

function travelCost(from, to) {
    const a = settlementById(from);
    const b = settlementById(to);
    const dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const roads = player.provinces[to].roads;
    if (player.edicts.includes('roads')) return 0;
    return Math.max(2, Math.round(dist * 0.35 * (1 - 0.2 * roads)));
}

function travelLock(from, to) {
    if (from === to) return 'You are here';
    if (!player.stations.includes(to)) return 'Not visited yet';
    if (player.gold < travelCost(from, to)) return 'Not enough gold';
    return null;
}

function travel(from, to, done) {
    if (travelLock(from, to)) return;
    player.gold -= travelCost(from, to);
    const st = settlementById(to);
    const carter = st.npcs.find(n => n.role === 'carter') || { x: st.x, y: st.y };
    const el = $('fade');
    el.hidden = false;
    el.classList.add('on');
    setTimeout(() => {
        const spots = [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1]].map(([dx, dy]) => [carter.x + dx, carter.y + dy]).filter(([x, y]) => walkable(x, y) && !entityAt(x, y));
        const [x, y] = spots[0] || [st.x, st.y];
        player.x = player.rx = x;
        player.y = player.ry = y;
        trail = [];
        player.time += Math.min(0.3, (Math.abs(st.x - settlementById(from).x) + Math.abs(st.y - settlementById(from).y)) / 400);
        lastPlace = st.id;
        reveal(x, y);
        showBanner(st.name);
        el.classList.remove('on');
        setTimeout(() => { el.hidden = true; }, 450);
        save();
        if (done) done();
    }, 600);
}

function toggleRide() {
    if (!player.horse || ui.battle) return;
    player.mounted = !player.mounted;
    toast(player.mounted ? 'You mount your horse. You travel twice as fast.' : 'You dismount.');
}

// ---------- Government ----------

const TAXES = {
    low: { name: 'Light', share: 'one-eighth of the harvest', mult: 0.75, mood: 1 },
    fair: { name: 'Customary', share: 'one-sixth of the harvest, the traditional share', mult: 1, mood: 0 },
    high: { name: 'Heavy', share: 'one-third of the harvest', mult: 1.4, mood: -2 },
};

const MINISTERS = {
    diwan: { post: 'Diwan', role: 'Revenue and treasury', name: 'Pandit Keshav Rao', effect: '+15% gold from provinces', salary: 6 },
    dandanayaka: { post: 'Dandanayaka', role: 'Army command', name: 'Bhim Singh Rathore', effect: '+15% squad damage and faster healing', salary: 6 },
    amatya: { post: 'Amatya', role: 'Agriculture and land', name: 'Gopal Krishnan', effect: '+20% harvests', salary: 5 },
    rajguru: { post: 'Rajguru', role: 'Learning and scholars', name: 'Acharya Meenakshi', effect: '+30% knowledge each day', salary: 5 },
};

const EDICTS = {
    annadan: { name: 'Annadan', desc: 'Free community kitchens feed the poor.', effect: '+2 contentment a day everywhere, costs 6 grain a day' },
    roads: { name: 'Road-building drive', desc: 'Workers lay and repair roads.', effect: 'Free cart travel and +50% road income, costs 10 gold a day' },
    patronage: { name: 'Patronage of scholars', desc: 'Stipends for teachers and writers.', effect: '+4 knowledge a day, costs 8 gold a day' },
    drills: { name: 'Military drills', desc: 'Soldiers train daily.', effect: '+10% squad damage, costs 6 gold a day' },
    ahimsa: { name: 'Protection of animals', desc: 'Inspired by the pillar edicts of Emperor Ashoka, 3rd century BCE.', effect: 'Half as many wild animals roam, +1 contentment a day' },
};

const GOV_RANK = 4;
const EDICT_RANK = 5;

function moodFactor(prov) {
    return 0.6 + (player.provinces[prov].mood / 100) * 0.6;
}

function setTax(k) {
    player.tax = k;
    toast(`Tax set to ${TAXES[k].name.toLowerCase()}: ${TAXES[k].share}`);
}

function toggleMinister(k) {
    if (player.rank < GOV_RANK) return;
    player.ministers[k] = !player.ministers[k];
    toast(player.ministers[k] ? `${MINISTERS[k].name} is appointed ${MINISTERS[k].post}` : `${MINISTERS[k].name} leaves the council`);
}

function toggleEdict(k) {
    if (player.rank < EDICT_RANK) return;
    if (player.edicts.includes(k)) player.edicts = player.edicts.filter(e => e !== k);
    else if (player.edicts.length < 2) player.edicts.push(k);
    else { toast('You can keep only two royal edicts in force at once'); return; }
}

function adjustMood(prov, n) {
    const p = player.provinces[prov];
    p.mood = Math.max(0, Math.min(100, p.mood + n));
}

// ---------- Local government ----------

const COUNCIL_BODY = { village: 'Gram Panchayat', fishing: 'Gram Panchayat', town: 'Nagar Sabha', fort: 'Council of the fort', monastery: 'Council of the gompa', ashram: 'Ashram elders' };
const HEAD_TITLE = { village: 'Sarpanch', fishing: 'Sarpanch', town: 'Nagar Seth', fort: 'Qiledar', monastery: 'Lama', ashram: 'Acharya' };

function council(id) {
    const st = settlementById(id);
    const head = st.npcs.find(n => n.role === 'headman' || n.role === 'guru');
    return { body: COUNCIL_BODY[st.type], head: `${HEAD_TITLE[st.type]} ${head ? head.name : ''}`.trim() };
}

const FOCUS = {
    agriculture: { name: 'Agriculture', effect: '+25% harvest' },
    trade: { name: 'Trade', effect: '+25% province gold' },
    learning: { name: 'Learning', effect: '+50% school knowledge' },
    defense: { name: 'Defense', effect: 'Soldiers heal faster, +1 contentment a day' },
};

function setFocus(prov, f) {
    player.provinces[prov].focus = f;
    toast(`${council(prov).body} of ${PROVINCES[prov].name} will focus on ${FOCUS[f].name.toLowerCase()}`);
}

const PETITIONS = [
    {
        id: 'water', text: p => `Two families in ${p} are quarrelling over turns at the irrigation channel.`,
        choices: [
            { label: 'Fix fair turns for everyone', run: k => { adjustMood(k, 6); return 'The families agree to share by turns. The village is grateful.'; } },
            { label: 'Favour the bigger landowner', run: k => { adjustMood(k, -6); player.gold += 20; return 'The landowner pays you 20 gold. The poorer family leaves angry.'; } },
        ],
    },
    {
        id: 'school', text: p => `The council of ${p} asks for help to open a pathshala so children can learn letters and numbers.`,
        choices: [
            { label: 'Grant 40 gold', cost: 40, run: k => { player.gold -= 40; player.knowledge += 8; adjustMood(k, 6); return 'A teacher is hired. You gain 8 knowledge.'; } },
            { label: 'Not this year', run: k => { adjustMood(k, -3); return 'The council is disappointed.'; } },
        ],
    },
    {
        id: 'locust', text: p => `A swarm of locusts is flying toward the fields of ${p}!`,
        choices: [
            { label: 'Pay villagers to drive them off with drums and smoke (30 gold)', cost: 30, run: () => { player.gold -= 30; return 'Drums and smoke turn the swarm away. The crop is saved.'; } },
            { label: 'Let it pass and hope', run: k => { farm(k).blight = 0.4; adjustMood(k, -3); return 'The locusts strip part of the crop. This harvest will be smaller.'; } },
        ],
    },
    {
        id: 'festival', text: p => `The people of ${p} invite you to help fund their harvest festival.`,
        choices: [
            { label: 'Fund the festival (30 gold)', cost: 30, run: k => { player.gold -= 30; adjustMood(k, 10); gainRenown(5); return 'Lamps, music and sweets fill the night. Your name is praised everywhere.'; } },
            { label: 'Politely decline', run: k => { adjustMood(k, -2); return 'The festival is quieter this year.'; } },
        ],
    },
    {
        id: 'land', text: p => `Two brothers in ${p} dispute the land their father left them.`,
        choices: [
            { label: 'Divide it equally yourself', run: k => { adjustMood(k, 3); return 'Each brother receives an equal share.'; } },
            { label: 'Let the local council decide', run: k => { adjustMood(k, 5); return 'The council settles it. People are proud to govern themselves.'; } },
        ],
    },
    {
        id: 'well', text: p => `A hamlet in ${p} has no reliable water. They ask for a new stepwell.`,
        choices: [
            { label: 'Dig a stepwell (35 gold)', cost: 35, run: k => { player.gold -= 35; adjustMood(k, 8); player.provinces[k].wellBonus = Math.min(0.3, (player.provinces[k].wellBonus || 0) + 0.1); return 'The stepwell is dug. Fields here get a little more water from now on.'; } },
            { label: 'Refuse', run: k => { adjustMood(k, -4); return 'The villagers keep walking miles for water.'; } },
        ],
    },
    {
        id: 'bandits', text: p => `Bandits robbed a merchant caravan on the road near ${p}.`,
        choices: [
            { label: 'Send your squad after them', run: () => { const hurt = player.squad.length ? pick(player.squad) : null; if (hurt) hurt.hp = Math.max(1, hurt.hp - 12); player.gold += 25; return `Your soldiers recover 25 gold of stolen goods${hurt ? `, though a ${UNITS[hurt.type].name} is wounded` : ''}.`; } },
            { label: 'Compensate the merchants (20 gold)', cost: 20, run: k => { player.gold -= 20; adjustMood(k, 4); return 'The merchants thank you and keep trading here.'; } },
        ],
    },
    {
        id: 'tiger', text: p => `A tiger is killing cattle at the edge of ${p}.`,
        choices: [
            { label: 'Hunt it yourself', run: k => { adjustMood(k, 6); huntPending = true; return 'You take up your weapon and go after the tiger.'; } },
            { label: 'Pay for stronger cattle pens (20 gold)', cost: 20, run: k => { player.gold -= 20; adjustMood(k, 3); return 'The herders build thorn fences around the pens.'; } },
        ],
    },
];

function queuePetition() {
    const provs = unlockedProvinces();
    if (!provs.length) return;
    const pt = pick(PETITIONS);
    const pk = pick(provs);
    player.petition = { id: pt.id, prov: pk };
}

function petitionDialog() {
    const pp = player.petition;
    const pt = PETITIONS.find(p => p.id === pp.id);
    const cn = council(pp.prov);
    const choices = pt.choices.map(c => ({
        label: c.label,
        disabled: c.cost && player.gold < c.cost,
        run: () => {
            player.petition = null;
            const msg = c.run(pp.prov);
            say(lines(cn.head, msg), () => { if (huntPending) { huntPending = false; queueHunt(); } });
        },
    }));
    say([{ name: `Petition from the ${cn.body}`, text: pt.text(PROVINCES[pp.prov].name) }], null, choices);
}

let huntPending = false;

function queueHunt() {
    {
        const spots = Object.values(DIRS).map(([dx, dy]) => [player.x + dx, player.y + dy]).filter(([x, y]) => walkable(x, y) && !entityAt(x, y));
        const [x, y] = spots[0] || [player.x, player.y - 1];
        const tiger = { kind: 'tiger', foe: makeFoe('tiger', Math.max(0, tierAt(player.x, player.y))), region: biomeAt(player.x, player.y), x, y, rx: x, ry: y, nextMove: performance.now() + 1e9, stunUntil: 0 };
        entities.push(tiger);
        startBattle(tiger);
    }
}

// ---------- Winning settlements ----------

function claimLock(id) {
    const st = settlementById(id);
    const p = player.provinces[id];
    if (p.owned) return 'Already part of your realm';
    if (p.favour < 100) return `Their trust is ${Math.round(p.favour)} of 100`;
    if (player.renown < CLAIM_RENOWN[st.type]) return `A ${TYPE_NAME[st.type].toLowerCase()} expects ${CLAIM_RENOWN[st.type]} renown`;
    return null;
}

function addFavour(id, n) {
    const p = player.provinces[id];
    if (!p || p.owned) return;
    p.favour = Math.max(0, Math.min(100, p.favour + n));
}

function claim(id) {
    if (claimLock(id)) return;
    const p = player.provinces[id];
    p.owned = true;
    p.mood = 65;
    if (!player.stations.includes(id)) player.stations.push(id);
    const f = farm(id);
    f.crop = plannedCrop(id, season().key);
    showBanner(`${PROVINCES[id].name} joins your realm`);
    gainRenown(40);
    checkRank();
}

function lairCleared(lairId) {
    const l = WORLD.lairs.find(q => q.id === lairId);
    flags.cleared[lairId] = player.day;
    for (const st of WORLD.settlements) {
        const d = Math.hypot(st.x - l.x, st.y - l.y);
        if (st.id === l.near) addFavour(st.id, 70);
        else if (d < MAP_W * 0.22) addFavour(st.id, 25);
    }
}

function nearestThreat(id) {
    const st = settlementById(id);
    const open = WORLD.lairs.filter(l => flags.cleared[l.id] === undefined);
    open.sort((a, b) => Math.hypot(a.x - st.x, a.y - st.y) - Math.hypot(b.x - st.x, b.y - st.y));
    return open[0] || null;
}
