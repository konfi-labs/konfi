export interface TaxonomyDefinition {
  id: string;
  name: string;
  icon: string;
  colorPalette: string;
  order: number;
  enabled: boolean;
  archived?: boolean;
  isDefault?: boolean;
}

export function renumberTaxonomy<T extends TaxonomyDefinition>(
  definitions: readonly T[],
): T[] {
  return definitions.map((definition, index) => ({
    ...definition,
    order: index,
  }));
}

export function moveTaxonomy<T extends TaxonomyDefinition>(
  definitions: readonly T[],
  id: string,
  direction: -1 | 1,
): T[] {
  const index = definitions.findIndex((d) => d.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= definitions.length) {
    return [...definitions];
  }
  const next = [...definitions];
  const [item] = next.splice(index, 1);
  if (!item) return [...definitions];
  next.splice(target, 0, item);
  return renumberTaxonomy(next);
}
