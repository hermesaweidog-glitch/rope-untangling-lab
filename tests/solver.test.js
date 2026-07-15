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

test('playable generation skips a seed that fails the bounded legal solver', () => {
  const puzzle = generatePlayablePuzzle(2);
  assert.notEqual(puzzle.seed, 2);
  assert.equal(solvePuzzle(puzzle).solvable, true);
});
