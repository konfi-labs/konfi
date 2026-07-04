"use client";

import { useT } from "@/i18n/client";
import { useAuth } from "@/context/auth";
import { Heading, Separator, SimpleGrid } from "@chakra-ui/react";
import { Card, CustomHeading } from "@konfi/components";
import {
  ADMIN_B2B,
  ADMIN_CHANNELS,
  ADMIN_CONFIG_ATTRIBUTES,
  ADMIN_CONFIG_AI_INSTRUCTIONS,
  ADMIN_CONFIG_CMS,
  ADMIN_CONFIG_INTERNAL_TRANSIT,
  ADMIN_CONFIG_MEMBERS,
  ADMIN_CONFIG_ORDER_RULE_PRESETS,
  ADMIN_CONFIG_ORDER_WORKFLOW_STATUSES,
  ADMIN_CONFIG_PAYMENT_METHODS,
  ADMIN_CONFIG_PRICE_LISTS,
  ADMIN_CONFIG_PRINTING_METHODS,
  ADMIN_CONFIG_PRODUCT_TYPES,
  ADMIN_CONFIG_SCHEDULING,
  ADMIN_CONFIG_SHIPPING_METHODS,
  ADMIN_CONFIG_STORE,
  ADMIN_CONFIG_SUPPORT_TAXONOMY,
  ADMIN_CONFIG_TAXES,
  ADMIN_CONFIG_UNITS_PROOFING,
  ADMIN_CONFIG_WAREHOUSES,
  ADMIN_SUPPLIERS,
} from "@konfi/utils";
import { VISUAL_ONBOARDING_TARGETS } from "../components/onboarding/visual-onboarding-targets";

const ADMIN_CONFIG_CURRENCIES = "/configuration/currencies";

