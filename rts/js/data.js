'use strict';

// ---------- Age of Bharat: game data ----------

const RES_KEYS = ['food', 'wood', 'stone', 'gold'];
const RES_ICON = { food: '🌾', wood: '🪵', stone: '🪨', gold: '🪙' };
const RES_NAME = { food: 'Food', wood: 'Wood', stone: 'Stone', gold: 'Gold' };
const START_RES = { food: 200, wood: 200, stone: 150, gold: 100 };
const POP_MAX = 150;

const AGES = [
    { name: 'Vedic Age', local: 'Vaidik Yug', cost: null, time: 0 },
    { name: 'Janapada Age', local: 'Mahajanapada', cost: { food: 500 }, time: 40, needs: 2 },
    { name: 'Imperial Age', local: 'Samrajya', cost: { food: 800, gold: 200 }, time: 55, needs: 2 },
    { name: 'Golden Age', local: 'Swarna Yug', cost: { food: 1000, gold: 800 }, time: 70, needs: 2 },
];

const CIVS = {
    maurya: { name: 'Maurya', color: '#2f6fd6', bonus: 'Gold and stone gathered 15% faster.', leader: 'Chandragupta' },
    chola: { name: 'Chola', color: '#d9442b', bonus: 'Food gathered 15% faster.', leader: 'Rajendra' },
    rajput: { name: 'Rajput', color: '#e8a21a', bonus: 'Cavalry and elephants have 15% more health.', leader: 'Prithviraj' },
    maratha: { name: 'Maratha', color: '#2e9d5a', bonus: 'Infantry and cavalry cost 15% less.', leader: 'Shivaji' },
    vijayanagara: { name: 'Vijayanagara', color: '#8e44ad', bonus: 'Buildings have 25% more health and build 20% faster.', leader: 'Krishnadevaraya' },
};

// Armour has two kinds: melee (m) and pierce (p). Bonus multiplies damage against a class.
const UNIT_TYPES = {
    villager: { name: 'Villager', local: 'Gramin', icon: '🧑‍🌾', cls: 'villager', hp: 25, atk: 3, arm: [0, 0], range: 0.7, speed: 1.7, rate: 1.5, sight: 5, cost: { food: 50 }, time: 13, from: 'tc', age: 0 },
    spearman: { name: 'Spearman', local: 'Bhaladhari', icon: '🔱', cls: 'infantry', hp: 45, atk: 4, arm: [0, 0], range: 0.75, speed: 1.55, rate: 1.4, sight: 5, cost: { food: 35, wood: 25 }, time: 11, from: 'barracks', age: 0, bonus: { cavalry: 3, elephant: 3 } },
    swordsman: { name: 'Swordsman', local: 'Khadgadhari', icon: '⚔️', cls: 'infantry', hp: 62, atk: 8, arm: [1, 1], range: 0.75, speed: 1.4, rate: 1.5, sight: 5, cost: { food: 60, gold: 20 }, time: 13, from: 'barracks', age: 1, bonus: { building: 1.5 } },
    archer: { name: 'Archer', local: 'Dhanurdhar', icon: '🏹', cls: 'archer', hp: 32, atk: 4, arm: [0, 0], range: 5, speed: 1.5, rate: 2, sight: 7, cost: { wood: 25, gold: 45 }, time: 13, from: 'range', age: 1, bonus: { infantry: 1.5 }, missile: 'arrow' },
    cavalry: { name: 'Cavalry', local: 'Ashvarohi', icon: '🐎', cls: 'cavalry', hp: 110, atk: 9, arm: [1, 2], range: 0.85, speed: 2.7, rate: 1.8, sight: 7, cost: { food: 80, gold: 70 }, time: 17, from: 'stable', age: 1, bonus: { archer: 1.6, siege: 2 } },
    horsearcher: { name: 'Horse Archer', local: 'Ashva Dhanvi', icon: '🏇', cls: 'cavalry', hp: 60, atk: 5, arm: [0, 1], range: 4, speed: 2.5, rate: 2, sight: 7, cost: { wood: 40, gold: 70 }, time: 17, from: 'range', age: 2, missile: 'arrow' },
    elephant: { name: 'War Elephant', local: 'Gajasena', icon: '🐘', cls: 'elephant', hp: 320, atk: 16, arm: [1, 2], range: 1.0, speed: 1.0, rate: 2.2, sight: 6, cost: { food: 140, gold: 90 }, time: 26, from: 'gajashala', age: 2, bonus: { building: 2.5 }, radius: 0.55 },
    ram: { name: 'Battering Ram', local: 'Durg Bhedak', icon: '🪵', cls: 'siege', hp: 220, atk: 30, arm: [0, 8], range: 0.9, speed: 0.85, rate: 3, sight: 4, cost: { wood: 160, gold: 75 }, time: 24, from: 'workshop', age: 2, onlyBuildings: true, radius: 0.5 },
    rocket: { name: 'Rocket Cart', local: 'Baan Gaadi', icon: '🚀', cls: 'siege', hp: 90, atk: 24, arm: [0, 2], range: 7.5, speed: 0.9, rate: 4, sight: 8, cost: { wood: 160, gold: 120 }, time: 26, from: 'workshop', age: 3, tech: 'rockets', bonus: { building: 2.5 }, missile: 'rocket', splash: 1.2, radius: 0.45 },
    deer: { name: 'Chital deer', icon: '🦌', cls: 'animal', hp: 8, atk: 0, arm: [0, 0], range: 0, speed: 1.4, rate: 2, sight: 3, food: 140 },
    boar: { name: 'Wild boar', icon: '🐗', cls: 'animal', hp: 40, atk: 4, arm: [0, 0], range: 0.7, speed: 1.4, rate: 1.6, sight: 3, food: 300, aggressive: true },
};

