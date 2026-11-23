// WRACKLINE HEAT — Moonpool Bay. A coastal open-world crime game in Three.js.
// All code in this file is original to this entry. World layout: Moonpool
// Boulevard runs along z (-440..440); the sea is at -x, the city at +x.
import * as THREE from 'three';
import { MISSIONS, CHAPTERS } from './missions.js';
import { updateHUD, setDialogue, showPrompt, showBanner, probeOverlaps } from './hud.js';
import { initAudio, cycleStation, sfx, setEngine, STATIONS } from './audio.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const SEED = parseInt(params.get('seed') || '7', 10) || 7;
let _s = SEED * 7919 + 13;
const rnd = () => { _s = (_s * 16807) % 2147483647; return (_s - 1) / 2147483646; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

window.__errors = [];
window.addEventListener('error', e => window.__errors.push(String(e.message || e.error)));

// ---------- renderer / scene ----------
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2200);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const sun = new THREE.DirectionalLight(0xffb36b, 3.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -70; sun.shadow.camera.right = 70; sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
sun.shadow.camera.far = 500; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
scene.add(sun); scene.add(sun.target);
const hemi = new THREE.HemisphereLight(0x6f639e, 0xcaa06a, 0.45); scene.add(hemi);
const fill = new THREE.DirectionalLight(0xffe0b8, 0.5); fill.position.set(30, 40, -60); scene.add(fill);

// ---------- sky (gradient canvas on a backside sphere) ----------
function skyTexture(top, mid, bot) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top); gr.addColorStop(0.4, mid); gr.addColorStop(0.52, bot); gr.addColorStop(0.62, bot); gr.addColorStop(1, top);
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false });
const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 16), skyMat); scene.add(sky);
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,220,160,0.95)'); gr.addColorStop(0.35, 'rgba(255,170,90,0.45)'); gr.addColorStop(1, 'rgba(255,150,80,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})(), fog: false, depthWrite: false }));
sunSprite.scale.set(175, 175, 1); scene.add(sunSprite);

// ---------- procedural textures ----------
function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; return t;
}
const asphaltTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#33302e'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${140 + rnd() * 60},${130 + rnd() * 50},${120 + rnd() * 40},${rnd() * 0.08})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
  g.fillStyle = 'rgba(20,18,16,0.35)'; g.fillRect(52, 0, 44, h); g.fillRect(160, 0, 44, h); // wheel tracks
}, 1, 60);
const facadeMats = [];
function facadePair(base, litRatio) {
  // colour map: full facade. emissive map: BLACK except lit windows, so at
  // night only the windows glow — the wall itself never does.
  const litCells = [];
  const map = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, h - 26, w, 26);
    for (let y = 14; y < h - 34; y += 22) for (let x = 10; x < w - 14; x += 20) {
      const lit = rnd() < litRatio; litCells.push(lit);
      g.fillStyle = lit ? (rnd() < 0.7 ? '#ffca7a' : '#9adfe8') : `rgba(30,38,52,${0.75 + rnd() * 0.2})`;
      g.fillRect(x, y, 12, 14);
      g.fillStyle = 'rgba(255,255,255,0.13)'; g.fillRect(x, y, 12, 3);
    }
  });
  let k = 0;
  const emissiveMap = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (let y = 14; y < h - 34; y += 22) for (let x = 10; x < w - 14; x += 20) {
      if (litCells[k++]) { g.fillStyle = '#ffc98a'; g.fillRect(x, y, 12, 14); }
    }
  });
  return { map, emissiveMap };
}
const PALETTE = ['#e8d9bd', '#dfa98c', '#cfe0da', '#e5c3a5', '#d9b8c4', '#f0e6cf'];
for (let i = 0; i < 4; i++) {
  const { map, emissiveMap } = facadePair(PALETTE[i % PALETTE.length], 0.38);
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0.02, emissive: 0xffc98a, emissiveIntensity: 0.1, emissiveMap });
  facadeMats.push(m);
}

// ---------- ground plan ----------
const colliders = []; // {minX,maxX,minZ,maxZ}
function addCollider(x, z, hw, hd) { colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd }); }
function collide(pos, r) {
  for (const c of colliders) {
    if (pos.x > c.minX - r && pos.x < c.maxX + r && pos.z > c.minZ - r && pos.z < c.maxZ + r) {
      const dxl = pos.x - (c.minX - r), dxr = (c.maxX + r) - pos.x, dzl = pos.z - (c.minZ - r), dzr = (c.maxZ + r) - pos.z;
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) pos.x = c.minX - r; else if (m === dxr) pos.x = c.maxX + r;
      else if (m === dzl) pos.z = c.minZ - r; else pos.z = c.maxZ + r;
    }
  }
}
const mat = (color, rough = 0.9, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
function plane(w, d, material, x, z, y = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; scene.add(m); return m;
}
plane(500, 1000, mat(0x2c4632, 1), 120, 0, -0.08);                       // city base
plane(90, 1000, mat(0xd9bd8f, 1), -59, 0, -0.04);                        // sand (sea side handled below)
plane(3.4, 1000, mat(0xb9ac96, 0.95), -7.6, 0, 0.01);                    // promenade
const road = plane(12.4, 1000, new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.6, metalness: 0.05 }), 0, 0, 0.02);
plane(2.6, 1000, mat(0xb9ac96, 0.95), 7.6, 0, 0.01);                     // city sidewalk
// lane dashes + crosswalks
{
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5ead0 });
  const dashGeo = new THREE.PlaneGeometry(0.22, 3.2);
  for (let z = -480; z < 480; z += 9) for (const x of [-1.6, 1.6]) {
    const d = new THREE.Mesh(dashGeo, dashMat); d.rotation.x = -Math.PI / 2; d.position.set(x, 0.035, z); scene.add(d);
  }
  const cwMat = new THREE.MeshBasicMaterial({ color: 0xe8e2d2 });
  for (let z = -420; z <= 420; z += 60) for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.7), cwMat);
    s.rotation.x = -Math.PI / 2; s.position.set(-4.4 + i * 2.2, 0.035, z); scene.add(s);
  }
}
// sea: animated vertex waves + foam strip
const seaGeo = new THREE.PlaneGeometry(150, 1000, 28, 90);
const sea = new THREE.Mesh(seaGeo, new THREE.MeshStandardMaterial({ color: 0x2a6d84, roughness: 0.32, metalness: 0.25, transparent: true, opacity: 0.94 }));
sea.rotation.x = -Math.PI / 2; sea.position.set(-92, 0.12, 0); scene.add(sea);
const seaBase = seaGeo.attributes.position.array.slice();
const foam = plane(1.6, 1000, new THREE.MeshBasicMaterial({ color: 0xf4f1e4, transparent: true, opacity: 0.65 }), -15.2, 0, 0.05);
const glint = plane(13, 1000, new THREE.MeshBasicMaterial({ color: 0xffc98a, transparent: true, opacity: 0.1, depthWrite: false }), -34, 0, 0.16);

// blob shadow texture (AO grounding for every actor)
const blobTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
function blob(parent, w, d, y = 0.04) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = y; parent.add(m); return m;
}

