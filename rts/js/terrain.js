'use strict';

// ---------- Terrain and vegetation (shared look with Legends of Bharat) ----------
// Generated from rpg/js/world3d.js and adapted: vegetation streams around the camera
// target and resource tiles (gold, stone, berries) get their own looks.

let renderer = null;
let scene = null;
let camera = null;
let vegGroup = null;
let trees = [];
let vegCenter = null;
let waterBump = null;
const EXT = 10;
const CHUNK = 32;
let tileH = null;
const GEO = {};

function geo(key, make) {
    if (!GEO[key]) GEO[key] = make();
    return GEO[key];
}

function shade(hex, amt) {
    const c = new THREE.Color(hex);
    c.offsetHSL(0, 0, amt);
    return `#${c.getHexString()}`;
}

function hash(x, y) {
    return ((x * 73856093) ^ (y * 19349663)) >>> 0;
}

// ---------- Terrain heights ----------

function rawHeight(x, y) {
    const i = idx(x, y);
    const g = ground[i];
    const o = objects[i];
    const b = biome[i];
    const n = fbm(x * 0.33 + 17, y * 0.33 + 5);
    if (g === 'o') return -1.7;
    if (g === '~' || g === '=') return -0.95;
    if (o === 'M' || o === 'C') return 2.0 + n * 2.6 + (b === 'snow' || b === 'peak' ? 0.8 : 0);
    let h;
    switch (b) {
        case 'snow': h = 0.6 + n * 0.7; break;
        case 'badlands': h = 0.2 + Math.round(n * 3) / 3 * 0.75; break;
        case 'desert': h = 0.1 + Math.pow(Math.sin(x * 0.6 + y * 0.3) * 0.5 + 0.5, 2) * 0.6 * n + n * 0.12; break;
        case 'beach': h = 0.02 + n * 0.06; break;
        case 'marsh': h = -0.12 + n * 0.12; break;
        case 'forest': case 'jungle': h = 0.14 + n * 0.36; break;
        case 'savanna': h = 0.1 + n * 0.16; break;
        default: h = 0.07 + n * 0.2;
    }
    if (g === 'p' || g === 'a') h = Math.max(0.03, h * 0.7);
    return h;
}

function computeHeights() {
    const N = MAP_W * MAP_H;
    const raw = new Float32Array(N);
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) raw[idx(x, y)] = rawHeight(x, y);
    let cur = raw;
    for (let pass = 0; pass < 2; pass++) {
        const next = new Float32Array(N);
        for (let y = 0; y < MAP_H; y++) {
            for (let x = 0; x < MAP_W; x++) {
                let sum = cur[idx(x, y)] * 2;
                let wsum = 2;
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (!inMap(nx, ny)) continue;
                    sum += cur[idx(nx, ny)];
                    wsum++;
                }
                let v = sum / wsum;
                const i = idx(x, y);
                const g = ground[i];
                if (g === '~' || g === '=') v = Math.min(v, -0.6);
                else if (g === 'o') v = Math.min(v, -1.1);
                else v = Math.max(v, -0.2);
                if (objects[i] === 'M') v = Math.max(v, raw[i] * 0.8);
                next[i] = v;
            }
        }
        cur = next;
    }
    tileH = cur;
}

function tileHeight(x, y) {
    const cx = Math.max(0, Math.min(MAP_W - 1, x));
    const cy = Math.max(0, Math.min(MAP_H - 1, y));
    const base = tileH[cy * MAP_W + cx];
    const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
    if (!d) return base;
    const g = ground[idx(cx, cy)];
    if (g === 'o') return base - d * 0.05;
    if (g === '~' || g === '=') return -0.95;
    return base + d * 0.3 + fbm(x * 0.3 + 40, y * 0.3 + 40) * d * 0.28;
}

