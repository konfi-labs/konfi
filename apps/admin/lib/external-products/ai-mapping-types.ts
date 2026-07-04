export interface AISuggestedOptionMapping {
  externalValue: string;
  internalValue?: string;
  suggestedNewOption?: {
    label: string;
    value: string;
  };
  confidence: number;
}

export interface AISuggestedAttributeMapping {
  externalAttributeName: string;
  internalAttributeId?: string;
  confidence: number;
  optionMappings: AISuggestedOptionMapping[];
  suggestedNewAttribute?: {
    name: string;
    type:
      | "DROPDOWN"
      | "DROPDOWN_COLOR"
      | "RADIO_GROUP"
      | "RADIO_GROUP_IMAGE"
      | "RADIO_GROUP_COLOR";
    options: Array<{
      label: string;
      value: string;
      color?: string;
    }>;
  };
}

export interface AIAttributeMappingResult {
  success: boolean;
  mappings: AISuggestedAttributeMapping[];
  error?: string;
}