import { HOLE_COUNT } from './constants.js';
import { findMovementContacts, resolveDraftInteractions } from './geometry.js';

export { HOLE_COUNT };
export const MAX_ROPES = 10;
export const MAX_UNDERPASS_CLICKS = 2;
export const MAX_PASSIVE_HOOKS = 3;
export const PASSIVE_SLOTS = Object.freeze([0.5, 0.25, 0.75]);

export const ROPE_DEFS = Object.freeze([
  { id: 'rope-1', name: '珊瑚紅', color: '#ff6b6b' },
  { id: 'rope-2', name: '天空藍', color: '#4dabf7' },
  { id: 'rope-3', name: '薄荷綠', color: '#51cf66' },
  { id: 'rope-4', name: '亮黃色', color: '#ffd43b' },
  { id: 'rope-5', name: '葡萄紫', color: '#b197fc' },
  { id: 'rope-6', name: '暖橙色', color: '#ff922b' },
  { id: 'rope-7', name: '桃紅色', color: '#f06595' },
  { id: 'rope-8', name: '湖水青', color: '#22b8cf' },
  { id: 'rope-9', name: '萊姆綠', color: '#94d82d' },
  { id: 'rope-10', name: '靛青色', color: '#748ffc' },
]);

function cleanSnapshot(state) {
  const copy = structuredClone(state);
  copy.history = [];
  return copy;
}

function commitChange(previous, next) {
  return {
    ...next,
    history: [...previous.history, cleanSnapshot(previous)],
  };
}

function assertHole(state, holeId) {
  if (!Number.isInteger(holeId) || holeId < 0 || holeId >= HOLE_COUNT) {
    throw new Error(`未知洞位：${holeId}`);
  }
  return state.holes[holeId];
}

function assertEmptyHole(state, holeId) {
  const hole = assertHole(state, holeId);
  if (hole.occupant) throw new Error(`洞位 ${holeId + 1} 不是空洞。`);
  return hole;
}

export function createAuthoringState({ seed = null } = {}) {
  return {
    holes: Array.from({ length: HOLE_COUNT }, (_, id) => ({
      id,
      angle: (Math.PI * 2 * id) / HOLE_COUNT - Math.PI / 2,
      occupant: null,
    })),
    ropes: [],
    crossings: [],
    interactions: [],
    draft: null,
    nextRopeIndex: 0,
    history: [],
    seed,
  };
}

export function getEmptyHoles(state) {
  return state.holes.filter((hole) => hole.occupant === null);
}

export function countUnderpassClicks(state, ropeId) {
  let total = state.interactions
    .filter((interaction) => interaction.actorRopeId === ropeId)
    .reduce((sum, interaction) => sum + (interaction.clicks ?? interaction.turns), 0);
  total += (state.crossings ?? [])
    .filter((crossing) => crossing.actorRopeId === ropeId)
    .reduce((sum, crossing) => sum + (crossing.clicks ?? 1), 0);
  if (state.draft?.ropeId === ropeId) total += state.draft.wraps.length;
  return total;
}

export function countPassiveHooks(state, ropeId) {
  const committedTargets = state.interactions.filter((interaction) => interaction.targetRopeId === ropeId).length
    + (state.crossings ?? []).filter((crossing) => crossing.targetRopeId === ropeId).length;
  if (!state.draft) return committedTargets;
  const draftTargets = new Set(
    state.draft.wraps
      .filter((wrap) => wrap.targetRopeId === ropeId)
      .map((wrap) => wrap.targetRopeId),
  );
  return committedTargets + draftTargets.size;
}

export function beginRope(state, holeId) {
  if (state.draft) throw new Error('請先完成或復原目前正在建立的繩子。');
  if (state.nextRopeIndex >= MAX_ROPES) throw new Error('十條繩子都已完成。');
  assertEmptyHole(state, holeId);

  const definition = ROPE_DEFS[state.nextRopeIndex];
  const holes = structuredClone(state.holes);
  holes[holeId].occupant = { ropeId: definition.id, end: 'A', draft: true };

  return commitChange(state, {
    ...state,
    holes,
    draft: {
      ropeId: definition.id,
      startHole: holeId,
      wraps: [],
    },
  });
}