// ---------- buildings, palms, lamps ----------
const DISTRICTS = [
  { name: 'Heron Point', z: 372 }, { name: 'Beacon Quarter', z: 268 }, { name: 'Wrackline Strip', z: 164 },
  { name: 'Gullmarket', z: 58 }, { name: 'Cannery Steps', z: -52 }, { name: 'Moonpool Marina', z: -158 },
  { name: 'The Saltworks', z: -262 }, { name: 'Ferry Landing', z: -366 },
];
const lampHeads = [], lampPools = [];
const lampPoolMat = new THREE.MeshBasicMaterial({ color: 0xffc98a, transparent: true, opacity: 0, depthWrite: false });
function buildCity() {
  const roofMat = mat(0x8a7a68, 0.95), trimMat = mat(0xf2e8d5, 0.8);
  let fi = 0;
  for (const d of DISTRICTS) {
    for (let i = 0; i < 5; i++) {
      const w = 13 + rnd() * 7, dep = 11 + rnd() * 5, hgt = 13 + rnd() * 26;
      const x = 10.4 + dep / 2, z = d.z - 46 + i * 23 + rnd() * 5;
      const b = new THREE.Mesh(new THREE.BoxGeometry(dep, hgt, w), facadeMats[fi++ % facadeMats.length]);
      b.position.set(x, hgt / 2, z); b.castShadow = true; b.receiveShadow = true; scene.add(b);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(dep + 0.7, 0.7, w + 0.7), trimMat);
      cap.position.set(x, hgt + 0.3, z); cap.castShadow = true; scene.add(cap);
      const ao = new THREE.Mesh(new THREE.PlaneGeometry(w + 1.6, 2.6), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.85, depthWrite: false }));
      ao.rotation.x = -Math.PI / 2; ao.rotation.z = Math.PI / 2; ao.position.set(10.2, 0.05, z); scene.add(ao);
      if (rnd() < 0.6) { const ac = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 3), roofMat); ac.position.set(x, hgt + 1.2, z + (rnd() - 0.5) * 5); scene.add(ac); }
      addCollider(x, z, dep / 2, w / 2);
    }
    // second row, taller silhouettes
    for (let i = 0; i < 3; i++) {
      const w = 18 + rnd() * 8, dep = 14, hgt = 30 + rnd() * 34;
      const x = 34 + rnd() * 8, z = d.z - 40 + i * 38;
      const b = new THREE.Mesh(new THREE.BoxGeometry(dep, hgt, w), facadeMats[fi++ % facadeMats.length]);
      b.position.set(x, hgt / 2, z); scene.add(b); addCollider(x, z, dep / 2, w / 2);
    }
  }
  // palms along promenade + sidewalk
  const trunkMat = mat(0x8a6f4d, 1), frondMat = new THREE.MeshStandardMaterial({ color: 0x3f7d3a, roughness: 0.9, side: THREE.DoubleSide });
  for (let z = -460; z < 470; z += 15) {
    for (const x of [-6.9, 6.9]) {
      if (rnd() < 0.18) continue;
      const g = new THREE.Group(); const lean = (rnd() - 0.5) * 0.14, hh = 5.2 + rnd() * 1.6;
      for (let s = 0; s < 5; s++) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.16 - s * 0.015, 0.19 - s * 0.015, hh / 5, 6), trunkMat);
        seg.position.set(lean * s * s * 0.4, (s + 0.5) * hh / 5, 0); seg.rotation.z = lean; seg.castShadow = true; g.add(seg);
      }
      const topX = lean * 16 * 0.4;
      for (let f = 0; f < 8; f++) {
        const fr = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.55), frondMat);
        const a = f / 8 * Math.PI * 2;
        fr.position.set(topX + Math.cos(a) * 1.1, hh + 0.25 - Math.abs(Math.sin(a)) * 0.2, Math.sin(a) * 1.1);
        fr.rotation.set(0.5, -a, 0.25); g.add(fr);
      }
      g.position.set(x + (rnd() - 0.5) * 0.5, 0, z + rnd() * 6);
      scene.add(g); blob(g, 1.6, 1.6); addCollider(g.position.x, g.position.z, 0.35, 0.35);
    }
  }
  // lamps both sides
  const poleMat = mat(0x3c4248, 0.6, 0.6);
  for (let z = -450; z < 460; z += 30) for (const x of [-6.6, 6.6]) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 5.4, 6), poleMat); pole.position.y = 2.7; pole.castShadow = true; g.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffc98a, emissiveIntensity: 0 }));
    head.position.set(x < 0 ? 0.55 : -0.55, 5.4, 0); g.add(head); lampHeads.push(head);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.4, 18), lampPoolMat);
    pool.rotation.x = -Math.PI / 2; pool.position.set(x < 0 ? 1.4 : -1.4, 0.045, 0); g.add(pool); lampPools.push(pool);
    g.position.set(x, 0, z); scene.add(g);
  }
}
buildCity();

