import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import './style.css';

// -----------------------------------------------------------------------------
// UI
// -----------------------------------------------------------------------------
const canvas = document.querySelector('#scene');
const flashEl = document.querySelector('#flash');
const loadingEl = document.querySelector('#loading');
const loadingDetailEl = document.querySelector('#loadingDetail');
const eventMessageEl = document.querySelector('#eventMessage');
const courseLabelEl = document.querySelector('#courseLabel');
const hostileCountEl = document.querySelector('#hostileCount');

const cameraBtn = document.querySelector('#cameraBtn');
const intensityBtn = document.querySelector('#intensityBtn');
const volleyBtn = document.querySelector('#volleyBtn');
const waveBtn = document.querySelector('#waveBtn');
const pauseBtn = document.querySelector('#pauseBtn');
const shieldBtn = document.querySelector('#shieldBtn');
const libraryBtn = document.querySelector('#libraryBtn');

const portBtn = document.querySelector('#portBtn');
const forwardBtn = document.querySelector('#forwardBtn');
const starboardBtn = document.querySelector('#starboardBtn');
const ascendBtn = document.querySelector('#ascendBtn');
const descendBtn = document.querySelector('#descendBtn');
const cathedralBtn = document.querySelector('#cathedralBtn');

// -----------------------------------------------------------------------------
// Scene
// -----------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x01020a);
scene.fog = new THREE.FogExp2(0x01020a, 0.0016);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 2600);
camera.position.set(70, 34, 116);

const clock = new THREE.Clock();
const world = new THREE.Group();
scene.add(world);

const PLAYER_LENGTH = 92;
const PLAYER_SPEED = 7;

// Keep the battlefield visually overwhelming at all times. Only the closest
// ships use the heavy STL mesh; the remainder are lightweight instanced proxies.
const MAX_ENEMIES = 1000;
const DETAILED_ENEMIES = 30;
const DEFAULT_ENEMIES = MAX_ENEMIES;

const CATHEDRAL_POSITION = new THREE.Vector3(0, 55, -760);
const LIBRARY_STANDOFF_DISTANCE = 175;
const LIBRARY_STAGE_FRACTIONS = [0.20, 0.50, 1.00];
const LIBRARY_STAGE_DURATIONS = [20, 15, 20];

const state = {
  paused: false,
  elapsed: 0,
  cameraIndex: 0,
  intensityIndex: 1,
  cameraNames: ['CINEMATIC', 'BROADSIDE', 'CHASE', 'HELM', 'DESTINATION'],
  intensityNames: ['DRIFT', 'BATTLE', 'CHAOS'],
  // Intensity now changes the amount of gunfire/destruction, not fleet size.
  // The hostile count remains fixed at 1,000 in every mode.
  intensityCounts: [MAX_ENEMIES, MAX_ENEMIES, MAX_ENEMIES],
  wavePatternIndex: 0,
  wavePatternNames: ['SWARM', 'PINCER', 'CROSSWIND', 'HELIX'],
  libraryStage: 0,
  libraryJourneyOrigin: null,
  libraryStopPoint: null,
  libraryMotion: null,
  playerFireTimer: 0,
  enemyFireTimer: 0,
  destructionTimer: 0,
  beamTimer: 0,
  targetYaw: 0,
  targetPitch: 0,
  courseMode: 'FORWARD',
  pageBurst: 0,
};

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const tmp3 = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpQuat2 = new THREE.Quaternion();
const tmpMatrix = new THREE.Matrix4();
const tmpEuler = new THREE.Euler();
const forwardAxis = new THREE.Vector3(0, 0, -1);
const upAxis = new THREE.Vector3(0, 1, 0);

// Reused vectors for the 1,000-ship fleet update. Keeping these outside the
// frame loop avoids thousands of temporary Vector3 allocations every second.
const enemyForwardVec = new THREE.Vector3();
const enemyRightVec = new THREE.Vector3();
const enemyUpVec = new THREE.Vector3();
const enemyTargetVec = new THREE.Vector3();
const enemyDesiredVelocity = new THREE.Vector3();
const enemyRelativeVec = new THREE.Vector3();

// -----------------------------------------------------------------------------
// Lighting
// -----------------------------------------------------------------------------
scene.add(new THREE.HemisphereLight(0x8aa7e8, 0x150a20, 1.45));

const keyLight = new THREE.DirectionalLight(0xe6f1ff, 3.2);
keyLight.position.set(90, 110, 60);
scene.add(keyLight);

const violetRim = new THREE.DirectionalLight(0x7c4dff, 2.4);
violetRim.position.set(-80, -20, -110);
scene.add(violetRim);

const cathedralLight = new THREE.PointLight(0xffc75c, 1000, 520, 1.7);
cathedralLight.position.copy(CATHEDRAL_POSITION).add(new THREE.Vector3(0, 90, 0));
scene.add(cathedralLight);

// -----------------------------------------------------------------------------
// Textures / stars / nebulae
// -----------------------------------------------------------------------------
function makeRadialTexture(inner, middle, outer = 'rgba(0,0,0,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(.26, middle ?? inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const cyanGlowTex = makeRadialTexture('rgba(255,255,255,1)', 'rgba(60,201,255,.9)');
const redGlowTex = makeRadialTexture('rgba(255,255,255,1)', 'rgba(255,74,42,.9)');
const goldGlowTex = makeRadialTexture('rgba(255,255,255,1)', 'rgba(255,192,70,.82)');
const blueNebulaTex = makeRadialTexture('rgba(81,109,255,.36)', 'rgba(38,70,200,.22)');
const purpleNebulaTex = makeRadialTexture('rgba(174,72,255,.28)', 'rgba(93,38,170,.18)');

function createStarField(count = 5200) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const r = 130 + Math.random() * 850;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xdce8ff,
    size: .85,
    transparent: true,
    opacity: .92,
    depthWrite: false,
  });
  const stars = new THREE.Points(geometry, mat);
  scene.add(stars);
  return stars;
}

function addNebula(texture, position, scale) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  sprite.position.copy(position);
  sprite.scale.setScalar(scale);
  scene.add(sprite);
  return sprite;
}

const starField = createStarField();
const nebulaA = addNebula(blueNebulaTex, new THREE.Vector3(-270, 100, -480), 460);
const nebulaB = addNebula(purpleNebulaTex, new THREE.Vector3(340, -130, -660), 560);

// -----------------------------------------------------------------------------
// Player ship — loaded from the provided Prometheus OBJ.
// -----------------------------------------------------------------------------
const playerRoot = new THREE.Group();
playerRoot.name = 'PrometheusPlayerShip';
world.add(playerRoot);