export function addUnderpass(state, targetRopeId) {
  if (!state.draft) throw new Error('請先選擇繩子的起點。');
  if (targetRopeId === state.draft.ropeId) throw new Error('繩子不能從自己下方穿過。');
  if (!state.ropes.some((rope) => rope.id === targetRopeId)) throw new Error('只能從已完成的繩子下方穿過。');

  const activePasses = countUnderpassClicks(state, state.draft.ropeId);
  if (activePasses >= MAX_UNDERPASS_CLICKS) throw new Error('這條繩子已達下穿上限 2 次。');

  const existingPass = state.draft.wraps.find((wrap) => wrap.targetRopeId === targetRopeId);
  let targetT = existingPass?.targetT;
  if (targetT === undefined) {
    const passiveHooks = countPassiveHooks(state, targetRopeId);
    if (passiveHooks >= MAX_PASSIVE_HOOKS) throw new Error('目標繩已達被動交匯上限 3 個。');
    targetT = PASSIVE_SLOTS[passiveHooks];
  }

  const previousPasses = state.draft.wraps.filter((wrap) => wrap.targetRopeId === targetRopeId).length;
  const wraps = [
    ...state.draft.wraps,
    {
      targetRopeId,
      targetT,
      passIndex: previousPasses + 1,
    },
  ];

  return commitChange(state, {
    ...state,
    draft: { ...state.draft, wraps },
  });
}

export function finishRope(state, endHoleId) {
  if (!state.draft) throw new Error('請先選擇繩子的起點。');
  assertEmptyHole(state, endHoleId);

  const holes = structuredClone(state.holes);
  const startHole = state.draft.startHole;
  holes[startHole].occupant = { ropeId: state.draft.ropeId, end: 'A' };
  holes[endHoleId].occupant = { ropeId: state.draft.ropeId, end: 'B' };

  const definition = ROPE_DEFS[state.nextRopeIndex];
  const rope = {
    id: definition.id,
    name: definition.name,
    color: definition.color,
    creationOrder: state.nextRopeIndex,
    endpoints: { A: startHole, B: endHoleId },
  };
  const resolvedTopology = resolveDraftInteractions(state, endHoleId);
  const resolvedCrossings = resolvedTopology.filter((item) => item.twists === 0);
  const resolvedInteractions = resolvedTopology.filter((item) => item.twists > 0);
  const crossings = resolvedCrossings.map((crossing, index) => ({
    id: `crossing-${(state.crossings ?? []).length + index + 1}`,
    actorRopeId: state.draft.ropeId,
    targetRopeId: crossing.targetRopeId,
    targetT: crossing.targetT,
    clicks: crossing.clicks,
    kind: 'underpass',
    order: 'actor-under',
    routeOrder: crossing.routeOrder,
  }));
  const interactions = resolvedInteractions.map((interaction, index) => ({
    id: `interaction-${state.interactions.length + index + 1}`,
    actorRopeId: state.draft.ropeId,
    ...structuredClone(interaction),
  }));

  return commitChange(state, {
    ...state,
    holes,
    ropes: [...state.ropes, rope],
    crossings: [...(state.crossings ?? []), ...crossings],
    interactions: [...state.interactions, ...interactions],
    draft: null,
    nextRopeIndex: state.nextRopeIndex + 1,
  });
}

export function undo(state) {
  const previous = state.history.at(-1);
  if (!previous) return state;
  return {
    ...structuredClone(previous),
    history: state.history.slice(0, -1),
  };
}

