import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addUnderpass,
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

function placeRope(state, start, end) {
  return finishRope(beginRope(state, start), end);
}

function makeDoubleWrapPuzzle() {
  let state = createAuthoringState();
  state = placeRope(state, 0, 11);
  state = beginRope(state, 5);
  state = addUnderpass(state, 'rope-1');
  state = addUnderpass(state, 'rope-1');
  return finishRope(state, 16);
}

function topologyInteraction(id, actorRopeId, targetRopeId, targetT) {
  return {
    id,
    actorRopeId,
    targetRopeId,
    targetT,
    turns: 1,
    twists: 1,
    kind: 'twist',
    source: 'gameplay',
    routeOrder: 0,
    localOrder: { before: 'actor-top', atNode: 'actor-under', after: 'actor-top' },
  };
}

function visualCrossing(id, actorRopeId, targetRopeId, targetT = 0.5) {
  return {
    id,
    actorRopeId,
    targetRopeId,
    targetT,
    kind: 'underpass',
    order: 'actor-under',
    routeOrder: 0,
  };
}

test('a pure underpass is visual only and does not physically link or block either rope', () => {
  let puzzle = createAuthoringState();
  puzzle = placeRope(puzzle, 0, 11);
  puzzle = beginRope(puzzle, 5);
  puzzle = addUnderpass(puzzle, 'rope-1');
  puzzle = finishRope(puzzle, 16);
  let game = createGameState(puzzle);

  assert.equal(game.interactions.length, 0);
  assert.equal(game.crossings.length, 1);
  assert.equal(isRopeRemovable(game, 'rope-1'), true);
  assert.equal(isRopeRemovable(game, 'rope-2'), true);

  game = removeRope(game, 'rope-1');
  assert.equal(game.crossings.length, 0);
  assert.equal(game.ropes.length, 1);
  assert.equal(isRopeRemovable(game, 'rope-2'), true);
  game = removeRope(game, 'rope-2');
  assert.equal(isGameComplete(game), true);

  const restarted = restartGame(game);
  assert.equal(restarted.ropes.length, 2);
  assert.equal(restarted.moveCount, 0);
  assert.equal(restarted.removedCount, 0);
});

test('either endpoint of any rope can move, regardless of creation order', () => {
  let puzzle = createAuthoringState();
  puzzle = placeRope(puzzle, 0, 11);
  puzzle = placeRope(puzzle, 5, 6);
  const game = createGameState(puzzle);
  const moved = moveEndpoint(game, 'rope-1', 'A', 16);

  assert.equal(moved.ropes.find((rope) => rope.id === 'rope-1').endpoints.A, 16);
  assert.deepEqual(moved.holes[16].occupant, { ropeId: 'rope-1', end: 'A' });
  assert.equal(moved.holes[0].occupant, null);
});

test('repeated top-only crossings do not create a knot without an actual low layer', () => {
  let puzzle = createAuthoringState();
  puzzle = placeRope(puzzle, 0, 11);
  puzzle = placeRope(puzzle, 5, 6);
  let game = createGameState(puzzle);

  game = moveEndpoint(game, 'rope-2', 'A', 16);
  assert.equal(game.interactions.length, 0);
  assert.equal(game.crossings.some((item) => item.actorRopeId === 'rope-2' && item.order === 'actor-over'), true);

  game = moveEndpoint(game, 'rope-2', 'A', 4);
  assert.equal(game.interactions.length, 0);
});

test('moving across an existing double twist releases one layer per move', () => {
  let game = createGameState(makeDoubleWrapPuzzle());

  game = moveEndpoint(game, 'rope-2', 'A', 17);
  assert.equal(game.interactions[0].turns, 1);
  assert.equal(game.interactions[0].kind, 'twist');
  assert.equal(game.moveCount, 1);

  game = moveEndpoint(game, 'rope-2', 'A', 3);
  assert.equal(game.interactions.length, 0);
  assert.equal(game.moveCount, 2);
});

test('gameplay may add a fourth passive knot node although authoring is capped at three', () => {
  let puzzle = createAuthoringState();
  puzzle = placeRope(puzzle, 0, 11);
  puzzle = placeRope(puzzle, 5, 6);
  puzzle = placeRope(puzzle, 10, 12);
  let game = createGameState(puzzle);
  game.crossings = [visualCrossing('crossing-layer', 'rope-2', 'rope-3')];
  game.interactions = [
    topologyInteraction('existing-1', 'removed-rope-a', 'rope-1', 0.25),
    topologyInteraction('existing-2', 'removed-rope-b', 'rope-1', 0.5),
    topologyInteraction('existing-3', 'removed-rope-c', 'rope-1', 0.75),
  ];

  game = moveEndpoint(game, 'rope-2', 'A', 16);
  const targetNodes = game.interactions.filter((item) => item.targetRopeId === 'rope-1');
  assert.equal(targetNodes.length, 4);
  assert.equal(targetNodes.at(-1).actorRopeId, 'rope-2');
  assert.equal(targetNodes.at(-1).source, 'gameplay');
  assert.ok(targetNodes.at(-1).targetT > 0 && targetNodes.at(-1).targetT < 1);
});

test('a layered moving rope knots only with the first effective contact along its path', () => {
  let puzzle = createAuthoringState();
  puzzle = placeRope(puzzle, 0, 11);
  puzzle = placeRope(puzzle, 5, 6);
  puzzle = placeRope(puzzle, 3, 8);
  puzzle = placeRope(puzzle, 10, 12);
  let game = createGameState(puzzle);
  game.crossings = [visualCrossing('crossing-layer', 'rope-2', 'rope-4')];

  game = moveEndpoint(game, 'rope-2', 'A', 16);
  assert.equal(game.interactions.length, 1);
  assert.equal(game.interactions[0].actorRopeId, 'rope-2');
  assert.equal(game.interactions[0].targetRopeId, 'rope-3');
});
