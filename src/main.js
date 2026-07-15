import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';
import {
  ROPE_DEFS,
  applyTurn,
  createEmptyState,
  createInitialState,
  directionLabel,
  findPair,
  isSolved,
  pairKey,
  totalAbsoluteTurns,
  undo,
} from './topology.js';

const canvas = document.querySelector('#scene');
const turnCount = document.querySelector('#turn-count');
const moveCount = document.querySelector('#move-count');
const ropePicker = document.querySelector('#rope-picker');
const selectionCopy = document.querySelector('#selection-copy');
const twistWheel = document.querySelector('#twist-wheel');
const wheelKnob = document.querySelector('#wheel-knob');
const wheelValue = document.querySelector('#wheel-value');
const wheelPreview = document.querySelector('#wheel-preview');
const cwButton = document.querySelector('#cw-button');
const ccwButton = document.querySelector('#ccw-button');
const undoButton = document.querySelector('#undo-button');
const resetButton = document.querySelector('#reset-button');
const clearButton = document.querySelector('#clear-button');
const wrapList = document.querySelector('#wrap-list');
const statusPill = document.querySelector('#status-pill');
const toast = document.querySelector('#toast');
const winOverlay = document.querySelector('#win-overlay');
const winCopy = document.querySelector('#win-copy');
const playAgain = document.querySelector('#play-again');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1018);
scene.fog = new THREE.FogExp2(0x0d1018, 0.028);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
camera.position.set(10.5, 11.5, 13.8);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.target.set(0, 0.2, 0);
controls.minDistance = 9;
controls.maxDistance = 28;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minPolarAngle = Math.PI * 0.18;

scene.add(new THREE.HemisphereLight(0xaac8ff, 0x25190f, 2.2));
const keyLight = new THREE.DirectionalLight(0xfff1d7, 4.3);
keyLight.position.set(4, 10, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -12;
keyLight.shadow.camera.right = 12;
keyLight.shadow.camera.top = 12;
keyLight.shadow.camera.bottom = -12;
scene.add(keyLight);
const rimLight = new THREE.PointLight(0x6e82ff, 18, 28);
rimLight.position.set(-7, 5, -6);
scene.add(rimLight);

const table = new THREE.Mesh(
  new THREE.CylinderGeometry(6.35, 6.55, 0.48, 80),
  new THREE.MeshStandardMaterial({ color: 0x33261d, roughness: 0.58, metalness: 0.06 }),
);
table.position.y = -0.28;
table.receiveShadow = true;
scene.add(table);

const tableInset = new THREE.Mesh(
  new THREE.CylinderGeometry(6.05, 6.05, 0.055, 80),
  new THREE.MeshStandardMaterial({ color: 0x171b25, roughness: 0.82, metalness: 0.08 }),
);
tableInset.position.y = -0.005;
tableInset.receiveShadow = true;
scene.add(tableInset);

const rings = [2.1, 4.1, 5.7];
for (const radius of rings) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.012, 5, 120),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.065 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.035;
  scene.add(ring);
}

const ropeGroup = new THREE.Group();
const handleGroup = new THREE.Group();
scene.add(ropeGroup, handleGroup);

const ropeMeshes = new Map();
const ropeMaterials = new Map();
const baseRopeMaterials = new Map();

for (const rope of ROPE_DEFS) {
  const color = new THREE.Color(rope.color);
  const material = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.68,
    metalness: 0.02,
    clearcoat: 0.22,
    clearcoatRoughness: 0.7,
  });
  baseRopeMaterials.set(rope.id, material);
  ropeMaterials.set(rope.id, material);

  for (const x of [-5.55, 5.55]) {
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.68, 18),
      new THREE.MeshStandardMaterial({ color: 0xd69a50, roughness: 0.62 }),
    );
    handle.rotation.z = Math.PI / 2;
    handle.position.set(x, 0.52, rope.z);
    handle.castShadow = true;
    handle.userData.ropeId = rope.id;
    handleGroup.add(handle);
  }
}

const pairSlots = new Map();
const allPairs = [];
for (let i = 0; i < ROPE_DEFS.length; i += 1) {
  for (let j = i + 1; j < ROPE_DEFS.length; j += 1) {
    allPairs.push([ROPE_DEFS[i].id, ROPE_DEFS[j].id]);
  }
}
const slotCenters = [-4.15, -2.5, -0.84, 0.84, 2.5, 4.15];
allPairs.forEach(([a, b], index) => pairSlots.set(pairKey(a, b), slotCenters[index]));