// ---------- landmarks: pier + ferris wheel, marina, lighthouse ----------
const wheel = new THREE.Group(); let lighthouseBeam;
function buildLandmarks() {
  const woodMat = mat(0x9a7a58, 0.95), postMat = mat(0x6e5638, 1);
  const pier = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(26, 0.5, 9), woodMat); deck.position.set(-26, 1.1, 164); deck.castShadow = true; pier.add(deck);
  for (let i = 0; i < 6; i++) for (const zz of [160.5, 167.5]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.4, 6), postMat);
    p.position.set(-14 - i * 4.6, 0, zz); pier.add(p);
  }
  scene.add(pier); addCollider(-24, 164, 1, 5); // pier root post line (deck is over water, reached from promenade gap)
  // ferris wheel at pier head
  const rim = new THREE.Mesh(new THREE.TorusGeometry(7.5, 0.28, 8, 28), mat(0xe8e2d2, 0.5, 0.5));
  wheel.add(rim);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 15, 5), mat(0xcfc8b8, 0.5, 0.5));
    spoke.rotation.z = a; wheel.add(spoke);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 1.3), mat([0xe86a5a, 0x5ec8c4, 0xffc35c, 0x9a7fe0][i % 4], 0.6));
    cab.position.set(Math.cos(a) * 7.5, Math.sin(a) * 7.5, 0); wheel.add(cab);
  }
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 10.5, 6), postMat); legL.position.set(-1.8, -5, 0); legL.rotation.z = 0.18; wheel.add(legL);
  const legR = legL.clone(); legR.position.x = 1.8; legR.rotation.z = -0.18; wheel.add(legR);
  wheel.position.set(-36, 10.6, 164); scene.add(wheel);
  // marina: docks + bobbing sailboats
  window.__boats = [];
  const dockMat = mat(0x7d6a50, 0.95);
  for (let i = 0; i < 5; i++) {
    const dock = new THREE.Mesh(new THREE.BoxGeometry(13, 0.4, 2), dockMat);
    dock.position.set(-20, 0.7, -186 + i * 13); scene.add(dock);
    for (let bIdx = 0; bIdx < 2; bIdx++) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.9, 1.7), mat(bIdx ? 0xe8e2d2 : 0x3f7fae, 0.5));
      hull.position.y = 0.45; boat.add(hull);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6.4, 5), mat(0xd8d2c2, 0.5, 0.5)); mast.position.y = 3.6; boat.add(mast);
      const sailShape = new THREE.Shape(); sailShape.moveTo(0, 0); sailShape.lineTo(0, 5.4); sailShape.lineTo(2.4, 0.4); sailShape.closePath();
      const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), new THREE.MeshStandardMaterial({ color: 0xf4efe0, side: THREE.DoubleSide, roughness: 0.9 }));
      sail.position.set(0.08, 1, 0); boat.add(sail);
      boat.position.set(-24 + bIdx * 7, 0.1, -188 + i * 13);
      boat.userData.ph = rnd() * 6.28; scene.add(boat); window.__boats.push(boat);
    }
  }
  // lighthouse at Heron Point (z 400, sea side)
  const lh = new THREE.Group();
  const bandW = new THREE.MeshStandardMaterial({ color: 0xf2ecdc, roughness: 0.7 });
  const bandR = new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.7 });
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(2.2 - i * 0.25, 2.45 - i * 0.25, 3.4, 12), i % 2 ? bandR : bandW);
    seg.position.y = 1.7 + i * 3.4; seg.castShadow = true; lh.add(seg);
  }
  const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 10), new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffd98a, emissiveIntensity: 0.6, transparent: true, opacity: 0.9 }));
  lampRoom.position.y = 14.4; lh.add(lampRoom);
  const roofCone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.4, 10), mat(0x333a42, 0.6, 0.4)); roofCone.position.y = 16; lh.add(roofCone);
  lighthouseBeam = new THREE.Mesh(new THREE.ConeGeometry(3.2, 34, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  lighthouseBeam.rotation.z = Math.PI / 2; lighthouseBeam.position.set(-16, 14.4, 0); lh.add(lighthouseBeam);
  lh.position.set(-13, 0, 402); scene.add(lh); addCollider(-13, 402, 2.6, 2.6);
}
buildLandmarks();

// ---------- vehicles ----------
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0d1620, roughness: 0.16, metalness: 0.4, clearcoat: 1, envMapIntensity: 0.65 });
const tyreMat = mat(0x17181a, 0.95), alloyMat = mat(0xb9c0c8, 0.35, 0.8);
function makeCar({ color = 0x888888, police = false, hero = false, suv = false } = {}) {
  const g = new THREE.Group();
  const paint = hero
    ? new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.95 })
    : new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.5, envMapIntensity: 0.6 });
  const H = suv ? 1.05 : 0.78;
  const lower = new THREE.Mesh(new THREE.BoxGeometry(1.82, H, 4.45), paint);
  lower.position.y = 0.32 + H / 2; lower.castShadow = true; g.add(lower);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 1.15), paint);
  hood.position.set(0, 0.42 + H, -1.5); hood.rotation.x = 0.1; g.add(hood);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 2.1), glassMat);
  cabin.position.set(0, 0.62 + H, 0.25); cabin.castShadow = true; g.add(cabin);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.1, 4.5), mat(0x22262b, 0.6, 0.4)); trim.position.y = 0.34; g.add(trim);
  if (hero) { const sp = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.42), paint); sp.position.set(0, 1.28, 2.05); g.add(sp); }
  const wheels = [];
  const wgeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12);
  for (const [wx, wz] of [[-0.85, -1.45], [0.85, -1.45], [-0.85, 1.45], [0.85, 1.45]]) {
    const w = new THREE.Mesh(wgeo, tyreMat); w.rotation.z = Math.PI / 2; w.position.set(wx, 0.34, wz); w.castShadow = true; g.add(w); wheels.push(w);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.26, 8), alloyMat); hub.rotation.z = Math.PI / 2; hub.position.copy(w.position); g.add(hub); wheels.push(hub);
  }
  const hl = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.06), new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffedb8, emissiveIntensity: 0.7 }));
  hl.position.set(0, 0.72, -2.24); g.add(hl);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.13, 0.06), new THREE.MeshStandardMaterial({ color: 0x881111, emissive: 0xff2214, emissiveIntensity: 0.55 }));
  tl.position.set(0, 0.74, 2.24); g.add(tl);
  let lightbar = null;
  if (police) {
    const body2 = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.2, 4.47), mat(0xf0f2f4, 0.5, 0.3)); body2.position.y = 0.95; g.add(body2);
    lightbar = new THREE.Group();
    const lb1 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.5), new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2020, emissiveIntensity: 2 }));
    lb1.position.x = -0.3; lightbar.add(lb1);
    const lb2 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.5), new THREE.MeshStandardMaterial({ color: 0x000033, emissive: 0x2255ff, emissiveIntensity: 2 }));
    lb2.position.x = 0.3; lightbar.add(lb2);
    lightbar.position.set(0, 1.62, 0.25); g.add(lightbar);
  }
  blob(g, 2.6, 5.2, 0.045);
  scene.add(g);
  return { group: g, wheels, lightbar, speed: 0, heading: 0, cond: 100, name: 'Car', kind: 'traffic', flash: 0 };
}
const CAR_NAMES = [['Albacore GT', 0x0e6e6a], ['Sardine LX', 0xc0c4c8], ['Breaker Wagon', 0xb8562f], ['Pale Rider', 0xe3ddc8], ['Gullwing S', 0x39548c], ['Dune Fox', 0xc9a44a]];
const traffic = [], policeCars = [];
let heroCar;
{
  heroCar = makeCar({ color: 0x12a594, hero: true }); heroCar.name = 'Albacore GT'; heroCar.kind = 'hero';
  heroCar.group.position.set(2.8, 0, 196); heroCar.heading = Math.PI;
  const lanes = [[-3.2, 1], [3.2, -1]];
  for (let i = 0; i < 8; i++) {
    const [nm, col] = CAR_NAMES[1 + (i % 5)];
    const c = makeCar({ color: col, suv: i % 3 === 0 }); c.name = nm;
    const [lx, dir] = lanes[i % 2];
    c.group.position.set(lx, 0, -380 + i * 95 + rnd() * 30);
    c.heading = dir > 0 ? 0 : Math.PI; c.speed = 8.5 + rnd() * 2; c.dir = dir; c.lane = lx;
    traffic.push(c);
  }
  for (let i = 0; i < 6; i++) {
    const p = makeCar({ police: true }); p.name = 'MBPD Interceptor'; p.kind = 'police';
    p.group.position.set(0, 0, 9999); p.active = false; policeCars.push(p);
  }
}
// roadblock barriers (2 cars are police slots; barriers are props)
const barriers = [];
for (let i = 0; i < 4; i++) {
  const b = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 0.35), mat(0xe8e2d2, 0.7));
  bar.position.y = 0.55; bar.castShadow = true; b.add(bar);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.22, 0.37), new THREE.MeshStandardMaterial({ color: 0xc23b2e, emissive: 0x881111, emissiveIntensity: 0.3 }));
  stripe.position.y = 0.62; b.add(stripe);
  blob(b, 2.8, 1, 0.045);
  b.visible = false; scene.add(b); barriers.push({ group: b, active: false });
}
// ---------- people ----------
function makePerson(skin, shirt, pants) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), mat(skin, 0.7)); head.position.y = 1.58; head.castShadow = true; g.add(head);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.68, 0.3), mat(shirt, 0.85)); torso.position.y = 1.12; torso.castShadow = true; g.add(torso);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.72, 0.28), mat(pants, 0.9)); legs.position.y = 0.42; g.add(legs);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.6, 0.13), mat(shirt, 0.85)); armL.position.set(-0.34, 1.1, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.34; g.add(armR);
  blob(g, 1, 1, 0.045);
  scene.add(g);
  return { group: g, armL, armR, walkPh: rnd() * 6 };
}
const SKINS = [0xc98d5f, 0x8a5a34, 0xe8b98d, 0x6e4525, 0xa9743f];
const SHIRTS = [0xe86a5a, 0x5ec8c4, 0xffc35c, 0x7fae5a, 0xe8e2d2, 0x9a7fe0, 0x39548c, 0xd96a9a];
const playerPerson = makePerson(0xc98d5f, 0x205a54, 0x2a2e35);
const peds = [];
for (let i = 0; i < 14; i++) {
  const p = makePerson(SKINS[i % 5], SHIRTS[i % 8], 0x3a3f47);
  const side = i % 2 ? -7.6 : 7.6;
  p.group.position.set(side, 0, -400 + i * 58 + rnd() * 20);
  p.dir = rnd() < 0.5 ? 1 : -1; p.side = side; p.fallen = 0;
  peds.push(p);
}
const enemies = [];
function spawnEnemy(x, z) {
  const p = makePerson(0x8a5a34, 0x8a3038, 0x1e2126);
  p.group.position.set(x, 0, z);
  const e = { person: p.group, parts: p, hp: 100, fireT: 1 + rnd() * 1.5, dead: false };
  enemies.push(e); return e;
}
// ---------- helicopter DUNLIN-1 ----------
const heli = new THREE.Group();
let heliRotor, heliTail, coneMesh, poolMesh;
{
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2e3844, roughness: 0.35, metalness: 0.6, envMapIntensity: 0.8 });
  const fus = new THREE.Mesh(new THREE.SphereGeometry(1.55, 14, 10), bodyMat); fus.scale.set(1, 0.82, 1.7); fus.castShadow = true; heli.add(fus);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1.05, 12, 8), glassMat);
  cockpit.scale.set(0.92, 0.72, 1); cockpit.position.set(0, 0.18, -1.35); heli.add(cockpit);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.34, 5.6, 8), bodyMat);
  boom.rotation.x = Math.PI / 2 - 0.06; boom.position.set(0, 0.28, 3.9); heli.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.7), bodyMat); fin.position.set(0, 0.8, 6.6); heli.add(fin);
  heliTail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.5, 0.22), mat(0x17181a, 0.6)); heliTail.position.set(0.12, 0.55, 6.65); heli.add(heliTail);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 6), bodyMat); mast.position.y = 1.3; heli.add(mast);
  heliRotor = new THREE.Group();
  for (const rot of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.05, 0.42), mat(0x22262b, 0.5, 0.5));
    blade.rotation.y = rot; heliRotor.add(blade);
  }
  heliRotor.position.y = 1.62; heli.add(heliRotor);
  for (const sx of [-1.05, 1.05]) {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 6), mat(0x3c4248, 0.5, 0.6));
    skid.rotation.x = Math.PI / 2; skid.position.set(sx, -1.35, 0); heli.add(skid);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 5), bodyMat); strut.position.set(sx, -0.95, -0.6); heli.add(strut);
    const strut2 = strut.clone(); strut2.position.z = 0.8; heli.add(strut2);
  }
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.16, 0.34, 1.1), new THREE.MeshStandardMaterial({ color: 0x5ec8c4, emissive: 0x1a5a58, emissiveIntensity: 0.5 }));
  stripe.position.set(0, -0.15, -0.4); heli.add(stripe);
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.4, 8), mat(0x17181a, 0.5, 0.5));
  housing.position.set(0.5, -1.15, -1.1); heli.add(housing);
  const coneGeo = new THREE.ConeGeometry(2.7, 26, 14, 1, true); coneGeo.translate(0, -13, 0); // apex at origin, base 26 below
  coneMesh = new THREE.Mesh(coneGeo,
    new THREE.MeshBasicMaterial({ color: 0xfff3cf, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  coneMesh.visible = false; scene.add(coneMesh);
  poolMesh = new THREE.Mesh(new THREE.CircleGeometry(4.4, 20),
    new THREE.MeshBasicMaterial({ color: 0xfff3cf, transparent: true, opacity: 0.3, depthWrite: false }));
  poolMesh.rotation.x = -Math.PI / 2; poolMesh.position.y = 0.07; poolMesh.visible = false; scene.add(poolMesh);
  heli.position.set(0, -60, 9999); scene.add(heli);
}
// ---------- effects ----------
const effects = [];
function spawnTracer(a, b, color = 0xffd98a, life = 0.09) {
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }));
  scene.add(line); effects.push({ obj: line, t: life, max: life, kind: 'line' });
}
function spawnFlash(p, scale = 1.6, color = 0xffc478, life = 0.07) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunSprite.material.map, color, transparent: true, opacity: 0.9, depthWrite: false }));
  s.position.copy(p); s.scale.set(scale, scale, 1); scene.add(s);
  effects.push({ obj: s, t: life, max: life, kind: 'sprite' });
}
function aimCone(from, tx, tz) {
  poolMesh.position.set(tx, 0.07, tz);
  coneMesh.position.copy(from);
  const delta = new THREE.Vector3(tx - from.x, 0 - from.y, tz - from.z);
  const len = delta.length();
  coneMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), delta.normalize());
  coneMesh.scale.set(1, len / 26, 1); // stretch so the cone actually reaches its target
}
// ---------- game state ----------
const S = {
  mode: 'menu', money: 250, wanted: 0, inSight: false, health: 100, armor: 50, crew: 80,
  driving: false, vehicle: null, vehicleName: 'On Foot', vehicleCond: 0, speed: 0,
  playerHeading: Math.PI, radio: { ...STATIONS[0] },
  weapons: [
    { name: 'FISTS', icon: '✊', ammo: 999, dmg: 12, range: 2.4, cd: 0.4 },
    { name: 'PISTOL', icon: '🔫', ammo: 60, dmg: 34, range: 46, cd: 0.22 },
    { name: 'SMG', icon: '💥', ammo: 120, dmg: 22, range: 40, cd: 0.11 },
  ],
  selWeapon: 1,
  abilities: [
    { key: 'Q', name: 'KEELHAUL DASH', cd: 12, until: 0 },
    { key: 'Z', name: 'GLASS EYE', cd: 18, until: 0 },
    { key: 'X', name: 'LEDGER LUCK', cd: 25, until: 0 },
  ],
  mission: null, markerPos: null, freeRoam: false, dead: false,
};
const playerPos = new THREE.Vector3(-5.6, 0, 200);
playerPerson.group.position.copy(playerPos);
let currentCar = null;           // car the player is inside (reference into traffic/police/hero)
let searchTimer = 0, crimeCd = 0, fireCd = 0, saveTimer = 0, stageClearPending = 0;
const units = [];                // active police: {name, car, tactic}
let roadblock = null;            // {z, cars:[...]} when active
const clock = new THREE.Clock();

