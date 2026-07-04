import { all } from "better-all";

export async function allMap<T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const tasks: Record<string, () => Promise<R>> = {};

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    tasks[String(index)] = async () => mapper(item, index);
  }

  const result = await all(tasks);
  return items.map((_, index) => result[String(index)]);
}