function heightAt(fx, fz) {
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const tx = fx - x0;
    const tz = fz - z0;
    const a = tileHeight(x0, z0);
    const b = tileHeight(x0 + 1, z0);
    const c = tileHeight(x0, z0 + 1);
    const d = tileHeight(x0 + 1, z0 + 1);
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

function surfaceAt(fx, fz) {
    const tx = Math.round(fx);
    const tz = Math.round(fz);
    if (inMap(tx, tz) && ground[idx(tx, tz)] === '=') return 0.12;
    return Math.max(heightAt(fx, fz), -0.3);
}

// ---------- Textures and tints ----------

function noiseTexture(size, lo, hi, repeat) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
        const x = i % size;
        const y = Math.floor(i / size);
        const v = lo + (hi - lo) * (fbm(x * 0.08, y * 0.08) * 0.6 + Math.random() * 0.4);
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    return t;
}

const TINT = {
    grassland: ['#6c9443', '#86a54d'],
    forest: ['#47692d', '#3b5c27'],
    jungle: ['#35572a', '#2b4a22'],
    savanna: ['#a89a5a', '#94884c'],
    desert: ['#dcc08a', '#cfae74'],
    badlands: ['#b0653a', '#9a5532'],
    snow: ['#9aa48a', '#b4b8a4'],
    peak: ['#8a8378', '#9a948a'],
    marsh: ['#4f6a3c', '#5f7a48'],
    beach: ['#e6d3a0', '#dcc690'],
    water: ['#5e5038', '#6a5a40'],
    ocean: ['#4a6a6a', '#3e5a5e'],
};
const TINT_GROUND = { p: ['#b08d5c', '#a37f50'], a: ['#6a4b30', '#5c4029'], '=': ['#5e5038', '#5e5038'] };

function tileTint(x, y) {
    const cx = Math.max(0, Math.min(MAP_W - 1, x));
    const cy = Math.max(0, Math.min(MAP_H - 1, y));
    const i = idx(cx, cy);
    const pair = TINT_GROUND[ground[i]] || TINT[biome[i]] || TINT.grassland;
    return new THREE.Color(pair[0]).lerp(new THREE.Color(pair[1]), noise2(x * 0.7, y * 0.7));
}

// ---------- Terrain chunks ----------

function buildTerrain(group) {
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, map: noiseTexture(128, 190, 255, 1) });
    material.map.repeat.set(CHUNK / 6, CHUNK / 6);
    const rock = new THREE.Color('#847b70');
    const snow = new THREE.Color('#eef2f5');
    const wet = new THREE.Color('#6e6248');
    const seg = 2;
    for (let cz = -EXT; cz < MAP_H + EXT; cz += CHUNK) {
        for (let cx = -EXT; cx < MAP_W + EXT; cx += CHUNK) {
            const w = Math.min(CHUNK, MAP_W + EXT - cx);
            const h = Math.min(CHUNK, MAP_H + EXT - cz);
            const geom = new THREE.PlaneGeometry(w, h, w * seg, h * seg);
            geom.rotateX(-Math.PI / 2);
            const pos = geom.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                const fx = pos.getX(i) + cx + w / 2 - 0.5;
                const fz = pos.getZ(i) + cz + h / 2 - 0.5;
                pos.setXYZ(i, fx, heightAt(fx, fz) + (fbm(fx * 1.7, fz * 1.7) - 0.5) * 0.06, fz);
            }
            geom.computeVertexNormals();
            const nrm = geom.attributes.normal;
            const colors = new Float32Array(pos.count * 3);
            for (let i = 0; i < pos.count; i++) {
                const fx = pos.getX(i);
                const fz = pos.getZ(i);
                const x0 = Math.floor(fx);
                const z0 = Math.floor(fz);
                const tx = fx - x0;
                const tz = fz - z0;
                const top = tileTint(x0, z0).lerp(tileTint(x0 + 1, z0), tx);
                const c = top.lerp(tileTint(x0, z0 + 1).lerp(tileTint(x0 + 1, z0 + 1), tx), tz);
                const y = pos.getY(i);
                const steep = 1 - nrm.getY(i);
                if (y < -0.15) c.lerp(wet, Math.min(1, (-0.15 - y) * 3));
                if (steep > 0.18) c.lerp(rock, Math.min(1, (steep - 0.18) * 3));
                if (y > 2.0) c.lerp(snow, Math.min(1, (y - 2.0) * 1.1));
                const k = 0.92 + fbm(fx * 2.3, fz * 2.3) * 0.16;
                colors[i * 3] = c.r * k;
                colors[i * 3 + 1] = c.g * k;
                colors[i * 3 + 2] = c.b * k;
            }
            geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            const mesh = new THREE.Mesh(geom, material);
            mesh.receiveShadow = true;
            group.add(mesh);
        }
    }
}

