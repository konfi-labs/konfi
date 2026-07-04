/**
 * Pure list-manipulation helpers shared by all channel-methods configuration
 * pages (payment, printing, shipping). These are generic over any method
 * definition that has at minimum `id` and `order` fields.
 */

export function renumberMethods<T extends { order?: number }>(
  methods: readonly T[],
): T[] {
  return methods.map((method, index) => ({
    ...method,
    order: index,
  }));
}

export function moveMethod<T extends { id: string; order?: number }>(
  methods: readonly T[],
  id: string,
  direction: -1 | 1,
): T[] {
  const index = methods.findIndex((method) => method.id === id);
  const targetIndex = index + direction;

  if (index < 0 || targetIndex < 0 || targetIndex >= methods.length) {
    return [...methods];
  }

  const nextMethods = [...methods];
  const [method] = nextMethods.splice(index, 1);
  if (!method) {
    return [...methods];
  }

  nextMethods.splice(targetIndex, 0, method);
  return renumberMethods(nextMethods);
}
