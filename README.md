# Rope Untangling Lab

A Three.js interaction prototype for testing explicit rope wrapping and unwrapping gestures with four ropes and integer turn counts.

## What is implemented

- Four selectable 3D ropes: red, blue, green, and yellow.
- A real topology ledger storing signed integer turns (`-3…+3`) for each active rope pair.
- Circular pointer/touch gesture: one physical orbit adds or removes one turn.
- Accessible `+1` / `-1` controls, undo, reset, and clear actions.
- Live Three.js spline/tube deformation and a 3D wrap gizmo.
- Initial puzzle contains four active pairings and six total turns to remove.
- Responsive desktop/mobile HUD.
- Pure topology tests plus production build verification.

## Local development

```bash
npm install
npm run dev
```

Then open the URL printed by Vite.

## Verification

```bash
npm run check
npm test
npm run build
```

## Controls

1. Select a moving rope, then a target rope, either in the 3D scene or with the color chips.
2. Drag the wheel knob around a full circle. Clockwise adds `+1`; counter-clockwise adds `-1`.
3. Use the exact `±1` buttons when testing discrete values.
4. Drag the empty 3D scene to rotate the camera; scroll/pinch to zoom.
5. Apply opposite turns until the topology ledger reaches zero.

## Design note

Three.js renders the ropes, but the topology ledger is authoritative. This hybrid avoids unstable soft-body knot physics while keeping every winding operation inspectable, undoable, and deterministic.