const playerHullMaterial = new THREE.MeshStandardMaterial({ color: 0x5b646e, roughness: .48, metalness: .78 });
const playerDarkMaterial = new THREE.MeshStandardMaterial({ color: 0x202732, roughness: .58, metalness: .76 });
const playerRedMaterial = new THREE.MeshStandardMaterial({ color: 0x7e2429, roughness: .54, metalness: .6 });
const playerGlassMaterial = new THREE.MeshStandardMaterial({
  color: 0x7fd8ff,
  emissive: 0x126a9b,
  emissiveIntensity: 2.1,
  roughness: .2,
  metalness: .25,
});

function materialForObjName(name = '') {
  const n = name.toLowerCase();
  if (n.includes('red')) return playerRedMaterial;
  if (n.includes('blue') || n.includes('front')) return playerGlassMaterial;
  if (n.includes('gray') || n.includes('side') || n.includes('main')) return playerHullMaterial;
  return playerDarkMaterial;
}

function addPlayerEngineGlows() {
  const engineGroup = new THREE.Group();
  const localZ = PLAYER_LENGTH * .49;
  for (const x of [-13, -6.5, 0, 6.5, 13]) {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cyanGlowTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: .92,
    }));
    glow.position.set(x, 0, localZ + 3.5);
    glow.scale.set(9, 9, 1);
    engineGroup.add(glow);
  }
  playerRoot.add(engineGroup);
}

function buildFallbackPlayer() {
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(34, 13, PLAYER_LENGTH),
    playerHullMaterial,
  );
  playerRoot.add(hull);
}

async function loadPlayerModel() {
  loadingDetailEl.textContent = 'Loading Prometheus capital ship…';
  const loader = new OBJLoader();
  try {
    const object = await loader.loadAsync('./models/prometheus.obj');
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    object.position.sub(center);
    const scale = PLAYER_LENGTH / Math.max(size.z, .001);
    object.scale.setScalar(scale);

    object.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = false;
      child.receiveShadow = false;
      const original = Array.isArray(child.material) ? child.material[0] : child.material;
      child.material = materialForObjName(original?.name || child.name);
      child.geometry.computeVertexNormals();
    });
    playerRoot.add(object);
  } catch (error) {
    console.warn('Prometheus OBJ failed to load; using fallback capital ship.', error);
    buildFallbackPlayer();
  }
  addPlayerEngineGlows();
}

// -----------------------------------------------------------------------------
// Library cathedral — intentionally procedural, based on the supplied 3MF
// silhouette. Loading the source 3MF directly would add ~68 MB to every visit.
// -----------------------------------------------------------------------------
const cathedral = new THREE.Group();
cathedral.position.copy(CATHEDRAL_POSITION);
world.add(cathedral);

const cathedralStone = new THREE.MeshStandardMaterial({ color: 0x302c35, roughness: .76, metalness: .18 });
const cathedralTrim = new THREE.MeshStandardMaterial({
  color: 0x75582b,
  emissive: 0x4c2b08,
  emissiveIntensity: .7,
  roughness: .52,
  metalness: .5,
});
const cathedralWindow = new THREE.MeshStandardMaterial({
  color: 0xffd470,
  emissive: 0xffa91e,
  emissiveIntensity: 4.2,
  roughness: .25,
});

function boxMesh(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function buildCathedral() {
  // Cathedral body / nave
  cathedral.add(boxMesh(108, 18, 148, cathedralStone, 0, 9, 0));
  cathedral.add(boxMesh(58, 48, 128, cathedralStone, 0, 36, 0));
  cathedral.add(boxMesh(86, 24, 74, cathedralStone, 0, 26, -6));
  cathedral.add(boxMesh(36, 64, 92, cathedralStone, 0, 63, 8));

  // Twin western towers inspired by the supplied cathedral silhouette.
  for (const x of [-30, 30]) {
    cathedral.add(boxMesh(25, 86, 27, cathedralStone, x, 56, 47));
    const towerTop = new THREE.Mesh(new THREE.CylinderGeometry(13, 17, 34, 8), cathedralTrim);
    towerTop.position.set(x, 116, 47);
    cathedral.add(towerTop);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(12, 54, 8), cathedralTrim);
    spire.position.set(x, 160, 47);
    cathedral.add(spire);
  }

  // Central crossing tower.
  cathedral.add(boxMesh(28, 76, 30, cathedralStone, 0, 83, -16));
  const centralCrown = new THREE.Mesh(new THREE.CylinderGeometry(17, 20, 30, 8), cathedralTrim);
  centralCrown.position.set(0, 134, -16);
  cathedral.add(centralCrown);
  const centralSpire = new THREE.Mesh(new THREE.ConeGeometry(15, 70, 8), cathedralTrim);
  centralSpire.position.set(0, 184, -16);
  cathedral.add(centralSpire);

  // Side buttresses / floating structural fins.
  for (const side of [-1, 1]) {
    for (let z = -52; z <= 44; z += 24) {
      const buttress = boxMesh(7, 44, 5, cathedralTrim, side * 49, 33, z);
      buttress.rotation.z = side * .38;
      cathedral.add(buttress);
    }
  }

  // Glowing windows.
  for (const side of [-1, 1]) {
    for (let z = -48; z <= 50; z += 18) {
      const win = boxMesh(1.3, 12, 7.5, cathedralWindow, side * 55, 40, z);
      cathedral.add(win);
    }
  }
  for (const x of [-30, 0, 30]) {
    const win = boxMesh(8, 16, 1.5, cathedralWindow, x, x === 0 ? 80 : 78, 61);
    cathedral.add(win);
  }

  // Astral rings and destination beacon.
  for (const [r, y, tilt] of [[90, 72, .1], [126, 103, -.2], [158, 132, .18]]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, 1.15, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0xd9b85e, transparent: true, opacity: .34 }),
    );
    ring.position.y = y;
    ring.rotation.x = Math.PI / 2 + tilt;
    cathedral.add(ring);
  }

  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 7, 420, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xf4c55d,
      transparent: true,
      opacity: .1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  beacon.position.y = 285;
  cathedral.add(beacon);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: goldGlowTex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: .75,
  }));
  halo.position.set(0, 108, 0);
  halo.scale.set(330, 330, 1);
  cathedral.add(halo);
}

buildCathedral();

