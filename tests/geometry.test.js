import test from 'node:test';
import assert from 'node:assert/strict';
import { beginRope, addUnderpass, createAuthoringState, finishRope } from '../src/topology.js';
import {
  BOARD_CENTER,
  BOARD_RADIUS,
  HOLE_HIT_RADIUS,
  buildPuzzleGeometry,
  findCrossedTargets,
  findMovementContacts,
  holePoint,
  nearestHole,
  nearestTOnSamples,
  pointAndTangentAt,
} from '../src/geometry.js';

test('22 hole positions are distributed on the circular board rim', () => {
  const top = holePoint(0);
  assert.ok(Math.abs(top.x - BOARD_CENTER.x) < 0.0001);
  assert.ok(Math.abs(top.y - (BOARD_CENTER.y - BOARD_RADIUS)) < 0.0001);
  const opposite = holePoint(11);
  assert.ok(Math.abs(opposite.x - BOARD_CENTER.x) < 0.0001);
  assert.ok(Math.abs(opposite.y - (BOARD_CENTER.y + BOARD_RADIUS)) < 0.0001);
});

test('mobile hole hit target remains at least 44 CSS pixels wide', () => {
  const mobileBoardWidth = 400;
  const svgViewBoxWidth = 1000;
  const cssPixels = HOLE_HIT_RADIUS * 2 * mobileBoardWidth / svgViewBoxWidth;
  assert.ok(cssPixels >= 44);
});

test('overlapping mobile hit zones resolve to the geometrically nearest hole', () => {
  const holeOne = holePoint(0);
  const nearHoleOne = { x: holeOne.x + 5, y: holeOne.y + 4 };
  assert.equal(nearestHole(nearHoleOne)?.id, 0);
  assert.equal(nearestHole(BOARD_CENTER), null);
});

test('a rope-body click keeps its exact normalized position on the target curve', () => {
  let state = createAuthoringState();
  state = finishRope(beginRope(state, 0), 11);
  const samples = buildPuzzleGeometry(state).ropes.get('rope-1').samples;
  assert.ok(Math.abs(nearestTOnSamples(samples, BOARD_CENTER) - 0.5) < 0.01);
  assert.ok(Math.abs(nearestTOnSamples(samples, pointAndTangentAt(samples, 0.37).point) - 0.37) < 0.01);
});

test('movement geometry sees a pure crossing without treating it as an active knot target', () => {
  let state = createAuthoringState();
  state = finishRope(beginRope(state, 0), 11);
  state = beginRope(state, 5);
  state = addUnderpass(state, 'rope-1');
  state = finishRope(state, 16);

  assert.deepEqual(findMovementContacts(state, 'rope-2', 5, 17).map((item) => item.targetRopeId), ['rope-1']);
  assert.deepEqual(findCrossedTargets(state, 'rope-2', 5, 17), []);
  assert.deepEqual(findCrossedTargets(state, 'rope-2', 5, 6), []);
});

test('actor geometry passes through the target fixed hook point', () => {
  let state = createAuthoringState();
  state = finishRope(beginRope(state, 0), 11);
  state = beginRope(state, 5);
  state = addUnderpass(state, 'rope-1');
  state = finishRope(state, 16);
  const geometry = buildPuzzleGeometry(state);
  const interaction = geometry.crossings[0];
  const targetMidpoint = pointAndTangentAt(geometry.ropes.get('rope-1').samples, 0.5).point;
  assert.ok(Math.hypot(interaction.point.x - targetMidpoint.x, interaction.point.y - targetMidpoint.y) < 0.001);
  assert.equal(interaction.kind, 'underpass');
  assert.equal(interaction.order, 'actor-under');
});

test('two underpass clicks on the same target can resolve to one double-twist node', () => {
  let state = createAuthoringState();
  state = finishRope(beginRope(state, 0), 11);
  state = beginRope(state, 4);
  state = addUnderpass(state, 'rope-1');
  state = addUnderpass(state, 'rope-1');
  state = finishRope(state, 15);
  const geometry = buildPuzzleGeometry(state);
  assert.equal(geometry.interactions.length, 1);
  assert.equal(geometry.interactions[0].turns, 2);
  assert.match(geometry.ropes.get('rope-2').path, /^M /);
});