// ---------- mission marker (SHORT tapered cone + ring, never a column) ----------
const marker = new THREE.Group();
{
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 1.05, 3.1, 12),
    new THREE.MeshStandardMaterial({ color: 0xffb35c, emissive: 0xff9a2e, emissiveIntensity: 0.85, transparent: true, opacity: 0.92 }));
  cone.position.y = 1.55; marker.add(cone);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.55, 26),
    new THREE.MeshBasicMaterial({ color: 0xffb35c, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; marker.add(ring);
  marker.visible = false; scene.add(marker);
}
// ---------- missions engine ----------
let missionIdx = 0;
function startMission(i) {
  missionIdx = i;
  const m = MISSIONS[i];
  S.mission = { ch: m.ch, chapterName: CHAPTERS[m.ch], name: m.name, index: i, stage: 0, stageCount: m.stages.length, stageFrac: 0, timeLeft: m.time, objective: m.stages[0].text };
  setStage(0);
}
function setStage(n) {
  const m = MISSIONS[missionIdx], st = m.stages[n];
  S.mission.stage = n; S.mission.objective = st.text; S.mission.stageFrac = 0;
  S.markerPos = { x: st.x, z: st.z };
  marker.position.set(st.x, 0, st.z); marker.visible = true;
  // clear-stage enemies belong to the stage: remove leftovers, spawn fresh
  for (const e of enemies) { scene.remove(e.person); }
  enemies.length = 0;
  if (st.type === 'clear') for (let k = 0; k < st.n; k++) spawnEnemy(st.x + (rnd() - 0.5) * 10, st.z + (rnd() - 0.5) * 8 - 4);
  if (st.dlg) setDialogue(st.dlg[0], st.dlg[1], st.dlg[4], st.dlg[2], st.dlg[3]);
  if (st.type === 'escape' && S.wanted === 0) setWanted(2);
  saveGame();
}
function completeStage() {
  const m = MISSIONS[missionIdx];
  sfx('stage');
  if (S.mission.stage + 1 >= m.stages.length) {
    S.money += m.reward; sfx('cash'); sfx('mission');
    S.weapons[1].ammo += 30; S.weapons[2].ammo += 40; // Mira resupplies the crew after every closed job
    showBanner(`MISSION COMPLETE · +$${m.reward.toLocaleString('en-US')}`, 2400);
    setDialogue('Mira Solano', 'FIXER · “THE LEDGER”', `“${m.name}” is closed and paid. The Brinework provides.`, '#5e3a6e', '#120a18');
    if (missionIdx + 1 < MISSIONS.length) startMission(missionIdx + 1);
    else { S.mission = null; S.markerPos = null; marker.visible = false; S.freeRoam = true; saveGame(); }
  } else setStage(S.mission.stage + 1);
}
function failMission() {
  sfx('fail'); showBanner('MISSION FAILED — TRY AGAIN', 2200);
  for (const e of enemies) scene.remove(e.person); enemies.length = 0;
  startMission(missionIdx);
}
function checkStage(dt) {
  const M = S.mission; if (!M || S.mode !== 'play') return;
  M.timeLeft -= dt;
  if (M.timeLeft <= 0) { failMission(); return; }
  const st = MISSIONS[missionIdx].stages[M.stage];
  const p = S.driving && currentCar ? currentCar.group.position : playerPos;
  const d = Math.hypot(p.x - st.x, p.z - st.z);
  if (st.type === 'goto') { if (d < 6) completeStage(); }
  else if (st.type === 'drive' || st.type === 'deliver') { if (S.driving && d < 7) completeStage(); }
  else if (st.type === 'escape') { if (d < 7) { setWanted(0); completeStage(); } }
  else if (st.type === 'clear') {
    const alive = enemies.filter(e => !e.dead).length;
    M.stageFrac = st.n ? 1 - alive / st.n : 1;
    if (alive === 0) completeStage();
  }
}
// ---------- wanted / police ----------
function setWanted(n) {
  S.wanted = clamp(n, 0, 5);
  syncPolice();
}
function addCrime(amount = 1) {
  if (crimeCd > 0 || S.mode !== 'play') return;
  crimeCd = 1.2; setWanted(S.wanted + amount);
}
function syncPolice() {
  const want = S.wanted === 0 ? 0 : Math.min(6, S.wanted + 1);
  while (units.length > want) { const u = units.pop(); u.car.active = false; u.car.group.position.set(0, 0, 9999); }
  while (units.length < want) {
    const car = policeCars.find(c => !c.active);
    if (!car) break;
    car.active = true; car.cond = 100; car.speed = 0;
    const a = rnd() * Math.PI * 2, d = 55 + rnd() * 25;
    car.group.position.set(clamp(playerPos.x + Math.cos(a) * d, -5, 5), 0, clamp(playerPos.z + Math.sin(a) * d, -430, 430));
    car.heading = Math.atan2(playerPos.x - car.group.position.x, playerPos.z - car.group.position.z);
    units.push({ name: `MB-${units.length + 1}`, car, tactic: units.length % 5 });
  }
  if (S.wanted >= 4 && !roadblock) spawnRoadblock();
  if (S.wanted < 4 && roadblock) clearRoadblock();
}
function spawnRoadblock() {
  const dirZ = S.driving && currentCar ? Math.sign(Math.cos(currentCar.heading)) || 1 : (rnd() < 0.5 ? 1 : -1);
  const z = clamp(playerPos.z + dirZ * 65, -420, 420);
  const cars = [];
  for (const x of [-2.6, 2.6]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.15, 1.85), mat(0xf0f2f4, 0.5, 0.3));
    b.position.set(x, 0.75, z); b.castShadow = true; scene.add(b); blob(b, 5, 2.6, 0.045);
    const stripeB = new THREE.Mesh(new THREE.BoxGeometry(4.42, 0.3, 1.87), mat(0x2255aa, 0.5, 0.3)); stripeB.position.set(x, 0.8, z); scene.add(stripeB);
    cars.push(b, stripeB); addCollider(x, z, 2.2, 0.95);
  }
  barriers.forEach((bar, i) => { bar.active = true; bar.group.visible = true; bar.group.position.set(-4.6 + i * 3.05, 0, z + 1.8); addCollider(bar.group.position.x, z + 1.8, 1.2, 0.4); });
  roadblock = { z, cars, colliders: colliders.slice(colliders.length - 6) };
}
function clearRoadblock() {
  if (!roadblock) return;
  for (const m of roadblock.cars) { scene.remove(m); }
  for (const c of roadblock.colliders) { const i = colliders.indexOf(c); if (i >= 0) colliders.splice(i, 1); }
  barriers.forEach(bar => { bar.active = false; bar.group.visible = false; });
  roadblock = null;
}
// ---------- combat ----------
function playerShoot() {
  const w = S.weapons[S.selWeapon];
  if (fireCd > 0 || S.mode !== 'play' || S.dead) return false;
  if (S.driving) return false;
  if (w.ammo <= 0) { return false; }
  fireCd = w.cd; w.ammo = Math.max(0, w.ammo - 1);
  sfx('shot');
  const from = new THREE.Vector3(playerPos.x, 1.35, playerPos.z);
  let best = null, bestD = w.range;
  for (const e of enemies) {
    if (e.dead) continue;
    const d = dist2(playerPos, e.person.position);
    if (d > w.range) continue;
    const ang = Math.atan2(e.person.position.x - playerPos.x, e.person.position.z - playerPos.z);
    let da = Math.abs(((ang - S.playerHeading) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
    if (da < 0.6 || d < 3) { if (d < bestD) { best = e; bestD = d; } }
  }
  // police are valid targets too (they shoot back); damaging one raises wanted
  const to = best ? new THREE.Vector3(best.person.position.x, 1.25, best.person.position.z)
    : new THREE.Vector3(playerPos.x + Math.sin(S.playerHeading) * w.range, 1.2, playerPos.z + Math.cos(S.playerHeading) * w.range);
  spawnTracer(from, to, 0xffd98a);
  spawnFlash(new THREE.Vector3(from.x + Math.sin(S.playerHeading) * 0.5, 1.4, from.z + Math.cos(S.playerHeading) * 0.5), 1.5);
  if (best) {
    best.hp -= w.dmg; spawnFlash(new THREE.Vector3(to.x, 1.3, to.z), 1.1, 0xff9a5a); sfx('hit');
    if (best.hp <= 0 && !best.dead) { best.dead = true; best.person.rotation.x = -Math.PI / 2; best.person.position.y = 0.25; }
    addCrime(0); crimeCd = Math.max(crimeCd, 0.5);
    if (S.wanted === 0) setWanted(1);
  } else if (S.wanted === 0 && w.name !== 'FISTS') setWanted(1);
  return true;
}
function hurtPlayer(dmg) {
  if (S.dead || S.mode !== 'play') return;
  const absorbed = Math.min(S.armor, dmg * 0.6);
  S.armor -= absorbed; S.health -= (dmg - absorbed);
  if (S.health <= 0) {
    S.health = 0; S.dead = true;
    showBanner('WASTED', 2000); sfx('fail');
    document.getElementById('fade').style.opacity = '1';
    setTimeout(() => {
      playerPos.set(-5.6, 0, 200); S.playerHeading = Math.PI;
      if (S.driving) exitCar();
      S.health = 100; S.armor = 25; S.money = Math.max(0, S.money - 100);
      setWanted(Math.max(0, S.wanted - 2)); S.dead = false;
      document.getElementById('fade').style.opacity = '0';
      showBanner('BACK ON THE BOULEVARD', 1500);
    }, 1900);
  }
}
// ---------- cars: enter / exit ----------
function nearestCar(maxD = 3.4) {
  let best = null, bd = maxD;
  for (const c of [heroCar, ...traffic, ...policeCars.filter(p => p.active)]) {
    const d = dist2(playerPos, c.group.position); if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function enterCar(c) {
  currentCar = c; S.driving = true; S.vehicle = c; S.vehicleName = c.name; S.vehicleCond = c.cond;
  playerPerson.group.visible = false; sfx('door');
  if (c.kind === 'traffic') { addCrime(1); setDialogue('Ines Halvorsen', 'LOOKOUT · “GLASS EYE”', 'Borrowed wheels, Cass. MBPD noticed — keep moving.', '#31556e', '#0a1218'); }
  if (c.kind === 'police') addCrime(2);
}
function exitCar() {
  if (!currentCar) return;
  playerPos.set(currentCar.group.position.x + 2.2, 0, currentCar.group.position.z);
  collide(playerPos, 0.5);
  currentCar.speed = 0; currentCar = null;
  S.driving = false; S.vehicle = null; S.vehicleName = 'On Foot'; S.speed = 0;
  playerPerson.group.visible = true; sfx('door'); setEngine(false, 0);
}
// ---------- save / load ----------
const SAVE_KEY = 'wrackline-heat-save';
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: S.money, missionIdx, stage: S.mission ? S.mission.stage : 0,
      timeLeft: S.mission ? S.mission.timeLeft : null,
      px: playerPos.x, pz: playerPos.z, wanted: 0, done: S.freeRoam,
      weapons: S.weapons.map(w => w.ammo),
    }));
  } catch { /* storage unavailable: game continues unsaved */ }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY); if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function applySave(sv) {
  S.money = sv.money ?? 250;
  playerPos.set(clamp(sv.px ?? -5.6, -13, 8), 0, clamp(sv.pz ?? 200, -430, 430));
  if (sv.done) { S.freeRoam = true; S.mission = null; marker.visible = false; }
  else {
    startMission(clamp(sv.missionIdx ?? 0, 0, MISSIONS.length - 1));
    if (sv.stage) { // re-enter the saved stage honestly: walk stages forward via the engine's own setter
      for (let k = 1; k <= Math.min(sv.stage, MISSIONS[missionIdx].stages.length - 1); k++) setStage(k);
      if (sv.timeLeft) S.mission.timeLeft = sv.timeLeft;
    }
  }
  if (Array.isArray(sv.weapons)) sv.weapons.forEach((a, i) => { if (S.weapons[i]) S.weapons[i].ammo = a; });
}
// ---------- moods ----------
const MOODS = {
  golden: { exp: 1.12, sun: 0xffb36b, sunI: 3.0, hemiSky: 0x6f639e, hemiGnd: 0xcaa06a, hemiI: 0.45, fog: 0xd98a5e, fogD: 0.0015, facade: 0.14, lamp: 0, pool: 0, beam: 0, sky: ['#3a2a6e', '#c65a7a', '#ff9a55'], sunPos: [-0.55, 0.16, -0.4] },
  dusk: { exp: 1.06, sun: 0xff9a55, sunI: 2.1, hemiSky: 0x6a5bb0, hemiGnd: 0x9a7a52, hemiI: 0.5, fog: 0xb06a72, fogD: 0.0017, facade: 0.6, lamp: 1.6, pool: 0.5, beam: 0.08, sky: ['#2c2358', '#9a4a72', '#e87a4a'], sunPos: [-0.6, 0.1, -0.35] },
  night: { exp: 0.98, sun: 0x7d94c8, sunI: 0.55, hemiSky: 0x24365e, hemiGnd: 0x0c1220, hemiI: 0.42, fog: 0x0a1428, fogD: 0.0021, facade: 1.15, lamp: 2.4, pool: 0.8, beam: 0.16, sky: ['#060a1c', '#101c3e', '#1c2c52'], sunPos: [0.3, 0.5, 0.3] },
};
let moodName = 'golden';
function applyMood(name) {
  moodName = name; const m = MOODS[name];
  renderer.toneMappingExposure = m.exp;
  sun.color.set(m.sun); sun.intensity = m.sunI;
  hemi.color.set(m.hemiSky); hemi.groundColor.set(m.hemiGnd); hemi.intensity = m.hemiI;
  fill.intensity = name === 'night' ? 0.25 : 0.5; fill.color.set(name === 'night' ? 0x8fb4e8 : 0xffe0b8);
  scene.fog = new THREE.FogExp2(m.fog, m.fogD);
  skyMat.map = skyTexture(m.sky[0], m.sky[1], m.sky[2]); skyMat.needsUpdate = true;
  sunSprite.position.set(m.sunPos[0] * 850, m.sunPos[1] * 850 + 30, m.sunPos[2] * 850);
  sunSprite.material.opacity = name === 'night' ? 0.25 : 1;
  facadeMats.forEach(f => { f.emissiveIntensity = m.facade; });
  lampHeads.forEach(h => { h.material.emissiveIntensity = m.lamp; });
  lampPoolMat.opacity = m.pool;
  if (lighthouseBeam) lighthouseBeam.material.opacity = m.beam;
  glint.material.opacity = name === 'night' ? 0.03 : 0.1;
}
applyMood('golden');

