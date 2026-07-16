import {
  createGameState,
  generateRandomPuzzle,
  isRopeRemovable,
  moveEndpoint,
  removeRope,
} from './topology.js';

function knotTurns(game) {
  return game.interactions.reduce((sum, interaction) => sum + interaction.turns, 0);
}

function stateKey(game) {
  const ropes = [...game.ropes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((rope) => `${rope.id}:${rope.endpoints.A}:${rope.endpoints.B}`)
    .join('|');
  const knots = [...game.interactions]
    .map((item) => `${item.actorRopeId}>${item.targetRopeId}:${item.turns}:${item.targetT.toFixed(4)}`)
    .sort()
    .join('|');
  const crossings = [...(game.crossings ?? [])]
    .map((item) => `${item.actorRopeId}>${item.targetRopeId}:${item.order}:${item.targetT.toFixed(4)}`)
    .sort()
    .join('|');
  return `${ropes}#${knots}#${crossings}`;
}

function removeFreeRopes(game) {
  let next = game;
  const removed = [];
  while (true) {
    const removable = next.ropes
      .filter((rope) => isRopeRemovable(next, rope.id))
      .sort((a, b) => b.creationOrder - a.creationOrder);
    if (!removable.length) break;
    const rope = removable[0];
    next = removeRope(next, rope.id);
    removed.push(rope.id);
  }
  return { game: next, removed };
}

function priority(node) {
  return knotTurns(node.game) * 100 + node.game.ropes.length * 5 + node.moves.length;
}

function candidateMoves(game) {
  const emptyHoles = game.holes.filter((hole) => !hole.occupant).map((hole) => hole.id);
  const involved = new Set(game.interactions.flatMap((item) => [item.actorRopeId, item.targetRopeId]));
  const ropes = [...game.ropes].sort((a, b) => {
    const aInvolved = involved.has(a.id) ? 1 : 0;
    const bInvolved = involved.has(b.id) ? 1 : 0;
    return bInvolved - aInvolved || b.creationOrder - a.creationOrder;
  });
  const result = [];

  for (const rope of ropes) {
    for (const endpoint of ['A', 'B']) {
      for (const destinationHoleId of emptyHoles) {
        const fromHoleId = rope.endpoints[endpoint];
        const nextGame = moveEndpoint(game, rope.id, endpoint, destinationHoleId);
        const normalized = removeFreeRopes(nextGame);
        result.push({
          game: normalized.game,
          move: {
            ropeId: rope.id,
            endpoint,
            fromHoleId,
            destinationHoleId,
            contacts: nextGame.lastMove.contacts.map((item) => item.targetRopeId),
            released: nextGame.lastMove.released,
            created: nextGame.lastMove.created,
          },
          removed: normalized.removed,
        });
      }
    }
  }

  return result.sort((a, b) => (
    knotTurns(a.game) - knotTurns(b.game)
      || a.game.ropes.length - b.game.ropes.length
  ));
}

export function solvePuzzle(puzzle, { maxDepth = 8, maxStates = 12000, beamWidth = 20 } = {}) {
  const initial = removeFreeRopes(createGameState(puzzle));
  if (!initial.game.ropes.length) {
    return { solvable: true, moveCount: 0, removalCount: initial.removed.length, moves: [], remainingRopes: 0 };
  }

  const queue = [{ game: initial.game, moves: [], removalCount: initial.removed.length }];
  const seenDepth = new Map([[stateKey(initial.game), 0]]);
  let exploredStates = 0;

  while (queue.length && exploredStates < maxStates) {
    queue.sort((a, b) => priority(a) - priority(b));
    const current = queue.shift();
    exploredStates += 1;
    if (current.moves.length >= maxDepth) continue;

    const currentTurns = knotTurns(current.game);
    const candidates = candidateMoves(current.game)
      .filter((candidate) => knotTurns(candidate.game) <= currentTurns + 1)
      .slice(0, beamWidth);

    for (const candidate of candidates) {
      const moves = [...current.moves, candidate.move];
      const removalCount = current.removalCount + candidate.removed.length;
      if (!candidate.game.ropes.length) {
        return {
          solvable: true,
          moveCount: moves.length,
          removalCount,
          moves,
          remainingRopes: 0,
          exploredStates,
        };
      }
      const key = stateKey(candidate.game);
      const previousDepth = seenDepth.get(key);
      if (previousDepth !== undefined && previousDepth <= moves.length) continue;
      seenDepth.set(key, moves.length);
      queue.push({ game: candidate.game, moves, removalCount });
    }
  }

  return {
    solvable: false,
    moveCount: 0,
    removalCount: initial.removed.length,
    moves: [],
    remainingRopes: initial.game.ropes.length,
    exploredStates,
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