// size is the square footprint in tiles.
const BUILDING_TYPES = {
    tc: { name: 'Town Center', local: 'Nagar Kendra', icon: '🏛️', size: 3, hp: 2400, cost: { wood: 275, stone: 100 }, time: 90, age: 2, drop: RES_KEYS, pop: 5, trains: ['villager'], atk: 5, range: 6, rate: 2, sight: 8 },
    house: { name: 'House', local: 'Ghar', icon: '🏠', size: 2, hp: 550, cost: { wood: 30 }, time: 14, age: 0, pop: 5, sight: 3 },
    farm: { name: 'Farm', local: 'Khet', icon: '🌱', size: 2, hp: 280, cost: { wood: 60 }, time: 10, age: 0, food: 300, walkable: true, sight: 1 },
    storehouse: { name: 'Storehouse', local: 'Bhandar', icon: '📦', size: 2, hp: 900, cost: { wood: 100 }, time: 20, age: 0, drop: RES_KEYS, sight: 4 },
    barracks: { name: 'Barracks', local: 'Senashala', icon: '🛡️', size: 3, hp: 1200, cost: { wood: 175 }, time: 30, age: 0, trains: ['spearman', 'swordsman'], sight: 5, counts: true },
    range: { name: 'Archery Range', local: 'Dhanushala', icon: '🎯', size: 3, hp: 1200, cost: { wood: 175 }, time: 30, age: 1, trains: ['archer', 'horsearcher'], sight: 5, counts: true },
    stable: { name: 'Stable', local: 'Ashvashala', icon: '🐴', size: 3, hp: 1200, cost: { wood: 175 }, time: 30, age: 1, trains: ['cavalry'], sight: 5, counts: true },
    temple: { name: 'Temple', local: 'Mandir', icon: '🛕', size: 2, hp: 1400, cost: { wood: 100, stone: 125 }, time: 35, age: 1, heal: 4, sight: 5, counts: true },
    university: { name: 'University', local: 'Vidyalaya', icon: '📜', size: 3, hp: 1500, cost: { wood: 200 }, time: 35, age: 1, sight: 5, counts: true },
    tower: { name: 'Watch Tower', local: 'Burj', icon: '🗼', size: 1, hp: 1000, cost: { wood: 25, stone: 125 }, time: 25, age: 1, atk: 6, range: 7, rate: 2, sight: 9 },
    gajashala: { name: 'Elephant Stable', local: 'Gajashala', icon: '🐘', size: 3, hp: 1500, cost: { wood: 200, stone: 100 }, time: 40, age: 2, trains: ['elephant'], sight: 5, counts: true },
    workshop: { name: 'Siege Workshop', local: 'Yantrashala', icon: '⚙️', size: 3, hp: 1300, cost: { wood: 200, gold: 50 }, time: 40, age: 2, trains: ['ram', 'rocket'], sight: 5, counts: true },
};

