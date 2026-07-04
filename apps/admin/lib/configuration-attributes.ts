import type { Attribute } from "@konfi/types";

type AttributeDocumentSnapshot = {
  id: string;
  data: () => Attribute;
};

export function attributeFromSnapshot(
  snapshot: AttributeDocumentSnapshot,
): Attribute {
  return {
    ...snapshot.data(),
    id: snapshot.id,
  };
}
