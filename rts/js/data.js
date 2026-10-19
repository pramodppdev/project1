'use strict';

// ---------- Age of Bharat: game data ----------

const RES_KEYS = ['food', 'wood', 'stone', 'gold'];
const RES_ICON = { food: '🌾', wood: '🪵', stone: '🪨', gold: '🪙' };
const RES_NAME = { food: 'Food', wood: 'Wood', stone: 'Stone', gold: 'Gold' };
const START_RES = { food: 200, wood: 200, stone: 150, gold: 100 };
const POP_MAX = 200;

const AGES = [
    { name: 'Vedic Age', local: 'Vaidik Yug', cost: null, time: 0 },
    { name: 'Janapada Age', local: 'Mahajanapada', cost: { food: 500 }, time: 40, needs: 2 },
    { name: 'Imperial Age', local: 'Samrajya', cost: { food: 800, gold: 200 }, time: 55, needs: 2 },
    { name: 'Golden Age', local: 'Swarna Yug', cost: { food: 1000, gold: 800 }, time: 70, needs: 2 },
];

// Bonus kinds: farming, mining, mounted, thrift, builders, archers, forest, trade.
const BONUS_TEXT = {
    farming: 'Food gathered 15% faster.',
    mining: 'Gold and stone gathered 15% faster.',
    mounted: 'Cavalry and elephants have 15% more health.',
    thrift: 'Infantry, archers and cavalry cost 15% less.',
    builders: 'Buildings have 25% more health and build 20% faster.',
    archers: 'Archers and towers shoot 1 tile further.',
    forest: 'Wood gathered 15% faster.',
    trade: 'Villages pay 30% more tribute and markets give better prices.',
};
const CIVS = {
    maurya: { name: 'Maurya', color: '#2f6fd6', leader: 'Chandragupta', kind: 'mining' },
    chola: { name: 'Chola', color: '#d9442b', leader: 'Rajendra', kind: 'farming' },
    rajput: { name: 'Rajput', color: '#e8a21a', leader: 'Prithviraj', kind: 'mounted' },
    maratha: { name: 'Maratha', color: '#2e9d5a', leader: 'Shivaji', kind: 'thrift' },
    vijayanagara: { name: 'Vijayanagara', color: '#8e44ad', leader: 'Krishnadevaraya', kind: 'builders' },
    gupta: { name: 'Gupta', color: '#f2d33a', leader: 'Samudragupta', kind: 'trade' },
    pandya: { name: 'Pandya', color: '#1aa6b7', leader: 'Nedunjeliyan', kind: 'trade' },
    chera: { name: 'Chera', color: '#7cb342', leader: 'Senguttuvan', kind: 'forest' },
    pallava: { name: 'Pallava', color: '#c2185b', leader: 'Narasimhavarman', kind: 'builders' },
    chalukya: { name: 'Chalukya', color: '#ff7043', leader: 'Pulakeshin', kind: 'archers' },
    rashtrakuta: { name: 'Rashtrakuta', color: '#5c6bc0', leader: 'Amoghavarsha', kind: 'mining' },
    kakatiya: { name: 'Kakatiya', color: '#a1887f', leader: 'Rudrama Devi', kind: 'builders' },
    hoysala: { name: 'Hoysala', color: '#26a69a', leader: 'Vishnuvardhana', kind: 'farming' },
    pala: { name: 'Pala', color: '#ec407a', leader: 'Dharmapala', kind: 'trade' },
    satavahana: { name: 'Satavahana', color: '#8d6e63', leader: 'Gautamiputra', kind: 'thrift' },
    kalinga: { name: 'Kalinga', color: '#00897b', leader: 'Kharavela', kind: 'mounted' },
    magadha: { name: 'Magadha', color: '#6d4c41', leader: 'Bimbisara', kind: 'forest' },
    avanti: { name: 'Avanti', color: '#9ccc65', leader: 'Pradyota', kind: 'archers' },
    kuru: { name: 'Kuru', color: '#455a64', leader: 'Parikshit', kind: 'farming' },
    ahom: { name: 'Ahom', color: '#ffb74d', leader: 'Sukaphaa', kind: 'forest' },
};
for (const c of Object.values(CIVS)) c.bonus = BONUS_TEXT[c.kind];
const MAX_KINGDOMS = 20;

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
    well: { name: 'Well', local: 'Kuan', icon: '', size: 1, hp: 500, cost: { stone: 50 }, time: 12, age: 0, sight: 2, mood: 3, farmBoost: 5 },
    shmashan: { name: 'Cremation Ground', local: 'Shmashan Ghat', icon: '', size: 2, hp: 700, cost: { wood: 75, stone: 25 }, time: 18, age: 0, sight: 3, counts: true },
    market: { name: 'Market', local: 'Haat', icon: '', size: 3, hp: 1200, cost: { wood: 175 }, time: 30, age: 1, sight: 5, counts: true },
    gurukul: { name: 'Gurukul', local: 'Gurukul', icon: '', size: 3, hp: 1100, cost: { wood: 150, stone: 50 }, time: 30, age: 1, sight: 5, counts: true },
    panchayat: { name: 'Village Council', local: 'Panchayat Chaupal', icon: '', size: 2, hp: 1000, cost: { wood: 100, stone: 100, gold: 50 }, time: 30, age: 1, sight: 5, counts: true, mood: 5 },
    thana: { name: 'Police Post', local: 'Thana', size: 2, hp: 1100, cost: { wood: 120, stone: 40 }, time: 25, age: 0, sight: 7, counts: true },
    karyalaya: { name: 'Government Office', local: 'Karyalaya', size: 3, hp: 1500, cost: { wood: 200, stone: 150 }, time: 40, age: 1, sight: 5, counts: true },
    wall: { name: 'Stone Wall', local: 'Prakar', size: 1, hp: 1400, cost: { stone: 6 }, time: 5, age: 1, sight: 2, line: true },
    gate: { name: 'Gate', local: 'Dwar', size: 1, hp: 1800, cost: { stone: 30 }, time: 10, age: 1, sight: 3, gate: true, line: true },
    fort: { name: 'Fort', local: 'Durg', size: 4, hp: 5200, cost: { stone: 650, wood: 250 }, time: 90, age: 2, sight: 10, atk: 8, range: 8, rate: 1.4, arrows: 3, trains: ['spearman', 'swordsman', 'archer', 'cavalry'], counts: true, territory: 11 },
    village: { name: 'Village', local: 'Gaon', size: 3, hp: 3000, cost: {}, time: 1, age: 9, sight: 7, drop: RES_KEYS, pop: 8, trains: ['villager'], settlement: true },
    workshop: { name: 'Siege Workshop', local: 'Yantrashala', icon: '⚙️', size: 3, hp: 1300, cost: { wood: 200, gold: 50 }, time: 40, age: 2, trains: ['ram', 'rocket'], sight: 5, counts: true },
};

