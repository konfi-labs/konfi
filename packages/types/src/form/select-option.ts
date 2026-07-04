export interface SelectOption {
  label: string;
  value: string;
  object?: object;
  image?: string;
  color?: string;
  formatWidth?: number | null;
  formatHeight?: number | null;
  disabled?: boolean;
}
