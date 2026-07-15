export const HOLE_COUNT = 22;
export const MAX_ROPES = 10;
export const MAX_ACTIVE_TURNS = 2;
export const MAX_PASSIVE_HOOKS = 3;
export const PASSIVE_SLOTS = Object.freeze([0.5, 0.25, 0.75]);

export const ROPE_DEFS = Object.freeze([
  { id: 'rope-1', name: '珊瑚紅', color: '#ff6b6b' },
  { id: 'rope-2', name: '天空藍', color: '#4dabf7' },
  { id: 'rope-3', name: '薄荷綠', color: '#51cf66' },
  { id: 'rope-4', name: '亮黃色', color: '#ffd43b' },
  { id: 'rope-5', name: '葡萄紫', color: '#b197fc' },
  { id: 'rope-6', name: '暖橙色', color: '#ff922b' },
  { id: 'rope-7', name: '桃紅色', color: '#f06595' },
  { id: 'rope-8', name: '湖水青', color: '#22b8cf' },
  { id: 'rope-9', name: '萊姆綠', color: '#94d82d' },
  { id: 'rope-10', name: '靛青色', color: '#748ffc' },
]);

function cleanSnapshot(state) {
  const copy = structuredClone(state);
  copy.history = [];
  return copy;
}

function commitChange(previous, next) {
  return {
    ...next,
    history: [...previous.history, cleanSnapshot(previous)],
  };
}

function assertHole(state, holeId) {
  if (!Number.isInteger(holeId) || holeId < 0 || holeId >= HOLE_COUNT) {
    throw new Error(`未知洞位：${holeId}`);
  }
  return state.holes[holeId];
}

function assertEmptyHole(state, holeId) {
  const hole = assertHole(state, holeId);
  if (hole.occupant) throw new Error(`洞位 ${holeId + 1} 不是空洞。`);
  return hole;
}

export function createAuthoringState({ seed = null } = {}) {
  return {
    holes: Array.from({ length: HOLE_COUNT }, (_, id) => ({
      id,
      angle: (Math.PI * 2 * id) / HOLE_COUNT - Math.PI / 2,
      occupant: null,
    })),
    ropes: [],
    interactions: [],
    draft: null,
    nextRopeIndex: 0,
    history: [],
    seed,
  };
}

export function getEmptyHoles(state) {
  return state.holes.filter((hole) => hole.occupant === null);
}

export function countActiveTurns(state, ropeId) {
  let total = state.interactions
    .filter((interaction) => interaction.actorRopeId === ropeId)
    .reduce((sum, interaction) => sum + interaction.turns, 0);
  if (state.draft?.ropeId === ropeId) {
    total += state.draft.wraps.reduce((sum, wrap) => sum + wrap.turns, 0);
  }
  return total;
}

export function countPassiveHooks(state, ropeId) {
  let total = state.interactions.filter((interaction) => interaction.targetRopeId === ropeId).length;
  if (state.draft) total += state.draft.wraps.filter((wrap) => wrap.targetRopeId === ropeId).length;
  return total;
}

export function beginRope(state, holeId) {
  if (state.draft) throw new Error('請先完成或復原目前正在建立的繩子。');
  if (state.nextRopeIndex >= MAX_ROPES) throw new Error('十條繩子都已完成。');
  assertEmptyHole(state, holeId);

  const definition = ROPE_DEFS[state.nextRopeIndex];
  const holes = structuredClone(state.holes);
  holes[holeId].occupant = { ropeId: definition.id, end: 'A', draft: true };

  return commitChange(state, {
    ...state,
    holes,
    draft: {
      ropeId: definition.id,
      startHole: holeId,
      wraps: [],
    },
  });
}

export function addWrap(state, targetRopeId) {
  if (!state.draft) throw new Error('請先選擇繩子的起點。');
  if (targetRopeId === state.draft.ropeId) throw new Error('繩子不能纏繞自己。');
  if (!state.ropes.some((rope) => rope.id === targetRopeId)) throw new Error('只能纏繞已完成的繩子。');

  const activeTurns = countActiveTurns(state, state.draft.ropeId);
  if (activeTurns >= MAX_ACTIVE_TURNS) throw new Error('這條繩子已達主動纏繞上限 2 次。');

  const existingIndex = state.draft.wraps.findIndex((wrap) => wrap.targetRopeId === targetRopeId);
  if (existingIndex >= 0) {
    const wraps = structuredClone(state.draft.wraps);
    if (wraps[existingIndex].turns >= 2) throw new Error('同一對繩只能在同一節點纏繞兩次。');
    wraps[existingIndex].turns += 1;
    return commitChange(state, {
      ...state,
      draft: { ...state.draft, wraps },
    });
  }

  const passiveHooks = countPassiveHooks(state, targetRopeId);
  if (passiveHooks >= MAX_PASSIVE_HOOKS) throw new Error('目標繩已達被動纏繞上限 3 次。');

  const wraps = [
    ...state.draft.wraps,
    {
      targetRopeId,
      targetT: PASSIVE_SLOTS[passiveHooks],
      turns: 1,
      localOrder: {
        before: 'actor-top',
        atNode: 'actor-under',
        after: 'actor-top',
      },
    },
  ];

  return commitChange(state, {
    ...state,
    draft: { ...state.draft, wraps },
  });
}

