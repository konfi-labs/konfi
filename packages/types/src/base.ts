import { NestedMember } from "./configuration/member";
import { Timestamp } from "firebase/firestore";

/**
 * Interface representing the base structure of an entity.
 */
export interface Base {
  /**
   * The ID of the entity.
   */
  id: string;
  /**
   * The name of the entity.
   */
  name: string;
  /**
   * The NestedMember that created the entity.
   */
  createdBy: NestedMember;
  /**
   * The timestamp when the entity was created.
   */
  createdAt: Omit<Timestamp, "toJSON">;
  /**
   * The NestedMember that updated the entity.
   */
  updatedBy: NestedMember;
  /**
   * The timestamp when the entity was updated.
   */
  updatedAt: Omit<Timestamp, "toJSON">;
  /**
   * Whether the entity is active.
   */
  active: boolean;
}