function buildWater(group) {
    waterBump = noiseTexture(128, 0, 255, Math.round((MAP_W + EXT * 2) / 4));
    const water = new THREE.Mesh(
        new THREE.PlaneGeometry(MAP_W + EXT * 2, MAP_H + EXT * 2, 1, 1),
        new THREE.MeshStandardMaterial({ color: '#2d6f8e', roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.86, bumpMap: waterBump, bumpScale: 0.03 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(MAP_W / 2 - 0.5, -0.32, MAP_H / 2 - 0.5);
    water.receiveShadow = true;
    group.add(water);
}

// ---------- Vegetation, streamed around the hero ----------

const VEG = {};
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function vegMesh(key, geometry, material, count, shadow = true) {
    const im = new THREE.InstancedMesh(geometry, material, count);
    im.castShadow = shadow;
    im.receiveShadow = true;
    im.count = 0;
    im.frustumCulled = false;
    im.userData.max = count;
    // Create per-instance colours up front so the shader is compiled with them from the start.
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3);
    VEG[key] = im;
    return im;
}

function initVegetation() {
    const leaf = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true });
    const plain = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
    const bark = new THREE.MeshStandardMaterial({ color: '#5a3d26', roughness: 1 });
    const rock = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true });
    const frond = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, side: THREE.DoubleSide });
    vegGroup = new THREE.Group();
    vegGroup.add(
        vegMesh('trunk', new THREE.CylinderGeometry(0.05, 0.09, 1, 7), bark, 9000),
        vegMesh('canopy', new THREE.IcosahedronGeometry(1, 1), leaf, 14000),
        vegMesh('pine', new THREE.ConeGeometry(1, 1, 8), leaf, 8000),
        vegMesh('frond', new THREE.ConeGeometry(1, 1, 3), frond, 9000),
        vegMesh('cane', new THREE.CylinderGeometry(0.025, 0.03, 1, 5), plain, 8000),
        vegMesh('tuft', new THREE.ConeGeometry(1, 1, 4), plain, 5000, false),
        vegMesh('rock', new THREE.DodecahedronGeometry(1, 0), rock, 4000),
        vegMesh('gem', new THREE.OctahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0.4 }), 3000, false),
    );
    scene.add(vegGroup);
}

function tiltPart(t, key, ox, oy, oz, sx, sy, sz, color, rotY = 0, rotX = 0, rotZ = 0) {
    t.parts.push({ key, ox, oy, oz, sx, sy, sz, color, rotY, rotX, rotZ });
}

