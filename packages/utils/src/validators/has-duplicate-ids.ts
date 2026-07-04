export function hasDuplicateIds(ids: string[]): boolean {
  return new Set(ids).size !== ids.length;
}