const gizmo = new THREE.Group();
const gizmoRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.69, 0.035, 10, 80),
  new THREE.MeshBasicMaterial({ color: 0xb9ff66, transparent: true, opacity: 0.5, depthTest: false }),
);
gizmoRing.rotation.y = Math.PI / 2;
const gizmoArrow = new THREE.Mesh(
  new THREE.ConeGeometry(0.12, 0.35, 18),
  new THREE.MeshBasicMaterial({ color: 0xb9ff66, depthTest: false }),
);
gizmoArrow.rotation.z = -Math.PI / 2;
gizmoArrow.position.set(0, 0.7, 0);
gizmo.add(gizmoRing, gizmoArrow);
gizmo.visible = false;
scene.add(gizmo);

let state = createInitialState();
let movingId = null;
let targetId = null;
let previewDelta = 0;
let pointerSelectionStart = null;
let toastTimer = null;
let winShown = false;

function ropeById(id) {
  return ROPE_DEFS.find((rope) => rope.id === id);
}

function selectedPair() {
  if (!movingId || !targetId) return null;
  return findPair(state, movingId, targetId) ?? { moving: movingId, target: targetId, turns: 0 };
}

function turnsForRendering(wrap) {
  const selected = selectedPair();
  if (!selected || !wrap) return wrap?.turns ?? 0;
  const samePair = pairKey(selected.moving, selected.target) === pairKey(wrap.moving, wrap.target);
  return wrap.turns + (samePair ? previewDelta : 0);
}

function activeWrapsForRendering() {
  const wraps = state.wraps.map((wrap) => ({ ...wrap, turns: turnsForRendering(wrap) }));
  const selected = selectedPair();
  if (selected && !findPair(state, selected.moving, selected.target) && Math.abs(previewDelta) > 0.001) {
    wraps.push({ moving: selected.moving, target: selected.target, turns: previewDelta });
  }
  return wraps;
}

function smoothEnvelope(u) {
  const s = Math.sin(Math.PI * u);
  return s * s;
}

function createRopeCurve(rope) {
  const points = [];
  const wraps = activeWrapsForRendering().filter((wrap) => wrap.moving === rope.id && Math.abs(wrap.turns) > 0.001);
  const segments = 180;

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const x = THREE.MathUtils.lerp(-5.42, 5.42, t);
    let y = 0.56;
    let z = rope.z;

    for (const wrap of wraps) {
      const center = pairSlots.get(pairKey(wrap.moving, wrap.target));
      const halfWidth = 0.73;
      if (x < center - halfWidth || x > center + halfWidth) continue;
      const u = (x - (center - halfWidth)) / (halfWidth * 2);
      const envelope = smoothEnvelope(u);
      const target = ropeById(wrap.target);
      const radius = 0.43;
      const angle = u * Math.PI * 2 * wrap.turns - Math.PI / 2;
      y += envelope * (0.34 + radius * Math.sin(angle));
      z += envelope * ((target.z - rope.z) + radius * Math.cos(angle));
    }

    points.push(new THREE.Vector3(x, y, z));
  }

  return new THREE.CatmullRomCurve3(points, false, 'centripetal');
}

function rebuildRopes() {
  for (const rope of ROPE_DEFS) {
    const oldMesh = ropeMeshes.get(rope.id);
    if (oldMesh) {
      ropeGroup.remove(oldMesh);
      oldMesh.geometry.dispose();
    }

    const curve = createRopeCurve(rope);
    const geometry = new THREE.TubeGeometry(curve, 180, 0.125, 10, false);
    const mesh = new THREE.Mesh(geometry, ropeMaterials.get(rope.id));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.ropeId = rope.id;
    ropeMeshes.set(rope.id, mesh);
    ropeGroup.add(mesh);
  }
  updateRopeHighlights();
}

function updateRopeHighlights() {
  for (const rope of ROPE_DEFS) {
    const material = baseRopeMaterials.get(rope.id);
    const mesh = ropeMeshes.get(rope.id);
    mesh.material = material;
    material.emissive.set(rope.color);
    material.emissiveIntensity = rope.id === movingId ? 0.34 : rope.id === targetId ? 0.18 : 0.02;
    material.opacity = movingId && rope.id !== movingId && rope.id !== targetId ? 0.6 : 1;
    material.transparent = material.opacity < 1;
  }
}

function updateGizmo() {
  const pair = selectedPair();
  gizmo.visible = Boolean(pair);
  if (!pair) return;
  const target = ropeById(pair.target);
  gizmo.position.set(pairSlots.get(pairKey(pair.moving, pair.target)), 0.58, target.z);
  const moving = ropeById(pair.moving);
  gizmoRing.material.color.set(moving.color);
  gizmoArrow.material.color.set(moving.color);
  gizmo.rotation.x = previewDelta * Math.PI * 2;
}

function selectRope(id) {
  if (!movingId || (movingId && targetId)) {
    movingId = id;
    targetId = null;
    previewDelta = 0;
  } else if (id === movingId) {
    movingId = null;
  } else {
    const existing = findPair(state, movingId, id);
    if (existing) {
      movingId = existing.moving;
      targetId = existing.target;
    } else {
      targetId = id;
    }
  }
  renderAll({ rebuild: false });
}