const BUILD_MENU = ['house', 'farm', 'storehouse', 'well', 'shmashan', 'thana', 'barracks', 'range', 'stable', 'temple', 'market', 'gurukul', 'panchayat', 'karyalaya', 'university', 'tower', 'wall', 'gate', 'gajashala', 'workshop', 'fort', 'tc'];

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
    pucca: { name: 'Pucca houses', at: 'storehouse', age: 1, cost: { wood: 150, stone: 100 }, time: 30, effect: 'Fired-brick houses: each house shelters 3 more people and is twice as strong.', source: 'Baked bricks of Harappa' },
    roads: { name: 'Paved roads', at: 'panchayat', age: 1, cost: { stone: 150, gold: 50 }, time: 30, effect: 'Everyone walks 10% faster.', source: 'The Uttarapatha trade road' },
    utsav: { name: 'Utsav', at: 'temple', age: 1, cost: { food: 150, gold: 75 }, time: 25, effect: 'Festivals last twice as long and lift spirits even more.' },
    arthashastra: { name: 'Arthashastra', at: 'panchayat', age: 2, cost: { food: 200, gold: 150 }, time: 35, effect: 'Fair taxes bring in a steady flow of gold.', source: 'Kautilya\'s treatise on statecraft' },
    fortified: { name: 'Durg walls', at: 'university', age: 2, cost: { stone: 300, gold: 100 }, time: 40, effect: 'Town Centers and towers get 50% more health and +2 attack.', source: 'Hill forts of the Deccan' },
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

// ---------- Village life ----------

const YEAR = 60;          // seconds of play per year of life
const ADULT_AGE = 14;
const WORK_AGE = 6;
const ELDER_AGE = 55;
const FESTIVAL_CYCLE = 240; // seconds between one year's festivals and the next

