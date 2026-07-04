export type Newsletter = {
  email: string;
  subscribed: boolean;
};

export interface NewsletterCreate extends Newsletter {}
export interface NewsletterUpdate extends Omit<Newsletter, "email"> {}
