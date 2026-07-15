import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTurn,
  createEmptyState,
  createInitialState,
  findPair,
  isSolved,
  totalAbsoluteTurns,
  undo,
} from '../src/topology.js';

test('initial puzzle has four ropes and six actual turns to remove', () => {
  const state = createInitialState();
  assert.equal(state.wraps.length, 4);
  assert.equal(totalAbsoluteTurns(state), 6);
  assert.equal(isSolved(state), false);
});

test('opposite integer turns cancel an existing wrap', () => {
  let state = createInitialState();
  state = applyTurn(state, 'red', 'blue', -1);
  assert.equal(findPair(state, 'red', 'blue').turns, 1);
  state = applyTurn(state, 'red', 'blue', -1);
  assert.equal(findPair(state, 'red', 'blue'), null);
});

test('new pair preserves the selected moving and target rope', () => {
  const state = applyTurn(createEmptyState(), 'yellow', 'red', 1);
  assert.deepEqual(findPair(state, 'red', 'yellow'), {
    moving: 'yellow',
    target: 'red',
    turns: 1,
  });
});

test('turn counts are clamped to the playable range', () => {
  let state = createEmptyState();
  state = applyTurn(state, 'red', 'green', 3);
  const unchanged = applyTurn(state, 'red', 'green', 1);
  assert.equal(unchanged, state);
  assert.equal(findPair(state, 'red', 'green').turns, 3);
});

test('undo restores the exact previous topology', () => {
  const initial = createInitialState();
  const changed = applyTurn(initial, 'green', 'red', 1);
  assert.equal(findPair(changed, 'green', 'red'), null);
  const restored = undo(changed);
  assert.equal(findPair(restored, 'green', 'red').turns, -1);
  assert.equal(restored.moves, 0);
});

test('all actual turns can be cancelled to solve the puzzle', () => {
  let state = createInitialState();
  state = applyTurn(state, 'red', 'blue', -2);
  state = applyTurn(state, 'green', 'red', 1);
  state = applyTurn(state, 'yellow', 'green', -1);
  state = applyTurn(state, 'blue', 'yellow', 2);
  assert.equal(totalAbsoluteTurns(state), 0);
  assert.equal(isSolved(state), true);
});
