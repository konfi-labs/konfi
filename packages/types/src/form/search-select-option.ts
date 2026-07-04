export interface SearchSelectOption<T extends { id: string }> {
  label: string;
  value: string;
  color?: string;
  __isNew__?: boolean;
  object: T;
}
