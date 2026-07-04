export const PREVIEW_3D_TEMPLATES = [
  "ASTAND",
  "BOX",
  "BOOKLET",
  "CANVAS",
  "CUP",
  "FLAT",
  "FLYERS",
  "LBANNER",
  "PIN",
  "ROLLUP_PREMIUM",
  "ROLLUP_STANDARD",
  "TOOTHPICK",
  "XBANNER",
] as const;

export type Preview3DTemplate = (typeof PREVIEW_3D_TEMPLATES)[number];

type ProceduralTemplate = "BOX" | "BOOKLET" | "FLAT";

export interface Preview3DVariant {
  backNodeNames?: string[];
  dimensions?: {
    height: number;
    width: number;
  };
  frontNodeNames: string[];
  id: string;
  supportNodeNames?: string[];
}

export interface Preview3DTemplateDefinition {
  fileName?: string;
  kind: "gltf" | "procedural";
  procedural?: ProceduralTemplate;
  supportNodeNames?: string[];
  template: Preview3DTemplate;
  variants?: Preview3DVariant[];
}

function createModelUrl(fileName: string) {
  return new URL(`../models/${fileName}`, import.meta.url).href;
}

const rollupStandardVariants = [
  createSizeVariant("85x200", "blockout85x200", ["statyw85x200"], 85, 200),
  createSizeVariant("100x200", "blockout100x200", ["statyw100x200"], 100, 200),
  createSizeVariant("120x200", "blockout120x200", ["statyw120x200"], 120, 200),
  createSizeVariant("150x200", "blockout150x200", ["statyw150x200"], 150, 200),
];

const rollupPremiumVariants = [
  createSizeVariant("85x200", "blockout85x200", ["statyw85x200"], 85, 200),
  createSizeVariant("100x200", "blockout100x200", ["statyw100x200"], 100, 200),
  createSizeVariant("120x200", "blockout120x200", ["statyw120x200"], 120, 200),
  createSizeVariant("150x200", "blockout150x200", ["statyw150x200"], 150, 200),
];

export const PREVIEW_3D_TEMPLATE_DEFINITIONS: Record<
  Preview3DTemplate,
  Preview3DTemplateDefinition
> = {
  ASTAND: {
    fileName: "astand.gltf",
    kind: "gltf",
    supportNodeNames: ["standa1", "waterstanda1", "waterstandb1", "standb1"],
    template: "ASTAND",
    variants: [
      {
        frontNodeNames: [
          "blockouta1",
          "waterblockouta1",
          "waterblockoutb1",
          "blockoutb1",
        ],
        id: "default",
      },
    ],
  },
  BOX: {
    kind: "procedural",
    procedural: "BOX",
    template: "BOX",
  },
  BOOKLET: {
    kind: "procedural",
    procedural: "BOOKLET",
    template: "BOOKLET",
  },
  CANVAS: {
    fileName: "canvas.gltf",
    kind: "gltf",
    template: "CANVAS",
    variants: [
      createSizeVariant("20x30", "canvas20x30", ["blejt20x30"], 20, 30),
      createSizeVariant("30x40", "canvas30x40", ["blejt30x40"], 30, 40),
      createSizeVariant("35x50", "canvas35x50", ["blejt35x50"], 35, 50),
      createSizeVariant("40x60", "canvas40x60", ["blejt40x60"], 40, 60),
      createSizeVariant("50x70", "canvas50x70", ["blejt50x70"], 50, 70),
      createSizeVariant("60x80", "canvas60x80", ["blejt60x80"], 60, 80),
      createSizeVariant("70x100", "canvas70x100", ["blejt70x100"], 70, 100),
      createSizeVariant("100x150", "canvas100x150", ["blejt100x150"], 100, 150),
    ],
  },
  CUP: {
    fileName: "cup.gltf",
    kind: "gltf",
    supportNodeNames: ["cup"],
    template: "CUP",
    variants: [
      {
        frontNodeNames: ["plane"],
        id: "default",
      },
    ],
  },
  FLAT: {
    kind: "procedural",
    procedural: "FLAT",
    template: "FLAT",
  },
  FLYERS: {
    fileName: "flyers.gltf",
    kind: "gltf",
    template: "FLYERS",
    variants: [
      createSizeVariant("DL", "flyersDL", [], 99, 210, ["flyersDLbackside"]),
      createSizeVariant("A4", "flyersA4", [], 210, 297, ["flyersA4backside"]),
      createSizeVariant("A5", "flyersA5", [], 148, 210, ["flyersA5backside"]),
      createSizeVariant("A6", "flyersA6", [], 105, 148, ["flyersA6backside"]),
    ],
  },
  LBANNER: {
    fileName: "lbanner.gltf",
    kind: "gltf",
    template: "LBANNER",
    variants: [
      createSizeVariant("80x202", "baner80x202", ["statyw80x205"], 80, 202),
    ],
  },
  PIN: {
    fileName: "pin.gltf",
    kind: "gltf",
    template: "PIN",
    variants: [
      createSizeVariant("25", "pin25", [], 25, 25, ["pin25backside"]),
      createSizeVariant("37", "pin37", [], 37, 37, ["pin37backside"]),
      createSizeVariant("56", "pin56", [], 56, 56, ["pin56backside"]),
    ],
  },
  ROLLUP_PREMIUM: {
    fileName: "rolluppremium.gltf",
    kind: "gltf",
    template: "ROLLUP_PREMIUM",
    variants: rollupPremiumVariants,
  },
  ROLLUP_STANDARD: {
    fileName: "rollupstandard.gltf",
    kind: "gltf",
    template: "ROLLUP_STANDARD",
    variants: rollupStandardVariants,
  },
  TOOTHPICK: {
    fileName: "toothpick.gltf",
    kind: "gltf",
    template: "TOOTHPICK",
    variants: [
      createSizeVariant("30", "plane30", ["toothpick10"], 30, 30),
      createSizeVariant("50", "plane50", ["toothpick15"], 50, 50),
      createSizeVariant("60", "plane60", ["toothpick20"], 60, 60),
    ],
  },
  XBANNER: {
    fileName: "xbanner.gltf",
    kind: "gltf",
    template: "XBANNER",
    variants: [
      createSizeVariant("60x160", "baner60x160", ["statyw60x160"], 60, 160),
      createSizeVariant("80x180", "baner80x180", ["statyw80x180"], 80, 180),
      createSizeVariant("120x200", "baner120x200", ["statyw120x200"], 120, 200),
    ],
  },
};

