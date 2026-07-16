import { validatePuzzle } from './topology.js';

export function assessGameStart(state) {
  if (state.ropes.length !== 10 || !validatePuzzle(state).valid) {
    return { allowed: false, message: '請先完成十條繩子的出題' };
  }
  return { allowed: true, message: null };
}
