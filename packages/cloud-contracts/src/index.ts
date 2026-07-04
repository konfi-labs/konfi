import {
  TENANT_PERMISSION_VERSION,
  type TenantPermission,
} from "./permissions.js";

export type DeploymentMode = "dedicated" | "saas";

export type TenantId = string;

export type TenantPlanId = string;

export type TenantAccessLevel = number;

export const STARTER_TEMPLATE_MANIFEST_IDS = ["empty", "print-shop"] as const;

export type StarterTemplateManifestId =
  (typeof STARTER_TEMPLATE_MANIFEST_IDS)[number];

export type TenantVerticalTemplateId = StarterTemplateManifestId;

export enum TenantStatus {
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
  PROVISIONING = "PROVISIONING",
  DISABLED = "DISABLED",
}

export enum TenantProvisioningState {
  PENDING = "PENDING",
  RUNNING = "RUNNING",
  READY = "READY",
  FAILED = "FAILED",
}

export enum TenantProvisioningJobStatus {
  QUEUED = "QUEUED",
  RUNNING = "RUNNING",
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
  CANCELED = "CANCELED",
}

export enum TenantPlanStatus {
  ACTIVE = "ACTIVE",
  DISABLED = "DISABLED",
  ARCHIVED = "ARCHIVED",
}

export enum TenantRole {
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  MEMBER = "MEMBER",
  COURIER = "COURIER",
}

export enum TenantMembershipStatus {
  ACTIVE = "ACTIVE",
  INVITED = "INVITED",
  DISABLED = "DISABLED",
}

export enum TenantDomainKind {
  ADMIN = "ADMIN",
  STOREFRONT = "STOREFRONT",
  CUSTOM = "CUSTOM",
}

export enum TenantDomainStatus {
  ACTIVE = "ACTIVE",
  DISABLED = "DISABLED",
  ERROR = "ERROR",
  PENDING_VERIFICATION = "PENDING_VERIFICATION",
}

export interface TenantDomainVerificationRecord {
  domain?: string;
  reason?: string;
  type: string;
  value: string;
}

export interface TenantModuleFlags {
  imposition?: boolean;
  preflight?: boolean;
  printingMethods?: boolean;
  dynamicPrintPricing?: boolean;
  storefront?: boolean;
  externalProviderImport?: boolean;
  fileProofing?: boolean;
  rmaWorkflow?: boolean;
  taxEngine?: boolean;
  aiImport?: boolean;
  aiText?: boolean;
  aiImage?: boolean;
  aiVideo?: boolean;
}

export interface TenantPlanLimits {
  maxTenants?: number;
  maxChannels?: number;
  maxMembers?: number;
  maxProducts?: number;
  maxCategories?: number;
  maxCustomers?: number;
  maxConfigurableStatuses?: number;
  maxConfigurableUnits?: number;
  maxConfigurableCurrencies?: number;
  maxOrdersPerMonth?: number;
  maxStorageBytes?: number;
  softFirestoreReadsPerDay?: number;
  hardFirestoreReadsPerDay?: number;
  softFirestoreWritesPerDay?: number;
  hardFirestoreWritesPerDay?: number;
  /** Weekly AI text token allowance (combined input + output + reasoning). */
  aiTextTokensPerWeek?: number;
  /** 5-hour AI text token burst cap (combined input + output + reasoning). */
  aiTextTokensPer5Hours?: number;
  aiImageGenerationsPerMonth?: number;
  aiVideoGenerationsPerMonth?: number;
}

export type AiUsageModality = "text" | "image" | "video";

export type AiUsageEventSource =
  | "admin-chat"
  | "admin-action"
  | "agent"
  | "durable-agent"
  | "external-import"
  | "image"
  | "store-image"
  | "video"
  | "translation"
  | "storefront-assistant"
  | "order-risk"
  | "genkit-rating"
  | "other";

export interface TenantPlan {
  id: TenantPlanId;
  name: string;
  status?: TenantPlanStatus;
  limits?: TenantPlanLimits;
  moduleFlags?: TenantModuleFlags;
}

export interface TenantStorefrontMaintenance {
  enabled?: boolean;
  message?: string;
  title?: string;
  updatedAt?: unknown;
  updatedByUid?: string;
}

export interface Tenant {
  id: TenantId;
  name: string;
  slug: string;
  planId: TenantPlanId;
  planStatus?: TenantPlanStatus;
  status: TenantStatus;
  deploymentMode: DeploymentMode;
  defaultChannelId?: string;
  verticalTemplateId?: TenantVerticalTemplateId;
  limits?: TenantPlanLimits;
  moduleFlags?: TenantModuleFlags;
  storefrontMaintenance?: TenantStorefrontMaintenance;
  quotaEnforcementDisabled?: boolean;
  provisioningState?: TenantProvisioningState;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TenantMembership {
  id: string;
  tenantId: TenantId;
  uid: string;
  role: TenantRole;
  accessLevel: TenantAccessLevel;
  channelIds?: string[];
  permissions?: TenantPermission[];
  permissionVersion?: typeof TENANT_PERMISSION_VERSION;
  status: TenantMembershipStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TenantDomain {
  disabledAt?: unknown;
  disabledByUid?: string;
  error?: string;
  hostname: string;
  tenantId: TenantId;
  channelId?: string;
  kind: TenantDomainKind;
  maintenance?: TenantStorefrontMaintenance;
  status: TenantDomainStatus;
  lastSyncedAt?: unknown;
  source?: "onboarding" | "operator" | "provisioning";
  vercelProductionDeploymentCheckedAt?: unknown;
  vercelProductionDeploymentId?: string;
  vercelProductionDeploymentUrl?: string;
  vercelProjectId?: string;
  verification?: TenantDomainVerificationRecord[];
  verified?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TenantContext {
  deploymentMode: DeploymentMode;
  tenantId?: TenantId;
  requireTenantId: boolean;
}

export interface TenantRuntimeFlags {
  deploymentMode: DeploymentMode;
  requireTenantId: boolean;
}

export interface TenantOwned {
  tenantId?: TenantId;
}

export interface TenantProvisioningJob {
  id: string;
  tenantId: TenantId;
  status: TenantProvisioningJobStatus;
  state?: TenantProvisioningState;
  templateId?: StarterTemplateManifestId;
  requestedByUid?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  startedAt?: unknown;
  completedAt?: unknown;
}

export interface StarterTemplateSeedResource {
  collectionPath: string;
  documentId?: string;
  sourcePath?: string;
}

export interface StarterTemplateChannelManifest {
  id: string;
  name: string;
  hostname?: string;
  defaultLocale?: string;
}

export interface StarterTemplateManifest {
  id: StarterTemplateManifestId;
  name: string;
  version: string;
  description?: string;
  moduleFlags?: TenantModuleFlags;
  channels?: StarterTemplateChannelManifest[];
  seedResources?: StarterTemplateSeedResource[];
}

export const buildTenantMembershipId = (
  tenantId: TenantId,
  uid: string,
): string => `${tenantId}_${uid}`;

export * from "./cooperation.js";
export * from "./permissions.js";
export * from "./usage-control.js";
