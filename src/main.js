import './style.css';
import {
  ROPE_DEFS,
  addUnderpass,
  beginRope,
  countUnderpassClicks,
  countPassiveHooks,
  createAuthoringState,
  createGameState,
  finishRope,
  getEmptyHoles,
  isGameComplete,
  isRopeRemovable,
  moveEndpoint,
  removeRope,
  restartGame,
  undo,
  validatePuzzle,
} from './topology.js';
import {
  BOARD_CENTER,
  HOLE_HIT_RADIUS,
  buildPuzzleGeometry,
  findMovementContacts,
  holePoint,
  nearestHole,
  nearestTOnSamples,
  pathFromSamples,
  pointAndTangentAt,
  sampleCurve,
} from './geometry.js';
import { generatePlayablePuzzle } from './solver.js';
import { buildRenderStack } from './render-order.js';
import { assessGameStart, snapshotAuthoringStateForPlay } from './game-start.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const board = document.querySelector('#board');
const boardShell = document.querySelector('.board-shell');
const ropeLayer = document.querySelector('#rope-layer');
const crossingLayer = document.querySelector('#crossing-layer');
const previewLayer = document.querySelector('#preview-layer');
const moveLayer = document.querySelector('#move-layer');
const holeLayer = document.querySelector('#hole-layer');
const ropeCount = document.querySelector('#rope-count');
const holeCount = document.querySelector('#hole-count');
const emptyCount = document.querySelector('#empty-count');
const ropeCountLabel = document.querySelector('#rope-count-label');
const holeCountLabel = document.querySelector('#hole-count-label');
const emptyCountLabel = document.querySelector('#empty-count-label');
const modeLabel = document.querySelector('#mode-label');
const pageTitle = document.querySelector('#page-title');
const currentRope = document.querySelector('#current-rope');
const instruction = document.querySelector('#instruction');
const activeQuota = document.querySelector('#active-quota');
const undoButton = document.querySelector('#undo-button');
const sameSeedButton = document.querySelector('#same-seed-button');
const clearButton = document.querySelector('#clear-button');
const randomButton = document.querySelector('#random-button');
const startGameButton = document.querySelector('#start-game-button');
const restartGameButton = document.querySelector('#restart-game-button');
const backEditorButton = document.querySelector('#back-editor-button');
const ropeRoster = document.querySelector('#rope-roster');
const interactionList = document.querySelector('#interaction-list');
const interactionCount = document.querySelector('#interaction-count');
const validationPill = document.querySelector('#validation-pill');
const boardStatus = document.querySelector('#board-status');
const seedValue = document.querySelector('#seed-value');
const gameHud = document.querySelector('#game-hud');
const gameInstruction = document.querySelector('#game-instruction');
const victory = document.querySelector('#victory');
const victoryMoves = document.querySelector('#victory-moves');
const victoryRestart = document.querySelector('#victory-restart');
const victoryEditor = document.querySelector('#victory-editor');
const toast = document.querySelector('#toast');
const steps = {
  start: document.querySelector('#step-start'),
  wrap: document.querySelector('#step-wrap'),
  end: document.querySelector('#step-end'),
};

let state = createAuthoringState();
let authoringSnapshot = null;
let mode = 'author';
let selectedEndpoint = null;
let previewPoint = null;
let moveFlash = null;
let toastTimer = null;
let previewFrame = null;
let moveFlashTimer = null;

function svgElement(tag, attributes = {}, text = '') {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) element.setAttribute(name, String(value));
  }
  if (text) element.textContent = text;
  return element;
}

function ropeDefinition(id) {
  return ROPE_DEFS.find((rope) => rope.id === id);
}

function focusedGameRopeId() {
  if (mode !== 'game') return null;
  return selectedEndpoint?.ropeId ?? null;
}

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
}

function boardPointFromEvent(event) {
  const point = board.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(board.getScreenCTM().inverse());
}

function lineAround(point, tangent, halfLength = 31) {
  return {
    x1: point.x - tangent.x * halfLength,
    y1: point.y - tangent.y * halfLength,
    x2: point.x + tangent.x * halfLength,
    y2: point.y + tangent.y * halfLength,
  };
}

