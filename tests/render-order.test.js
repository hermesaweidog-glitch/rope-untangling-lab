import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRenderStack } from '../src/render-order.js';

test('a higher rope covers unrelated lower knots but stays below its own knot', () => {
  const ropes = [
    { id: 'rope-1', creationOrder: 0 },
    { id: 'rope-2', creationOrder: 1 },
    { id: 'rope-10', creationOrder: 9 },
  ];
  const interactions = [
    { id: 'lower-knot', actorRopeId: 'rope-2', targetRopeId: 'rope-1' },
    { id: 'indigo-knot', actorRopeId: 'rope-10', targetRopeId: 'rope-1' },
  ];

  const stack = buildRenderStack(ropes, [], interactions)
    .map(({ kind, id }) => `${kind}:${id}`);

  assert.deepEqual(stack, [
    'rope:rope-1',
    'rope:rope-2',
    'interaction:lower-knot',
    'rope:rope-10',
    'interaction:indigo-knot',
  ]);
});

test('a crossing repaint follows both participants but precedes an unrelated higher rope', () => {
  const ropes = [
    { id: 'rope-1', creationOrder: 0 },
    { id: 'rope-2', creationOrder: 1 },
    { id: 'rope-3', creationOrder: 2 },
  ];
  const crossings = [
    { id: 'shared-crossing', actorRopeId: 'rope-2', targetRopeId: 'rope-1' },
  ];

  const stack = buildRenderStack(ropes, crossings, [])
    .map(({ kind, id }) => `${kind}:${id}`);

  assert.deepEqual(stack, [
    'rope:rope-1',
    'rope:rope-2',
    'crossing:shared-crossing',
    'rope:rope-3',
  ]);
});