// -----------------------------------------------------------------------------
// Flying information pages around the Library.
// -----------------------------------------------------------------------------
function makePageTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 176;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4ead0';
  ctx.fillRect(4, 4, 120, 168);
  ctx.strokeStyle = 'rgba(110,72,35,.9)';
  ctx.lineWidth = 3;
  ctx.strokeRect(5, 5, 118, 166);
  ctx.fillStyle = '#62451f';
  ctx.fillRect(18, 22, 40, 8);
  ctx.fillStyle = 'rgba(70,48,30,.72)';
  for (let y = 44; y < 148; y += 14) {
    const w = 68 + ((y * 17) % 32);
    ctx.fillRect(18, y, w, 4);
  }
  ctx.fillStyle = '#9a5b17';
  ctx.beginPath();
  ctx.arc(99, 30, 10, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const PAGE_COUNT = 260;
const pageGeometry = new THREE.PlaneGeometry(5.2, 7.1);
const pageMaterial = new THREE.MeshBasicMaterial({
  map: makePageTexture(),
  transparent: true,
  opacity: .92,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const pageInstances = new THREE.InstancedMesh(pageGeometry, pageMaterial, PAGE_COUNT);
pageInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(pageInstances);

const pageData = Array.from({ length: PAGE_COUNT }, (_, i) => ({
  angle: Math.random() * Math.PI * 2,
  radius: 80 + Math.random() * 205,
  height: -30 + Math.random() * 270,
  speed: .12 + Math.random() * .5,
  wobble: Math.random() * Math.PI * 2,
  stream: Math.random() < .42,
  lane: Math.random(),
  phase: i * .37 + Math.random() * 3,
}));

function updatePages(t, dt) {
  const burst = state.pageBurst;
  for (let i = 0; i < PAGE_COUNT; i += 1) {
    const p = pageData[i];
    p.angle += dt * p.speed * (1 + burst * 2.6);
    p.wobble += dt * (1.4 + p.speed);

    let x;
    let y;
    let z;
    if (p.stream) {
      const flow = (t * (.045 + p.speed * .02) + p.lane + burst * .12) % 1;
      const radius = 18 + flow * 320;
      x = Math.cos(p.angle + flow * 9) * (radius * .56);
      y = 40 + p.height * .36 + Math.sin(p.wobble) * 18 + flow * 80;
      z = 30 + flow * 250 + Math.sin(p.angle * 1.7) * 34;
    } else {
      x = Math.cos(p.angle) * p.radius;
      y = p.height + Math.sin(p.wobble) * 13;
      z = Math.sin(p.angle) * p.radius;
    }

    tmp.set(x, y, z).add(CATHEDRAL_POSITION);
    tmpEuler.set(
      Math.sin(p.wobble) * .7,
      p.angle + t * .35,
      Math.cos(p.wobble * .8) * .9,
    );
    tmpQuat.setFromEuler(tmpEuler);
    const s = .45 + (i % 7) * .055 + burst * .11;
    tmpMatrix.compose(tmp, tmpQuat, tmp2.setScalar(s));
    pageInstances.setMatrixAt(i, tmpMatrix);
  }
  pageInstances.instanceMatrix.needsUpdate = true;
  state.pageBurst = Math.max(0, state.pageBurst - dt * .32);
}

// -----------------------------------------------------------------------------
// Enemy armada. Near ships use the supplied STL as true geometry; the remaining
// ships use a lightweight proxy so 1,000 moving hostiles remain practical.
// -----------------------------------------------------------------------------
const enemyData = Array.from({ length: MAX_ENEMIES }, () => ({
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  scale: 1,
  speed: 70,
  roll: 0,
  phase: Math.random() * Math.PI * 2,
  laneX: 0,
  laneY: 0,
  alive: true,
  respawn: 0,
  hasPassed: false,
}));

const enemyWoodMat = new THREE.MeshStandardMaterial({ color: 0x6e4930, roughness: .76, metalness: .08 });
const enemySailMat = new THREE.MeshStandardMaterial({
  color: 0xcbbd91,
  roughness: .88,
  metalness: .02,
  side: THREE.DoubleSide,
});
const enemyDetailMat = new THREE.MeshStandardMaterial({ color: 0x786044, roughness: .72, metalness: .12 });

let detailedEnemyMesh = null;
let proxyHullMesh = null;
let proxySailMesh = null;
let proxyMastMesh = null;

function resetEnemy(index, extraDistance = 0, forceNear = false) {
  const e = enemyData[index];

  // Spawn in front of the player's current heading. The broader spread prevents
  // 1,000 ships from reading as one flat wall.
  const spread = forceNear ? 230 : 560;
  const distance = forceNear
    ? THREE.MathUtils.randFloat(180, 370)
    : THREE.MathUtils.randFloat(320, 830 + Math.min(extraDistance, 160));

  playerForward(enemyForwardVec);
  enemyRightVec.set(1, 0, 0).applyQuaternion(playerRoot.quaternion);
  enemyUpVec.set(0, 1, 0).applyQuaternion(playerRoot.quaternion);

  e.laneX = THREE.MathUtils.randFloatSpread(spread);
  e.laneY = THREE.MathUtils.randFloatSpread(spread * .50);

  e.position.copy(playerRoot.position)
    .addScaledVector(enemyForwardVec, distance)
    .addScaledVector(enemyRightVec, e.laneX)
    .addScaledVector(enemyUpVec, e.laneY);

  // Start by aiming through the player's vicinity and beyond it. Steering in
  // updateEnemyInstances() then bends this vector into the active wave pattern.
  enemyTargetVec.copy(playerRoot.position)
    .addScaledVector(enemyForwardVec, -220)
    .addScaledVector(enemyRightVec, e.laneX * .16)
    .addScaledVector(enemyUpVec, e.laneY * .12);

  e.speed = THREE.MathUtils.randFloat(58, 112);
  e.velocity.copy(enemyTargetVec).sub(e.position).normalize().multiplyScalar(e.speed);

  // The enemy ships should look tiny against the capital ship.
  e.scale = THREE.MathUtils.randFloat(.50, .82);
  e.roll = THREE.MathUtils.randFloatSpread(.72);
  e.phase = Math.random() * Math.PI * 2;
  e.alive = true;
  e.respawn = 0;
  e.hasPassed = false;
}

for (let i = 0; i < MAX_ENEMIES; i += 1) {
  resetEnemy(i, i * .08, i < 170);
}

function createProxyEnemyMeshes() {
  const proxyCount = MAX_ENEMIES - DETAILED_ENEMIES;

  // A compact fantasy galleon silhouette. The old sail was intentionally large
  // for readability, but at battle scale it looked like an enormous square flag.
  const hull = new THREE.ConeGeometry(1.22, 7.2, 6, 1, false);
  hull.rotateX(Math.PI / 2);
  hull.translate(0, -.38, 0);
  proxyHullMesh = new THREE.InstancedMesh(hull, enemyWoodMat, proxyCount);
  proxyHullMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  world.add(proxyHullMesh);

  // Small tapered sail: roughly one third of the old visible area.
  const sail = new THREE.BufferGeometry();
  sail.setAttribute('position', new THREE.Float32BufferAttribute([
    -1.25, 0.20, 0,
     1.25, 0.20, 0,
     0.72, 1.95, 0,

    -1.25, 0.20, 0,
     0.72, 1.95, 0,
    -0.58, 1.95, 0,
  ], 3));
  sail.computeVertexNormals();
  sail.translate(0, 1.0, .18);
  proxySailMesh = new THREE.InstancedMesh(sail, enemySailMat, proxyCount);
  proxySailMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  world.add(proxySailMesh);

  const mast = new THREE.CylinderGeometry(.09, .12, 4.0, 6);
  mast.translate(0, 1.05, 0);
  proxyMastMesh = new THREE.InstancedMesh(mast, enemyDetailMat, proxyCount);
  proxyMastMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  world.add(proxyMastMesh);
}

createProxyEnemyMeshes();

async function loadDetailedEnemies() {
  loadingDetailEl.textContent = 'Loading Spelljammer galleons…';
  const loader = new STLLoader();
  try {
    const geometry = await loader.loadAsync('./models/galleon-ship.stl');
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.center();

    // Keep the true STL ships dramatically smaller than the 92-unit Prometheus.
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    const normScale = 8.5 / Math.max(size.y, size.x, size.z);
    geometry.scale(normScale, normScale, normScale);
    geometry.rotateX(Math.PI / 2);

    detailedEnemyMesh = new THREE.InstancedMesh(geometry, enemyDetailMat, DETAILED_ENEMIES);
    detailedEnemyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    world.add(detailedEnemyMesh);
  } catch (error) {
    console.warn('Galleon STL failed to load. Proxy fleet remains available.', error);
  }
}

function activeEnemyCount() {
  return MAX_ENEMIES;
}

function playerForward(target = new THREE.Vector3()) {
  return target.copy(forwardAxis).applyQuaternion(playerRoot.quaternion).normalize();
}

function getWavePassTarget(e, index, t, out) {
  // Base target is deliberately BEHIND the player. Enemies therefore cross the
  // capital ship's position and keep going rather than turning around in front.
  out.copy(playerRoot.position).addScaledVector(enemyForwardVec, -240);

  const pattern = state.wavePatternNames[state.wavePatternIndex];
  let x = e.laneX * .12;
  let y = e.laneY * .10;

  if (pattern === 'PINCER') {
    const side = index % 2 === 0 ? -1 : 1;
    x = side * (38 + Math.min(95, Math.abs(e.laneX) * .24));
    y = e.laneY * .08;
  } else if (pattern === 'CROSSWIND') {
    // Aim for the opposite side of the player so ships visibly cross one another.
    x = -Math.sign(e.laneX || (index % 2 ? 1 : -1)) * (70 + Math.min(120, Math.abs(e.laneX) * .26));
    y = -e.laneY * .18;
  } else if (pattern === 'HELIX') {
    const angle = e.phase + t * .72 + (index % 32) * (Math.PI * 2 / 32);
    const radius = 78 + (index % 5) * 8;
    x = Math.cos(angle) * radius;
    y = Math.sin(angle) * radius * .62;
  }

  out.addScaledVector(enemyRightVec, x);
  out.addScaledVector(enemyUpVec, y);
  return out;
}

function updateEnemyInstances(dt, t) {
  const count = activeEnemyCount();
  hostileCountEl.textContent = String(count);

  const playerPos = playerRoot.position;
  const baseUp = upAxis;
  let proxyIndex = 0;

  // All ships share the same player-relative basis for this frame.
  playerForward(enemyForwardVec);
  enemyRightVec.set(1, 0, 0).applyQuaternion(playerRoot.quaternion);
  enemyUpVec.set(0, 1, 0).applyQuaternion(playerRoot.quaternion);

  for (let i = 0; i < MAX_ENEMIES; i += 1) {
    const e = enemyData[i];

    if (!e.alive) {
      e.respawn -= dt;
      if (e.respawn <= 0) resetEnemy(i, 130, i < 170);
    }

    if (e.alive) {
      // Before a ship crosses the player, gently steer it towards the current
      // wave's pass-through target. This lets W alter formations without moving
      // a ship's position even one pixel.
      if (!e.hasPassed) {
        getWavePassTarget(e, i, t, enemyTargetVec);
        enemyDesiredVelocity.copy(enemyTargetVec)
          .sub(e.position)
          .normalize()
          .multiplyScalar(e.speed);

        const steer = 1 - Math.pow(.10, dt);
        e.velocity.lerp(enemyDesiredVelocity, steer);
        if (e.velocity.lengthSq() > .001) e.velocity.normalize().multiplyScalar(e.speed);
      }

      e.position.addScaledVector(e.velocity, dt);
      e.position.y += Math.sin(t * 1.8 + e.phase) * dt * 2.2;

      enemyRelativeVec.copy(e.position).sub(playerPos);
      const depth = enemyRelativeVec.dot(enemyForwardVec);
      const distSq = enemyRelativeVec.lengthSq();

      // Once the ship is behind the player, stop steering and let it streak away.
      if (!e.hasPassed && depth < -26) e.hasPassed = true;

      // Recycle only after it is well behind / far away. There is deliberately
      // no "distance < 16" reset anymore, so close fly-bys actually pass the ship.
      if (depth < -560 || distSq > 1250 * 1250) {
        resetEnemy(i, 80, i < 170);
      }
    }

    const visibleScale = e.alive ? e.scale : 0;
    const dir = e.velocity.lengthSq() > .01 ? e.velocity : enemyForwardVec;
    tmpQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tmp.copy(dir).normalize());
    tmpQuat2.setFromAxisAngle(baseUp, e.roll + Math.sin(t * 1.1 + e.phase) * .12);
    tmpQuat.multiply(tmpQuat2);
    tmpMatrix.compose(e.position, tmpQuat, tmp2.setScalar(visibleScale));

    if (i < DETAILED_ENEMIES) {
      if (detailedEnemyMesh) detailedEnemyMesh.setMatrixAt(i, tmpMatrix);
    } else {
      proxyHullMesh.setMatrixAt(proxyIndex, tmpMatrix);
      proxySailMesh.setMatrixAt(proxyIndex, tmpMatrix);
      proxyMastMesh.setMatrixAt(proxyIndex, tmpMatrix);
      proxyIndex += 1;
    }
  }

  if (detailedEnemyMesh) detailedEnemyMesh.instanceMatrix.needsUpdate = true;
  proxyHullMesh.instanceMatrix.needsUpdate = true;
  proxySailMesh.instanceMatrix.needsUpdate = true;
  proxyMastMesh.instanceMatrix.needsUpdate = true;
}

// -----------------------------------------------------------------------------
// Instanced bolt systems
// -----------------------------------------------------------------------------
class BoltSystem {
  constructor({ max, color, glowColor, speed = 180, length = 3 }) {
    this.max = max;
    this.cursor = 0;
    this.speed = speed;
    this.items = Array.from({ length: max }, () => ({
      active: false,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      life: 0,
      targetIndex: -1,
      playerOwned: false,
    }));
    const geometry = new THREE.BoxGeometry(.18, .18, length);
    const material = new THREE.MeshBasicMaterial({ color });
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);

    this.glow = new THREE.PointLight(glowColor, 0, 20, 2);
  }

  fire(start, direction, options = {}) {
    const item = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    item.active = true;
    item.position.copy(start);
    item.velocity.copy(direction).normalize().multiplyScalar(options.speed ?? this.speed);
    item.life = options.life ?? 2.5;
    item.targetIndex = options.targetIndex ?? -1;
    item.playerOwned = options.playerOwned ?? false;
  }

  update(dt) {
    for (let i = 0; i < this.max; i += 1) {
      const item = this.items[i];
      if (item.active) {
        item.position.addScaledVector(item.velocity, dt);
        item.life -= dt;

        if (item.playerOwned && item.targetIndex >= 0) {
          const target = enemyData[item.targetIndex];
          if (target?.alive && item.position.distanceToSquared(target.position) < 12) {
            destroyEnemy(item.targetIndex);
            item.active = false;
          }
        } else if (!item.playerOwned && item.position.distanceToSquared(playerRoot.position) < 850) {
          // Enemy impact near the capital ship: spark against a random hull point.
          tmp.copy(playerRoot.position).add(new THREE.Vector3(
            THREE.MathUtils.randFloatSpread(28),
            THREE.MathUtils.randFloatSpread(10),
            THREE.MathUtils.randFloatSpread(62),
          ));
          spawnImpact(tmp, false);
          item.active = false;
        }

        if (item.life <= 0) item.active = false;
      }

      if (item.active) {
        const dir = tmp.copy(item.velocity).normalize();
        tmpQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
        tmpMatrix.compose(item.position, tmpQuat, tmp2.set(1, 1, 1));
      } else {
        tmpMatrix.compose(tmp.set(0, -9999, 0), tmpQuat.identity(), tmp2.setScalar(0));
      }
      this.mesh.setMatrixAt(i, tmpMatrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const playerBolts = new BoltSystem({ max: 900, color: 0x7cdfff, glowColor: 0x45c8ff, speed: 245, length: 4.4 });
const enemyBolts = new BoltSystem({ max: 1400, color: 0xff633d, glowColor: 0xff3f25, speed: 175, length: 3.0 });

// -----------------------------------------------------------------------------
// Explosions, sparks and transient beams
// -----------------------------------------------------------------------------
const explosions = [];
const beams = [];
const sparkGeometry = new THREE.BoxGeometry(.14, .14, 1.6);
const sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xffc56d, transparent: true, opacity: .95 });
const SPARK_MAX = 950;
const sparkMesh = new THREE.InstancedMesh(sparkGeometry, sparkMaterial, SPARK_MAX);
sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(sparkMesh);
const sparks = Array.from({ length: SPARK_MAX }, () => ({
  active: false,
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  life: 0,
  maxLife: 1,
}));
let sparkCursor = 0;

function spawnSparks(position, count = 18, power = 26) {
  for (let j = 0; j < count; j += 1) {
    const s = sparks[sparkCursor];
    sparkCursor = (sparkCursor + 1) % SPARK_MAX;
    s.active = true;
    s.position.copy(position);
    s.velocity.set(
      THREE.MathUtils.randFloatSpread(1),
      THREE.MathUtils.randFloatSpread(1),
      THREE.MathUtils.randFloatSpread(1),
    ).normalize().multiplyScalar(THREE.MathUtils.randFloat(power * .35, power));
    s.life = THREE.MathUtils.randFloat(.45, 1.45);
    s.maxLife = s.life;
  }
}

function spawnExplosion(position, large = false) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: large ? goldGlowTex : redGlowTex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 1,
  }));
  sprite.position.copy(position);
  const base = large ? 13 : 7;
  sprite.scale.set(base, base, 1);
  scene.add(sprite);
  explosions.push({ sprite, life: large ? 1.25 : .82, maxLife: large ? 1.25 : .82, base });
  spawnSparks(position, large ? 34 : 18, large ? 42 : 26);
}

