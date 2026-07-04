import { ImpositionWorkflow } from "./common";

export interface Impose extends Omit<
  ImpositionWorkflow,
  "id" | "name" | "spacingHorizontal" | "spacingVertical"
> {
  customSheetSize: boolean;
  automaticSheetOrientation: boolean;
  customItemSize: boolean;
  automaticItemOrientation: boolean;
  automaticNumberOfHorizontalItems: boolean;
  automaticNumberOfVerticalItems: boolean;
  automaticSpacingHorizontal: boolean;
  automaticSpacingVertical: boolean;
  spacingHorizontal?: string;
  spacingVertical?: string;
  files?: File[];
  saveAsTemplate: boolean;
  templateName?: string;
}

export interface ImpositionWorkflowData extends Omit<
  Impose,
  | "files"
  | "saveAsTemplate"
  | "templateName"
  | "spacingHorizontal"
  | "spacingVertical"
> {
  id: string;
  name: string;
  spacingHorizontal: number[];
  spacingVertical: number[];
}

export interface CreateImpositionWorkflow extends ImpositionWorkflowData {}