export function finishRope(state, endHoleId) {
  if (!state.draft) throw new Error('請先選擇繩子的起點。');
  assertEmptyHole(state, endHoleId);

  const holes = structuredClone(state.holes);
  const startHole = state.draft.startHole;
  holes[startHole].occupant = { ropeId: state.draft.ropeId, end: 'A' };
  holes[endHoleId].occupant = { ropeId: state.draft.ropeId, end: 'B' };

  const definition = ROPE_DEFS[state.nextRopeIndex];
  const rope = {
    id: definition.id,
    name: definition.name,
    color: definition.color,
    creationOrder: state.nextRopeIndex,
    endpoints: { A: startHole, B: endHoleId },
  };
  const interactions = state.draft.wraps.map((wrap, index) => ({
    id: `interaction-${state.interactions.length + index + 1}`,
    kind: wrap.turns === 2 ? 'helix' : 'crossing',
    actorRopeId: state.draft.ropeId,
    targetRopeId: wrap.targetRopeId,
    targetT: wrap.targetT,
    turns: wrap.turns,
    localOrder: structuredClone(wrap.localOrder),
  }));

  return commitChange(state, {
    ...state,
    holes,
    ropes: [...state.ropes, rope],
    interactions: [...state.interactions, ...interactions],
    draft: null,
    nextRopeIndex: state.nextRopeIndex + 1,
  });
}

export function undo(state) {
  const previous = state.history.at(-1);
  if (!previous) return state;
  return {
    ...structuredClone(previous),
    history: state.history.slice(0, -1),
  };
}

export function validatePuzzle(state) {
  const errors = [];
  if (state.holes.length !== HOLE_COUNT) errors.push(`盤面必須有 ${HOLE_COUNT} 個洞。`);
  if (state.ropes.length > MAX_ROPES) errors.push('繩子超過 10 條。');

  const occupied = state.holes.filter((hole) => hole.occupant).length;
  const expectedOccupied = state.ropes.length * 2 + (state.draft ? 1 : 0);
  if (occupied !== expectedOccupied) errors.push('洞位占用數與繩端數不一致。');
  if (state.ropes.length === MAX_ROPES && getEmptyHoles(state).length !== 2) {
    errors.push('完成出題後必須保留 2 個空洞。');
  }

  for (const rope of state.ropes) {
    if (countActiveTurns(state, rope.id) > MAX_ACTIVE_TURNS) errors.push(`${rope.name} 主動纏繞超過 2 次。`);
    if (countPassiveHooks(state, rope.id) > MAX_PASSIVE_HOOKS) errors.push(`${rope.name} 被動纏繞超過 3 次。`);
  }

  for (const interaction of state.interactions) {
    if (!PASSIVE_SLOTS.includes(interaction.targetT)) errors.push(`${interaction.id} 使用無效節點。`);
    if (![1, 2].includes(interaction.turns)) errors.push(`${interaction.id} 圈數無效。`);
  }

  return { valid: errors.length === 0, errors };
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function generateRandomPuzzle(seed = Date.now()) {
  const normalizedSeed = Number(seed) >>> 0;
  const random = mulberry32(normalizedSeed);
  const holeOrder = shuffled(Array.from({ length: HOLE_COUNT }, (_, id) => id), random);
  let state = createAuthoringState({ seed: normalizedSeed });

  for (let ropeIndex = 0; ropeIndex < MAX_ROPES; ropeIndex += 1) {
    state = beginRope(state, holeOrder[ropeIndex * 2]);

    if (ropeIndex > 0) {
      const desiredTurns = Math.floor(random() * 3);
      for (let turn = 0; turn < desiredTurns; turn += 1) {
        const existingTarget = state.draft.wraps[0]?.targetRopeId;
        let candidates = state.ropes.filter((rope) => countPassiveHooks(state, rope.id) < MAX_PASSIVE_HOOKS);
        if (turn === 1 && existingTarget && random() < 0.38) {
          candidates = state.ropes.filter((rope) => rope.id === existingTarget);
        }
        if (!candidates.length) break;
        const target = candidates[Math.floor(random() * candidates.length)];
        try {
          state = addWrap(state, target.id);
        } catch {
          break;
        }
      }
    }

    state = finishRope(state, holeOrder[ropeIndex * 2 + 1]);
  }

  return {
    ...state,
    history: [],
  };
}
