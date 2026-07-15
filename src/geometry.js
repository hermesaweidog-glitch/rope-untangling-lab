import { HOLE_COUNT } from './constants.js';

export const BOARD_CENTER = Object.freeze({ x: 500, y: 380 });
export const BOARD_RADIUS = 276;
export const HOLE_HIT_RADIUS = 57;

export function holePoint(holeId) {
  const angle = (Math.PI * 2 * holeId) / HOLE_COUNT - Math.PI / 2;
  return {
    x: BOARD_CENTER.x + Math.cos(angle) * BOARD_RADIUS,
    y: BOARD_CENTER.y + Math.sin(angle) * BOARD_RADIUS,
  };
}

export function nearestHole(point, maxDistance = HOLE_HIT_RADIUS) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (let id = 0; id < HOLE_COUNT; id += 1) {
    const position = holePoint(id);
    const currentDistance = Math.hypot(point.x - position.x, point.y - position.y);
    if (currentDistance < nearestDistance) {
      nearest = { id, point: position, distance: currentDistance };
      nearestDistance = currentDistance;
    }
  }
  return nearestDistance <= maxDistance ? nearest : null;
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function catmullPoint(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

export function sampleCurve(waypoints, samplesPerSegment = 24) {
  if (waypoints.length < 2) return [...waypoints];
  const samples = [];
  for (let segment = 0; segment < waypoints.length - 1; segment += 1) {
    const p0 = waypoints[Math.max(0, segment - 1)];
    const p1 = waypoints[segment];
    const p2 = waypoints[segment + 1];
    const p3 = waypoints[Math.min(waypoints.length - 1, segment + 2)];
    for (let step = 0; step < samplesPerSegment; step += 1) {
      samples.push(catmullPoint(p0, p1, p2, p3, step / samplesPerSegment));
    }
  }
  samples.push(waypoints.at(-1));
  return samples;
}

export function pointAndTangentAt(samples, normalizedT) {
  if (!samples.length) return { point: { ...BOARD_CENTER }, tangent: { x: 1, y: 0 } };
  if (samples.length === 1) return { point: { ...samples[0] }, tangent: { x: 1, y: 0 } };

  const lengths = [];
  let total = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const length = distance(samples[index - 1], samples[index]);
    lengths.push(length);
    total += length;
  }
  const target = Math.max(0, Math.min(1, normalizedT)) * total;
  let travelled = 0;

  for (let index = 0; index < lengths.length; index += 1) {
    const segmentLength = lengths[index];
    if (travelled + segmentLength >= target || index === lengths.length - 1) {
      const local = segmentLength === 0 ? 0 : (target - travelled) / segmentLength;
      const start = samples[index];
      const end = samples[index + 1];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const magnitude = Math.hypot(dx, dy) || 1;
      return {
        point: {
          x: start.x + dx * local,
          y: start.y + dy * local,
        },
        tangent: { x: dx / magnitude, y: dy / magnitude },
      };
    }
    travelled += segmentLength;
  }

  return { point: { ...samples.at(-1) }, tangent: { x: 1, y: 0 } };
}

export function pathFromSamples(samples) {
  if (!samples.length) return '';
  return samples.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
}

export function buildPuzzleGeometry(state) {
  const ropes = new Map();
  const interactionGeometry = [];

  for (const rope of [...state.ropes].sort((a, b) => a.creationOrder - b.creationOrder)) {
    const ropeInteractions = state.interactions.filter((interaction) => interaction.actorRopeId === rope.id);
    const waypoints = [holePoint(rope.endpoints.A)];

    for (const interaction of ropeInteractions) {
      const target = ropes.get(interaction.targetRopeId);
      if (!target) continue;
      const hook = pointAndTangentAt(target.samples, interaction.targetT);
      waypoints.push(hook.point);
      interactionGeometry.push({
        ...interaction,
        point: { ...hook.point },
        tangent: { ...hook.tangent },
      });
    }

    waypoints.push(holePoint(rope.endpoints.B));
    const samples = sampleCurve(waypoints);
    ropes.set(rope.id, {
      ...rope,
      waypoints,
      samples,
      path: pathFromSamples(samples),
    });
  }

  return { ropes, interactions: interactionGeometry };
}

function signedSide(point, origin, tangent) {
  return tangent.x * (point.y - origin.y) - tangent.y * (point.x - origin.x);
}

export function resolveDraftInteractions(state, endHoleId) {
  if (!state.draft) return [];
  const geometry = buildPuzzleGeometry(state);
  const events = state.draft.wraps;
  const eventHooks = events.map((event) => {
    const target = geometry.ropes.get(event.targetRopeId);
    if (!target) throw new Error('找不到下穿目標繩。');
    return pointAndTangentAt(target.samples, event.targetT);
  });
  const groups = new Map();
  events.forEach((event, index) => {
    if (!groups.has(event.targetRopeId)) groups.set(event.targetRopeId, []);
    groups.get(event.targetRopeId).push(index);
  });

  return [...groups.entries()].map(([targetRopeId, indexes]) => {
    const firstIndex = indexes[0];
    const lastIndex = indexes.at(-1);
    const event = events[firstIndex];
    const hook = eventHooks[firstIndex];
    const incoming = firstIndex === 0
      ? holePoint(state.draft.startHole)
      : eventHooks[firstIndex - 1].point;
    const outgoing = lastIndex === events.length - 1
      ? holePoint(endHoleId)
      : eventHooks[lastIndex + 1].point;
    const incomingSide = signedSide(incoming, hook.point, hook.tangent);
    const outgoingSide = signedSide(outgoing, hook.point, hook.tangent);
    const sameSide = incomingSide * outgoingSide > 0;
    const clicks = indexes.length;
    const twists = clicks === 1
      ? (sameSide ? 1 : 0)
      : (sameSide ? 1 : 2);

    return {
      targetRopeId,
      targetT: event.targetT,
      clicks,
      twists,
      turns: Math.max(1, twists),
      kind: twists === 0 ? 'underpass' : (twists === 1 ? 'twist' : 'helix'),
      sameSide,
      localOrder: {
        before: 'actor-top',
        atNode: 'actor-under',
        after: 'actor-top',
      },
    };
  });
}

function segmentsIntersect(a, b, c, d) {
  const denominator = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(denominator) < 0.000001) return false;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / denominator;
  const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / denominator;
  return t > 0.001 && t < 0.999 && u >= 0 && u <= 1;
}

export function findCrossedTargets(state, actorRopeId, fromHoleId, toHoleId) {
  const geometry = buildPuzzleGeometry(state);
  const movementStart = holePoint(fromHoleId);
  const movementEnd = holePoint(toHoleId);
  const activeTargets = new Set(
    state.interactions
      .filter((interaction) => interaction.actorRopeId === actorRopeId)
      .map((interaction) => interaction.targetRopeId),
  );
  const crossed = [];

  for (const targetRopeId of activeTargets) {
    const target = geometry.ropes.get(targetRopeId);
    if (!target) continue;
    for (let index = 1; index < target.samples.length; index += 1) {
      if (segmentsIntersect(movementStart, movementEnd, target.samples[index - 1], target.samples[index])) {
        crossed.push(targetRopeId);
        break;
      }
    }
  }
  return crossed;
}
