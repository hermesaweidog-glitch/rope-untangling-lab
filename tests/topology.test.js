import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOLE_COUNT,
  PASSIVE_SLOTS,
  ROPE_DEFS,
  addUnderpass,
  beginRope,
  countUnderpassClicks,
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
  for (const target of targets) next = addUnderpass(next, target);
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

test('a rope can record at most two underpass clicks', () => {
  let state = createAuthoringState();
  state = placeRope(state, 0, 1);
  state = placeRope(state, 2, 3);
  state = beginRope(state, 4);
  state = addUnderpass(state, 'rope-1');
  state = addUnderpass(state, 'rope-2');
  assert.equal(countUnderpassClicks(state, 'rope-3'), 2);
  assert.throws(() => addUnderpass(state, 'rope-1'), /下穿上限/);
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
  assert.throws(() => addUnderpass(state, 'rope-1'), /被動交匯上限/);
});

function twistScenario(clicks, endHoleId) {
  let state = createAuthoringState();
  state = placeRope(state, 0, 11);
  state = beginRope(state, 5);
  for (let index = 0; index < clicks; index += 1) state = addUnderpass(state, 'rope-1');
  return finishRope(state, endHoleId);
}

test('one underpass click ending on the opposite side is visual only, with no topology relation', () => {
  const state = twistScenario(1, 17);
  assert.equal(state.interactions.length, 0);
  assert.equal(state.crossings.length, 1);
  assert.equal(state.crossings[0].kind, 'underpass');
});

test('one underpass click ending on the starting side resolves to one twist', () => {
  const interaction = twistScenario(1, 6).interactions[0];
  assert.equal(interaction.kind, 'twist');
  assert.equal(interaction.twists, 1);
  assert.equal(interaction.turns, 1);
});

test('two underpass clicks ending on the opposite side resolve to a double twist', () => {
  const interaction = twistScenario(2, 17).interactions[0];
  assert.equal(interaction.kind, 'helix');
  assert.equal(interaction.twists, 2);
  assert.equal(interaction.turns, 2);
});

test('two underpass clicks ending on the starting side resolve to one twist', () => {
  const interaction = twistScenario(2, 6).interactions[0];
  assert.equal(interaction.kind, 'twist');
  assert.equal(interaction.twists, 1);
  assert.equal(interaction.turns, 1);
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
    assert.ok(countUnderpassClicks(first, rope.id) <= 2);
    assert.ok(countPassiveHooks(first, rope.id) <= 3);
  }
});
