export const VISUAL_ONBOARDING_STORAGE_KEY =
  "admin.visualOnboarding.fullSetup.v1";

export const VISUAL_ONBOARDING_STORAGE_VERSION = 1;

export const VISUAL_ONBOARDING_RESTART_EVENT = "admin:visual-onboarding:start";

export const VISUAL_ONBOARDING_TARGETS = {
  settingsTrigger: "admin-settings-trigger",
  settingsConfiguration: "admin-settings-configuration",
  settingsCatalog: "admin-settings-catalog",
  configChannels: "configuration-channels",
  configAttributes: "configuration-attributes",
  configProductTypes: "configuration-product-types",
  configWarehouses: "configuration-warehouses",
  configShipping: "configuration-shipping",
  configPayment: "configuration-payment",
  configTaxes: "configuration-taxes",
  configWorkflow: "configuration-workflow",
  configSupportTaxonomy: "configuration-support-taxonomy",
  configCms: "configuration-cms",
  configStore: "configuration-store",
} as const;

export type VisualOnboardingTargetId =
  (typeof VISUAL_ONBOARDING_TARGETS)[keyof typeof VISUAL_ONBOARDING_TARGETS];
