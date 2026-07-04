export interface PreflightIssue {
  description: string;
  rule: string;
  attributes: {
    [key: string]:
      | string
      | number
      | {
          [key: string]: string | number;
        };
  };
}