// ---------- input ----------
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (S.mode !== 'play') return;
  if (e.code === 'KeyE') { if (S.driving) exitCar(); else { const c = nearestCar(); if (c) enterCar(c); } }
  if (e.code === 'KeyF') playerShoot();
  if (e.code === 'KeyR') { S.radio = { ...cycleStation() }; }
  if (e.code === 'Digit1') S.selWeapon = 0;
  if (e.code === 'Digit2') S.selWeapon = 1;
  if (e.code === 'Digit3') S.selWeapon = 2;
  if (e.code === 'KeyQ') useAbility(0);
  if (e.code === 'KeyZ') useAbility(1);
  if (e.code === 'KeyX') useAbility(2);
});
addEventListener('keyup', e => { keys[e.code] = false; });
canvas.addEventListener('pointerdown', () => { initAudio(); if (S.mode === 'play' && !S.driving) playerShoot(); });
function useAbility(i) {
  const a = S.abilities[i], now = performance.now();
  if (now < a.until) return;
  a.until = now + a.cd * 1000;
  if (i === 0) { // dash: burst forward
    if (S.driving && currentCar) currentCar.speed += 14; else { playerPos.x += Math.sin(S.playerHeading) * 6; playerPos.z += Math.cos(S.playerHeading) * 6; collide(playerPos, 0.5); }
  } else if (i === 1) { S.inSight = false; searchTimer += 3; }
  else { S.armor = Math.min(100, S.armor + 20); }
  sfx('stage');
}
// ---------- menu wiring ----------
const startScreen = document.getElementById('start-screen');
function beginGame(fromSave) {
  initAudio();
  S.mode = 'play';
  startScreen.style.display = 'none';
  document.querySelectorAll('.panel').forEach(p => { if (p.id !== 'hud-prompt' && p.id !== 'hud-banner') p.style.display = ''; });
  if (fromSave) { const sv = loadSave(); if (sv) applySave(sv); else startMission(0); }
  else if (!S.mission && !S.freeRoam) startMission(0);
}
document.getElementById('btn-new').addEventListener('click', () => {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  S.money = 250; S.freeRoam = false; beginGame(false);
});
document.getElementById('btn-continue').addEventListener('click', () => beginGame(true));
document.getElementById('btn-free').addEventListener('click', () => { S.freeRoam = true; S.mission = null; marker.visible = false; beginGame(false); S.mission = null; marker.visible = false; });
// ---------- per-frame updates ----------
function updatePlayer(dt) {
  if (S.dead) return;
  if (S.driving && currentCar) {
    const c = currentCar;
    const accel = (keys.KeyW ? 15 : 0) - (keys.KeyS ? 9 : 0);
    c.speed += accel * dt; c.speed -= c.speed * 0.55 * dt;
    if (!keys.KeyW && !keys.KeyS) c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 3 * dt);
    c.speed = clamp(c.speed, -9, 30);
    const steer = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0);
    if (Math.abs(c.speed) > 0.3) c.heading += steer * dt * 1.5 * Math.sign(c.speed) * clamp(Math.abs(c.speed) / 8, 0.35, 1);
    const px = c.group.position.x, pz = c.group.position.z;
    c.group.position.x += Math.sin(c.heading) * c.speed * dt;
    c.group.position.z += Math.cos(c.heading) * c.speed * dt;
    c.group.position.x = clamp(c.group.position.x, -13.5, 8);
    c.group.position.z = clamp(c.group.position.z, -436, 436);
    const before = { x: px, z: pz };
    collide(c.group.position, 1.6);
    if (Math.hypot(c.group.position.x - before.x, c.group.position.z - before.z) > 0.6 && Math.abs(c.speed) > 6) {
      c.cond = Math.max(5, c.cond - 4); S.vehicleCond = c.cond; c.speed *= 0.35;
    }
    c.group.rotation.y = c.heading;
    for (const w of c.wheels) w.rotation.x += c.speed * dt / 0.34;
    // car vs car
    for (const o of [...traffic, ...policeCars.filter(p => p.active), heroCar]) {
      if (o === c) continue;
      const d = dist2(c.group.position, o.group.position);
      if (d < 3.1) {
        const push = (3.1 - d) / 2;
        const nx = (c.group.position.x - o.group.position.x) / (d || 1), nz = (c.group.position.z - o.group.position.z) / (d || 1);
        c.group.position.x += nx * push; c.group.position.z += nz * push;
        if (Math.abs(c.speed) > 7) { c.cond = Math.max(5, c.cond - 3); o.cond = Math.max(5, (o.cond ?? 100) - 3); S.vehicleCond = c.cond; }
        c.speed *= 0.72;
      }
    }
    // car vs ped
    for (const p of peds) {
      if (p.fallen > 0) continue;
      if (dist2(c.group.position, p.group.position) < 1.7 && Math.abs(c.speed) > 2.5) {
        p.fallen = 4; p.group.rotation.x = -Math.PI / 2; p.group.position.y = 0.2; addCrime(1);
      }
    }
    playerPos.copy(c.group.position);
    S.speed = c.speed; S.vehicleCond = c.cond; S.playerHeading = c.heading;
    setEngine(true, c.speed / 30);
  } else {
    const turn = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0);
    S.playerHeading += turn * dt * 2.4;
    const fwd = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 0.6 : 0);
    const sp = (keys.ShiftLeft || keys.ShiftRight) ? 7.4 : 4.3;
    playerPos.x += Math.sin(S.playerHeading) * fwd * sp * dt;
    playerPos.z += Math.cos(S.playerHeading) * fwd * sp * dt;
    playerPos.x = clamp(playerPos.x, -13.5, 8.6);
    playerPos.z = clamp(playerPos.z, -436, 436);
    collide(playerPos, 0.5);
    playerPerson.group.position.copy(playerPos);
    playerPerson.group.rotation.y = S.playerHeading;
    const moving = Math.abs(fwd) > 0;
    playerPerson.walkPh += dt * (moving ? 9 : 2);
    playerPerson.armL.rotation.x = Math.sin(playerPerson.walkPh) * (moving ? 0.6 : 0.08);
    playerPerson.armR.rotation.x = -Math.sin(playerPerson.walkPh) * (moving ? 0.6 : 0.08);
    S.speed = 0;
    setEngine(false, 0);
  }
}
function updateTraffic(dt) {
  for (const c of traffic) {
    if (S.driving && currentCar === c) continue;
    c.group.position.z += c.dir * c.speed * dt;
    if (c.group.position.z > 445) { c.group.position.z = -445; if (dist2(c.group.position, playerPos) < 30) c.group.position.z -= 160; }
    if (c.group.position.z < -445) { c.group.position.z = 445; if (dist2(c.group.position, playerPos) < 30) c.group.position.z += 160; }
    c.group.rotation.y = c.heading;
    for (const w of c.wheels) w.rotation.x += c.dir * c.speed * dt / 0.34;
  }
}
function updatePolice(dt) {
  let nearest = 1e9;
  for (const u of units) {
    const c = u.car, p = c.group.position;
    const d = dist2(p, playerPos); nearest = Math.min(nearest, d);
    const targetSpeed = d > 14 ? 24 : d > 6 ? 13 : 3;
    c.speed += clamp(targetSpeed - c.speed, -22 * dt, 14 * dt);
    const want = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
    let da = ((want - c.heading) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    c.heading += clamp(da, -1.7 * dt, 1.7 * dt);
    p.x += Math.sin(c.heading) * c.speed * dt;
    p.z += Math.cos(c.heading) * c.speed * dt;
    p.x = clamp(p.x, -13.5, 8); p.z = clamp(p.z, -436, 436);
    collide(p, 1.6);
    c.group.rotation.y = c.heading;
    for (const w of c.wheels) w.rotation.x += c.speed * dt / 0.34;
    if (c.lightbar) c.lightbar.children.forEach((lb, i) => { lb.material.emissiveIntensity = (Math.floor(performance.now() / 220) + i) % 2 ? 2.4 : 0.25; });
    u.tactic = S.wanted >= 4 ? 3 : d < 16 ? 1 : d < 40 ? 0 : 2;
  }
  // sight + search
  const seen = nearest < 46 || (S.wanted >= 3 && nearest < 80);
  S.inSight = S.wanted > 0 && seen;
  if (S.wanted > 0) {
    if (seen) searchTimer = 0;
    else { searchTimer += dt; if (searchTimer > 6) { searchTimer = 0; setWanted(S.wanted - 1); } }
  }
  // heli
  if (S.wanted >= 3) {
    const t = performance.now() / 1000;
    const hx = playerPos.x - 6 + Math.sin(t * 0.5) * 5, hz = playerPos.z - 20 + Math.cos(t * 0.35) * 6;
    heli.position.x += (hx - heli.position.x) * Math.min(1, dt * 1.6);
    heli.position.z += (hz - heli.position.z) * Math.min(1, dt * 1.6);
    heli.position.y = 13.5 + Math.sin(t * 0.8) * 0.7;
    heli.rotation.y = Math.atan2(playerPos.x - heli.position.x, playerPos.z - heli.position.z);
    coneMesh.visible = true; poolMesh.visible = true;
    aimCone(new THREE.Vector3(heli.position.x + 0.5, heli.position.y - 1.2, heli.position.z - 1), playerPos.x, playerPos.z);
  } else { heli.position.y -= (heli.position.y + 60) * dt * 0.5; if (heli.position.y < -40) heli.position.set(0, -60, 9999); coneMesh.visible = false; poolMesh.visible = false; }
}
function updatePedsEnemies(dt) {
  for (const p of peds) {
    if (p.fallen > 0) { p.fallen -= dt; if (p.fallen <= 0) { p.group.rotation.x = 0; p.group.position.y = 0; } continue; }
    p.group.position.z += p.dir * 1.15 * dt;
    if (p.group.position.z > 445) p.dir = -1; if (p.group.position.z < -445) p.dir = 1;
    p.group.rotation.y = p.dir > 0 ? 0 : Math.PI;
    p.walkPh += dt * 6; p.armL.rotation.x = Math.sin(p.walkPh) * 0.45; p.armR.rotation.x = -Math.sin(p.walkPh) * 0.45;
  }
  for (const e of enemies) {
    if (e.dead) continue;
    const p = e.person.position, d = dist2(p, playerPos);
    if (d > 9) { // close in
      const a = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
      p.x += Math.sin(a) * 2.1 * dt; p.z += Math.cos(a) * 2.1 * dt;
      e.person.rotation.y = a;
      e.parts.walkPh += dt * 7; e.parts.armL.rotation.x = Math.sin(e.parts.walkPh) * 0.5; e.parts.armR.rotation.x = -Math.sin(e.parts.walkPh) * 0.5;
    } else e.person.rotation.y = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
    e.fireT -= dt;
    if (e.fireT <= 0 && d < 38 && S.mode === 'play' && !S.dead) {
      e.fireT = 1.1 + rnd() * 0.9;
      spawnTracer(new THREE.Vector3(p.x, 1.35, p.z), new THREE.Vector3(playerPos.x, 1.2, playerPos.z), 0xff8a6a);
      spawnFlash(new THREE.Vector3(p.x, 1.4, p.z), 1.3);
      sfx('shot');
      if (rnd() < 0.62) hurtPlayer(4 + rnd() * 4);
    }
  }
  // police gunfire at high wanted when close
  if (S.wanted >= 4 && !S.driving && units.length && rnd() < dt * 0.5) {
    const u = units[0];
    if (dist2(u.car.group.position, playerPos) < 30) hurtPlayer(3);
  }
}
function updateWorldFx(dt, t) {
  // sea waves
  const pos = seaGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = seaBase[i * 3], y = seaBase[i * 3 + 1];
    pos.setZ(i, Math.sin(x * 0.11 + t * 1.1) * 0.22 + Math.cos(y * 0.05 + t * 0.7) * 0.18);
  }
  pos.needsUpdate = true;
  foam.material.opacity = 0.45 + Math.sin(t * 0.9) * 0.2;
  if (heliRotor) heliRotor.rotation.y += dt * 28;
  if (heliTail) heliTail.rotation.x += dt * 32;
  wheel.rotation.z += dt * 0.25;
  for (const b of window.__boats) { b.position.y = 0.1 + Math.sin(t * 1.2 + b.userData.ph) * 0.14; b.rotation.z = Math.sin(t * 0.9 + b.userData.ph) * 0.05; }
  if (lighthouseBeam && MOODS[moodName].beam > 0) lighthouseBeam.rotation.y = t * 0.5;
  marker.rotation.y += dt * 1.4;
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]; e.t -= dt;
    if (e.obj.material) e.obj.material.opacity = Math.max(0, e.t / e.max) * (e.kind === 'line' ? 0.95 : 0.9);
    if (e.t <= 0) { scene.remove(e.obj); if (e.obj.geometry) e.obj.geometry.dispose(); effects.splice(i, 1); }
  }
}
function updateCamera(dt) {
  let tx, ty, tz, lx, ly, lz;
  if (S.camOverride) { [tx, ty, tz] = S.camOverride.pos; [lx, ly, lz] = S.camOverride.look; }
  else if (S.driving && currentCar) {
    const h = currentCar.heading;
    tx = currentCar.group.position.x - Math.sin(h) * 7.6 + Math.sin(h + Math.PI / 2) * 1.1;
    tz = currentCar.group.position.z - Math.cos(h) * 7.6 + Math.cos(h + Math.PI / 2) * 1.1;
    ty = 2.05;
    lx = currentCar.group.position.x + Math.sin(h) * 9; ly = 1.1; lz = currentCar.group.position.z + Math.cos(h) * 9;
  } else {
    const h = S.playerHeading;
    tx = playerPos.x - Math.sin(h) * 6.4; tz = playerPos.z - Math.cos(h) * 6.4; ty = 2.5;
    lx = playerPos.x + Math.sin(h) * 6; ly = 1.25; lz = playerPos.z + Math.cos(h) * 6;
  }
  // camera collision: keep the camera over the open corridor, never inside a building volume
  tx = clamp(tx, -30, 8.4); ty = Math.max(ty, 0.7);
  camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 7);
  camera.position.y += (ty - camera.position.y) * Math.min(1, dt * 7);
  camera.position.z += (tz - camera.position.z) * Math.min(1, dt * 7);
  camera.lookAt(lx, ly, lz);
  // sun shadow follows the player; fill light stays on the camera side so the hero reads glossy, never black
  sun.position.set(playerPos.x - 120, 90, playerPos.z - 70);
  sun.target.position.copy(playerPos);
  fill.position.set(camera.position.x + 26, 34, camera.position.z + 30);
}
function districtAt(z) {
  let best = DISTRICTS[0], bd = 1e9;
  for (const d of DISTRICTS) { const dd = Math.abs(d.z - z); if (dd < bd) { bd = dd; best = d; } }
  return best.name;
}
// ---------- main loop ----------
let fpsAcc = 0, fpsN = 0, fpsShown = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (S.mode === 'play') {
    fireCd = Math.max(0, fireCd - dt); crimeCd = Math.max(0, crimeCd - dt);
    updatePlayer(dt); updateTraffic(dt); updatePolice(dt); updatePedsEnemies(dt);
    checkStage(dt);
    // enter-car prompt
    if (!S.driving && !S.dead) { const c = nearestCar(); showPrompt(!!c, c ? `Enter ${c.name}` : ''); }
    else showPrompt(false);
    saveTimer += dt; if (saveTimer > 8) { saveTimer = 0; saveGame(); }
  }
  updateWorldFx(dt, t);
  updateCamera(dt);
  G.district = districtAt(playerPos.z);
  updateHUD(G);
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 1) { fpsShown = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  renderer.render(scene, camera);
}
// ---------- shared context + debug hook ----------
const G = { S, units, traffic, enemies, heli, playerPos, district: 'Wrackline Strip', applyMood, heroCar, playerPerson, policeCars,
  placeEnemies(list) { for (const e of enemies) scene.remove(e.person); enemies.length = 0; for (const [x, z] of list) spawnEnemy(x, z); },
  placePolice(i, x, z, h) { const c = policeCars[i]; c.group.position.set(x, 0, z); c.heading = h ?? Math.PI; c.group.rotation.y = c.heading; },
  placeTraffic(i, x, z, h) { const c = traffic[i]; c.group.position.set(x, 0, z); if (h !== undefined) { c.heading = h; c.group.rotation.y = h; } },
  stagePeds(z, n) { peds.forEach((p, i) => { if (i < n) { p.group.position.set(i % 2 ? -7.6 : 7.6, 0, z + (i - n / 2) * 7); } }); },
  spawnTracer, spawnFlash, setSpotlight(alpha) { coneMesh.visible = alpha > 0; poolMesh.visible = alpha > 0; coneMesh.material.opacity = 0.13 * alpha; },
  placeCone(fx, fy, fz, tx, tz) { aimCone(new THREE.Vector3(fx, fy, fz), tx, tz); },
  aimConeAt(x, z) { poolMesh.position.set(x, 0.07, z); },
  V3: THREE.Vector3, camera, scene };
