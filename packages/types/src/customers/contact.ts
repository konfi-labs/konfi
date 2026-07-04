export interface Contact {
  name: string;
  email?: string;
  phone?: string;
  active: boolean;
}

export function isContact(obj: unknown): obj is Contact {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  const candidate = obj as Partial<Record<keyof Contact, unknown>>;

  return (
    typeof candidate.name === "string" &&
    typeof candidate.active === "boolean" &&
    (candidate.email === undefined || typeof candidate.email === "string") &&
    (candidate.phone === undefined || typeof candidate.phone === "string")
  );
}
