export interface FakturowniaDepartmentLookup {
  id?: number | null;
  name?: string | null;
  shortcut?: string | null;
}

export interface DepartmentChannelLookup {
  id: string;
  name: string;
  warehouses?: string[];
}

export interface DepartmentWarehouseLookup {
  id: string;
  name: string;
  address?: {
    city?: string;
  } | null;
  keywords?: string[];
}

interface ScoredCandidate<T> {
  score: number;
  value: T;
}

const CHANNEL_EXACT_SCORE = 100;
const CHANNEL_TOKEN_SCORE = 90;
const WAREHOUSE_EXACT_SCORE = 80;
const WAREHOUSE_TOKEN_SCORE = 40;

function normalizeLookupText(value: string | null | undefined) {
  const normalized = value
    ?.trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return normalized || undefined;
}

function tokenizeLookupText(value: string) {
  return value.split(/[^a-z0-9]+/).filter(Boolean);
}

function getDepartmentTerms(department: FakturowniaDepartmentLookup) {
  const terms = [department.shortcut, department.name]
    .map(normalizeLookupText)
    .filter((term): term is string => Boolean(term));

  return Array.from(new Set(terms));
}

function scoreTextAgainstDepartmentTerms(
  value: string | null | undefined,
  departmentTerms: string[],
  exactScore: number,
  tokenScore: number,
) {
  const normalizedValue = normalizeLookupText(value);
  if (!normalizedValue) {
    return 0;
  }

  if (departmentTerms.includes(normalizedValue)) {
    return exactScore;
  }

  const valueTokens = new Set(tokenizeLookupText(normalizedValue));
  for (const term of departmentTerms) {
    const termTokens = tokenizeLookupText(term);
    if (
      termTokens.length > 0 &&
      termTokens.every((token) => valueTokens.has(token))
    ) {
      return tokenScore;
    }
  }

  return 0;
}

function getWarehouseScore(
  warehouse: DepartmentWarehouseLookup,
  departmentTerms: string[],
) {
  const searchableValues = [
    warehouse.id,
    warehouse.name,
    warehouse.address?.city,
    ...(warehouse.keywords ?? []),
  ];

  return searchableValues.reduce(
    (bestScore, value) =>
      Math.max(
        bestScore,
        scoreTextAgainstDepartmentTerms(
          value,
          departmentTerms,
          WAREHOUSE_EXACT_SCORE,
          WAREHOUSE_TOKEN_SCORE,
        ),
      ),
    0,
  );
}

function getChannelScore(
  channel: DepartmentChannelLookup,
  warehouses: readonly DepartmentWarehouseLookup[],
  departmentTerms: string[],
) {
  const channelScore = Math.max(
    scoreTextAgainstDepartmentTerms(
      channel.id,
      departmentTerms,
      CHANNEL_EXACT_SCORE,
      CHANNEL_TOKEN_SCORE,
    ),
    scoreTextAgainstDepartmentTerms(
      channel.name,
      departmentTerms,
      CHANNEL_EXACT_SCORE,
      CHANNEL_TOKEN_SCORE,
    ),
  );

  if (channelScore > 0) {
    return channelScore;
  }

  return (channel.warehouses ?? []).reduce((bestScore, warehouseId) => {
    const warehouse = warehouses.find((item) => item.id === warehouseId);
    if (!warehouse) {
      return bestScore;
    }

    return Math.max(bestScore, getWarehouseScore(warehouse, departmentTerms));
  }, 0);
}

function pickBestCandidate<T>(
  candidates: ScoredCandidate<T>[],
  isPreferred?: (value: T) => boolean,
) {
  if (candidates.length === 0) {
    return undefined;
  }

  const bestScore = Math.max(...candidates.map((candidate) => candidate.score));
  const bestCandidates = candidates.filter(
    (candidate) => candidate.score === bestScore,
  );

  const preferredCandidate = isPreferred
    ? bestCandidates.find((candidate) => isPreferred(candidate.value))
    : undefined;
  if (preferredCandidate) {
    return preferredCandidate.value;
  }

  if (bestCandidates.length === 1) {
    return bestCandidates[0]?.value;
  }

  return undefined;
}

export function findMatchingDepartmentForWarehouseText<
  TDepartment extends FakturowniaDepartmentLookup,
>(warehouseText: string, departments: readonly TDepartment[]) {
  const candidates = departments.flatMap((department) => {
    const departmentTerms = getDepartmentTerms(department);
    const score = scoreTextAgainstDepartmentTerms(
      warehouseText,
      departmentTerms,
      WAREHOUSE_EXACT_SCORE,
      WAREHOUSE_TOKEN_SCORE,
    );

    return score > 0 ? [{ score, value: department }] : [];
  });

  return pickBestCandidate(candidates);
}

export function findMatchingWarehouseForDepartment<
  TWarehouse extends DepartmentWarehouseLookup,
>(department: FakturowniaDepartmentLookup, warehouses: readonly TWarehouse[]) {
  const departmentTerms = getDepartmentTerms(department);
  const candidates = warehouses.flatMap((warehouse) => {
    const score = getWarehouseScore(warehouse, departmentTerms);

    return score > 0 ? [{ score, value: warehouse }] : [];
  });

  return pickBestCandidate(candidates);
}

export function resolveDepartmentChannelId({
  channels,
  departmentId,
  departments,
  preferredChannelId,
  warehouses,
}: {
  channels: readonly DepartmentChannelLookup[];
  departmentId: string | undefined;
  departments: readonly FakturowniaDepartmentLookup[];
  preferredChannelId?: string;
  warehouses: readonly DepartmentWarehouseLookup[];
}) {
  if (!departmentId) {
    return undefined;
  }

  const selectedDepartment = departments.find(
    (department) => department.id?.toString() === departmentId,
  );
  if (!selectedDepartment) {
    return undefined;
  }

  const departmentTerms = getDepartmentTerms(selectedDepartment);
  const candidates = channels.flatMap((channel) => {
    const score = getChannelScore(channel, warehouses, departmentTerms);

    return score > 0 ? [{ score, value: channel }] : [];
  });

  return pickBestCandidate(
    candidates,
    (channel) => channel.id === preferredChannelId,
  )?.id;
}
