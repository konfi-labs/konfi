import { FieldPath, QueryConstraint, WhereFilterOp } from "firebase/firestore";
import { SelectOption } from "./form/select-option";

type RuleFilterOp = Extract<WhereFilterOp, "==" | "in" | "array-contains-any">;

export type Rule = {
  label: string;
  fieldPath: FieldPath;
  opStr: RuleFilterOp;
  options?: SelectOption[];
};

export type RulePreset = {
  id?: string;
  label: string;
  icon: string;
  values: QueryConstraint[];
  /** Structured status ids from the preset definition. Optional so hand-built presets stay valid. */
  statusIds?: string[];
  /** Structured printing method ids from the preset definition. Optional so hand-built presets stay valid. */
  printingMethodIds?: string[];
};

export type RulesState = {
  rulesQueries: QueryConstraint[][];
  values: string[][];
  presetEnabled: boolean;
  enabledPresetIndex: number | null;
  enabledPresetId?: string | null;
};

export type RulesStateAction = {
  rulesQueries: QueryConstraint[][];
  values: string[][];
  presetEnabled: boolean;
  enabledPresetIndex: number | null;
  enabledPresetId?: string | null;
  type: "INIT";
};