// Each plant is described relative to its base so it can shrink away in place.
function plantSpec(o, x, y, b) {
    const rng = mulberry32(hash(x, y) + 7);
    const t = { x: x + (rng() - 0.5) * 0.4, z: y + (rng() - 0.5) * 0.4, parts: [], vis: 1, tall: true };
    const green = (h0, s0, l0) => new THREE.Color().setHSL(h0 + rng() * 0.06, s0, l0 + rng() * 0.08, THREE.SRGBColorSpace);
    const s = 0.8 + rng() * 0.5;
    switch (o) {
        case 'T': {
            const trunkH = (0.9 + rng() * 0.5) * s;
            tiltPart(t, 'trunk', 0, trunkH / 2, 0, s, trunkH, s);
            for (let k = 0; k < (b === 'forest' ? 3 : 2); k++) {
                const r = (0.38 + rng() * 0.22) * s;
                tiltPart(t, 'canopy', (rng() - 0.5) * 0.5 * s, trunkH + rng() * 0.45 * s, (rng() - 0.5) * 0.5 * s, r, r * 0.85, r, green(0.24, 0.45, 0.22), rng() * 6);
            }
            break;
        }
        case 'J': {
            const trunkH = 1.3 * s;
            tiltPart(t, 'trunk', 0, trunkH / 2, 0, s * 1.8, trunkH, s * 1.8);
            for (let k = 0; k < 3; k++) {
                const a = rng() * 6.28;
                tiltPart(t, 'trunk', Math.cos(a) * 0.45 * s, trunkH * 0.45, Math.sin(a) * 0.45 * s, 0.35, trunkH * 0.9, 0.35);
            }
            for (let k = 0; k < 4; k++) {
                const r = (0.5 + rng() * 0.3) * s;
                tiltPart(t, 'canopy', (rng() - 0.5) * 1.1 * s, trunkH + rng() * 0.4 * s, (rng() - 0.5) * 1.1 * s, r * 1.2, r * 0.7, r * 1.2, green(0.26, 0.5, 0.16), rng() * 6);
            }
            break;
        }
        case 'P': {
            tiltPart(t, 'trunk', 0, 0.2 * s, 0, s * 0.8, 0.4 * s, s * 0.8);
            const dark = green(0.33, 0.35, 0.14);
            tiltPart(t, 'pine', 0, 0.75 * s, 0, 0.42 * s, 0.9 * s, 0.42 * s, dark);
            tiltPart(t, 'pine', 0, 1.25 * s, 0, 0.3 * s, 0.7 * s, 0.3 * s, dark);
            break;
        }
        case 'L': {
            // A coconut or date palm: a leaning trunk and a crown of long fronds.
            const lean = (rng() - 0.5) * 0.5;
            const h = 1.6 * s;
            tiltPart(t, 'trunk', lean * h * 0.5, h / 2, 0, 0.7, h, 0.7, null, 0, 0, -lean);
            for (let k = 0; k < 7; k++) {
                const a = (k / 7) * Math.PI * 2 + rng() * 0.4;
                tiltPart(t, 'frond', lean * h + Math.cos(a) * 0.35, h + 0.02, Math.sin(a) * 0.35, 0.12, 0.8, 0.04, green(0.25, 0.5, 0.25), -a + Math.PI / 2, 0, 1.25);
            }
            break;
        }
        case 'G': {
            for (let k = 0; k < 5; k++) {
                const a = (k / 5) * Math.PI * 2;
                tiltPart(t, 'trunk', Math.cos(a) * 0.25, 0.25, Math.sin(a) * 0.25, 0.3, 0.6, 0.3, null, 0, Math.sin(a) * 0.4, -Math.cos(a) * 0.4);
            }
            tiltPart(t, 'trunk', 0, 0.6, 0, 0.6, 0.6, 0.6);
            tiltPart(t, 'canopy', 0, 1.0, 0, 0.75 * s, 0.4 * s, 0.75 * s, green(0.3, 0.45, 0.17), rng() * 6);
            break;
        }
        case 'Y': {
            for (let k = 0; k < 7; k++) {
                const h = (1.4 + rng() * 0.9) * s;
                const a = rng() * 6.28;
                const r = rng() * 0.25;
                tiltPart(t, 'cane', Math.cos(a) * r, h / 2, Math.sin(a) * r, 1, h, 1, green(0.2, 0.45, 0.35), 0, (rng() - 0.5) * 0.25, (rng() - 0.5) * 0.25);
            }
            tiltPart(t, 'canopy', 0, 1.9 * s, 0, 0.4, 0.3, 0.4, green(0.24, 0.5, 0.3), rng() * 6);
            break;
        }
        case 'c': {
            tiltPart(t, 'trunk', 0, 0.45 * s, 0, 0.6 * s, 0.9 * s, 0.6 * s);
            const olive = green(0.18, 0.3, 0.3);
            tiltPart(t, 'canopy', 0.05, 0.95 * s, 0, 0.55 * s, 0.18 * s, 0.5 * s, olive, rng() * 6);
            tiltPart(t, 'canopy', -0.15, 0.85 * s, 0.1, 0.35 * s, 0.14 * s, 0.35 * s, olive, rng() * 6);
            break;
        }
        case 'k': {
            const tint = b === 'badlands' ? '#9a5a3a' : b === 'desert' || b === 'beach' ? '#b49a74' : '#86807a';
            for (let k = 0; k < 3; k++) {
                const r = 0.25 + rng() * 0.35;
                tiltPart(t, 'rock', (rng() - 0.5) * 0.5, r * 0.45, (rng() - 0.5) * 0.5, r, r * 0.8, r * 1.1, new THREE.Color(tint).offsetHSL(0, 0, (rng() - 0.5) * 0.08), rng() * 6, rng(), rng());
            }
            break;
        }
        case '$': case '%': {
            const gold = o === '$';
            for (let k = 0; k < 4; k++) {
                const r = 0.22 + rng() * 0.2;
                tiltPart(t, 'rock', (rng() - 0.5) * 0.6, r * 0.45, (rng() - 0.5) * 0.6, r, r * 0.8, r * 1.1, gold ? (k % 2 ? '#e0b43c' : '#8a7a5a') : new THREE.Color('#a8a49c').offsetHSL(0, 0, (rng() - 0.5) * 0.1), rng() * 6, rng(), rng());
            }
            if (gold) tiltPart(t, 'gem', 0, 0.42, 0, 0.12, 0.12, 0.12, '#ffd34a', rng() * 6);
            t.tall = false;
            break;
        }
        case '*': {
            tiltPart(t, 'canopy', 0, 0.28, 0, 0.36, 0.3, 0.36, green(0.27, 0.45, 0.2), rng() * 6);
            for (let k = 0; k < 6; k++) {
                const a = rng() * 6.28;
                tiltPart(t, 'gem', Math.cos(a) * 0.3, 0.25 + rng() * 0.2, Math.sin(a) * 0.3, 0.05, 0.05, 0.05, '#c2183a');
            }
            t.tall = false;
            break;
        }
        case 'M': {
            if (b !== 'snow' && b !== 'peak' && rng() < 0.4) return plantSpec('P', x, y, b);
            return null;
        }
        default:
            return null;
    }
    return t;
}

