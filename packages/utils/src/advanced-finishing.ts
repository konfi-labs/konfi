import {
  AdvancedAttributeSelection,
  AdvancedEdgeFinishing,
  AdvancedEdgeSide,
  AdvancedFinishingPreset,
  AdvancedFinishingType,
} from "@konfi/types";

const ALL_SIDES: AdvancedEdgeSide[] = ["top", "right", "bottom", "left"];

const defaultGrommets = {
  sides: [] as AdvancedEdgeSide[],
  spacing: 50,
  offsetStart: 0,
  offsetEnd: 0,
};

const uniqueSides = (sides: AdvancedEdgeSide[]): AdvancedEdgeSide[] =>
  ALL_SIDES.filter((side) => sides.includes(side));

export const createEmptyAdvancedSelection = (
  presetId?: string,
): AdvancedAttributeSelection => ({
  preset: presetId,
  reinforcementSides: [],
  tunnelSides: [],
  grommets: { ...defaultGrommets },
  cutToSize: false,
});

type LegacySelection = AdvancedAttributeSelection & {
  sides?: Partial<Record<AdvancedEdgeSide, AdvancedEdgeFinishing>>;
};

export const normalizeAdvancedSelection = (
  selection?: AdvancedAttributeSelection,
): AdvancedAttributeSelection => {
  if (!selection) {
    return createEmptyAdvancedSelection();
  }

  const legacy = selection as LegacySelection;
  const migratedReinforcement: AdvancedEdgeSide[] = [];
  const migratedTunnel: AdvancedEdgeSide[] = [];
  const migratedGrommets: AdvancedEdgeSide[] = [];
  if (legacy.sides) {
    for (const side of ALL_SIDES) {
      const value = legacy.sides[side];
      if (value === AdvancedEdgeFinishing.REINFORCEMENT) {
        migratedReinforcement.push(side);
      } else if (value === AdvancedEdgeFinishing.TUNNEL) {
        migratedTunnel.push(side);
      } else if (value === AdvancedEdgeFinishing.GROMMETS) {
        migratedGrommets.push(side);
      }
    }
  }

  const cutToSize = selection.cutToSize ?? false;
  const tunnelSides = cutToSize
    ? []
    : uniqueSides([...(selection.tunnelSides ?? []), ...migratedTunnel]);
  const reinforcementSides = cutToSize
    ? []
    : uniqueSides([
        ...(selection.reinforcementSides ?? []),
        ...migratedReinforcement,
      ]);
  const grommetSidesRaw = [
    ...(selection.grommets?.sides ?? []),
    ...migratedGrommets,
  ];
  const grommetSides = uniqueSides(grommetSidesRaw).filter(
    (side) => !tunnelSides.includes(side),
  );

  return {
    preset: selection.preset,
    cutToSize,
    reinforcementSides: reinforcementSides.filter(
      (side) => !tunnelSides.includes(side),
    ),
    tunnelSides,
    grommets: {
      ...defaultGrommets,
      ...selection.grommets,
      sides: grommetSides,
    },
    notes: selection.notes,
  };
};

export const createSelectionFromPreset = (
  preset?: AdvancedFinishingPreset,
  presetId?: string,
): AdvancedAttributeSelection => {
  const base = createEmptyAdvancedSelection(presetId);
  if (!preset) return base;

  const tunnelSides = uniqueSides(preset.tunnelSides ?? []);
  const reinforcementSides = uniqueSides(
    (preset.reinforcementSides ?? []).filter(
      (side) => !tunnelSides.includes(side),
    ),
  );

  const grommets = preset.grommets
    ? {
        sides: uniqueSides(preset.grommets.sides ?? []).filter(
          (side) => !tunnelSides.includes(side),
        ),
        spacing:
          typeof preset.grommets.spacing === "number"
            ? preset.grommets.spacing
            : defaultGrommets.spacing,
        offsetStart:
          typeof preset.grommets.offsetStart === "number"
            ? preset.grommets.offsetStart
            : defaultGrommets.offsetStart,
        offsetEnd:
          typeof preset.grommets.offsetEnd === "number"
            ? preset.grommets.offsetEnd
            : defaultGrommets.offsetEnd,
      }
    : { ...defaultGrommets };

  return normalizeAdvancedSelection({
    ...base,
    reinforcementSides,
    tunnelSides,
    grommets,
    cutToSize: preset.cutToSize ?? false,
  });
};

