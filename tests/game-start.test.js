import test from 'node:test';
import assert from 'node:assert/strict';
import { assessGameStart } from '../src/game-start.js';
import { beginRope, createAuthoringState, finishRope } from '../src/topology.js';

function completeStructuralPuzzle() {
  let state = createAuthoringState();
  for (let ropeIndex = 0; ropeIndex < 10; ropeIndex += 1) {
    state = beginRope(state, ropeIndex * 2);
    state = finishRope(state, ropeIndex * 2 + 1);
  }
  return state;
}

test('a structurally valid ten-rope puzzle may enter play without a solver verdict', () => {
  const decision = assessGameStart(completeStructuralPuzzle());

  assert.deepEqual(decision, { allowed: true, message: null });
});
