export type PrintingMethodId = string;

export interface PrintingMethodDefinition {
  id: PrintingMethodId;
  name: string;
  icon: string;
  colorPalette: string;
  order: number;
  enabled: boolean;
  archived?: boolean;
  isDefault?: boolean;
}

export interface PrintingMethodsSettings {
  methods: PrintingMethodDefinition[];
  updatedAt?: unknown;
  tenantId?: string;
}
