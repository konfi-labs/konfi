import { Locale } from "./enums";

/**
 * Entity types that can have change tracking
 */
export enum EntityType {
  Order = "Order",
  Customer = "Customer",
  Product = "Product",
  Category = "Category",
  Attribute = "Attribute",
  Channel = "Channel",
  Warehouse = "Warehouse",
  Member = "Member",
  Promotion = "Promotion",
  Campaign = "Campaign",
  Quote = "Quote",
  Complaint = "Complaint",
  Settings = "Settings",
  ProductPrice = "ProductPrice",
  ProductType = "ProductType",
}

/**
 * Represents a single change detected by microdiff
 */
export interface Change {
  type: "CREATE" | "REMOVE" | "CHANGE";
  path: (string | number)[];
  value?: unknown;
  oldValue?: unknown;
}

/**
 * Human-readable description of changes in different locales
 */
export interface ChangeDescription {
  [key: string]: string; // locale -> description
}

/**
 * Complete change record with descriptions
 */
export interface ChangeRecord {
  changes: Change[];
  description: ChangeDescription;
  timestamp: Date;
  entityType?: string;
  entityId?: string;
}

/**
 * Firestore change log entry with AI-generated descriptions
 */
export interface ChangeLogEntry {
  id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changes: Change[];
  descriptions: Record<string, string>;
  timestamp: Date;
  entityType?: string;
  entityId?: string;
  channelId?: string;
}

/**
 * Options for generating change descriptions
 */
export interface ChangeDescriptionOptions {
  /**
   * Context about what entity changed (e.g., "Customer", "Order", "Product")
   */
  entityType?: string;
  /**
   * Additional context to help AI generate better descriptions
   */
  context?: string;
  /**
   * Locales to generate translations for (defaults to all except DEFAULT_LOCALE)
   */
  locales?: Locale[];
}

/**
 * A translatable feature highlight
 */
export interface FeatureHighlight {
  en: string;
  pl: string;
  category?: Record<Locale, string> | Record<string, string>;
  icon?: string;
  colorPalette?: "primary" | "green" | "orange" | "purple";
  imageUrl?: string;
}

/**
 * App version change for "What's New" feature
 */
export interface AppChange {
  id: string;
  timestamp: string; // ISO date string
  title: Record<Locale, string>; // locale -> title
  description: Record<Locale, string>; // locale -> description
  imageUrl?: string;
  highlightFeatures?: FeatureHighlight[]; // Array of translated feature highlights
}
