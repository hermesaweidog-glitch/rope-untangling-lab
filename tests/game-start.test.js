import test from 'node:test';
import assert from 'node:assert/strict';
import * as gameStart from '../src/game-start.js';
import { beginRope, createAuthoringState, createGameState, finishRope } from '../src/topology.js';

function completeStructuralPuzzle() {
  let state = createAuthoringState();
  for (let ropeIndex = 0; ropeIndex < 10; ropeIndex += 1) {
    state = beginRope(state, ropeIndex * 2);
    state = finishRope(state, ropeIndex * 2 + 1);
  }
  return state;
}

test('a structurally valid ten-rope puzzle may enter play without a solver verdict', () => {
  const decision = gameStart.assessGameStart(completeStructuralPuzzle());

  assert.deepEqual(decision, { allowed: true, message: null });
});

test('a partial authored board may enter play immediately', () => {
  let partial = createAuthoringState();
  partial = finishRope(beginRope(partial, 0), 11);
  partial = finishRope(beginRope(partial, 5), 16);

  assert.deepEqual(gameStart.assessGameStart(partial), { allowed: true, message: null });
});

test('starting during an unfinished rope discards only the draft', () => {
  let authored = finishRope(beginRope(createAuthoringState(), 0), 11);
  authored = beginRope(authored, 5);

  const game = createGameState(authored);

  assert.equal(game.ropes.length, 1);
  assert.equal(game.ropes[0].id, 'rope-1');
  assert.equal(game.draft, undefined);
});

test('returning from play does not restore a discarded draft', () => {
  let authored = finishRope(beginRope(createAuthoringState(), 0), 11);
  authored = beginRope(authored, 5);

  assert.equal(typeof gameStart.snapshotAuthoringStateForPlay, 'function');
  const snapshot = gameStart.snapshotAuthoringStateForPlay(authored);

  assert.equal(snapshot.ropes.length, 1);
  assert.equal(snapshot.draft, null);
});
