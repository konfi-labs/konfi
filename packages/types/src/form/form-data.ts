const searchFor = [
  "customers",
  "orders",
  "quotes",
  "productTypes",
  "categories",
  "products",
  "members",
] as const;
export type SearchFor = (typeof searchFor)[number];

const searchResult = ["id", "object", "array"] as const;
export type SearchResult = (typeof searchResult)[number];

export type FieldData = {
  name: string;
  label?: string;
  helperText?: string;
  isRequired?: boolean;
  clearable?: boolean;
  placeholder?: string;
  autocomplete?: string;
  type?:
    | "checkbox"
    | "select"
    | "textarea"
    | "date"
    | "datetime-local"
    | "number"
    | "search"
    | "indexedSearch"
    | "groupedIndexedSearch"
    | "slider"
    | "multiSelect"
    | "radio"
    | "radioGrid"
    | "addressAutocomplete"
    | "inpost-geowidget"
    | "fileInputDropzone"
    | "colorPicker"
    | "fileManager";
  options?: { label: string; value: string }[];
  optionsKey?: "contacts" | "shippingAddresses" | "billingAddresses";
  min?: number;
  max?: number;
  disabled?: boolean;
  searchFor?: SearchFor;
  searchResult?: SearchResult;
  resetFormOnChange?: boolean;
  combination?: boolean;
  arrayIndexTotalPrice?: boolean;
  updateDisabled?: boolean;
  matrix?: boolean;
  isCreatable?: boolean;
  enumName?: string;
  imageProps?: ImageProps;
  watch?: boolean;
  isObject?: boolean;
  dependsOn?: string;
  dependencyValue?: string | string[];
  dependencies?: FieldDependency[];
  watchNested?: true;
  pattern?: string;
  mdxPreview?: boolean;
  mdxImageProps?: ImageProps;
  orientation?: "horizontal" | "vertical";
  generate?: {
    systemPrompt: string;
    context: string[];
    model?: string;
    stream?: boolean;
  };
  getCustomerDataModal?: boolean;
  noFilter?: boolean;
  filterShippingOptionsByProduct?: boolean;
  gridColumns?: number | number[]; // Responsive columns like [1, 1, 2]
  showImages?: boolean;
  imageUrlTemplate?: string; // Template for generating image URLs
};

export type FieldDependency = {
  name: string;
  value: string | string[];
  watchNested?: true;
};

export type ImageProps = {
  prefix?: string;
  includePrefix?: boolean;
  maxNumber?: number;
  maxFiles?: number;
  maxFileSize?: number;
  maxTotalFileSize?: number;
  acceptType?: string[];
  /** Props to customize the FileUpload.Root container. Accepts Chakra UI size values (e.g., maxW: "xl", w: "100%"). */
  rootProps?: {
    maxW?: string;
    w?: string;
  };
  /** Props to customize the FileUpload.Dropzone (e.g., minH: '200px', py: 4) */
  dropzoneProps?: {
    minH?: string;
    py?: number;
  };
};

export interface FormData {
  allowMultiple: boolean;
  allowToggle: boolean;
  sections: {
    fieldArray: boolean;
    name?: string;
    initialValues?: {};
    heading?: string;
    description?: string;
    fields: FieldData[];
    dependsOn?: string;
    dependencyValue?: string | string[];
    isDefaultExpanded?: boolean;
    stackDirection?: "row" | "column";
  }[];
}
