export function assessGameStart() {
  return { allowed: true, message: null };
}

export function snapshotAuthoringStateForPlay(state) {
  return { ...structuredClone(state), draft: null };
}
