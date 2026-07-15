import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOLE_COUNT,
  PASSIVE_SLOTS,
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
} from '../src/topology.js';

function placeRope(state, start, end, targets = []) {
  let next = beginRope(state, start);
  for (const target of targets) next = addWrap(next, target);
  return finishRope(next, end);
}

test('authoring board starts with 22 empty holes and ten unique ropes', () => {
  const state = createAuthoringState();
  assert.equal(HOLE_COUNT, 22);
  assert.equal(state.holes.length, 22);
  assert.equal(getEmptyHoles(state).length, 22);
  assert.equal(ROPE_DEFS.length, 10);
  assert.equal(new Set(ROPE_DEFS.map((rope) => rope.color)).size, 10);
});

test('placing ten ropes occupies 20 holes and leaves exactly two empty holes', () => {
  let state = createAuthoringState();
  for (let index = 0; index < 10; index += 1) {
    state = placeRope(state, index * 2, index * 2 + 1);
  }
  assert.equal(state.ropes.length, 10);
  assert.equal(getEmptyHoles(state).length, 2);
  assert.deepEqual(getEmptyHoles(state).map((hole) => hole.id), [20, 21]);
  assert.equal(validatePuzzle(state).valid, true);
});

test('a rope can actively wrap at most twice', () => {
  let state = createAuthoringState();
  state = placeRope(state, 0, 1);
  state = placeRope(state, 2, 3);
  state = beginRope(state, 4);
  state = addWrap(state, 'rope-1');
  state = addWrap(state, 'rope-2');
  assert.equal(countActiveTurns(state, 'rope-3'), 2);
  assert.throws(() => addWrap(state, 'rope-1'), /主動纏繞上限/);
});

test('a target receives hooks at middle, quarter, then three-quarter and rejects a fourth', () => {
  let state = createAuthoringState();
  state = placeRope(state, 0, 1);
  state = placeRope(state, 2, 3, ['rope-1']);
  state = placeRope(state, 4, 5, ['rope-1']);
  state = placeRope(state, 6, 7, ['rope-1']);
  assert.deepEqual(PASSIVE_SLOTS, [0.5, 0.25, 0.75]);
  assert.equal(countPassiveHooks(state, 'rope-1'), 3);
  state = beginRope(state, 8);
  assert.throws(() => addWrap(state, 'rope-1'), /被動纏繞上限/);
});

test('wrapping the same target twice reuses one hook and becomes a two-turn helix', () => {
  let state = createAuthoringState();
  state = placeRope(state, 0, 1);
  state = beginRope(state, 2);
  state = addWrap(state, 'rope-1');
  state = addWrap(state, 'rope-1');
  state = finishRope(state, 3);
  assert.equal(state.interactions.length, 1);
  assert.equal(state.interactions[0].turns, 2);
  assert.equal(state.interactions[0].targetT, 0.5);
  assert.equal(countActiveTurns(state, 'rope-2'), 2);
  assert.equal(countPassiveHooks(state, 'rope-1'), 1);
});

test('start and end holes must be distinct and empty', () => {
  let state = createAuthoringState();
  state = beginRope(state, 0);
  assert.throws(() => finishRope(state, 0), /空洞/);
  state = finishRope(state, 1);
  assert.throws(() => beginRope(state, 1), /空洞/);
});

test('undo restores the exact state before the last authoring action', () => {
  const empty = createAuthoringState();
  const started = beginRope(empty, 0);
  const restored = undo(started);
  assert.equal(restored.draft, null);
  assert.equal(getEmptyHoles(restored).length, 22);
});

test('seeded random generation creates reproducible valid full puzzles', () => {
  const first = generateRandomPuzzle(20260715);
  const second = generateRandomPuzzle(20260715);
  assert.deepEqual(first, second);
  assert.equal(first.ropes.length, 10);
  assert.equal(getEmptyHoles(first).length, 2);
  assert.equal(validatePuzzle(first).valid, true);
  for (const rope of first.ropes) {
    assert.ok(countActiveTurns(first, rope.id) <= 2);
    assert.ok(countPassiveHooks(first, rope.id) <= 3);
  }
});