function groundCover(x, y, b, g) {
    const rng = mulberry32(hash(x, y) + 31);
    const out = [];
    const tuftColor = { grassland: [0.24, 0.45, 0.2], forest: [0.26, 0.45, 0.16], jungle: [0.28, 0.5, 0.14], savanna: [0.13, 0.4, 0.38], marsh: [0.22, 0.4, 0.25] }[b];
    if (tuftColor && (g === '.' || g === 'f' || g === 'j' || g === 'd' || g === 'q')) {
        const n = b === 'marsh' ? 3 : 2;
        for (let k = 0; k < n; k++) {
            const t = { x: x + (rng() - 0.5) * 0.9, z: y + (rng() - 0.5) * 0.9, parts: [], vis: 1 };
            const sz = b === 'marsh' ? 0.04 : 0.03 + rng() * 0.035;
            const tall = b === 'marsh' ? 6 : b === 'savanna' ? 3.4 : 2.4;
            tiltPart(t, 'tuft', 0, sz * tall / 2, 0, sz, sz * tall, sz, new THREE.Color().setHSL(tuftColor[0] + rng() * 0.05, tuftColor[1], tuftColor[2] + rng() * 0.08, THREE.SRGBColorSpace), rng() * 6);
            out.push(t);
        }
    }
    if ((b === 'desert' || b === 'badlands' || b === 'snow' || b === 'beach') && rng() < 0.12) {
        const t = { x: x + (rng() - 0.5) * 0.8, z: y + (rng() - 0.5) * 0.8, parts: [], vis: 1 };
        const r = 0.06 + rng() * 0.12;
        tiltPart(t, 'rock', 0, r * 0.4, 0, r, r * 0.7, r * 1.2, new THREE.Color(b === 'badlands' ? '#9a5a3a' : '#8a837a'), rng() * 6);
        out.push(t);
    }
    return out;
}