function requestAuthorWrap(event, rope) {
  event.stopPropagation();
  if (!state.draft) {
    notify('請先點擊空洞，開始放置新繩。');
    return;
  }
  try {
    const target = buildPuzzleGeometry(state).ropes.get(rope.id);
    const targetT = nearestTOnSamples(target.samples, boardPointFromEvent(event));
    state = addUnderpass(state, rope.id, targetT);
    const passCount = state.draft.wraps.filter((wrap) => wrap.targetRopeId === rope.id).length;
    notify(`${ropeDefinition(state.draft.ropeId).name}從${rope.name}下方穿過（第 ${passCount} 次）· 放下終點後才判定扭轉`);
    renderAll();
  } catch (error) {
    notify(error.message);
  }
}

function requestGameRope(event, rope) {
  event.stopPropagation();
  if (!isRopeRemovable(state, rope.id)) {
    const active = state.interactions
      .filter((interaction) => interaction.actorRopeId === rope.id || interaction.targetRopeId === rope.id)
      .reduce((sum, interaction) => sum + interaction.turns, 0);
    notify(`${rope.name}仍與其他繩索有 ${active} 層拓撲交纏；可移動任一端點解開`);
    return;
  }
  state = removeRope(state, rope.id);
  selectedEndpoint = null;
  notify(`已取下${rope.name} · 還剩 ${state.ropes.length} 條`);
  renderAll();
  if (isGameComplete(state)) showVictory();
}

function createCommittedRope(geometry, rope) {
  const data = geometry.ropes.get(rope.id);
  if (!data) return null;
  const removable = mode === 'game' && isRopeRemovable(state, rope.id);
  const selected = mode === 'game' && selectedEndpoint?.ropeId === rope.id;
  const focusedRopeId = focusedGameRopeId();
  const dimmed = mode === 'game' && focusedRopeId && focusedRopeId !== rope.id;
  const group = svgElement('g', {
    class: `rope-group${removable ? ' removable' : ''}${selected ? ' selected-rope' : ''}${dimmed ? ' dimmed-rope' : ''}`,
    'data-rope-id': rope.id,
  });
  if (removable) {
    group.append(svgElement('path', { class: 'rope-ready-glow', d: data.path, stroke: rope.color }));
  }
  group.append(
    svgElement('path', { class: 'rope-shadow', d: data.path }),
    svgElement('path', { class: 'rope-body', d: data.path, stroke: rope.color }),
    svgElement('path', { class: 'rope-shine', d: data.path }),
  );
  const hit = svgElement('path', {
    class: `rope-hit${mode === 'game' ? ' game-rope-hit' : ''}`,
    d: data.path,
    tabindex: '0',
    role: 'button',
    'aria-label': removable ? `取下${rope.name}` : mode === 'game' ? `${rope.name}尚不可取下` : `讓自由端從${rope.name}下方穿過`,
    'data-rope-id': rope.id,
  });
  const action = (event) => mode === 'game' ? requestGameRope(event, rope) : requestAuthorWrap(event, rope);
  hit.addEventListener('click', action);
  hit.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') action(event);
  });
  group.append(hit);
  return group;
}

function createVisualCrossing(crossing) {
  const actor = ropeDefinition(crossing.actorRopeId);
  const target = ropeDefinition(crossing.targetRopeId);
  const actorIsOver = crossing.order === 'actor-over';
  const tangent = actorIsOver ? crossing.actorTangent : crossing.tangent;
  const color = actorIsOver ? actor.color : target.color;
  const line = lineAround(crossing.point, tangent, 18);
  const group = svgElement('g', {
    class: 'visual-crossing',
    'data-crossing-id': crossing.id,
    'data-order': crossing.order,
  });
  group.append(
    svgElement('line', { class: 'visual-crossing-upper', ...line, stroke: color }),
    svgElement('line', { class: 'visual-crossing-shine', ...line }),
  );
  return group;
}