function spawnImpact(position, large = false) {
  spawnExplosion(position, large);
}

function updateEffects(dt) {
  for (let i = explosions.length - 1; i >= 0; i -= 1) {
    const e = explosions[i];
    e.life -= dt;
    const a = Math.max(0, e.life / e.maxLife);
    e.sprite.material.opacity = a;
    const s = e.base * (1 + (1 - a) * 3.2);
    e.sprite.scale.set(s, s, 1);
    if (e.life <= 0) {
      scene.remove(e.sprite);
      e.sprite.material.dispose();
      explosions.splice(i, 1);
    }
  }

  for (let i = 0; i < SPARK_MAX; i += 1) {
    const s = sparks[i];
    if (s.active) {
      s.position.addScaledVector(s.velocity, dt);
      s.velocity.multiplyScalar(Math.pow(.985, dt * 60));
      s.life -= dt;
      if (s.life <= 0) s.active = false;
    }
    if (s.active) {
      const dir = tmp.copy(s.velocity).normalize();
      tmpQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      const sc = Math.max(.08, s.life / s.maxLife);
      tmpMatrix.compose(s.position, tmpQuat, tmp2.set(sc, sc, 1));
    } else {
      tmpMatrix.compose(tmp.set(0, -9999, 0), tmpQuat.identity(), tmp2.setScalar(0));
    }
    sparkMesh.setMatrixAt(i, tmpMatrix);
  }
  sparkMesh.instanceMatrix.needsUpdate = true;

  for (let i = beams.length - 1; i >= 0; i -= 1) {
    const b = beams[i];
    b.life -= dt;
    b.mesh.material.opacity = Math.max(0, b.life / b.maxLife);
    if (b.life <= 0) {
      scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      b.mesh.material.dispose();
      beams.splice(i, 1);
    }
  }
}