export function validatePuzzle(state) {
  const errors = [];
  if (state.holes.length !== HOLE_COUNT) errors.push(`盤面必須有 ${HOLE_COUNT} 個洞。`);
  if (state.ropes.length > MAX_ROPES) errors.push('繩子超過 10 條。');

  const occupied = state.holes.filter((hole) => hole.occupant).length;
  const expectedOccupied = state.ropes.length * 2 + (state.draft ? 1 : 0);
  if (occupied !== expectedOccupied) errors.push('洞位占用數與繩端數不一致。');
  if (state.ropes.length === MAX_ROPES && getEmptyHoles(state).length !== 2) {
    errors.push('完成出題後必須保留 2 個空洞。');
  }

  for (const rope of state.ropes) {
    if (countUnderpassClicks(state, rope.id) > MAX_UNDERPASS_CLICKS) errors.push(`${rope.name} 下穿超過 2 次。`);
    if (countPassiveHooks(state, rope.id) > MAX_PASSIVE_HOOKS) errors.push(`${rope.name} 被動交匯超過 3 個。`);
  }

  for (const interaction of state.interactions) {
    if (!PASSIVE_SLOTS.includes(interaction.targetT)) errors.push(`${interaction.id} 使用無效節點。`);
    if (![1, 2].includes(interaction.turns)) errors.push(`${interaction.id} 圈數無效。`);
  }
  for (const crossing of state.crossings ?? []) {
    if (!PASSIVE_SLOTS.includes(crossing.targetT)) errors.push(`${crossing.id} 使用無效視覺交點。`);
  }

  return { valid: errors.length === 0, errors };
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function generateRandomPuzzle(seed = Date.now()) {
  const normalizedSeed = Number(seed) >>> 0;
  const random = mulberry32(normalizedSeed);
  const holeOrder = shuffled(Array.from({ length: HOLE_COUNT }, (_, id) => id), random);
  let state = createAuthoringState({ seed: normalizedSeed });

  for (let ropeIndex = 0; ropeIndex < MAX_ROPES; ropeIndex += 1) {
    state = beginRope(state, holeOrder[ropeIndex * 2]);

    if (ropeIndex > 0) {
      const desiredTurns = Math.floor(random() * 3);
      for (let turn = 0; turn < desiredTurns; turn += 1) {
        const existingTarget = state.draft.wraps[0]?.targetRopeId;
        let candidates = state.ropes.filter((rope) => countPassiveHooks(state, rope.id) < MAX_PASSIVE_HOOKS);
        if (turn === 1 && existingTarget && random() < 0.38) {
          candidates = state.ropes.filter((rope) => rope.id === existingTarget);
        }
        if (!candidates.length) break;
        const target = candidates[Math.floor(random() * candidates.length)];
        try {
          state = addUnderpass(state, target.id);
        } catch {
          break;
        }
      }
    }

    state = finishRope(state, holeOrder[ropeIndex * 2 + 1]);
  }

  return {
    ...state,
    history: [],
  };
}

function gamePuzzleSnapshot(state) {
  return {
    holes: structuredClone(state.holes),
    ropes: structuredClone(state.ropes),
    crossings: structuredClone(state.crossings ?? []),
    interactions: structuredClone(state.interactions),
    seed: state.seed ?? null,
  };
}

export function createGameState(puzzleState) {
  if (puzzleState.draft) throw new Error('請先完成正在建立的繩子。');
  const puzzle = gamePuzzleSnapshot(puzzleState);
  return {
    ...structuredClone(puzzle),
    initialPuzzle: structuredClone(puzzle),
    moveCount: 0,
    removedCount: 0,
    lastMove: null,
  };
}

export function moveEndpoint(game, ropeId, endpoint, destinationHoleId) {
  if (!['A', 'B'].includes(endpoint)) throw new Error('未知的繩端。');
  const rope = game.ropes.find((item) => item.id === ropeId);
  if (!rope) throw new Error('找不到這條繩子。');
  assertEmptyHole(game, destinationHoleId);

  const sourceHoleId = rope.endpoints[endpoint];
  const contacts = findMovementContacts(game, ropeId, sourceHoleId, destinationHoleId);
  const hasLayerDifference = (game.crossings ?? []).some((item) => (
    (item.actorRopeId === ropeId && item.order === 'actor-under')
      || (item.targetRopeId === ropeId && item.order === 'actor-over')
  )) || game.interactions.some(
    (item) => item.actorRopeId === ropeId || item.targetRopeId === ropeId,
  );
  const relationFor = (targetRopeId) => game.interactions.find((item) => (
    (item.actorRopeId === ropeId && item.targetRopeId === targetRopeId)
      || (item.targetRopeId === ropeId && item.actorRopeId === targetRopeId)
  ));
  const effectiveContact = contacts.find((contact) => relationFor(contact.targetRopeId) || hasLayerDifference) ?? null;
  const existingRelation = effectiveContact ? relationFor(effectiveContact.targetRopeId) : null;

  const holes = structuredClone(game.holes);
  holes[sourceHoleId].occupant = null;
  holes[destinationHoleId].occupant = { ropeId, end: endpoint };

  const ropes = structuredClone(game.ropes);
  ropes.find((item) => item.id === ropeId).endpoints[endpoint] = destinationHoleId;

  const released = [];
  const created = [];
  let interactions = game.interactions.map((interaction) => structuredClone(interaction));
  let crossings = (game.crossings ?? []).map((crossing) => structuredClone(crossing));

  if (existingRelation) {
    interactions = interactions.flatMap((interaction) => {
      if (interaction.id !== existingRelation.id) return [interaction];
      const turns = interaction.turns - 1;
      released.push({
        interactionId: interaction.id,
        targetRopeId: effectiveContact.targetRopeId,
        remainingTurns: Math.max(0, turns),
      });
      if (turns <= 0) return [];
      return [{ ...interaction, turns, twists: turns, kind: turns === 2 ? 'helix' : 'twist' }];
    });
  } else if (effectiveContact) {
    const interaction = {
      id: `interaction-game-${game.moveCount + 1}-${interactions.length + 1}`,
      actorRopeId: ropeId,
      targetRopeId: effectiveContact.targetRopeId,
      targetT: effectiveContact.targetT,
      turns: 1,
      twists: 1,
      kind: 'twist',
      source: 'gameplay',
      routeOrder: endpoint === 'A' ? -(game.moveCount + 1) : 1000 + game.moveCount + 1,
      localOrder: { before: 'actor-top', atNode: 'actor-under', after: 'actor-top' },
    };
    interactions.push(interaction);
    created.push({
      interactionId: interaction.id,
      targetRopeId: interaction.targetRopeId,
      targetT: interaction.targetT,
    });
    crossings = crossings.filter((crossing) => !(
      (crossing.actorRopeId === ropeId && crossing.targetRopeId === interaction.targetRopeId)
        || (crossing.targetRopeId === ropeId && crossing.actorRopeId === interaction.targetRopeId)
    ));
  }

  for (const contact of contacts) {
    if (interactions.some((item) => (
      (item.actorRopeId === ropeId && item.targetRopeId === contact.targetRopeId)
        || (item.targetRopeId === ropeId && item.actorRopeId === contact.targetRopeId)
    ))) continue;
    if (crossings.some((item) => item.actorRopeId === ropeId && item.targetRopeId === contact.targetRopeId)) continue;
    crossings.push({
      id: `crossing-game-${game.moveCount + 1}-${crossings.length + 1}`,
      actorRopeId: ropeId,
      targetRopeId: contact.targetRopeId,
      targetT: contact.targetT,
      kind: 'overpass',
      order: 'actor-over',
      source: 'gameplay',
      routeOrder: endpoint === 'A' ? -(game.moveCount + 1) : 1000 + game.moveCount + 1,
    });
  }

  return {
    ...game,
    holes,
    ropes,
    crossings,
    interactions,
    moveCount: game.moveCount + 1,
    lastMove: {
      ropeId,
      endpoint,
      fromHoleId: sourceHoleId,
      toHoleId: destinationHoleId,
      contacts,
      released,
      created,
    },
  };
}

export function isRopeRemovable(game, ropeId) {
  const rope = game.ropes.find((item) => item.id === ropeId);
  if (!rope) return false;
  return !game.interactions.some(
    (interaction) => interaction.actorRopeId === ropeId || interaction.targetRopeId === ropeId,
  );
}

export function removeRope(game, ropeId) {
  const rope = game.ropes.find((item) => item.id === ropeId);
  if (!rope) throw new Error('找不到這條繩子。');
  if (!isRopeRemovable(game, ropeId)) throw new Error('這條繩子尚未完全位於最上層。');

  const holes = structuredClone(game.holes);
  for (const hole of holes) {
    if (hole.occupant?.ropeId === ropeId) hole.occupant = null;
  }

  return {
    ...game,
    holes,
    ropes: game.ropes.filter((item) => item.id !== ropeId).map((item) => structuredClone(item)),
    crossings: (game.crossings ?? [])
      .filter((crossing) => crossing.actorRopeId !== ropeId && crossing.targetRopeId !== ropeId)
      .map((crossing) => structuredClone(crossing)),
    interactions: game.interactions
      .filter((interaction) => interaction.actorRopeId !== ropeId && interaction.targetRopeId !== ropeId)
      .map((interaction) => structuredClone(interaction)),
    removedCount: game.removedCount + 1,
    lastRemoval: { ropeId },
  };
}

export function isGameComplete(game) {
  return game.ropes.length === 0;
}

export function restartGame(game) {
  return createGameState(game.initialPuzzle);
}