function selectPair(moving, target) {
  movingId = moving;
  targetId = target;
  previewDelta = 0;
  renderAll({ rebuild: false });
}

function signed(value) {
  return value > 0 ? `+${value}` : `${value}`;
}

function renderPicker() {
  ropePicker.replaceChildren();
  for (const rope of ROPE_DEFS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `rope-chip${rope.id === movingId ? ' moving' : ''}${rope.id === targetId ? ' target' : ''}`;
    button.style.setProperty('--rope', rope.color);
    button.textContent = rope.name;
    button.setAttribute('aria-pressed', String(rope.id === movingId || rope.id === targetId));
    button.addEventListener('click', () => selectRope(rope.id));
    ropePicker.append(button);
  }
}

function renderSelection() {
  const pair = selectedPair();
  const ready = Boolean(pair);
  twistWheel.classList.toggle('ready', ready);
  cwButton.disabled = !ready;
  ccwButton.disabled = !ready;
  twistWheel.setAttribute('aria-disabled', String(!ready));

  if (!movingId) {
    selectionCopy.textContent = '先選擇要移動的繩索，再選擇目標繩索。';
    wheelValue.textContent = '選擇繩索';
    wheelPreview.textContent = '拖曳圓點繞一圈';
    return;
  }

  if (!targetId) {
    selectionCopy.textContent = `已選 ${ropeById(movingId).name}；現在選擇它要繞行的目標。`;
    wheelValue.textContent = ropeById(movingId).name;
    wheelPreview.textContent = '還需要目標繩索';
    return;
  }

  const moving = ropeById(pair.moving);
  const target = ropeById(pair.target);
  const current = findPair(state, pair.moving, pair.target)?.turns ?? 0;
  selectionCopy.textContent = `${moving.name}繞${target.name}；反向操作可減少現有圈數。`;
  wheelValue.textContent = `${signed(current)} 圈`;
  wheelPreview.textContent = previewDelta
    ? `預覽 ${signed(Math.round((current + previewDelta) * 100) / 100)} 圈`
    : `${moving.name} → ${target.name}`;
  twistWheel.setAttribute('aria-valuenow', String(current));
}

function renderLedger() {
  wrapList.replaceChildren();
  const active = [...state.wraps].sort((a, b) => pairSlots.get(pairKey(a.moving, a.target)) - pairSlots.get(pairKey(b.moving, b.target)));

  if (!active.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-ledger';
    empty.textContent = '所有纏繞數量均為 0。';
    wrapList.append(empty);
    return;
  }

  for (const wrap of active) {
    const moving = ropeById(wrap.moving);
    const target = ropeById(wrap.target);
    const button = document.createElement('button');
    button.type = 'button';
    const selected = movingId && targetId && pairKey(movingId, targetId) === pairKey(wrap.moving, wrap.target);
    button.className = `wrap-card${selected ? ' selected' : ''}`;
    button.innerHTML = `
      <span class="rope-pair" aria-hidden="true">
        <i class="rope-dot" style="background:${moving.color}"></i>
        <i class="rope-dot" style="background:${target.color}"></i>
      </span>
      <span><strong>${moving.name}繞${target.name}</strong><small>${directionLabel(wrap.turns)}</small></span>
      <span class="turn-badge ${wrap.turns > 0 ? 'plus' : 'minus'}">${signed(wrap.turns)}</span>
    `;
    button.addEventListener('click', () => selectPair(wrap.moving, wrap.target));
    wrapList.append(button);
  }
}

function renderMetrics() {
  const remaining = totalAbsoluteTurns(state);
  turnCount.textContent = `${remaining} 圈`;
  moveCount.textContent = String(state.moves);
  undoButton.disabled = state.history.length === 0;
  const solved = isSolved(state);
  statusPill.className = `status-pill ${solved ? 'solved' : 'tangled'}`;
  statusPill.textContent = solved ? '全部解開' : '尚未解開';
}

function renderAll({ rebuild = true } = {}) {
  renderPicker();
  renderSelection();
  renderLedger();
  renderMetrics();
  updateRopeHighlights();
  updateGizmo();
  if (rebuild) rebuildRopes();
}

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

function commitTurn(delta) {
  const pair = selectedPair();
  if (!pair || delta === 0) return;
  const before = findPair(state, pair.moving, pair.target)?.turns ?? 0;
  state = applyTurn(state, pair.moving, pair.target, delta);
  const afterPair = findPair(state, pair.moving, pair.target);
  const after = afterPair?.turns ?? 0;
  previewDelta = 0;
  notify(after === 0 ? `${ropeById(pair.moving).name}與${ropeById(pair.target).name}已解除` : `纏繞數 ${signed(before)} → ${signed(after)}`);
  renderAll();
  checkWin();
}