function createBeam(start, end, color = 0x72d9ff, width = .34, life = .28) {
  const direction = tmp.copy(end).sub(start);
  const length = direction.length();
  if (length < .1) return;
  const geometry = new THREE.CylinderGeometry(width, width, length, 6);
  geometry.rotateX(Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: .92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
  scene.add(mesh);
  beams.push({ mesh, life, maxLife: life });
}

function destroyEnemy(index) {
  const e = enemyData[index];
  if (!e || !e.alive || index >= activeEnemyCount()) return;
  e.alive = false;
  e.respawn = THREE.MathUtils.randFloat(.9, 2.8);
  spawnExplosion(e.position, Math.random() < .22);
  if (Math.random() < .35) {
    flash(0.11, 'rgba(255,180,70,1)');
  }
}

function nearestLivingEnemy(preferNear = true) {
  const count = activeEnemyCount();
  let best = -1;
  let bestScore = Infinity;
  for (let tries = 0; tries < 20; tries += 1) {
    const i = Math.floor(Math.random() * count);
    const e = enemyData[i];
    if (!e.alive) continue;
    const d = e.position.distanceTo(playerRoot.position);
    const score = preferNear ? d : Math.random() * 1000;
    if (score < bestScore) { bestScore = score; best = i; }
  }
  return best;
}

function randomPlayerGunPosition(out = new THREE.Vector3()) {
  const mounts = [
    [-15, 3.8, -23], [-9, 5.2, -31], [-3, 6.0, -34], [3, 6.0, -34],
    [9, 5.2, -31], [15, 3.8, -23], [-16, -2, -13], [16, -2, -13],
    [-12, 2, 4], [12, 2, 4],
  ];
  const m = mounts[Math.floor(Math.random() * mounts.length)];
  out.set(m[0], m[1], m[2]).applyQuaternion(playerRoot.quaternion).add(playerRoot.position);
  return out;
}

function firePlayerBurst(shots = 8, spread = .03) {
  for (let j = 0; j < shots; j += 1) {
    const targetIndex = nearestLivingEnemy(true);
    if (targetIndex < 0) return;
    const enemy = enemyData[targetIndex];
    const start = randomPlayerGunPosition(new THREE.Vector3());
    const direction = enemy.position.clone().sub(start).normalize();
    direction.x += THREE.MathUtils.randFloatSpread(spread);
    direction.y += THREE.MathUtils.randFloatSpread(spread);
    direction.z += THREE.MathUtils.randFloatSpread(spread);
    playerBolts.fire(start, direction, {
      targetIndex,
      playerOwned: true,
      speed: THREE.MathUtils.randFloat(215, 285),
      life: 3.0,
    });
  }
}

function fireEnemyBurst(shots = 6) {
  const count = activeEnemyCount();
  for (let j = 0; j < shots; j += 1) {
    const index = Math.floor(Math.random() * count);
    const e = enemyData[index];
    if (!e.alive || e.position.distanceTo(playerRoot.position) > 340) continue;
    const start = e.position.clone();
    const aim = playerRoot.position.clone().add(new THREE.Vector3(
      THREE.MathUtils.randFloatSpread(24),
      THREE.MathUtils.randFloatSpread(9),
      THREE.MathUtils.randFloatSpread(52),
    ));
    const direction = aim.sub(start).normalize();
    enemyBolts.fire(start, direction, {
      playerOwned: false,
      speed: THREE.MathUtils.randFloat(155, 220),
      life: 3.2,
    });
  }
}

function firePlayerBeam() {
  const targetIndex = nearestLivingEnemy(true);
  if (targetIndex < 0) return;
  const target = enemyData[targetIndex];
  const start = randomPlayerGunPosition(new THREE.Vector3());
  createBeam(start, target.position, 0x8de9ff, .28, .22);
  if (Math.random() < .72) destroyEnemy(targetIndex);
}

// -----------------------------------------------------------------------------
// Course / movement
// -----------------------------------------------------------------------------
function setCourseLabel(label) {
  state.courseMode = label;
  courseLabelEl.textContent = label;

  // Manual flight input cancels only the current scripted motion. It does not
  // erase completed Library stages, so the DM can pause, manoeuvre, then resume.
  if (!label.startsWith('LIBRARY')) state.libraryMotion = null;
}

function turnPort() {
  state.targetYaw += THREE.MathUtils.degToRad(24);
  setCourseLabel('PORT TURN');
}

function turnStarboard() {
  state.targetYaw -= THREE.MathUtils.degToRad(24);
  setCourseLabel('STARBOARD TURN');
}

function levelForward() {
  state.targetPitch = 0;
  setCourseLabel('FORWARD');
}

function ascend() {
  state.targetPitch = THREE.MathUtils.clamp(
    state.targetPitch + THREE.MathUtils.degToRad(12),
    THREE.MathUtils.degToRad(-42),
    THREE.MathUtils.degToRad(42),
  );
  setCourseLabel('ASCENDING');
}

function descend() {
  state.targetPitch = THREE.MathUtils.clamp(
    state.targetPitch - THREE.MathUtils.degToRad(12),
    THREE.MathUtils.degToRad(-42),
    THREE.MathUtils.degToRad(42),
  );
  setCourseLabel('DESCENDING');
}

function initialiseLibraryJourney() {
  state.libraryJourneyOrigin = playerRoot.position.clone();

  // Stop on the approach side of the cathedral instead of inside its geometry.
  const approachDirection = state.libraryJourneyOrigin.clone()
    .sub(CATHEDRAL_POSITION)
    .normalize();

  state.libraryStopPoint = CATHEDRAL_POSITION.clone()
    .addScaledVector(approachDirection, LIBRARY_STANDOFF_DISTANCE);
}

function updateLibraryButtonLabel() {
  if (state.libraryStage >= 3 && !state.libraryMotion) {
    cathedralBtn.textContent = 'AT THE LIBRARY';
    return;
  }
  const next = Math.min(3, state.libraryStage + 1);
  cathedralBtn.textContent = `THE LIBRARY ${next}/3`;
}

function setCourseToCathedral() {
  // Do not skip stages if G/the button is pressed repeatedly during a segment.
  if (state.libraryMotion) return;

  if (state.libraryStage >= 3) {
    state.courseMode = 'LIBRARY HOLD';
    courseLabelEl.textContent = 'LIBRARY HOLD';
    updateLibraryButtonLabel();
    return;
  }

  if (!state.libraryJourneyOrigin || !state.libraryStopPoint) {
    initialiseLibraryJourney();
  }

  const stageIndex = state.libraryStage;
  const fraction = LIBRARY_STAGE_FRACTIONS[stageIndex];
  const duration = LIBRARY_STAGE_DURATIONS[stageIndex];

  const target = state.libraryJourneyOrigin.clone().lerp(state.libraryStopPoint, fraction);
  state.libraryStage += 1;
  state.libraryMotion = {
    stage: state.libraryStage,
    start: playerRoot.position.clone(),
    target,
    elapsed: 0,
    duration,
  };

  state.courseMode = `LIBRARY APPROACH ${state.libraryStage}/3`;
  courseLabelEl.textContent = state.courseMode;
  cathedralBtn.textContent = `APPROACHING ${state.libraryStage}/3`;
}

function faceLibrary(dt) {
  enemyTargetVec.copy(CATHEDRAL_POSITION).sub(playerRoot.position);
  if (enemyTargetVec.lengthSq() < .001) return;

  enemyTargetVec.normalize();
  state.targetYaw = Math.atan2(-enemyTargetVec.x, -enemyTargetVec.z);
  state.targetPitch = Math.asin(THREE.MathUtils.clamp(enemyTargetVec.y, -1, 1));

  const desired = tmpQuat.setFromEuler(tmpEuler.set(
    state.targetPitch,
    state.targetYaw,
    0,
    'YXZ',
  ));
  playerRoot.quaternion.slerp(desired, 1 - Math.pow(.001, dt));
}

function updatePlayer(dt, t) {
  if (state.libraryMotion) {
    const motion = state.libraryMotion;
    motion.elapsed = Math.min(motion.duration, motion.elapsed + dt);

    const linear = THREE.MathUtils.clamp(motion.elapsed / motion.duration, 0, 1);
    // Smoothstep gives the ship a capital-ship acceleration/deceleration feel.
    const eased = linear * linear * (3 - 2 * linear);
    playerRoot.position.lerpVectors(motion.start, motion.target, eased);
    faceLibrary(dt);

    if (linear >= 1) {
      state.libraryMotion = null;
      state.courseMode = state.libraryStage >= 3
        ? 'LIBRARY HOLD'
        : `LIBRARY HOLD ${state.libraryStage}/3`;
      courseLabelEl.textContent = state.courseMode;
      updateLibraryButtonLabel();
    }
  } else if (state.courseMode.startsWith('LIBRARY HOLD')) {
    // Explicitly hold position between presses. This is the pacing control:
    // 20 s to 20%, 15 s to 50%, then 20 s to the cathedral stand-off point.
    faceLibrary(dt);
  } else {
    const desired = tmpQuat.setFromEuler(tmpEuler.set(
      state.targetPitch,
      state.targetYaw,
      0,
      'YXZ',
    ));
    playerRoot.quaternion.slerp(desired, 1 - Math.pow(.001, dt));

    playerForward(tmp);
    playerRoot.position.addScaledVector(tmp, PLAYER_SPEED * dt);

    // Gentle capital-ship banking makes turns readable but remains suitable as a
    // tabletop background rather than a twitch-flight game.
    const currentYaw = tmpEuler.setFromQuaternion(playerRoot.quaternion, 'YXZ').y;
    const yawError = THREE.MathUtils.euclideanModulo(
      state.targetYaw - currentYaw + Math.PI,
      Math.PI * 2,
    ) - Math.PI;
    playerRoot.rotation.z = THREE.MathUtils.lerp(
      playerRoot.rotation.z,
      THREE.MathUtils.clamp(yawError * -.22, -.16, .16),
      dt * 2.4,
    );
  }

  // Keep the star sphere centred on the player so travel can continue forever.
  starField.position.copy(playerRoot.position);
  nebulaA.position.lerp(
    playerRoot.position.clone().add(new THREE.Vector3(-270, 100, -480)),
    dt * .018,
  );
  nebulaB.position.lerp(
    playerRoot.position.clone().add(new THREE.Vector3(340, -130, -660)),
    dt * .014,
  );

  // Engine pulse.
  playerRoot.children.forEach((child) => {
    if (!child.isGroup) return;
    child.children.forEach((sub) => {
      if (sub.isSprite) {
        const s = 8.2 + Math.sin(t * 6 + sub.position.x) * .8;
        sub.scale.set(s, s, 1);
      }
    });
  });
}

// -----------------------------------------------------------------------------
// Camera
// -----------------------------------------------------------------------------
function localToWorldOffset(local) {
  return local.clone().applyQuaternion(playerRoot.quaternion).add(playerRoot.position);
}

function updateCamera(dt) {
  const name = state.cameraNames[state.cameraIndex];
  let desiredPos;
  let lookAt;

  if (name === 'CINEMATIC') {
    desiredPos = localToWorldOffset(new THREE.Vector3(72, 40, 124));
    lookAt = localToWorldOffset(new THREE.Vector3(0, 5, -26));
  } else if (name === 'BROADSIDE') {
    desiredPos = localToWorldOffset(new THREE.Vector3(138, 20, 12));
    lookAt = playerRoot.position.clone();
  } else if (name === 'CHASE') {
    desiredPos = localToWorldOffset(new THREE.Vector3(0, 22, 126));
    lookAt = localToWorldOffset(new THREE.Vector3(0, 2, -90));
  } else if (name === 'HELM') {
    desiredPos = localToWorldOffset(new THREE.Vector3(0, 13, -10));
    lookAt = localToWorldOffset(new THREE.Vector3(0, 10, -220));
  } else {
    desiredPos = localToWorldOffset(new THREE.Vector3(38, 30, 118));
    lookAt = CATHEDRAL_POSITION.clone();
  }

  camera.position.lerp(desiredPos, 1 - Math.pow(.018, dt));
  camera.lookAt(lookAt);
}

function cycleCamera() {
  state.cameraIndex = (state.cameraIndex + 1) % state.cameraNames.length;
  cameraBtn.textContent = `Camera: ${titleCase(state.cameraNames[state.cameraIndex])}`;
}

function cycleIntensity() {
  state.intensityIndex = (state.intensityIndex + 1) % state.intensityNames.length;
  intensityBtn.textContent = `Intensity: ${titleCase(state.intensityNames[state.intensityIndex])}`;
  // Fleet size is intentionally fixed at 1,000. Intensity only changes how much
  // firing, destruction and beam activity happens around those same ships.
}

function titleCase(value) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

// -----------------------------------------------------------------------------
// Narration events
// -----------------------------------------------------------------------------
let messageTimer = null;
function showEvent(html, variant) {
  clearTimeout(messageTimer);
  eventMessageEl.className = `event-message event-message--${variant}`;
  eventMessageEl.innerHTML = html;
  // Restart CSS animation.
  void eventMessageEl.offsetWidth;
  eventMessageEl.classList.add('is-visible');
  messageTimer = setTimeout(() => eventMessageEl.classList.remove('is-visible'), 4450);
}

function shieldDown() {
  showEvent('SHIELDS ARE DOWN', 'danger');
  flash(.36, 'rgba(255,24,48,1)');
  // Hull impacts immediately sell the loss of shielding.
  for (let i = 0; i < 12; i += 1) {
    const p = playerRoot.position.clone().add(new THREE.Vector3(
      THREE.MathUtils.randFloatSpread(34),
      THREE.MathUtils.randFloatSpread(14),
      THREE.MathUtils.randFloatSpread(72),
    ));
    spawnImpact(p, i < 3);
  }
  fireEnemyBurst(36);
}

function libraryLearns() {
  showEvent('THE LIBRARY LEARNS<small>THE LIBRARY HAS NOTED DOWN YOUR ACTIONS</small>', 'library');
  state.pageBurst = 1;
  flash(.24, 'rgba(255,217,129,1)');
  cathedralLight.intensity = 2900;
  setTimeout(() => { cathedralLight.intensity = 1000; }, 1200);
}

function flash(strength = .18, color = 'white') {
  flashEl.style.background = color;
  flashEl.animate(
    [{ opacity: strength }, { opacity: 0 }],
    { duration: 260, easing: 'ease-out' },
  );
}

function playerVolley() {
  firePlayerBurst(80, .065);
  for (let i = 0; i < 7; i += 1) {
    setTimeout(() => firePlayerBurst(22, .055), i * 110);
  }
  flash(.14, 'rgba(105,218,255,1)');
}

function enemyWave() {
  // Change steering logic only. Existing enemy positions are untouched, so the
  // fleet visibly bends into a new formation instead of popping elsewhere.
  state.wavePatternIndex = (state.wavePatternIndex + 1) % state.wavePatternNames.length;
  const pattern = state.wavePatternNames[state.wavePatternIndex];

  waveBtn.innerHTML = `Enemy Wave: ${titleCase(pattern)} <kbd>W</kbd>`;
  showEvent(`HOSTILE FORMATION<small>${pattern}</small>`, 'danger');
  fireEnemyBurst(52);
  flash(.12, 'rgba(255,89,52,1)');
}

function togglePause() {
  state.paused = !state.paused;
  pauseBtn.innerHTML = state.paused ? 'Resume <kbd>P</kbd>' : 'Pause <kbd>P</kbd>';
}

// -----------------------------------------------------------------------------
// Input
// -----------------------------------------------------------------------------
cameraBtn.addEventListener('click', cycleCamera);
intensityBtn.addEventListener('click', cycleIntensity);
volleyBtn.addEventListener('click', playerVolley);
waveBtn.addEventListener('click', enemyWave);
pauseBtn.addEventListener('click', togglePause);
shieldBtn.addEventListener('click', shieldDown);
libraryBtn.addEventListener('click', libraryLearns);

portBtn.addEventListener('click', turnPort);
starboardBtn.addEventListener('click', turnStarboard);
forwardBtn.addEventListener('click', levelForward);
ascendBtn.addEventListener('click', ascend);
descendBtn.addEventListener('click', descend);
cathedralBtn.addEventListener('click', setCourseToCathedral);

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  const key = event.key.toLowerCase();
  if (key === 'c') cycleCamera();
  else if (key === 'i') cycleIntensity();
  else if (key === 'v') playerVolley();
  else if (key === 'w') enemyWave();
  else if (key === 'p') togglePause();
  else if (key === 's') shieldDown();
  else if (key === 'l') libraryLearns();
  else if (key === 'arrowleft') { event.preventDefault(); turnPort(); }
  else if (key === 'arrowright') { event.preventDefault(); turnStarboard(); }
  else if (key === 'arrowup') { event.preventDefault(); levelForward(); }
  else if (key === 'r') ascend();
  else if (key === 'f') descend();
  else if (key === 'g') setCourseToCathedral();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
});