function createInteractionNode(interaction) {
  const actor = ropeDefinition(interaction.actorRopeId);
  const target = ropeDefinition(interaction.targetRopeId);
  const line = lineAround(interaction.point, interaction.tangent);
  const angle = Math.atan2(interaction.tangent.y, interaction.tangent.x) * 180 / Math.PI;
  const focusedRopeId = focusedGameRopeId();
  const focused = mode === 'game' && focusedRopeId
    && (focusedRopeId === interaction.actorRopeId || focusedRopeId === interaction.targetRopeId);
  // Split center bar for relative layer visualization.
  // Use head (A) and tail (B) positions relative to knot point projected on target tangent.
  // The half whose direction aligns with the "upper layer" end of blue gets actor color (per user example).
  const halfLen = 31;
  const p = interaction.point;
  const t = interaction.tangent;
  let posColor = target.color;
  let negColor = actor.color;
  const actorRope = state.ropes.find(r => r.id === interaction.actorRopeId);
  if (actorRope) {
    const endA = holePoint(actorRope.endpoints.A);
    const endB = holePoint(actorRope.endpoints.B);
    const vecA = {x: endA.x - p.x, y: endA.y - p.y};
    const vecB = {x: endB.x - p.x, y: endB.y - p.y};
    const projA = vecA.x * t.x + vecA.y * t.y;
    const projB = vecB.x * t.x + vecB.y * t.y;
    // If B end (often the moved end) is more "positive", color pos with actor to indicate that end on upper.
    if (projB > projA) {
      posColor = actor.color;
      negColor = target.color;
    }
  }
  const posLine = { x1: p.x, y1: p.y, x2: p.x + t.x * halfLen, y2: p.y + t.y * halfLen };
  const negLine = { x1: p.x, y1: p.y, x2: p.x - t.x * halfLen, y2: p.y - t.y * halfLen };
  const group = svgElement('g', {
    class: `interaction-node${mode === 'game' ? ' game-node' : ''}${focused ? ' focused' : ''}`,
    'data-interaction-id': interaction.id,
  });
  const loopOffsets = interaction.turns === 2 ? [-13, 13] : [0];
  for (const offset of loopOffsets) {
    const cx = interaction.point.x + interaction.tangent.x * offset;
    const cy = interaction.point.y + interaction.tangent.y * offset;
    group.append(svgElement('ellipse', {
      class: 'helix-loop', cx, cy, rx: 15, ry: 27, stroke: actor.color,
      transform: `rotate(${angle} ${cx} ${cy})`,
    }));
  }
  group.append(
    svgElement('line', { class: 'local-mask', ...line }),
    svgElement('line', { class: 'local-target-shadow', ...line }),
    svgElement('line', { class: 'local-target', ...posLine, stroke: target.color }),
    svgElement('line', { class: 'local-target', ...negLine, stroke: actor.color }),
    svgElement('line', { class: 'local-target-shine', ...line }),
    svgElement('circle', { class: `node-dot ${interaction.kind}`, cx: interaction.point.x, cy: interaction.point.y, r: 12, fill: actor.color }),
    svgElement('text', { class: 'node-label', x: interaction.point.x, y: interaction.point.y + 1 }, `×${interaction.turns}`),
  );
  return group;
}

function drawCommittedScene(geometry) {
  ropeLayer.replaceChildren();
  crossingLayer.replaceChildren();
  const stack = buildRenderStack(state.ropes, geometry.crossings, geometry.interactions);
  for (const entry of stack) {
    const group = entry.kind === 'rope'
      ? createCommittedRope(geometry, entry.item)
      : entry.kind === 'crossing'
        ? createVisualCrossing(entry.item)
        : createInteractionNode(entry.item);
    if (!group) continue;
    group.dataset.renderKind = entry.kind;
    group.dataset.renderLayer = String(entry.layer);
    ropeLayer.append(group);
  }
}