const IndexPage = () => {
  const { t } = useT();
  const { isSuperAdminClient, tenantAccess } = useAuth();
  const hasFullTenantScope =
    isSuperAdminClient || tenantAccess?.hasFullTenantScope === true;

  const CONFIG_SECTIONS = [
    {
      heading: t(
        "configuration.sections.attributesAndProductTypes",
        "Attributes and Product Types",
      ),
      cards: [
        {
          route: ADMIN_CONFIG_ATTRIBUTES,
          icon: "edit_attributes",
          requiresFullTenantScope: true,
          onboardingId: VISUAL_ONBOARDING_TARGETS.configAttributes,
          title: t("configuration.cards.attributes.title", "Attributes"),
          description: t(
            "configuration.cards.attributes.description",
            "Define attributes used to create product types",
          ),
        },
        {
          route: ADMIN_CONFIG_PRODUCT_TYPES,
          icon: "token",
          requiresFullTenantScope: true,
          onboardingId: VISUAL_ONBOARDING_TARGETS.configProductTypes,
          title: t("configuration.cards.productTypes.title", "Product Types"),
          description: t(
            "configuration.cards.productTypes.description",
            "Define what types of products you sell",
          ),
        },
        {
          route: ADMIN_CONFIG_PRINTING_METHODS,
          icon: "print",
          requiresFullTenantScope: true,
          title: t(
            "configuration.cards.printingMethods.title",
            "Execution Methods",
          ),
          description: t(
            "configuration.cards.printingMethods.description",
            "Manage execution departments used by products and orders",
          ),
        },
        {
          route: ADMIN_CONFIG_UNITS_PROOFING,
          icon: "straighten",
          requiresFullTenantScope: true,
          title: t("configuration.cards.unitsProofing.title", {
            defaultValue: "Units & Proofing",
          }),
          description: t("configuration.cards.unitsProofing.description", {
            defaultValue:
              "Manage product units, abbreviations, and proofing options",
          }),
        },
      ],
    },
    {
      heading: t("configuration.sections.orderWorkflow", {
        defaultValue: "Order Workflow",
      }),
      cards: [
        {
          route: ADMIN_CONFIG_ORDER_WORKFLOW_STATUSES,
          icon: "view_kanban",
          requiresFullTenantScope: true,
          onboardingId: VISUAL_ONBOARDING_TARGETS.configWorkflow,
          title: t("configuration.cards.orderWorkflowStatuses.title", {
            defaultValue: "Order & File Statuses",
          }),
          description: t(
            "configuration.cards.orderWorkflowStatuses.description",
            {
              defaultValue:
                "Configure workflow columns, file states, and automation flags",
            },
          ),
        },
        {
          route: ADMIN_CONFIG_ORDER_RULE_PRESETS,
          icon: "filter_alt",
          requiresFullTenantScope: true,
          title: t("configuration.cards.orderRulePresets.title", {
            defaultValue: "Order Filter Presets",
          }),
          description: t("configuration.cards.orderRulePresets.description", {
            defaultValue:
              "Configure reusable status and execution method filters for order views",
          }),
        },
        {
          route: ADMIN_CONFIG_SUPPORT_TAXONOMY,
          icon: "support_agent",
          requiresFullTenantScope: true,
          onboardingId: VISUAL_ONBOARDING_TARGETS.configSupportTaxonomy,
          title: t("configuration.cards.supportTaxonomy.title", {
            defaultValue: "Complaints & Notes",
          }),
          description: t("configuration.cards.supportTaxonomy.description", {
            defaultValue:
              "Manage complaint statuses, note categories, and priorities",
          }),
        },
        {
          route: ADMIN_CONFIG_INTERNAL_TRANSIT,
          icon: "local_shipping",
          requiresFullTenantScope: true,
          title: t("configuration.cards.internalTransit.title", {
            defaultValue: "Internal Transit",
          }),
          description: t("configuration.cards.internalTransit.description", {
            defaultValue:
              "Schedule inter-warehouse courier transfers and pickup arrival ETAs",
          }),
        },
      ],
    },
    {
      heading: t("configuration.sections.teamSettings", "Team Settings"),
      cards: [
        {
          route: ADMIN_CONFIG_MEMBERS,
          icon: "group",
          requiresFullTenantScope: true,
          title: t("configuration.cards.teamMembers.title", "Team Members"),
          description: t(
            "configuration.cards.teamMembers.description",
            "Manage employees and their permissions",
          ),
        },
        ...(process.env.NODE_ENV === "development"
          ? [
              {
                route: ADMIN_CONFIG_SCHEDULING,
                icon: "calendar_month",
                requiresFullTenantScope: true,
                title: t(
                  "configuration.cards.scheduling.title",
                  "Work Schedule",
                ),
                description: t(
                  "configuration.cards.scheduling.description",
                  "Manage work time planning and shift schedules",
                ),
              },
            ]
          : []),
      ],
    },
    {
      heading: t(
        "configuration.sections.shippingSettings",
        "Shipping Settings",
      ),
      cards: [
        {
          route: ADMIN_CONFIG_WAREHOUSES,
          icon: "warehouse",
          requiresFullTenantScope: true,
          onboardingId: VISUAL_ONBOARDING_TARGETS.configWarehouses,
          title: t("configuration.cards.warehouses.title", "Warehouses"),
          description: t(
            "configuration.cards.warehouses.description",
            "Manage and change warehouse information",
          ),
        },
        {
          route: ADMIN_SUPPLIERS,
          icon: "local_shipping",
          requiresFullTenantScope: true,
          title: t("configuration.cards.suppliers.title", "Suppliers"),
          description: t(
            "configuration.cards.suppliers.description",
            "Manage and change supplier information",
          ),
        },
        {
          route: ADMIN_CONFIG_SHIPPING_METHODS,
          icon: "local_shipping",
          requiresFullTenantScope: true,
          onboardingId: VISUAL_ONBOARDING_TARGETS.configShipping,
          title: t("configuration.cards.shippingMethods.title", {
            defaultValue: "Shipping Methods",
          }),
          description: t("configuration.cards.shippingMethods.description", {
            defaultValue:
              "Configure checkout shipping methods and carrier semantics",
          }),
        },
        {
          route: ADMIN_CONFIG_PAYMENT_METHODS,
          icon: "payments",
          requiresFullTenantScope: true,
          onboardingId: VISUAL_ONBOARDING_TARGETS.configPayment,
          title: t("configuration.cards.paymentMethods.title", {
            defaultValue: "Payment Methods",
          }),
          description: t("configuration.cards.paymentMethods.description", {
            defaultValue: "Configure payment methods and shipping eligibility",
          }),
        },
      ],
    },
    {
      heading: t("configuration.sections.miscellaneous", "Miscellaneous"),
      cards: [
        {
          route: ADMIN_CONFIG_CMS,
          icon: "database",
          onboardingId: VISUAL_ONBOARDING_TARGETS.configCms,
          title: t("configuration.cards.cms.title", "CMS"),
          description: t(
            "configuration.cards.cms.description",
            "Manage storefront hero content and CMS pages",
          ),
        },
        {
          route: ADMIN_CONFIG_STORE,
          icon: "settings",
          onboardingId: VISUAL_ONBOARDING_TARGETS.configStore,
          title: t("configuration.cards.storeSettings.title", "Store Settings"),
          description: t(
            "configuration.cards.storeSettings.description",
            "View and change store settings",
          ),
        },
        {
          route: ADMIN_CONFIG_AI_INSTRUCTIONS,
          icon: "psychology",
          title: t("configuration.cards.aiInstructions.title", {
            defaultValue: "AI Instructions",
          }),
          description: t("configuration.cards.aiInstructions.description", {
            defaultValue:
              "Guide AI assistant and print-method behavior for this channel",
          }),
        },
        {
          route: ADMIN_CHANNELS,
          icon: "share",
          onboardingId: VISUAL_ONBOARDING_TARGETS.configChannels,
          title: t("configuration.cards.channels.title", "Channels"),
          description: t(
            "configuration.cards.channels.description",
            "Manage channels",
          ),
        },
        {
          route: ADMIN_CONFIG_CURRENCIES,
          icon: "currency_exchange",
          requiresFullTenantScope: true,
          title: t("configuration.cards.currencies.title", {
            defaultValue: "Currencies",
          }),
          description: t("configuration.cards.currencies.description", {
            defaultValue:
              "Manage channel currencies, conversion rates, and offsets",
          }),
        },
        {
          route: ADMIN_CONFIG_TAXES,
          icon: "receipt_long",
          requiresFullTenantScope: true,
          onboardingId: VISUAL_ONBOARDING_TARGETS.configTaxes,
          title: t("configuration.cards.taxes.title", {
            defaultValue: "Taxes & Regions",
          }),
          description: t("configuration.cards.taxes.description", {
            defaultValue:
              "Configure channel tax regions, rates, and checkout snapshots",
          }),
        },
        {
          route: ADMIN_CONFIG_PRICE_LISTS,
          icon: "price_change",
          requiresFullTenantScope: true,
          title: t("configuration.cards.priceLists.title", {
            defaultValue: "Price lists",
          }),
          description: t("configuration.cards.priceLists.description", {
            defaultValue:
              "Manage customer, channel, and campaign checkout pricing",
          }),
        },
        {
          route: ADMIN_B2B,
          icon: "domain",
          requiresFullTenantScope: true,
          title: t("configuration.cards.b2bInquiries.title", "B2B Inquiries"),
          description: t(
            "configuration.cards.b2bInquiries.description",
            "View and manage B2B inquiries",
          ),
        },
      ],
    },
  ];
  const visibleConfigSections = CONFIG_SECTIONS.map((section) => ({
    ...section,
    cards: section.cards.filter(
      (card) => hasFullTenantScope || !card.requiresFullTenantScope,
    ),
  })).filter((section) => section.cards.length > 0);

  return (
    <>
      <CustomHeading
        heading={t("configuration.title", "Configuration")}
        mb={8}
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      {visibleConfigSections.map((section, sectionIndex) => (
        <section key={sectionIndex}>
          <Separator mt={"6"} />
          <Heading my={"4"} size="md">
            {section.heading}
          </Heading>
          <SimpleGrid columns={{ md: 1, lg: 2 }} gap="4">
            {section.cards.map((card, cardIndex) => (
              <Card
                key={cardIndex}
                route={card.route}
                icon={card.icon}
                title={card.title}
                description={card.description}
                onboardingId={card.onboardingId}
              ></Card>
            ))}
          </SimpleGrid>
        </section>
      ))}
    </>
  );
};

export default IndexPage;