const BUILD_MENU = ['house', 'farm', 'storehouse', 'barracks', 'range', 'stable', 'temple', 'university', 'tower', 'gajashala', 'workshop', 'tc'];

const TECHS = {
    plough: { name: 'Heavy plough', at: 'storehouse', age: 1, cost: { food: 125, wood: 125 }, time: 25, effect: 'Farms hold 50% more food and are worked 15% faster.' },
    bowsaw: { name: 'Bow saw', at: 'storehouse', age: 1, cost: { food: 100, wood: 50 }, time: 20, effect: 'Villagers chop wood 20% faster.' },
    mining: { name: 'Mining', at: 'storehouse', age: 1, cost: { food: 100, wood: 75 }, time: 20, effect: 'Villagers mine gold and stone 20% faster.' },
    wootz: { name: 'Wootz steel', at: 'university', age: 1, cost: { food: 150, gold: 100 }, time: 30, effect: '+2 attack for infantry, cavalry and elephants.', source: 'South Indian crucible steel' },
    dhanurveda: { name: 'Dhanurveda', at: 'university', age: 1, cost: { food: 100, wood: 100 }, time: 25, effect: 'Archers, horse archers and towers get +1 range and +1 attack.', source: 'The ancient science of archery' },
    ayurveda: { name: 'Ayurveda', at: 'university', age: 1, cost: { food: 150, gold: 50 }, time: 25, effect: 'All units have 20% more health.', source: 'Charaka and Sushruta' },
    ironarmour: { name: 'Iron Pillar armour', at: 'university', age: 2, cost: { food: 200, gold: 150 }, time: 35, effect: '+1 melee and +1 pierce armour for soldiers.', source: 'Rust-free iron of the Iron Pillar' },
    stepwell: { name: 'Stepwell irrigation', at: 'university', age: 2, cost: { wood: 200, gold: 100 }, time: 30, effect: 'Farms are worked a further 20% faster.', source: 'Rani ki Vav' },
    ganita: { name: 'Ganita', at: 'university', age: 2, cost: { food: 200, gold: 200 }, time: 35, effect: 'All gathering 10% faster.', source: 'Brahmagupta and the rules of zero' },
    jyotisha: { name: 'Jyotisha', at: 'university', age: 2, cost: { food: 150, gold: 150 }, time: 30, effect: '+2 line of sight for all units and buildings.', source: 'Aryabhata\'s astronomy' },
    rockets: { name: 'Mysorean rockets', at: 'university', age: 3, cost: { wood: 300, gold: 300 }, time: 45, effect: 'Siege workshops can build Rocket Carts.', source: 'Hyder Ali and Tipu Sultan' },
    nalanda: { name: 'Nalanda', at: 'university', age: 3, cost: { food: 500, gold: 500 }, time: 50, effect: 'Villagers work 15% faster and population limit rises by 25.', source: 'The great university of Nalanda' },
};

const RESOURCE_OBJECTS = {
    T: { res: 'wood', amount: 100 }, J: { res: 'wood', amount: 150 }, P: { res: 'wood', amount: 100 }, Y: { res: 'wood', amount: 60 },
    L: { res: 'wood', amount: 80 }, G: { res: 'wood', amount: 80 }, c: { res: 'wood', amount: 60 },
    $: { res: 'gold', amount: 500 }, '%': { res: 'stone', amount: 350 }, '*': { res: 'food', amount: 125 },
};

const GATHER_RATE = { food: 0.58, wood: 0.52, stone: 0.45, gold: 0.48, farm: 0.44, hunt: 0.75 };
const CARRY = 10;