function draftWaypoints(geometry, endPoint) {
  if (!state.draft) return [];
  const startPoint = holePoint(state.draft.startHole);
  const points = [startPoint];
  state.draft.wraps.forEach((wrap, index) => {
    const target = geometry.ropes.get(wrap.targetRopeId);
    if (!target) return;
    const hook = pointAndTangentAt(target.samples, wrap.targetT);
    const previous = state.draft.wraps[index - 1];
    if (previous?.targetRopeId === wrap.targetRopeId) {
      const normal = { x: -hook.tangent.y, y: hook.tangent.x };
      const side = Math.sign((startPoint.x - hook.point.x) * normal.x + (startPoint.y - hook.point.y) * normal.y) || 1;
      points.push({
        x: hook.point.x + normal.x * side * 58 + hook.tangent.x * 24,
        y: hook.point.y + normal.y * side * 58 + hook.tangent.y * 24,
      });
    }
    points.push(hook.point);
  });
  points.push(endPoint ?? BOARD_CENTER);
  return points;
}

function drawPreview(geometry) {
  previewLayer.replaceChildren();
  if (mode !== 'author' || !state.draft) return;
  const definition = ropeDefinition(state.draft.ropeId);
  const samples = sampleCurve(draftWaypoints(geometry, previewPoint));
  previewLayer.append(svgElement('path', { class: 'preview-rope', d: pathFromSamples(samples), stroke: definition.color }));
  const pendingTargets = new Map();
  for (const wrap of state.draft.wraps) {
    const entry = pendingTargets.get(wrap.targetRopeId) ?? { wrap, count: 0 };
    entry.count += 1;
    pendingTargets.set(wrap.targetRopeId, entry);
  }
  for (const { wrap, count } of pendingTargets.values()) {
    const target = geometry.ropes.get(wrap.targetRopeId);
    if (!target) continue;
    const hook = pointAndTangentAt(target.samples, wrap.targetT);
    previewLayer.append(
      svgElement('circle', { class: 'preview-node', cx: hook.point.x, cy: hook.point.y, r: count === 2 ? 25 : 18, stroke: definition.color }),
      svgElement('text', { class: 'node-label preview-pass-label', x: hook.point.x, y: hook.point.y + 1 }, `↓${count}`),
    );
  }
}

function drawMoveFlash() {
  moveLayer.replaceChildren();
  if (!moveFlash) return;
  const from = holePoint(moveFlash.fromHoleId);
  const to = holePoint(moveFlash.toHoleId);
  moveLayer.append(
    svgElement('line', { class: 'move-sweep-shadow', x1: from.x, y1: from.y, x2: to.x, y2: to.y }),
    svgElement('line', { class: 'move-sweep', x1: from.x, y1: from.y, x2: to.x, y2: to.y, stroke: moveFlash.color }),
  );
}

function handleAuthorHole(holeId) {
  if (state.holes[holeId].occupant) {
    notify(`洞位 ${holeId + 1} 已被占用。`);
    return;
  }
  if (!state.draft) {
    state = beginRope(state, holeId);
    previewPoint = holePoint(holeId);
    notify(`已選洞位 ${holeId + 1} 為起點`);
  } else {
    const name = ropeDefinition(state.draft.ropeId).name;
    state = finishRope(state, holeId);
    previewPoint = null;
    notify(`${name}已完成；原有繩索 ${state.ropes.length} 條`);
  }
  renderAll();
}

function handleGameHole(holeId) {
  const occupant = state.holes[holeId].occupant;
  if (occupant) {
    if (selectedEndpoint?.ropeId === occupant.ropeId && selectedEndpoint?.endpoint === occupant.end) {
      selectedEndpoint = null;
      notify('已取消選擇繩端');
    } else {
      selectedEndpoint = { ropeId: occupant.ropeId, endpoint: occupant.end };
      notify(`已選${ropeDefinition(occupant.ropeId).name} ${occupant.end} 端 · 請點空洞`);
    }
    renderAll();
    return;
  }
  if (!selectedEndpoint) {
    notify('請先點擊一個彩色繩端');
    return;
  }

  const rope = state.ropes.find((item) => item.id === selectedEndpoint.ropeId);
  if (!rope) return;
  const fromHoleId = rope.endpoints[selectedEndpoint.endpoint];
  state = moveEndpoint(state, rope.id, selectedEndpoint.endpoint, holeId);
  moveFlash = { fromHoleId, toHoleId: holeId, color: rope.color };
  const released = state.lastMove.released;
  const created = state.lastMove.created;
  selectedEndpoint = null;
  renderAll();

  clearTimeout(moveFlashTimer);
  moveFlashTimer = setTimeout(() => {
    moveFlash = null;
    drawMoveFlash();
  }, 620);

  if (created.length) {
    const knots = created.map((item) => ropeDefinition(item.targetRopeId).name).join('、');
    notify(`移動段位於最上層；與第一個有效接觸 ${knots} 新增 ×1 交纏`);
  } else if (released.length) {
    const opened = released.map((item) => {
      const target = ropeDefinition(item.targetRopeId).name;
      return item.remainingTurns ? `${target}剩 ${item.remainingTurns} 層` : `${target}已清除`;
    }).join('、');
    notify(`越過目標繩：${opened}`);
  } else if (isRopeRemovable(state, rope.id)) {
    notify(`${rope.name}已沒有拓撲關聯，點擊發光繩身取下`);
  } else {
    notify('移孔完成；接觸只形成視覺上下交叉，沒有新增拓撲關聯');
  }
}