const withoutSide = (
  sides: AdvancedEdgeSide[],
  side: AdvancedEdgeSide,
): AdvancedEdgeSide[] => sides.filter((candidate) => candidate !== side);

const withSide = (
  sides: AdvancedEdgeSide[],
  side: AdvancedEdgeSide,
): AdvancedEdgeSide[] =>
  sides.includes(side) ? sides : uniqueSides([...sides, side]);

/**
 * Toggle a side for a given finishing type, enforcing:
 *  - tunnel on a side is mutually exclusive with reinforcement and grommets
 *  - reinforcement and grommets can coexist on the same side
 */
export const toggleFinishingSide = (
  selection: AdvancedAttributeSelection,
  type: AdvancedFinishingType,
  side: AdvancedEdgeSide,
  force?: boolean,
): AdvancedAttributeSelection => {
  const normalized = normalizeAdvancedSelection(selection);
  const grommets = normalized.grommets ?? { ...defaultGrommets };
  let cutToSize = normalized.cutToSize ?? false;

  const currentlyOn =
    type === "reinforcement"
      ? normalized.reinforcementSides.includes(side)
      : type === "tunnel"
        ? normalized.tunnelSides.includes(side)
        : (grommets.sides ?? []).includes(side);

  const nextOn = typeof force === "boolean" ? force : !currentlyOn;

  let reinforcementSides = normalized.reinforcementSides;
  let tunnelSides = normalized.tunnelSides;
  let grommetSides = grommets.sides ?? [];

  if (type === "reinforcement") {
    if (nextOn && cutToSize) {
      cutToSize = false;
    }
    reinforcementSides = nextOn
      ? withSide(reinforcementSides, side)
      : withoutSide(reinforcementSides, side);
    if (nextOn) {
      tunnelSides = withoutSide(tunnelSides, side);
    }
  } else if (type === "tunnel") {
    if (nextOn && cutToSize) {
      cutToSize = false;
    }
    tunnelSides = nextOn
      ? withSide(tunnelSides, side)
      : withoutSide(tunnelSides, side);
    if (nextOn) {
      reinforcementSides = withoutSide(reinforcementSides, side);
      grommetSides = withoutSide(grommetSides, side);
    }
  } else {
    grommetSides = nextOn
      ? withSide(grommetSides, side)
      : withoutSide(grommetSides, side);
    if (nextOn) {
      tunnelSides = withoutSide(tunnelSides, side);
    }
  }

  return {
    ...normalized,
    cutToSize,
    reinforcementSides,
    tunnelSides,
    grommets: { ...grommets, sides: grommetSides },
    preset: undefined,
  };
};

export const setCutToSize = (
  selection: AdvancedAttributeSelection,
  enabled: boolean,
): AdvancedAttributeSelection =>
  normalizeAdvancedSelection({
    ...normalizeAdvancedSelection(selection),
    cutToSize: enabled,
    reinforcementSides: enabled ? [] : selection.reinforcementSides,
    tunnelSides: enabled ? [] : selection.tunnelSides,
    preset: undefined,
  });

export const updateGrommets = (
  selection: AdvancedAttributeSelection,
  updates: Partial<NonNullable<AdvancedAttributeSelection["grommets"]>>,
): AdvancedAttributeSelection => {
  const normalized = normalizeAdvancedSelection(selection);
  const grommets = normalized.grommets ?? { ...defaultGrommets };
  const nextSides = updates.sides
    ? uniqueSides(updates.sides).filter(
        (side) => !normalized.tunnelSides.includes(side),
      )
    : [...(grommets.sides ?? [])];

  return {
    ...normalized,
    grommets: {
      sides: nextSides,
      spacing:
        typeof updates.spacing === "number"
          ? updates.spacing
          : grommets.spacing,
      offsetStart:
        typeof updates.offsetStart === "number"
          ? updates.offsetStart
          : grommets.offsetStart,
      offsetEnd:
        typeof updates.offsetEnd === "number"
          ? updates.offsetEnd
          : grommets.offsetEnd,
    },
    preset: undefined,
  };
};

export const hasAnyGrommets = (
  selection: AdvancedAttributeSelection,
): boolean => {
  const normalized = normalizeAdvancedSelection(selection);
  return (normalized.grommets?.sides?.length ?? 0) > 0;
};

export const ADVANCED_EDGE_SIDES: AdvancedEdgeSide[] = ALL_SIDES;
