import { HOLE_COUNT } from './topology.js';

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