function handleHole(holeId) {
  try {
    if (mode === 'game') handleGameHole(holeId);
    else handleAuthorHole(holeId);
  } catch (error) {
    notify(error.message);
  }
}

function drawHoles() {
  holeLayer.replaceChildren();
  for (const hole of state.holes) {
    const point = holePoint(hole.id);
    const occupant = hole.occupant;
    const selected = mode === 'game' && occupant && selectedEndpoint?.ropeId === occupant.ropeId && selectedEndpoint?.endpoint === occupant.end;
    const available = mode === 'game' && !occupant && selectedEndpoint;
    const group = svgElement('g', {
      class: `hole ${occupant ? 'occupied' : 'empty'}${state.draft?.startHole === hole.id || selected ? ' selected' : ''}${available ? ' available' : ''}${mode === 'game' && occupant ? ' game-endpoint' : ''}`,
      transform: `translate(${point.x} ${point.y})`, tabindex: '0', role: 'button',
      'aria-label': occupant ? `洞位 ${hole.id + 1}，${ropeDefinition(occupant.ropeId).name} ${occupant.end} 端` : `空洞 ${hole.id + 1}`,
      'data-hole-id': hole.id,
    });
    group.append(
      svgElement('circle', { class: 'hole-hit', r: HOLE_HIT_RADIUS }),
      svgElement('circle', { class: 'hole-well', r: 22 }),
      svgElement('circle', { class: 'hole-rim', r: 28 }),
    );
    if (occupant) {
      const definition = ropeDefinition(occupant.ropeId);
      group.append(
        svgElement('circle', { class: 'plug-shadow', cx: 0, cy: 0, r: 18 }),
        svgElement('circle', { class: 'plug', cx: 0, cy: -3, r: 17, fill: definition.color }),
        svgElement('ellipse', { class: 'plug-cap', cx: -5, cy: -10, rx: 6, ry: 4 }),
      );
    } else {
      group.append(svgElement('text', { class: 'hole-number', x: 0, y: 1 }, String(hole.id + 1)));
    }
    group.addEventListener('click', (event) => {
      event.stopPropagation();
      handleHole(hole.id);
    });
    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleHole(hole.id);
      }
    });
    holeLayer.append(group);
  }
}

function renderGuide() {
  const definition = state.nextRopeIndex < ROPE_DEFS.length ? ROPE_DEFS[state.nextRopeIndex] : null;
  currentRope.innerHTML = definition
    ? `<i class="rope-swatch" style="--rope:${definition.color}"></i><div><strong>${definition.name}</strong><small>第 ${state.nextRopeIndex + 1}／10 條</small></div>`
    : '<div><strong>十條繩都已完成</strong><small>盤面保留兩個空洞</small></div>';
  Object.values(steps).forEach((step) => step.classList.remove('active'));
  if (state.ropes.length === 10) {
    instruction.textContent = '出題完成。按「開始遊戲」即可實際驗證這個繩結。';
  } else if (!state.draft) {
    steps.start.classList.add('active');
    instruction.textContent = '點擊任一空洞作為新繩的起點。';
  } else {
    steps.wrap.classList.add('active');
    steps.end.classList.add('active');
    const remaining = 2 - countUnderpassClicks(state, state.draft.ropeId);
    instruction.textContent = `可點擊既有繩索，讓自由端從其下方穿過（還可 ${remaining} 次）；點空洞放下終點後才結算扭轉。`;
  }
  activeQuota.textContent = state.draft ? `${countUnderpassClicks(state, state.draft.ropeId)} / 2` : '0 / 2';
  undoButton.disabled = state.history.length === 0;
  sameSeedButton.disabled = state.seed === null;
  startGameButton.disabled = !assessGameStart(state).allowed;
}

