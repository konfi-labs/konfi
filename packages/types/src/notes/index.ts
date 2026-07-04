import { Base } from "../base";
import { Timestamp } from "firebase/firestore";
import type { TenantOwned } from "../tenant";

/**
 * Enum for note categories
 */
export enum NoteCategory {
  GENERAL = "GENERAL",
  CUSTOMER = "CUSTOMER",
  ORDER = "ORDER",
  PRODUCT = "PRODUCT",
  INVOICE = "INVOICE",
  QUOTE = "QUOTE",
  PAYMENT = "PAYMENT",
  SHIPPING = "SHIPPING",
  TASK = "TASK",
  INTERNAL = "INTERNAL",
}

export type NoteCategoryId = string;

export enum NoteEntityType {
  CUSTOMER = "CUSTOMER",
  ORDER = "ORDER",
  PRODUCT = "PRODUCT",
  SUPPLIER = "SUPPLIER",
}

/**
 * Enum for note priority levels
 */
export enum NotePriority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  URGENT = "URGENT",
}

export type NotePriorityId = string;

/**
 * Interface representing a note entity.
 */
export interface Note extends Omit<Base, "active">, TenantOwned {
  /**
   * The content of the note.
   */
  content: string;

  /**
   * The category of the note.
   */
  category: NoteCategoryId;

  /**
   * The priority level of the note.
   */
  priority: NotePriorityId;

  /**
   * ID of the channel this note belongs to.
   */
  channelId?: string;

  /**
   * Channel object for form handling.
   */
  toChannel?: {
    id?: string;
  };

  /**
   * ID of the entity this note is associated with.
   */
  entityId?: string;

  /**
   * Type of the entity this note is associated with.
   */
  entityType?: NoteEntityType;

  /**
   * Due date for the note, if applicable.
   */
  dueDate: string;

  /**
   * Whether the note has been completed.
   */
  completed: boolean;

  /**
   * Timestamp when the note was completed.
   */
  completedAt?: Omit<Timestamp, "toJSON">;

  /**
   * IDs of users this note is assigned to.
   */
  carriedOutBy?: string[];
}

/**
 * Check if an object is a Note.
 */
export function isNote(arg: unknown): arg is Note {
  if (typeof arg !== "object" || arg === null) {
    return false;
  }

  const candidate = arg as Partial<Record<keyof Note, unknown>>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.content === "string" &&
    typeof candidate.category === "string" &&
    typeof candidate.priority === "string" &&
    typeof candidate.entityId === "string" &&
    typeof candidate.entityType === "string" &&
    typeof candidate.completed === "boolean" &&
    Boolean(candidate.createdBy) &&
    Boolean(candidate.createdAt) &&
    Boolean(candidate.updatedBy) &&
    Boolean(candidate.updatedAt)
  );
}

/**
 * Interface for creating a new note.
 */
export interface NoteCreate extends Omit<Note, "id" | "name" | "toChannel"> {
  name?: string; // Optional on create, will default to truncated content
}

/**
 * Interface for updating an existing note.
 */
export interface NoteUpdate extends Omit<
  Note,
  "id" | "createdBy" | "createdAt" | "toChannel"
> {}

/**
 * Interface for the note creation form.
 */
export interface NoteCreateForm extends Omit<
  NoteCreate,
  | "createdAt"
  | "completedAt"
  | "updatedBy"
  | "updatedAt"
  | "channelId"
  | "tenantId"
> {
  toChannel?: {
    id?: string;
  };
}

/**
 * Interface for the note update form.
 */
export interface NoteUpdateForm extends Omit<
  NoteUpdate,
  "completedAt" | "id" | "updatedAt" | "channelId" | "tenantId"
> {
  toChannel?: {
    id?: string;
  };
}
