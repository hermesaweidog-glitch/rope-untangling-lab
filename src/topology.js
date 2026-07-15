export const ROPE_DEFS = Object.freeze([
  { id: 'red', name: '紅繩', color: '#ff5a55', z: -2.4 },
  { id: 'blue', name: '藍繩', color: '#4da3ff', z: -0.8 },
  { id: 'green', name: '綠繩', color: '#58d07d', z: 0.8 },
  { id: 'yellow', name: '黃繩', color: '#ffd24d', z: 2.4 },
]);

const INITIAL_WRAPS = Object.freeze([
  { moving: 'red', target: 'blue', turns: 2 },
  { moving: 'green', target: 'red', turns: -1 },
  { moving: 'yellow', target: 'green', turns: 1 },
  { moving: 'blue', target: 'yellow', turns: -2 },
]);

export function pairKey(a, b) {
  return [a, b].sort().join(':');
}

export function createInitialState() {
  return {
    wraps: INITIAL_WRAPS.map((wrap) => ({ ...wrap })),
    moves: 0,
    history: [],
  };
}

export function createEmptyState() {
  return { wraps: [], moves: 0, history: [] };
}

export function findPair(state, a, b) {
  const key = pairKey(a, b);
  return state.wraps.find((wrap) => pairKey(wrap.moving, wrap.target) === key) ?? null;
}

export function getTurns(state, moving, target) {
  const pair = findPair(state, moving, target);
  return pair?.turns ?? 0;
}

export function applyTurn(state, moving, target, delta, { recordHistory = true } = {}) {
  if (!ROPE_DEFS.some((rope) => rope.id === moving)) throw new Error(`Unknown moving rope: ${moving}`);
  if (!ROPE_DEFS.some((rope) => rope.id === target)) throw new Error(`Unknown target rope: ${target}`);
  if (moving === target) throw new Error('A rope cannot wrap around itself in this prototype.');
  if (!Number.isInteger(delta) || delta === 0) throw new Error('Turn delta must be a non-zero integer.');

  const wraps = state.wraps.map((wrap) => ({ ...wrap }));
  const key = pairKey(moving, target);
  const index = wraps.findIndex((wrap) => pairKey(wrap.moving, wrap.target) === key);
  const previous = index >= 0 ? wraps[index] : null;
  const before = previous?.turns ?? 0;
  const canonicalMoving = previous?.moving ?? moving;
  const canonicalTarget = previous?.target ?? target;
  const after = Math.max(-3, Math.min(3, before + delta));

  if (after === before) return state;

  if (index >= 0) {
    if (after === 0) wraps.splice(index, 1);
    else wraps[index] = { ...wraps[index], turns: after };
  } else {
    wraps.push({ moving: canonicalMoving, target: canonicalTarget, turns: after });
  }

  const action = {
    moving: canonicalMoving,
    target: canonicalTarget,
    delta: after - before,
    before,
    after,
  };

  return {
    wraps,
    moves: state.moves + 1,
    history: recordHistory ? [...state.history, action] : [...state.history],
  };
}

export function undo(state) {
  const last = state.history.at(-1);
  if (!last) return state;
  const withoutHistory = { ...state, history: state.history.slice(0, -1) };
  const reverted = applyTurn(withoutHistory, last.moving, last.target, -last.delta, { recordHistory: false });
  return {
    ...reverted,
    moves: Math.max(0, state.moves - 1),
    history: state.history.slice(0, -1),
  };
}

export function totalAbsoluteTurns(state) {
  return state.wraps.reduce((sum, wrap) => sum + Math.abs(wrap.turns), 0);
}

export function isSolved(state) {
  return totalAbsoluteTurns(state) === 0;
}

export function directionLabel(turns) {
  if (turns > 0) return `順時針 +${turns}`;
  if (turns < 0) return `逆時針 ${turns}`;
  return '已解開 0';
}