function renderAuthorMetrics() {
  const empty = getEmptyHoles(state).length;
  ropeCountLabel.textContent = '已放繩索';
  holeCountLabel.textContent = '占用洞位';
  emptyCountLabel.textContent = '保留空洞';
  ropeCount.textContent = `${state.ropes.length} / 10`;
  holeCount.textContent = `${22 - empty} / 22`;
  emptyCount.textContent = String(empty);
  seedValue.textContent = state.seed === null ? '手動' : String(state.seed);
  const validation = validatePuzzle(state);
  if (state.ropes.length < 10) {
    validationPill.className = 'validation-pill idle';
    validationPill.textContent = '出題中';
    boardStatus.textContent = state.draft
      ? `正在建立 ${ropeDefinition(state.draft.ropeId).name} · 已記錄 ${countUnderpassClicks(state, state.draft.ropeId)} 次下穿，等待終點結算`
      : `已完成 ${state.ropes.length} 條 · 還需 ${10 - state.ropes.length} 條`;
  } else if (validation.valid) {
    validationPill.className = 'validation-pill valid';
    validationPill.textContent = '可開始遊戲';
    boardStatus.textContent = `出題完成 · 20 個端點已固定 · 保留 ${empty} 個空洞`;
  } else {
    validationPill.className = 'validation-pill invalid';
    validationPill.textContent = '規則錯誤';
    boardStatus.textContent = validation.errors[0];
  }
}

function renderGameMetrics() {
  const remainingTurns = state.interactions.reduce((sum, interaction) => sum + interaction.turns, 0);
  ropeCountLabel.textContent = '剩餘繩索';
  holeCountLabel.textContent = '移孔次數';
  emptyCountLabel.textContent = '未清除層數';
  ropeCount.textContent = `${state.ropes.length} / 10`;
  holeCount.textContent = String(state.moveCount);
  emptyCount.textContent = String(remainingTurns);

  if (!state.ropes.length) {
    gameInstruction.textContent = '所有繩子都已取下';
    boardStatus.textContent = '遊戲完成';
  } else if (selectedEndpoint) {
    const rope = ropeDefinition(selectedEndpoint.ropeId);
    const endpointHole = state.ropes.find((item) => item.id === selectedEndpoint.ropeId)?.endpoints[selectedEndpoint.endpoint];
    gameInstruction.textContent = `已選${rope.name} ${selectedEndpoint.endpoint} 端（洞 ${endpointHole + 1}）· 點一個發光空洞`;
    boardStatus.textContent = '移動段視為最上層；第一個有效階層接觸可能解除舊結或建立新結';
  } else {
    const freeCount = state.ropes.filter((rope) => isRopeRemovable(state, rope.id)).length;
    gameInstruction.textContent = '可移動任意繩端；點擊發光繩身可直接取下無關聯繩索';
    boardStatus.textContent = state.interactions.length
      ? `目前 ${state.interactions.length} 個拓撲交纏 · ${freeCount} 條繩可取下`
      : `沒有拓撲交纏 · ${freeCount} 條剩餘繩索都可自由取下`;
  }
}

