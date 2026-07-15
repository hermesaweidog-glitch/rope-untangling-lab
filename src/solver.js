import {
  createGameState,
  generateRandomPuzzle,
  isRopeRemovable,
  moveEndpoint,
  removeRope,
} from './topology.js';
import { findCrossedTargets } from './geometry.js';

function topRope(game) {
  return [...game.ropes].sort((a, b) => b.creationOrder - a.creationOrder)[0] ?? null;
}

function searchKey(game, ropeId) {
  const rope = game.ropes.find((item) => item.id === ropeId);
  const knots = game.interactions
    .filter((item) => item.actorRopeId === ropeId)
    .map((item) => `${item.targetRopeId}:${item.turns}`)
    .sort()
    .join(',');
  const emptyHoles = game.holes
    .filter((hole) => !hole.occupant)
    .map((hole) => hole.id)
    .join(',');
  return `${rope.endpoints.A}:${rope.endpoints.B}|${knots}|${emptyHoles}`;
}

export function solveTopRope(game, maxDepth = 8) {
  const top = topRope(game);
  if (!top) return { game, moves: [] };
  if (isRopeRemovable(game, top.id)) return { game, moves: [] };

  const queue = [{ game, moves: [] }];
  const seen = new Set([searchKey(game, top.id)]);
  while (queue.length) {
    const current = queue.shift();
    if (current.moves.length >= maxDepth) continue;
    const rope = current.game.ropes.find((item) => item.id === top.id);
    const emptyHoles = current.game.holes
      .filter((hole) => !hole.occupant)
      .map((hole) => hole.id);

    for (const endpoint of ['A', 'B']) {
      for (const destinationHoleId of emptyHoles) {
        const fromHoleId = rope.endpoints[endpoint];
        const crossedTargetIds = findCrossedTargets(
          current.game,
          top.id,
          fromHoleId,
          destinationHoleId,
        );
        const nextGame = moveEndpoint(
          current.game,
          top.id,
          endpoint,
          destinationHoleId,
          crossedTargetIds,
        );
        const moves = [...current.moves, {
          ropeId: top.id,
          endpoint,
          fromHoleId,
          destinationHoleId,
          crossedTargetIds,
        }];
        if (isRopeRemovable(nextGame, top.id)) return { game: nextGame, moves };
        const key = searchKey(nextGame, top.id);
        if (!seen.has(key)) {
          seen.add(key);
          queue.push({ game: nextGame, moves });
        }
      }
    }
  }
  return null;
}

export function solvePuzzle(puzzle, { maxDepth = 8 } = {}) {
  let game = createGameState(puzzle);
  const moves = [];
  let removalCount = 0;
  while (game.ropes.length) {
    const result = solveTopRope(game, maxDepth);
    if (!result) {
      return {
        solvable: false,
        moveCount: moves.length,
        removalCount,
        moves,
        remainingRopes: game.ropes.length,
      };
    }
    moves.push(...result.moves);
    const top = topRope(result.game);
    game = removeRope(result.game, top.id);
    removalCount += 1;
  }
  return {
    solvable: true,
    moveCount: moves.length,
    removalCount,
    moves,
    remainingRopes: 0,
  };
}

export function generatePlayablePuzzle(seed = Date.now(), { maxAttempts = 64, maxDepth = 8 } = {}) {
  const requestedSeed = Number(seed) >>> 0;
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidateSeed = (requestedSeed + offset) >>> 0;
    const puzzle = generateRandomPuzzle(candidateSeed);
    if (solvePuzzle(puzzle, { maxDepth }).solvable) return puzzle;
  }
  throw new Error(`連續 ${maxAttempts} 個 seed 都找不到可解題目。`);
}