export function isPreview3DTemplate(
  template: string | null | undefined,
): template is Preview3DTemplate {
  return PREVIEW_3D_TEMPLATES.includes(template as Preview3DTemplate);
}

export function resolvePreview3DTemplate(
  template: string | null | undefined,
  pageCount?: number | null,
): Preview3DTemplate {
  if (isPreview3DTemplate(template)) {
    return template;
  }

  return pageCount && pageCount > 1 ? "BOOKLET" : "FLAT";
}

export function getPreview3DTemplateDefinition(
  template: string | null | undefined,
  pageCount?: number | null,
) {
  return PREVIEW_3D_TEMPLATE_DEFINITIONS[
    resolvePreview3DTemplate(template, pageCount)
  ];
}

export function getPreview3DModelUrl(
  definition: Preview3DTemplateDefinition,
): string | undefined {
  return definition.fileName ? createModelUrl(definition.fileName) : undefined;
}

export function resolvePreview3DVariant(params: {
  definition: Preview3DTemplateDefinition;
  height: number;
  width: number;
}): Preview3DVariant | undefined {
  const variants = params.definition.variants ?? [];

  if (variants.length === 0) {
    return undefined;
  }

  const measurableVariants = variants.filter((variant) => variant.dimensions);
  if (measurableVariants.length === 0) {
    return variants[0];
  }

  const normalizedTarget = normalizeDimensions(params.width, params.height);

  return measurableVariants.reduce((bestVariant, currentVariant) => {
    return getVariantDistance(currentVariant, normalizedTarget) <
      getVariantDistance(bestVariant, normalizedTarget)
      ? currentVariant
      : bestVariant;
  }, measurableVariants[0]);
}

function createSizeVariant(
  id: string,
  frontNodeName: string,
  supportNodeNames: string[],
  width: number,
  height: number,
  backNodeNames?: string[],
): Preview3DVariant {
  return {
    backNodeNames,
    dimensions: { height, width },
    frontNodeNames: [frontNodeName],
    id,
    supportNodeNames,
  };
}

function normalizeDimensions(width: number, height: number) {
  return {
    height: Math.max(width, height),
    width: Math.min(width, height),
  };
}

function getVariantDistance(
  variant: Preview3DVariant,
  target: { height: number; width: number },
) {
  if (!variant.dimensions) {
    return Number.POSITIVE_INFINITY;
  }

  const dimensions = normalizeDimensions(
    variant.dimensions.width,
    variant.dimensions.height,
  );

  const widthDelta = dimensions.width - target.width;
  const heightDelta = dimensions.height - target.height;

  return Math.sqrt(widthDelta * widthDelta + heightDelta * heightDelta);
}