function placeTree(t) {
    const v = t.vis;
    for (const p of t.parts) {
        _e.set(p.rotX, p.rotY, p.rotZ);
        _q.setFromEuler(_e);
        _p.set(t.x + p.ox * v, t.y + p.oy * v, t.z + p.oz * v);
        _s.set(p.sx * v + 1e-4, p.sy * v + 1e-4, p.sz * v + 1e-4);
        _m.compose(_p, _q, _s);
        p.im.setMatrixAt(p.i, _m);
        p.im.instanceMatrix.needsUpdate = true;
    }
}

function streamVegetation(force) {
    const cx = Math.round(camTarget.x);
    const cz = Math.round(camTarget.z);
    if (!force && vegCenter && Math.abs(vegCenter[0] - cx) + Math.abs(vegCenter[1] - cz) < 6) return;
    vegCenter = [cx, cz];
    for (const im of Object.values(VEG)) im.count = 0;
    trees = [];
    const R = vegRadius();
    for (let y = cz - R; y <= cz + R; y++) {
        for (let x = cx - R; x <= cx + R; x++) {
            if ((x - cx) * (x - cx) + (y - cz) * (y - cz) > R * R) continue;
            const inside = inMap(x, y);
            const cxm = Math.max(0, Math.min(MAP_W - 1, x));
            const cym = Math.max(0, Math.min(MAP_H - 1, y));
            const b = biome[idx(cxm, cym)];
            let o = inside ? objects[idx(x, y)] : '';
            if (!inside) {
                // Beyond the map edge the land carries on as wild country.
                const r = (hash(x, y) % 100) / 100;
                if (b === 'forest' || b === 'jungle') o = r < 0.35 ? 'T' : '';
                else if (b === 'grassland' || b === 'savanna') o = r < 0.08 ? (b === 'savanna' ? 'c' : 'T') : '';
                else if (b === 'snow' || b === 'peak') o = r < 0.2 ? 'P' : '';
                else if (b === 'desert') o = r < 0.03 ? 'c' : '';
            }
            const specs = [];
            if (o) { const sp = plantSpec(o, x, y, b); if (sp) specs.push(sp); }
            if (!o && inside && (x - cx) ** 2 + (y - cz) ** 2 < 400) specs.push(...groundCover(x, y, b, ground[idx(x, y)]));
            for (const t of specs) {
                t.y = heightAt(t.x, t.z) - (t.tall ? 0.05 : 0);
                let ok = true;
                for (const p of t.parts) {
                    const im = VEG[p.key];
                    if (im.count >= im.userData.max) { ok = false; break; }
                }
                if (!ok) continue;
                for (const p of t.parts) {
                    p.im = VEG[p.key];
                    p.i = p.im.count++;
                    if (p.color) p.im.setColorAt(p.i, p.color instanceof THREE.Color ? p.color : new THREE.Color(p.color));
                    else if (p.key === 'trunk' || p.key === 'rock') p.im.setColorAt(p.i, new THREE.Color(p.key === 'trunk' ? '#6a4a30' : '#8a837a'));
                }
                placeTree(t);
                if (t.tall) trees.push(t);
            }
        }
    }
    for (const im of Object.values(VEG)) {
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
}
