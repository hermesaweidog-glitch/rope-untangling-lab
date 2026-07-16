function pairLayer(item, orderByRope) {
  const actorLayer = orderByRope.get(item.actorRopeId);
  const targetLayer = orderByRope.get(item.targetRopeId);
  if (actorLayer === undefined || targetLayer === undefined) return null;
  return Math.max(actorLayer, targetLayer);
}

export function buildRenderStack(ropes, crossings = [], interactions = []) {
  const orderedRopes = [...ropes].sort((a, b) => a.creationOrder - b.creationOrder);
  const orderByRope = new Map(orderedRopes.map((rope) => [rope.id, rope.creationOrder]));
  const crossingsByLayer = new Map();
  const interactionsByLayer = new Map();

  for (const crossing of crossings) {
    const layer = pairLayer(crossing, orderByRope);
    if (layer === null) continue;
    const entries = crossingsByLayer.get(layer) ?? [];
    entries.push(crossing);
    crossingsByLayer.set(layer, entries);
  }

  for (const interaction of interactions) {
    const layer = pairLayer(interaction, orderByRope);
    if (layer === null) continue;
    const entries = interactionsByLayer.get(layer) ?? [];
    entries.push(interaction);
    interactionsByLayer.set(layer, entries);
  }

  const stack = [];
  for (const rope of orderedRopes) {
    const layer = rope.creationOrder;
    stack.push({ kind: 'rope', id: rope.id, item: rope, layer });
    for (const crossing of crossingsByLayer.get(layer) ?? []) {
      stack.push({ kind: 'crossing', id: crossing.id, item: crossing, layer });
    }
    for (const interaction of interactionsByLayer.get(layer) ?? []) {
      stack.push({ kind: 'interaction', id: interaction.id, item: interaction, layer });
    }
  }
  return stack;
}