// -----------------------------------------------------------------------------
// Main battle loop
// -----------------------------------------------------------------------------
function updateBattle(dt) {
  state.elapsed += dt;
  const t = state.elapsed;

  updatePlayer(dt, t);
  updateEnemyInstances(dt, t);
  updatePages(t, dt);

  const intensity = state.intensityIndex;

  // Prometheus constantly fires. Even DRIFT remains an active battle scene.
  state.playerFireTimer -= dt;
  if (state.playerFireTimer <= 0) {
    firePlayerBurst(intensity === 2 ? 10 : intensity === 1 ? 7 : 4, .035);
    state.playerFireTimer = intensity === 2 ? .055 : intensity === 1 ? .085 : .14;
  }

  state.enemyFireTimer -= dt;
  if (state.enemyFireTimer <= 0) {
    fireEnemyBurst(intensity === 2 ? 14 : intensity === 1 ? 9 : 5);
    state.enemyFireTimer = intensity === 2 ? .06 : intensity === 1 ? .095 : .16;
  }

  state.destructionTimer -= dt;
  if (state.destructionTimer <= 0) {
    const target = nearestLivingEnemy(true);
    if (target >= 0 && enemyData[target].position.distanceTo(playerRoot.position) < 390) destroyEnemy(target);
    state.destructionTimer = intensity === 2 ? .18 : intensity === 1 ? .34 : .62;
  }

  state.beamTimer -= dt;
  if (state.beamTimer <= 0) {
    firePlayerBeam();
    state.beamTimer = intensity === 2 ? .52 : intensity === 1 ? .82 : 1.3;
  }

  playerBolts.update(dt);
  enemyBolts.update(dt);
  updateEffects(dt);

  // Slowly rotate cathedral astral rings and pulse the library aura.
  cathedral.children.forEach((child, index) => {
    if (child.geometry?.type === 'TorusGeometry') child.rotation.z += dt * (.035 + index * .001);
  });
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .04);
  if (!state.paused) updateBattle(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
}

// -----------------------------------------------------------------------------
// Boot
// -----------------------------------------------------------------------------
async function boot() {
  await Promise.all([loadPlayerModel(), loadDetailedEnemies()]);
  loadingDetailEl.textContent = 'Battle ready';
  setTimeout(() => loadingEl.classList.add('is-hidden'), 260);
  firePlayerBurst(36, .055);
  animate();
}

boot();