window.__game = {
  S, G, playerPos, units, enemies, traffic, policeCars, peds,
  teleport(x, z) { playerPos.set(x, 0, z); if (S.driving && currentCar) { currentCar.group.position.set(x, 0, z); } else playerPerson.group.position.copy(playerPos); },
  toMarker() { const m = S.markerPos; if (!m) return false; const px = clamp(m.x, -5, 5); this.teleport(px, m.z + (S.driving ? 0 : 2)); return true; },
  fire: () => playerShoot(),
  setWanted, startMission, setStage: n => setStage(n),
  stageInfo() { const M = S.mission; if (!M) return null; const st = MISSIONS[M.index].stages[M.stage]; return { mission: M.index, name: M.name, stage: M.stage, type: st.type, timeLeft: M.timeLeft, marker: S.markerPos }; },
  setTimeLeft(s) { if (S.mission) S.mission.timeLeft = s; },
  hurt: d => hurtPlayer(d), saveGame, loadSave,
  enterNearest() { const c = nearestCar(); if (c) { enterCar(c); return c.name; } return null; },
  exitCar, fps: () => fpsShown, mood: () => moodName, applyMood,
  setHealth(v) { S.health = v; }, roadblock: () => !!roadblock,
  camPos: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z }),
  beginNew() { S.freeRoam = false; beginGame(false); },
  beginContinue() { beginGame(true); },
};
// ---------- boot ----------
const shotName = params.get('shot');
if (shotName) {
  S.mode = 'shot';
  document.querySelectorAll('.panel').forEach(p => { if (p.id !== 'hud-prompt' && p.id !== 'hud-banner') p.style.display = ''; });
  startScreen.style.display = 'none';
  startMission(0);
  stageShot(G, shotName);
} else {
  startScreen.style.display = 'flex';
  document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; });
  S.camOverride = { pos: [7.5, 9.5, 246], look: [-16, 3.5, 130] };
}
loop();
requestAnimationFrame(() => requestAnimationFrame(() => {
  window.__probe = probeOverlaps();
  window.__panels = document.querySelectorAll('.panel').length;
  window.__ready = true;
}));
