import './style.css';
import {
  ROPE_DEFS,
  addWrap,
  beginRope,
  countActiveTurns,
  countPassiveHooks,
  createAuthoringState,
  finishRope,
  generateRandomPuzzle,
  getEmptyHoles,
  undo,
  validatePuzzle,
} from './topology.js';
import {
  BOARD_CENTER,
  HOLE_HIT_RADIUS,
  buildPuzzleGeometry,
  holePoint,
  nearestHole,
  pathFromSamples,
  pointAndTangentAt,
  sampleCurve,
} from './geometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const board = document.querySelector('#board');
const ropeLayer = document.querySelector('#rope-layer');
const crossingLayer = document.querySelector('#crossing-layer');
const previewLayer = document.querySelector('#preview-layer');
const holeLayer = document.querySelector('#hole-layer');
const ropeCount = document.querySelector('#rope-count');
const holeCount = document.querySelector('#hole-count');
const emptyCount = document.querySelector('#empty-count');
const currentRope = document.querySelector('#current-rope');
const instruction = document.querySelector('#instruction');
const activeQuota = document.querySelector('#active-quota');
const undoButton = document.querySelector('#undo-button');
const sameSeedButton = document.querySelector('#same-seed-button');
const clearButton = document.querySelector('#clear-button');
const randomButton = document.querySelector('#random-button');
const ropeRoster = document.querySelector('#rope-roster');
const interactionList = document.querySelector('#interaction-list');
const interactionCount = document.querySelector('#interaction-count');
const validationPill = document.querySelector('#validation-pill');
const boardStatus = document.querySelector('#board-status');
const seedValue = document.querySelector('#seed-value');
const toast = document.querySelector('#toast');
const steps = {
  start: document.querySelector('#step-start'),
  wrap: document.querySelector('#step-wrap'),
  end: document.querySelector('#step-end'),
};

let state = createAuthoringState();
let previewPoint = null;
let toastTimer = null;
let previewFrame = null;

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

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2100);
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

function drawCommittedRopes(geometry) {
  ropeLayer.replaceChildren();
  for (const rope of [...state.ropes].sort((a, b) => a.creationOrder - b.creationOrder)) {
    const data = geometry.ropes.get(rope.id);
    const group = svgElement('g', { class: 'rope-group', 'data-rope-id': rope.id });
    group.append(
      svgElement('path', { class: 'rope-shadow', d: data.path }),
      svgElement('path', { class: 'rope-body', d: data.path, stroke: rope.color }),
      svgElement('path', { class: 'rope-shine', d: data.path }),
    );
    const hit = svgElement('path', {
      class: 'rope-hit',
      d: data.path,
      tabindex: '0',
      role: 'button',
      'aria-label': `纏繞 ${rope.name}`,
      'data-rope-id': rope.id,
    });
    const requestWrap = (event) => {
      event.stopPropagation();
      if (!state.draft) {
        notify('請先點擊空洞，開始放置新繩。');
        return;
      }
      try {
        state = addWrap(state, rope.id);
        notify(`${ropeDefinition(state.draft.ropeId).name}纏繞${rope.name}${state.draft.wraps.find((wrap) => wrap.targetRopeId === rope.id).turns === 2 ? '第二圈' : ''}`);
        renderAll();
      } catch (error) {
        notify(error.message);
      }
    };
    hit.addEventListener('click', requestWrap);
    hit.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') requestWrap(event);
    });
    group.append(hit);
    ropeLayer.append(group);
  }
}

function drawInteractionNodes(geometry) {
  crossingLayer.replaceChildren();
  for (const interaction of geometry.interactions) {
    const actor = ropeDefinition(interaction.actorRopeId);
    const target = ropeDefinition(interaction.targetRopeId);
    const line = lineAround(interaction.point, interaction.tangent);
    const angle = Math.atan2(interaction.tangent.y, interaction.tangent.x) * 180 / Math.PI;
    const group = svgElement('g', { class: 'interaction-node', 'data-interaction-id': interaction.id });

    const loopOffsets = interaction.turns === 2 ? [-13, 13] : [0];
    for (const offset of loopOffsets) {
      const cx = interaction.point.x + interaction.tangent.x * offset;
      const cy = interaction.point.y + interaction.tangent.y * offset;
      group.append(svgElement('ellipse', {
        class: 'helix-loop',
        cx,
        cy,
        rx: 15,
        ry: 27,
        stroke: actor.color,
        transform: `rotate(${angle} ${cx} ${cy})`,
      }));
    }

    group.append(
      svgElement('line', { class: 'local-mask', ...line }),
      svgElement('line', { class: 'local-target-shadow', ...line }),
      svgElement('line', { class: 'local-target', ...line, stroke: target.color }),
      svgElement('line', { class: 'local-target-shine', ...line }),
      svgElement('circle', { class: 'node-dot', cx: interaction.point.x, cy: interaction.point.y, r: 12, fill: actor.color }),
      svgElement('text', { class: 'node-label', x: interaction.point.x, y: interaction.point.y + 1 }, `×${interaction.turns}`),
    );
    crossingLayer.append(group);
  }
}

