import { Timestamp } from "firebase/firestore";

import { NestedMember } from "../configuration/member";

export interface ProductImageGenerationConfig {
  enabled: boolean;
  promptEnhancement?: string;
  updatedAt?: Omit<Timestamp, "toJSON">;
  updatedBy?: NestedMember;
}
