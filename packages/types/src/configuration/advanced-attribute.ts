export type AdvancedEdgeSide = "top" | "right" | "bottom" | "left";

export enum AdvancedEdgeFinishing {
  NONE = "none",
  REINFORCEMENT = "reinforcement",
  TUNNEL = "tunnel",
  GROMMETS = "grommets",
  CUT_TO_SIZE = "cut_to_size",
}

export type AdvancedGrommetsConfig = {
  sides: AdvancedEdgeSide[];
  spacing: number;
  offsetStart?: number;
  offsetEnd?: number;
};

export type AdvancedFinishingPreset = {
  reinforcementSides?: AdvancedEdgeSide[];
  tunnelSides?: AdvancedEdgeSide[];
  grommets?: AdvancedGrommetsConfig;
  cutToSize?: boolean;
};

export type AdvancedAttributeSelection = {
  preset?: string;
  reinforcementSides: AdvancedEdgeSide[];
  tunnelSides: AdvancedEdgeSide[];
  grommets?: AdvancedGrommetsConfig;
  cutToSize?: boolean;
  notes?: string;
};

export type AdvancedFinishingType = "reinforcement" | "tunnel" | "grommets";