function draftWaypoints(geometry, endPoint) {
  if (!state.draft) return [];
  const points = [holePoint(state.draft.startHole)];
  for (const wrap of state.draft.wraps) {
    const target = geometry.ropes.get(wrap.targetRopeId);
    if (target) points.push(pointAndTangentAt(target.samples, wrap.targetT).point);
  }
  points.push(endPoint ?? BOARD_CENTER);
  return points;
}

function drawPreview(geometry) {
  previewLayer.replaceChildren();
  if (!state.draft) return;
  const definition = ropeDefinition(state.draft.ropeId);
  const points = draftWaypoints(geometry, previewPoint);
  const samples = sampleCurve(points);
  previewLayer.append(svgElement('path', {
    class: 'preview-rope',
    d: pathFromSamples(samples),
    stroke: definition.color,
  }));
  for (const wrap of state.draft.wraps) {
    const target = geometry.ropes.get(wrap.targetRopeId);
    if (!target) continue;
    const hook = pointAndTangentAt(target.samples, wrap.targetT);
    previewLayer.append(
      svgElement('circle', {
        class: 'preview-node',
        cx: hook.point.x,
        cy: hook.point.y,
        r: wrap.turns === 2 ? 25 : 18,
        stroke: definition.color,
      }),
      svgElement('text', { class: 'node-label', x: hook.point.x, y: hook.point.y + 1 }, `×${wrap.turns}`),
    );
  }
}

function handleHole(holeId) {
  try {
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
  } catch (error) {
    notify(error.message);
  }
}