function renderRoster() {
  ropeRoster.replaceChildren();
  for (const definition of ROPE_DEFS) {
    const placed = state.ropes.some((rope) => rope.id === definition.id);
    const current = state.draft?.ropeId === definition.id;
    const active = countUnderpassClicks(state, definition.id);
    const passive = countPassiveHooks(state, definition.id);
    const row = document.createElement('div');
    row.className = `roster-row${current ? ' current' : ''}`;
    row.style.setProperty('--rope', definition.color);
    row.innerHTML = `<i class="roster-swatch"></i><div><strong>${definition.name}</strong><small>${placed ? '已固定兩端' : current ? '正在建立' : '尚未放置'}</small></div><div class="roster-quota">穿 ${active}/2<br>被 ${passive}/3</div>`;
    ropeRoster.append(row);
  }
}

function slotLabel(targetT) {
  if (targetT === 0.5) return '中點 ½';
  if (targetT === 0.25) return '節點 ¼';
  if (targetT === 0.75) return '節點 ¾';
  return `實際位置 ${Math.round(targetT * 100)}%`;
}

function renderInteractions() {
  const draftGroups = new Map();
  for (const wrap of state.draft?.wraps ?? []) {
    const entry = draftGroups.get(wrap.targetRopeId) ?? { ...wrap, clicks: 0 };
    entry.clicks += 1;
    draftGroups.set(wrap.targetRopeId, entry);
  }
  interactionCount.textContent = String(state.interactions.length + draftGroups.size);
  interactionList.replaceChildren();
  const committed = state.interactions.map((interaction) => ({ ...interaction, draft: false }));
  const drafts = [...draftGroups.values()].map((wrap, index) => ({
    id: `draft-${index}`,
    actorRopeId: state.draft.ropeId,
    ...wrap,
    draft: true,
  }));
  const items = [...committed, ...drafts];
  if (!items.length) {
    const empty = document.createElement('p');
    empty.textContent = '尚無拓撲扭轉節點';
    interactionList.append(empty);
    return;
  }
  for (const item of items) {
    const actor = ropeDefinition(item.actorRopeId);
    const target = ropeDefinition(item.targetRopeId);
    const element = document.createElement('div');
    element.className = 'interaction-item';
    const topologyLabel = item.draft
      ? `↓${item.clicks} 下穿待終點結算`
      : item.kind === 'helix'
        ? '雙重扭轉 ×2'
        : '單層扭轉 ×1';
    element.innerHTML = `<strong>${actor.name} → ${target.name}</strong><br><span>${slotLabel(item.targetT)} · ${topologyLabel}</span>`;
    interactionList.append(element);
  }
}

function fitBoardToViewport() {
  if (mode !== 'game') {
    board.style.removeProperty('width');
    board.style.removeProperty('height');
    return;
  }
  const widthLimit = boardShell.clientWidth * (window.innerWidth <= 760 ? 1.14 : 1);
  const heightLimit = boardShell.clientHeight;
  const fittedWidth = Math.min(widthLimit, heightLimit * (1000 / 760));
  board.style.width = `${Math.max(320, fittedWidth)}px`;
  board.style.height = 'auto';
}

function renderAll() {
  document.body.classList.toggle('game-mode', mode === 'game');
  fitBoardToViewport();
  modeLabel.textContent = mode === 'game' ? 'ROPE UNTANGLING · PLAY MODE' : 'ROPE UNTANGLING · PUZZLE AUTHOR';
  pageTitle.textContent = mode === 'game' ? '繩結解謎' : '繩結出題工房';
  gameHud.hidden = mode !== 'game';
  const geometry = buildPuzzleGeometry(state);
  drawCommittedScene(geometry);
  drawPreview(geometry);
  drawMoveFlash();
  drawHoles();
  if (mode === 'author') {
    renderGuide();
    renderAuthorMetrics();
    renderRoster();
    renderInteractions();
  } else {
    renderGameMetrics();
  }
}

function startGame() {
  const decision = assessGameStart(state);
  if (!decision.allowed) {
    notify(decision.message);
    return;
  }
  authoringSnapshot = snapshotAuthoringStateForPlay(state);
  state = createGameState(state);
  mode = 'game';
  selectedEndpoint = null;
  moveFlash = null;
  victory.hidden = true;
  renderAll();
  notify('遊戲開始：點繩端，再點空洞移動');
}

function restartCurrentGame() {
  if (mode !== 'game') return;
  state = restartGame(state);
  selectedEndpoint = null;
  moveFlash = null;
  victory.hidden = true;
  renderAll();
  notify('已回到這一題的初始狀態');
}

