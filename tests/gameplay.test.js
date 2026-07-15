import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addWrap,
  beginRope,
  createAuthoringState,
  createGameState,
  finishRope,
  isGameComplete,
  isRopeRemovable,
  moveEndpoint,
  removeRope,
  restartGame,
} from '../src/topology.js';

function makeDoubleWrapPuzzle() {
  let state = createAuthoringState();
  state = finishRope(beginRope(state, 0), 11);
  state = beginRope(state, 5);
  state = addWrap(state, 'rope-1');
  state = addWrap(state, 'rope-1');
  return finishRope(state, 16);
}

test('only the highest fully untangled rope can be removed until the board is empty', () => {
  let puzzle = createAuthoringState();
  puzzle = finishRope(beginRope(puzzle, 0), 11);
  puzzle = beginRope(puzzle, 5);
  puzzle = addWrap(puzzle, 'rope-1');
  puzzle = finishRope(puzzle, 16);
  let game = createGameState(puzzle);

  assert.equal(isRopeRemovable(game, 'rope-1'), false);
  assert.equal(isRopeRemovable(game, 'rope-2'), false);
  assert.throws(() => removeRope(game, 'rope-1'), /最上層/);

  game = moveEndpoint(game, 'rope-2', 'A', 2, ['rope-1']);
  assert.equal(isRopeRemovable(game, 'rope-2'), true);
  game = removeRope(game, 'rope-2');
  assert.equal(game.ropes.length, 1);
  assert.equal(game.removedCount, 1);
  assert.equal(game.holes[2].occupant, null);
  assert.equal(game.holes[16].occupant, null);

  assert.equal(isRopeRemovable(game, 'rope-1'), true);
  game = removeRope(game, 'rope-1');
  assert.equal(isGameComplete(game), true);

  const restarted = restartGame(game);
  assert.equal(restarted.ropes.length, 2);
  assert.equal(restarted.moveCount, 0);
  assert.equal(restarted.removedCount, 0);
});

test('moving an endpoint to an empty hole opens one turn of a crossed knot per move', () => {
  let game = createGameState(makeDoubleWrapPuzzle());

  game = moveEndpoint(game, 'rope-2', 'A', 2, ['rope-1']);
  assert.equal(game.holes[5].occupant, null);
  assert.deepEqual(game.holes[2].occupant, { ropeId: 'rope-2', end: 'A' });
  assert.equal(game.ropes.find((rope) => rope.id === 'rope-2').endpoints.A, 2);
  assert.equal(game.interactions[0].turns, 1);
  assert.equal(game.interactions[0].kind, 'crossing');
  assert.equal(game.moveCount, 1);

  game = moveEndpoint(game, 'rope-2', 'A', 3, ['rope-1']);
  assert.equal(game.interactions.length, 0);
  assert.equal(game.moveCount, 2);
});