function drawHoles() {
  holeLayer.replaceChildren();
  for (const hole of state.holes) {
    const point = holePoint(hole.id);
    const occupant = hole.occupant;
    const group = svgElement('g', {
      class: `hole ${occupant ? 'occupied' : 'empty'}${state.draft?.startHole === hole.id ? ' selected' : ''}`,
      transform: `translate(${point.x} ${point.y})`,
      tabindex: '0',
      role: 'button',
      'aria-label': occupant ? `洞位 ${hole.id + 1}，已被${ropeDefinition(occupant.ropeId).name}占用` : `空洞 ${hole.id + 1}`,
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
  if (definition) {
    currentRope.innerHTML = `<i class="rope-swatch" style="--rope:${definition.color}"></i><div><strong>${definition.name}</strong><small>第 ${state.nextRopeIndex + 1}／10 條</small></div>`;
  } else {
    currentRope.innerHTML = '<div><strong>十條繩都已完成</strong><small>盤面保留兩個空洞</small></div>';
  }

  Object.values(steps).forEach((step) => step.classList.remove('active'));
  if (state.ropes.length === 10) {
    instruction.textContent = '出題完成。可檢查右側配額，或產生另一個隨機繩結。';
  } else if (!state.draft) {
    steps.start.classList.add('active');
    instruction.textContent = '點擊任一空洞作為新繩的起點。';
  } else {
    steps.wrap.classList.add('active');
    steps.end.classList.add('active');
    const remaining = 2 - countActiveTurns(state, state.draft.ropeId);
    instruction.textContent = `可點擊既有繩索加入纏繞（還可 ${remaining} 次），或直接點另一個空洞完成。`;
  }

  activeQuota.textContent = state.draft ? `${countActiveTurns(state, state.draft.ropeId)} / 2` : '0 / 2';
  undoButton.disabled = state.history.length === 0;
  sameSeedButton.disabled = state.seed === null;
}

function renderMetricsAndValidation() {
  const empty = getEmptyHoles(state).length;
  ropeCount.textContent = `${state.ropes.length} / 10`;
  holeCount.textContent = `${22 - empty} / 22`;
  emptyCount.textContent = String(empty);
  seedValue.textContent = state.seed === null ? '手動' : String(state.seed);

  const validation = validatePuzzle(state);
  if (state.ropes.length < 10) {
    validationPill.className = 'validation-pill idle';
    validationPill.textContent = '出題中';
    boardStatus.textContent = state.draft
      ? `正在建立 ${ropeDefinition(state.draft.ropeId).name} · 已加入 ${countActiveTurns(state, state.draft.ropeId)} 次纏繞`
      : `已完成 ${state.ropes.length} 條 · 還需 ${10 - state.ropes.length} 條`;
  } else if (validation.valid) {
    validationPill.className = 'validation-pill valid';
    validationPill.textContent = '規則通過';
    boardStatus.textContent = `出題完成 · 20 個端點已固定 · 保留 ${empty} 個空洞`;
  } else {
    validationPill.className = 'validation-pill invalid';
    validationPill.textContent = '規則錯誤';
    boardStatus.textContent = validation.errors[0];
  }
}

function renderRoster() {
  ropeRoster.replaceChildren();
  for (const definition of ROPE_DEFS) {
    const placed = state.ropes.some((rope) => rope.id === definition.id);
    const current = state.draft?.ropeId === definition.id;
    const active = countActiveTurns(state, definition.id);
    const passive = countPassiveHooks(state, definition.id);
    const row = document.createElement('div');
    row.className = `roster-row${current ? ' current' : ''}`;
    row.style.setProperty('--rope', definition.color);
    row.innerHTML = `
      <i class="roster-swatch"></i>
      <div><strong>${definition.name}</strong><small>${placed ? '已固定兩端' : current ? '正在建立' : '尚未放置'}</small></div>
      <div class="roster-quota">主 ${active}/2<br>被 ${passive}/3</div>
    `;
    ropeRoster.append(row);
  }
}

function slotLabel(targetT) {
  if (targetT === 0.5) return '中點 ½';
  if (targetT === 0.25) return '節點 ¼';
  return '節點 ¾';
}

function renderInteractions() {
  interactionCount.textContent = String(state.interactions.length + (state.draft?.wraps.length ?? 0));
  interactionList.replaceChildren();
  const committed = state.interactions.map((interaction) => ({ ...interaction, draft: false }));
  const drafts = (state.draft?.wraps ?? []).map((wrap, index) => ({
    id: `draft-${index}`,
    actorRopeId: state.draft.ropeId,
    ...wrap,
    draft: true,
  }));
  const items = [...committed, ...drafts];
  if (!items.length) {
    const empty = document.createElement('p');
    empty.textContent = '尚無纏繞節點';
    interactionList.append(empty);
    return;
  }
  for (const item of items) {
    const actor = ropeDefinition(item.actorRopeId);
    const target = ropeDefinition(item.targetRopeId);
    const element = document.createElement('div');
    element.className = 'interaction-item';
    element.innerHTML = `<strong>${actor.name} → ${target.name}</strong><br><span>${slotLabel(item.targetT)} · ${item.turns === 2 ? '雙圈螺旋' : '局部下穿'}${item.draft ? ' · 預覽' : ''}</span>`;
    interactionList.append(element);
  }
}

function renderAll() {
  const geometry = buildPuzzleGeometry(state);
  drawCommittedRopes(geometry);
  drawInteractionNodes(geometry);
  drawPreview(geometry);
  drawHoles();
  renderGuide();
  renderMetricsAndValidation();
  renderRoster();
  renderInteractions();
}

board.addEventListener('pointermove', (event) => {
  if (!state.draft) return;
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
  const seed = Date.now() >>> 0;
  state = generateRandomPuzzle(seed);
  previewPoint = null;
  renderAll();
  notify(`已產生完整題目 · seed ${seed}`);
});

sameSeedButton.addEventListener('click', () => {
  if (state.seed === null) return;
  state = generateRandomPuzzle(state.seed);
  previewPoint = null;
  renderAll();
  notify(`已重設 seed ${state.seed}`);
});

window.ropeAuthorDebug = {
  getState: () => structuredClone(state),
  validate: () => validatePuzzle(state),
  geometry: () => buildPuzzleGeometry(state),
  clickHole: handleHole,
  wrap: (targetRopeId) => {
    state = addWrap(state, targetRopeId);
    renderAll();
    return structuredClone(state);
  },
  random: (seed = 20260715) => {
    state = generateRandomPuzzle(seed);
    previewPoint = null;
    renderAll();
    return structuredClone(state);
  },
  clear: () => clearButton.click(),
};

renderAll();
