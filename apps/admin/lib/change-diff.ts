import type { Change } from "@konfi/types";
import type {
  ChangeSnapshot,
  ChangeSnapshotValue,
} from "@/lib/change-snapshot";

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isSnapshotRecord(
  value: unknown,
): value is Record<string, ChangeSnapshotValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function diffValues(
  before: ChangeSnapshotValue | undefined,
  after: ChangeSnapshotValue | undefined,
  path: (string | number)[],
): Change[] {
  if (before === undefined && after === undefined) {
    return [];
  }

  if (before === undefined) {
    return [{ type: "CREATE", path, value: after }];
  }

  if (after === undefined) {
    return [{ type: "REMOVE", path, oldValue: before }];
  }

  if (Object.is(before, after)) {
    return [];
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const changes: Change[] = [];
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index++) {
      changes.push(
        ...diffValues(before[index], after[index], [...path, index]),
      );
    }
    return changes;
  }

  if (isSnapshotRecord(before) && isSnapshotRecord(after)) {
    const changes: Change[] = [];
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      changes.push(
        ...diffValues(
          hasOwn(before, key) ? before[key] : undefined,
          hasOwn(after, key) ? after[key] : undefined,
          [...path, key],
        ),
      );
    }
    return changes;
  }

  return [{ type: "CHANGE", path, value: after, oldValue: before }];
}

export function detectChanges(
  before: ChangeSnapshot | undefined | null,
  after: ChangeSnapshot | undefined | null,
): Change[] {
  if (!before && !after) {
    return [];
  }

  if (!before && after) {
    return [{ type: "CREATE", path: [], value: after }];
  }

  if (before && !after) {
    return [{ type: "REMOVE", path: [], oldValue: before }];
  }

  return diffValues(before ?? undefined, after ?? undefined, []);
}
