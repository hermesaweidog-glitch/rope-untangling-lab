import test from 'node:test';
import assert from 'node:assert/strict';
import { generateRandomPuzzle } from '../src/topology.js';
import { generatePlayablePuzzle, solvePuzzle } from '../src/solver.js';

test('the reference tangled puzzle has a complete legal solution', () => {
  const result = solvePuzzle(generateRandomPuzzle(20260715));
  assert.equal(result.solvable, true);
  assert.equal(result.moveCount, 4);
  assert.equal(result.removalCount, 10);
});

test('playable generation is reproducible and guarded by the full-board solver', () => {
  const puzzle = generatePlayablePuzzle(2);
  const repeated = generatePlayablePuzzle(2);
  assert.deepEqual(repeated, puzzle);
  assert.equal(solvePuzzle(puzzle).solvable, true);
});