function returnToEditor() {
  if (!authoringSnapshot) return;
  state = structuredClone(authoringSnapshot);
  mode = 'author';
  selectedEndpoint = null;
  moveFlash = null;
  victory.hidden = true;
  renderAll();
  notify('已返回出題模式');
}

function showVictory() {
  victoryMoves.textContent = String(state.moveCount);
  victory.hidden = false;
}

board.addEventListener('pointermove', (event) => {
  if (mode !== 'author' || !state.draft) return;
  previewPoint = boardPointFromEvent(event);
  if (previewFrame) return;
  previewFrame = requestAnimationFrame(() => {
    previewFrame = null;
    drawPreview(buildPuzzleGeometry(state));
  });
});

board.addEventListener('click', (event) => {
  if (event.target.closest?.('.rope-hit')) return;
  const closest = nearestHole(boardPointFromEvent(event));
  if (closest) handleHole(closest.id);
});

undoButton.addEventListener('click', () => {
  state = undo(state);
  previewPoint = state.draft ? holePoint(state.draft.startHole) : null;
  renderAll();
  notify('已復原上一步');
});

clearButton.addEventListener('click', () => {
  state = createAuthoringState();
  previewPoint = null;
  renderAll();
  notify('盤面已清空');
});

randomButton.addEventListener('click', () => {
  const requestedSeed = Date.now() >>> 0;
  state = generatePlayablePuzzle(requestedSeed);
  previewPoint = null;
  renderAll();
  const skipped = state.seed === requestedSeed ? '' : ` · 跳過 ${state.seed - requestedSeed} 個無解 seed`;
  notify(`已產生可解完整題目 · seed ${state.seed}${skipped}`);
});

sameSeedButton.addEventListener('click', () => {
  if (state.seed === null) return;
  state = generatePlayablePuzzle(state.seed);
  previewPoint = null;
  renderAll();
  notify(`已重設可解 seed ${state.seed}`);
});

startGameButton.addEventListener('click', startGame);
restartGameButton.addEventListener('click', restartCurrentGame);
backEditorButton.addEventListener('click', returnToEditor);
victoryRestart.addEventListener('click', restartCurrentGame);
victoryEditor.addEventListener('click', returnToEditor);
window.addEventListener('resize', fitBoardToViewport);

window.ropeAuthorDebug = {
  getMode: () => mode,
  getState: () => structuredClone(state),
  validate: () => mode === 'author' ? validatePuzzle(state) : { valid: true, errors: [] },
  geometry: () => buildPuzzleGeometry(state),
  clickHole: handleHole,
  wrap: (targetRopeId, targetT) => {
    state = addUnderpass(state, targetRopeId, targetT);
    renderAll();
    return structuredClone(state);
  },
  random: (seed = 20260715) => {
    if (mode === 'game') return structuredClone(state);
    state = generatePlayablePuzzle(seed);
    previewPoint = null;
    renderAll();
    return structuredClone(state);
  },
  startGame: () => {
    startGame();
    return structuredClone(state);
  },
  selectEndpoint: (ropeId, endpoint) => {
    const rope = state.ropes.find((item) => item.id === ropeId);
    if (!rope) throw new Error('找不到繩子');
    handleGameHole(rope.endpoints[endpoint]);
    return structuredClone(selectedEndpoint);
  },
  crossings: (ropeId, endpoint, toHoleId) => {
    const rope = state.ropes.find((item) => item.id === ropeId);
    if (!rope) throw new Error('找不到繩子');
    return findMovementContacts(state, ropeId, rope.endpoints[endpoint], toHoleId);
  },
  moveTo: (holeId) => {
    handleGameHole(holeId);
    return structuredClone(state);
  },
  remove: (ropeId) => {
    state = removeRope(state, ropeId);
    selectedEndpoint = null;
    renderAll();
    if (isGameComplete(state)) showVictory();
    return structuredClone(state);
  },
  restartGame: () => {
    restartCurrentGame();
    return structuredClone(state);
  },
  clear: () => clearButton.click(),
};

renderAll();