const NAMES = {
    m: ['Arjun', 'Ravi', 'Vikram', 'Karthik', 'Anand', 'Bhima', 'Chandra', 'Dev', 'Gopal', 'Hari', 'Ishaan', 'Jayant', 'Kiran', 'Lakshman', 'Madhav', 'Nakul', 'Prakash', 'Raghav', 'Surya', 'Tarun', 'Uday', 'Varun', 'Yash', 'Arun', 'Bala', 'Murugan', 'Senthil', 'Raja', 'Govind', 'Mohan', 'Keshav', 'Nandan', 'Shankar', 'Vasu', 'Ajay', 'Bharat', 'Dhruv', 'Kabir', 'Manik', 'Satya', 'Tejas', 'Venkat', 'Ashok', 'Harsha', 'Kanha', 'Sahadev'],
    f: ['Sita', 'Lakshmi', 'Meera', 'Radha', 'Parvati', 'Ganga', 'Kaveri', 'Anjali', 'Bhavani', 'Chitra', 'Durga', 'Gauri', 'Isha', 'Janaki', 'Kamala', 'Lata', 'Malini', 'Nandini', 'Padma', 'Rukmini', 'Savitri', 'Tara', 'Uma', 'Vasanthi', 'Yamuna', 'Amba', 'Kalyani', 'Meenakshi', 'Rani', 'Saraswati', 'Tulsi', 'Valli', 'Ahalya', 'Damayanti', 'Shakuntala', 'Aruna', 'Champa', 'Devika', 'Hema', 'Jaya', 'Kumud', 'Leela', 'Mohini', 'Priya', 'Revati', 'Sudha'],
};

const SKILLS = { food: 'Farming', wood: 'Woodcutting', stone: 'Stonework', gold: 'Mining', build: 'Building', fight: 'Fighting' };
const SKILL_WORD = { food: 'farmer', wood: 'woodcutter', stone: 'stonemason', gold: 'miner', build: 'builder', fight: 'fighter' };
const SKILL_LEVELS = [[0, 'Novice'], [25, 'Skilled'], [50, 'Expert'], [80, 'Master']];
const RANKS = [[0, 'Sainik'], [3, 'Nayak'], [8, 'Senanayak'], [15, 'Mahasenapati']];

// Festivals fall at fixed points in each year.
const FESTIVALS = [
    { at: 0.04, name: 'Makar Sankranti', local: 'Pongal', mood: 15, text: 'The harvest festival: every farm gives a gift of food.', kind: 'harvest' },
    { at: 0.24, name: 'Holi', local: 'Festival of colours', mood: 20, text: 'People throw coloured powder and forget old quarrels.', kind: 'colours' },
    { at: 0.58, name: 'Onam', local: 'Return of Mahabali', mood: 15, text: 'Flower carpets and feasts in every home.', kind: 'flowers' },
    { at: 0.82, name: 'Diwali', local: 'Festival of lights', mood: 25, text: 'Lamps glow in every house and gold is offered to Lakshmi.', kind: 'lights' },
];

// ---------- Realm: settlements, territory, offices and elections ----------

const SETTLEMENT_LEVELS = [
    null,
    { name: 'Village', local: 'Gaon', pop: 8, radius: 8, tribute: 1, arrows: 0, hp: 3000 },
    { name: 'Town', local: 'Nagar', pop: 12, radius: 10, tribute: 2, arrows: 2, hp: 4500, cost: { wood: 300, stone: 200 }, age: 1 },
    { name: 'City', local: 'Mahanagar', pop: 20, radius: 13, tribute: 3.5, arrows: 4, hp: 7000, cost: { stone: 500, gold: 400 }, age: 2 },
];
const TERRITORY = { tc: 12, fort: 11, tower: 4 };
const REALM_TITLES = [[1, 'Chiefdom', 'Raja'], [3, 'Kingdom', 'Maharaja'], [7, 'Empire', 'Samrat']];

const PLACE_START = ['Rama', 'Krishna', 'Sona', 'Chandra', 'Hari', 'Shiva', 'Ganga', 'Lakshmi', 'Deva', 'Indra', 'Kamal', 'Madhu', 'Nila', 'Surya', 'Vijaya', 'Amra', 'Bel', 'Kesar', 'Tulsi', 'Mohan', 'Bhim', 'Gopal', 'Kanchi', 'Hampi', 'Ujjain', 'Mithila', 'Shri', 'Neel', 'Gauri', 'Durga'];
const PLACE_END = ['pur', 'nagar', 'gaon', 'garh', 'pura', 'palli', 'puram', 'kot', 'wadi', 'ganj', 'pet', 'halli', 'patnam', 'ur', 'dih'];

// One elected officer leads each stream of work.
const OFFICES = {
    food: { title: 'Krishi Adhikari', role: 'Agriculture officer' },
    wood: { title: 'Van Adhikari', role: 'Forest officer' },
    stone: { title: 'Shilpi Pramukh', role: 'Master of masons' },
    gold: { title: 'Khani Adhikari', role: 'Mines officer' },
    build: { title: 'Sthapati', role: 'Chief architect' },
    fight: { title: 'Senapati', role: 'Army commander' },
    police: { title: 'Kotwal', role: 'Chief of police' },
};
const ELECTION_YEARS = 5;
const SCHOOL_AGE = 5;
const COLLEGE_END = 18;