function checkWin() {
  if (!isSolved(state) || winShown) return;
  winShown = true;
  winCopy.textContent = `你用 ${state.moves} 步把 4 條繩索的實際纏繞數量降到 0。`;
  setTimeout(() => { winOverlay.hidden = false; }, 420);
}

cwButton.addEventListener('click', () => commitTurn(1));
ccwButton.addEventListener('click', () => commitTurn(-1));
undoButton.addEventListener('click', () => {
  state = undo(state);
  previewDelta = 0;
  winShown = false;
  winOverlay.hidden = true;
  renderAll();
  notify('已復原上一步');
});
resetButton.addEventListener('click', () => {
  state = createInitialState();
  movingId = null;
  targetId = null;
  previewDelta = 0;
  winShown = false;
  winOverlay.hidden = true;
  renderAll();
  notify('已重置為 6 圈纏繞');
});
clearButton.addEventListener('click', () => {
  state = { ...createEmptyState(), moves: state.moves + 1, history: [...state.history] };
  previewDelta = 0;
  renderAll();
  checkWin();
});
playAgain.addEventListener('click', () => resetButton.click());

let wheelDragging = false;
let lastWheelAngle = 0;
let wheelAccumulated = 0;
let wheelRenderRequested = false;

function angleFromPointer(event) {
  const rect = twistWheel.getBoundingClientRect();
  return Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2));
}

function requestPreviewRender() {
  if (wheelRenderRequested) return;
  wheelRenderRequested = true;
  requestAnimationFrame(() => {
    wheelRenderRequested = false;
    renderSelection();
    updateGizmo();
    rebuildRopes();
  });
}

wheelKnob.addEventListener('pointerdown', (event) => {
  if (!selectedPair()) return;
  wheelDragging = true;
  wheelAccumulated = 0;
  lastWheelAngle = angleFromPointer(event);
  wheelKnob.setPointerCapture(event.pointerId);
  controls.enabled = false;
});

wheelKnob.addEventListener('pointermove', (event) => {
  if (!wheelDragging) return;
  const angle = angleFromPointer(event);
  let delta = angle - lastWheelAngle;
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  wheelAccumulated += delta;
  lastWheelAngle = angle;
  previewDelta = wheelAccumulated / (Math.PI * 2);
  twistWheel.style.setProperty('--angle', `${-90 + THREE.MathUtils.radToDeg(wheelAccumulated)}deg`);
  requestPreviewRender();
});

function endWheelDrag(event) {
  if (!wheelDragging) return;
  wheelDragging = false;
  controls.enabled = true;
  if (wheelKnob.hasPointerCapture(event.pointerId)) wheelKnob.releasePointerCapture(event.pointerId);
  const revolutions = wheelAccumulated / (Math.PI * 2);
  let delta = Math.round(revolutions);
  if (delta === 0 && Math.abs(revolutions) >= 0.6) delta = Math.sign(revolutions);
  previewDelta = 0;
  wheelAccumulated = 0;
  twistWheel.style.setProperty('--angle', '-90deg');
  if (delta !== 0) commitTurn(delta);
  else {
    renderAll();
    notify('請沿旋轉環拖曳至少約 0.6 圈');
  }
}
wheelKnob.addEventListener('pointerup', endWheelDrag);
wheelKnob.addEventListener('pointercancel', endWheelDrag);
twistWheel.addEventListener('keydown', (event) => {
  if (!selectedPair()) return;
  if (event.key === 'ArrowRight' || event.key === 'ArrowUp') { event.preventDefault(); commitTurn(1); }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') { event.preventDefault(); commitTurn(-1); }
});

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
canvas.addEventListener('pointerdown', (event) => {
  pointerSelectionStart = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener('pointerup', (event) => {
  if (!pointerSelectionStart) return;
  const distance = Math.hypot(event.clientX - pointerSelectionStart.x, event.clientY - pointerSelectionStart.y);
  pointerSelectionStart = null;
  if (distance > 7) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([...ropeMeshes.values(), ...handleGroup.children], false);
  const ropeId = hits[0]?.object.userData.ropeId;
  if (ropeId) selectRope(ropeId);
});

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
});

function animate() {
  controls.update();
  gizmoArrow.position.y = 0.69 + Math.sin(performance.now() * 0.003) * 0.05;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

window.ropeDebug = {
  getState: () => structuredClone(state),
  getSelection: () => ({ movingId, targetId, previewDelta }),
  selectPair,
  turn: commitTurn,
  reset: () => resetButton.click(),
  solve: () => clearButton.click(),
  ropeCount: ROPE_DEFS.length,
};

rebuildRopes();
renderAll({ rebuild: false });
animate();
