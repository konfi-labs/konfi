import type { Route } from "next";

export const T_STORE_MAIN_LAYOUT: Route = "layout";
export const STORE_HOME: Route = "/";
export const T_STORE_HOME: Route = "home";
export const STORE_PRODUCTS: Route = "/products";
export const T_STORE_PRODUCTS: Route = "products";
export const STORE_PROMOTION_PRODUCTS = (campaignId: string) =>
  `/products?campaignId=${campaignId}` as Route;
export const STORE_B2B: Route = "/b2b";
export const T_STORE_B2B: Route = "b2b";
export const STORE_B2B_PRODUCTS: Route = "/b2b/products";
export const T_STORE_B2B_PRODUCTS: Route = "b2b_products";
export const STORE_ACCOUNT: Route = "/account";
export const T_STORE_ACCOUNT: Route = "account";
export const STORE_ACCOUNT_ORDERS: Route = "/account/orders";
export const T_STORE_ACCOUNT_ORDERS: Route = "account_orders";
export const STORE_ACCOUNT_GENERATIONS: Route = "/account/generations";
export const T_STORE_ACCOUNT_GENERATIONS: Route = "account_generations";
export const STORE_ACCOUNT_ADDRESSES: Route = "/account/addresses";
export const T_STORE_ACCOUNT_ADDRESSES: Route = "account_addresses";
export const STORE_ACCOUNT_RATINGS: Route = "/account/ratings";
export const T_STORE_ACCOUNT_RATINGS: Route = "account_ratings";
export const STORE_ACCOUNT_SETTINGS: Route = "/account/settings";
export const T_STORE_ACCOUNT_SETTINGS: Route = "account_settings";
export const STORE_HELP: Route = "/help";
export const T_STORE_HELP: Route = "help";
export const STORE_FAQ: Route = "/help/faq";
export const T_STORE_FAQ: Route = "help_faq";
export const STORE_REASONS_FOR_REJECTIONS: Route =
  "/help/reasons-for-rejections";
export const T_STORE_REASONS_FOR_REJECTIONS: Route =
  "help_reasons_for_rejections";
export const STORE_PRIVACY_POLICY: Route = "/help/privacy-policy";
export const T_STORE_PRIVACY_POLICY: Route = "help_privacy_policy";
export const STORE_REGULATIONS: Route = "/help/regulations";
export const T_STORE_REGULATIONS: Route = "help_regulations";
export const STORE_GENERAL_CONDITIONS_OF_SALE: Route =
  "/help/general-conditions-of-sale";
export const T_STORE_GENERAL_CONDITIONS_OF_SALE: Route =
  "help_general_conditions_of_sale";
export const STORE_CONTACT: Route = "/help/contact";
export const T_STORE_CONTACT: Route = "help_contact";
export const STORE_COOPERATION: Route = "/cooperation";
export const T_STORE_COOPERATION: Route = "cooperation";
export const STORE_ABOUT_US: Route = "/about-us";
export const T_STORE_ABOUT_US: Route = "about_us";
export const STORE_CART: Route = "/cart";
export const T_STORE_CART: Route = "cart";
export const STORE_CHECKOUT: Route = "/checkout";
export const T_STORE_CHECKOUT: Route = "checkout";

export const ACCOUNT_SETTINGS: Route = "/account/settings";
export const T_ACCOUNT_SETTINGS: Route = "account_settings";
export const AUTH_LOGIN: Route = "/auth/login";
export const T_AUTH_LOGIN: Route = "auth_login";
export const AUTH_REGISTER: Route = "/auth/register";
export const T_AUTH_REGISTER: Route = "auth_register";
export const AUTH_FORGOT: Route = "/auth/forgot";
export const T_AUTH_FORGOT: Route = "auth_forgot";

export const ADMIN_CUSTOMERS: Route = "/customers";
export const ADMIN_SUPPLIERS: Route = "/suppliers";
export const ADMIN_SUPPLIERS_CREATE: Route = "/suppliers/create";
export const ADMIN_SUPPLIERS_UPDATE = (id: string) =>
  `/suppliers/${id}/edit` as Route;
export const ADMIN_QUOTES: Route = "/quotes";
export const ADMIN_QUOTES_CREATE: Route = "/quotes/create";
export const ADMIN_ORDERS: Route = "/orders";
export const ADMIN_ORDERS_CREATE: Route = "/orders/create";
export const ADMIN_ORDERS_COMPLAINTS: Route = "/complaints";
export const ADMIN_RMA_REQUESTS: Route = "/complaints/rma";
export const ADMIN_PRODUCTION_COOPERATION: Route = "/cooperation";
export const ADMIN_PRODUCTION_COOPERATION_REVIEW: Route = "/cooperation/review";
export const ADMIN_PRODUCTION_COOPERATION_STATUS: Route = "/cooperation/status";
export const ADMIN_INTERNAL_ORDERS: Route = "/internal-orders";
export const ADMIN_INTERNAL_ORDERS_CREATE: Route = "/internal-orders/create";
export const ADMIN_CATALOG: Route = "/catalog";
export const ADMIN_CATALOG_IMPORT: Route = "/catalog/import";
export const ADMIN_CATALOG_PRODUCT_IMAGES: Route = "/catalog/product-images";
export const ADMIN_CATALOG_PRODUCTS_CREATE: Route = "/catalog/products/create";
export const ADMIN_CATALOG_PRODUCTS_EDIT: Route = "/catalog/products/edit";
export const ADMIN_CATALOG_PRODUCTS_RATINGS = (id: string) =>
  `/catalog/products/${id}/ratings` as Route;
export const ADMIN_PROMOTIONS: Route = "/promotions";
export const ADMIN_PROMOTIONS_CREATE: Route = "/promotions/create";
export const ADMIN_PROMOTIONS_UPDATE = (id: string) =>
  `/promotions/${id}/edit` as Route;
export const ADMIN_CAMPAIGNS_CREATE: Route = "/campaigns/create";
export const ADMIN_CAMPAIGNS_UPDATE = (id: string) =>
  `/campaigns/${id}/edit` as Route;
export const ADMIN_NOTES: Route = "/notes";
export const ADMIN_NOTES_CREATE: Route = "/notes/create";
export const ADMIN_CONFIG: Route = "/configuration";
export const ADMIN_CONFIG_AI_INSTRUCTIONS: Route =
  "/configuration/ai-instructions";
export const ADMIN_CONFIG_PRODUCT_TYPES: Route = "/configuration/product-types";
export const ADMIN_CONFIG_PRINTING_METHODS: Route =
  "/configuration/printing-methods";
export const ADMIN_CONFIG_SHIPPING_METHODS: Route =
  "/configuration/shipping-methods";
export const ADMIN_CONFIG_PAYMENT_METHODS: Route =
  "/configuration/payment-methods";
export const ADMIN_CONFIG_PRICE_LISTS: Route = "/configuration/price-lists";
export const ADMIN_CONFIG_TAXES: Route = "/configuration/taxes";
export const ADMIN_CONFIG_ORDER_WORKFLOW_STATUSES: Route =
  "/configuration/order-workflow-statuses";
export const ADMIN_CONFIG_ORDER_RULE_PRESETS: Route =
  "/configuration/order-rule-presets";
export const ADMIN_CONFIG_INTERNAL_TRANSIT: Route =
  "/configuration/internal-transit";
export const ADMIN_CONFIG_SUPPORT_TAXONOMY: Route =
  "/configuration/support-taxonomy";
export const ADMIN_CONFIG_UNITS_PROOFING: Route =
  "/configuration/units-proofing";
export const ADMIN_CONFIG_MEMBERS: Route = "/configuration/members";
export const ADMIN_CONFIG_SCHEDULING: Route = "/configuration/scheduling";
export const ADMIN_CONFIG_SHIFT_REQUESTS: Route =
  "/configuration/scheduling/requests";
export const ADMIN_CONFIG_SHIPPING: Route = "/configuration/shipping";
export const ADMIN_CONFIG_WAREHOUSES: Route = "/configuration/warehouses";
export const ADMIN_CONFIG_WAREHOUSE_STOCK = (id: string) =>
  `/configuration/warehouses/${id}/stock` as Route;
export const ADMIN_CONFIG_WAREHOUSE_ATTRIBUTE_STOCK = (id: string) =>
  `/configuration/warehouses/${id}/attribute-stock` as Route;
export const ADMIN_CONFIG_WAREHOUSE_FULFILLMENT_REQUESTS = (id: string) =>
  `/configuration/warehouses/${id}/fulfillment-requests` as Route;
export const ADMIN_CONFIG_STORE: Route = "/configuration/store";
export const ADMIN_CHANNELS: Route = "/channels";
export const ADMIN_B2B: Route = "/configuration/b2b";
export const ADMIN_PRODUCTS: Route = "/catalog/products";
export const ADMIN_PRODUCTS_CREATE: Route = "/catalog/products/create";
export const ADMIN_CONFIG_ATTRIBUTES: Route = "/configuration/attributes";
export const ADMIN_CONFIG_ATTRIBUTES_CREATE: Route =
  "/configuration/attributes/create";
export const ADMIN_CONFIG_CMS: Route = "/configuration/cms";
export const ADMIN_ATTRIBUTES_CREATE: Route = "/catalog/attributes/create";
export const ADMIN_TOOLS: Route = "/tools";
export const ADMIN_TOOLS_CHAT: Route = "/tools/chat";
export const ADMIN_TOOLS_CHAT_ID = (id: string) => `/tools/chat/${id}` as Route;
export const ADMIN_TOOLS_IMPOSE: Route = "/tools/impose";
export const ADMIN_TOOLS_CALCULATORS: Route = "/tools/calculators";
export const ADMIN_TOOLS_FILE_CONVERT: Route = "/tools/file-convert";
export const ADMIN_TOOLS_EMAILS: Route = "/tools/emails";
export const ADMIN_TOOLS_IMAGE_GENERATOR: Route = "/tools/image-generator";
export const ADMIN_TOOLS_ANALYTICS: Route = "/tools/analytics";
export const ADMIN_TOOLS_AI_BENCHMARKS: Route = "/tools/ai-benchmarks";
export const ADMIN_TOOLS_AGENT_MEMORY: Route = "/tools/agent-memory";
export const ADMIN_TOOLS_MCP: Route = "/tools/mcp";
export const ADMIN_TOOLS_STARTER_TEMPLATES: Route = "/tools/starter-templates";
export const ADMIN_TOOLS_CHANGES: Route = "/tools/changes";
export const ADMIN_TOOLS_TASKS: Route = "/tools/tasks";
export const ADMIN_TOOLS_RESEND_EMAILS: Route = "/tools/resend";
export const ADMIN_TOOLS_RESEND_EMAIL = (id: string) =>
  `/tools/resend/${id}` as Route;
export const ADMIN_TOOLS_ALLEGRO: Route = "/tools/allegro";
export const ADMIN_TOOLS_STRIPE: Route = "/tools/stripe";
export const ADMIN_TOOLS_PRZELEWY24: Route = "/tools/przelewy24";
// Blog routes
export const ADMIN_BLOG: Route = "/blog";
export const ADMIN_BLOG_POSTS: Route = "/blog/posts";
export const ADMIN_BLOG_POSTS_CREATE: Route = "/blog/posts/create";
export const ADMIN_BLOG_POST = (id: string) => `/blog/posts/${id}` as Route;
export const ADMIN_BLOG_POSTS_EDIT = (id: string) =>
  `/blog/posts/${id}/edit` as Route;
export const ADMIN_BLOG_CATEGORIES: Route = "/blog/categories";
export const ADMIN_BLOG_CATEGORIES_CREATE: Route = "/blog/categories/create";
export const ADMIN_BLOG_CATEGORY = (id: string) =>
  `/blog/categories/${id}` as Route;
export const ADMIN_BLOG_CATEGORIES_EDIT = (id: string) =>
  `/blog/categories/${id}/edit` as Route;
export const ADMIN_BLOG_TAGS: Route = "/blog/tags";
export const ADMIN_BLOG_TAGS_CREATE: Route = "/blog/tags/create";
export const ADMIN_BLOG_TAG = (id: string) => `/blog/tags/${id}` as Route;
export const ADMIN_BLOG_TAGS_EDIT = (id: string) =>
  `/blog/tags/${id}/edit` as Route;
export const ADMIN_DELIVERY: Route = "/delivery";
export const ADMIN_FAKTUROWNIA: Route = "/fakturownia";
export const ADMIN_LOGISTICS: Route = "/logistics";
export const ADMIN_SOCIAL: Route = "/social";

export const ADMIN_DESKTOP_SETTINGS_CHANNELS: Route = "/settings/channels";

// Store blog routes
export const STORE_BLOG: Route = "/blog";
export const T_STORE_BLOG: Route = "blog";
export const STORE_BLOG_POST = (slug: string) => `/blog/${slug}` as Route;
export const T_STORE_BLOG_POST: Route = "blog_post";
export const STORE_BLOG_CATEGORY = (slug: string) =>
  `/blog/category/${slug}` as Route;
export const T_STORE_BLOG_CATEGORY: Route = "blog_category";
export const STORE_BLOG_TAG = (slug: string) => `/blog/tag/${slug}` as Route;
export const T_STORE_BLOG_TAG: Route = "blog_tag";

export const T_STORE_ROUTES = [
  T_STORE_MAIN_LAYOUT,
  T_STORE_HOME,
  T_STORE_PRODUCTS,
  T_STORE_B2B,
  T_STORE_B2B_PRODUCTS,
  T_STORE_ACCOUNT,
  T_STORE_ACCOUNT_ORDERS,
  T_STORE_ACCOUNT_GENERATIONS,
  T_STORE_ACCOUNT_ADDRESSES,
  T_STORE_ACCOUNT_RATINGS,
  T_STORE_HELP,
  T_STORE_FAQ,
  T_STORE_REASONS_FOR_REJECTIONS,
  T_STORE_PRIVACY_POLICY,
  T_STORE_REGULATIONS,
  T_STORE_GENERAL_CONDITIONS_OF_SALE,
  T_STORE_CONTACT,
  T_STORE_COOPERATION,
  T_STORE_ABOUT_US,
  T_STORE_CART,
  T_STORE_CHECKOUT,
  T_STORE_BLOG,
  T_STORE_BLOG_POST,
  T_STORE_BLOG_CATEGORY,
  T_STORE_BLOG_TAG,
  T_ACCOUNT_SETTINGS,
  T_AUTH_LOGIN,
  T_AUTH_REGISTER,
  T_AUTH_FORGOT,
];

export const T_STORE_MDX_ROUTES = [
  T_STORE_HELP,
  T_STORE_FAQ,
  T_STORE_REASONS_FOR_REJECTIONS,
  T_STORE_PRIVACY_POLICY,
  T_STORE_REGULATIONS,
  T_STORE_GENERAL_CONDITIONS_OF_SALE,
  T_STORE_CONTACT,
  T_STORE_COOPERATION,
  T_STORE_ABOUT_US,
];

// Navigable routes configuration for breadcrumb navigation
export const NAVIGABLE_ROUTES = {
  exact: new Set([
    STORE_HOME,
    STORE_PRODUCTS,
    STORE_B2B,
    STORE_B2B_PRODUCTS,
    STORE_ACCOUNT,
    STORE_ACCOUNT_ORDERS,
    STORE_ACCOUNT_GENERATIONS,
    STORE_ACCOUNT_ADDRESSES,
    STORE_ACCOUNT_RATINGS,
    STORE_ACCOUNT_SETTINGS,
    STORE_HELP,
    STORE_FAQ,
    STORE_REASONS_FOR_REJECTIONS,
    STORE_PRIVACY_POLICY,
    STORE_REGULATIONS,
    STORE_GENERAL_CONDITIONS_OF_SALE,
    STORE_CONTACT,
    STORE_COOPERATION,
    STORE_ABOUT_US,
    STORE_CART,
    STORE_CHECKOUT,
    STORE_BLOG,
    ACCOUNT_SETTINGS,
    AUTH_LOGIN,
    AUTH_REGISTER,
    AUTH_FORGOT,

    // Admin routes
    ADMIN_CUSTOMERS,
    ADMIN_SUPPLIERS,
    ADMIN_SUPPLIERS_CREATE,
    ADMIN_QUOTES,
    ADMIN_QUOTES_CREATE,
    ADMIN_ORDERS,
    ADMIN_ORDERS_CREATE,
    ADMIN_ORDERS_COMPLAINTS,
    ADMIN_RMA_REQUESTS,
    ADMIN_PRODUCTION_COOPERATION,
    ADMIN_PRODUCTION_COOPERATION_REVIEW,
    ADMIN_PRODUCTION_COOPERATION_STATUS,
    ADMIN_INTERNAL_ORDERS,
    ADMIN_INTERNAL_ORDERS_CREATE,
    ADMIN_CATALOG,
    ADMIN_CATALOG_IMPORT,
    ADMIN_CATALOG_PRODUCT_IMAGES,
    ADMIN_CATALOG_PRODUCTS_CREATE,
    // ADMIN_CATALOG_PRODUCTS_EDIT,
    ADMIN_PROMOTIONS,
    ADMIN_PROMOTIONS_CREATE,
    ADMIN_CAMPAIGNS_CREATE,
    ADMIN_NOTES,
    ADMIN_NOTES_CREATE,
    ADMIN_CONFIG,
    ADMIN_CONFIG_AI_INSTRUCTIONS,
    ADMIN_CONFIG_PRODUCT_TYPES,
    ADMIN_CONFIG_PRINTING_METHODS,
    ADMIN_CONFIG_SHIPPING_METHODS,
    ADMIN_CONFIG_PAYMENT_METHODS,
    ADMIN_CONFIG_PRICE_LISTS,
    ADMIN_CONFIG_TAXES,
    ADMIN_CONFIG_ORDER_WORKFLOW_STATUSES,
    ADMIN_CONFIG_ORDER_RULE_PRESETS,
    ADMIN_CONFIG_SUPPORT_TAXONOMY,
    ADMIN_CONFIG_UNITS_PROOFING,
    ADMIN_CONFIG_MEMBERS,
    ADMIN_CONFIG_SCHEDULING,
    ADMIN_CONFIG_SHIFT_REQUESTS,
    ADMIN_CONFIG_SHIPPING,
    ADMIN_CONFIG_WAREHOUSES,
    ADMIN_CONFIG_STORE,
    ADMIN_CHANNELS,
    ADMIN_B2B,
    // ADMIN_PRODUCTS,
    ADMIN_PRODUCTS_CREATE,
    ADMIN_CONFIG_ATTRIBUTES,
    ADMIN_CONFIG_ATTRIBUTES_CREATE,
    ADMIN_CONFIG_CMS,
    ADMIN_ATTRIBUTES_CREATE,
    ADMIN_TOOLS,
    ADMIN_TOOLS_CHAT,
    ADMIN_TOOLS_IMAGE_GENERATOR,
    ADMIN_TOOLS_IMPOSE,
    ADMIN_TOOLS_CALCULATORS,
    ADMIN_TOOLS_CHANGES,
    ADMIN_TOOLS_ANALYTICS,
    ADMIN_TOOLS_AI_BENCHMARKS,
    ADMIN_TOOLS_AGENT_MEMORY,
    ADMIN_TOOLS_MCP,
    ADMIN_TOOLS_STARTER_TEMPLATES,
    ADMIN_TOOLS_TASKS,
    ADMIN_TOOLS_RESEND_EMAILS,
    ADMIN_TOOLS_ALLEGRO,
    ADMIN_TOOLS_STRIPE,
    ADMIN_TOOLS_PRZELEWY24,
    ADMIN_BLOG,
    ADMIN_BLOG_POSTS,
    ADMIN_BLOG_POSTS_CREATE,
    ADMIN_BLOG_CATEGORIES,
    ADMIN_BLOG_CATEGORIES_CREATE,
    ADMIN_BLOG_TAGS,
    ADMIN_BLOG_TAGS_CREATE,
    ADMIN_DELIVERY,
    ADMIN_SOCIAL,
  ]),
  patterns: [
    // Dynamic routes patterns
    /^\/products\?campaignId=.+$/, // STORE_PROMOTION_PRODUCTS
    /^\/suppliers\/[^\/]+\/edit$/, // ADMIN_SUPPLIERS_UPDATE
    /^\/catalog\/products\/[^\/]+\/ratings$/, // ADMIN_CATALOG_PRODUCTS_RATINGS
    /^\/promotions\/[^\/]+\/edit$/, // ADMIN_PROMOTIONS_UPDATE
    /^\/campaigns\/[^\/]+\/edit$/, // ADMIN_CAMPAIGNS_UPDATE
    /^\/configuration\/warehouses\/[^\/]+\/stock$/, // ADMIN_CONFIG_WAREHOUSE_STOCK
    /^\/configuration\/warehouses\/[^\/]+\/attribute-stock$/, // ADMIN_CONFIG_WAREHOUSE_ATTRIBUTE_STOCK
    /^\/configuration\/warehouses\/[^\/]+\/fulfillment-requests$/, // ADMIN_CONFIG_WAREHOUSE_FULFILLMENT_REQUESTS
    /^\/tools\/chat\/[^\/]+$/, // ADMIN_TOOLS_CHAT_ID
    /^\/blog\/posts\/[^\/]+$/, // ADMIN_BLOG_POST
    /^\/blog\/posts\/[^\/]+\/edit$/, // ADMIN_BLOG_POSTS_EDIT
    /^\/blog\/categories\/[^\/]+$/, // ADMIN_BLOG_CATEGORY
    /^\/blog\/categories\/[^\/]+\/edit$/, // ADMIN_BLOG_CATEGORIES_EDIT
    /^\/blog\/tags\/[^\/]+$/, // ADMIN_BLOG_TAG
    /^\/blog\/tags\/[^\/]+\/edit$/, // ADMIN_BLOG_TAGS_EDIT
    /^\/blog\/[^\/]+$/, // STORE_BLOG_POST
    /^\/blog\/category\/[^\/]+$/, // STORE_BLOG_CATEGORY
    /^\/blog\/tag\/[^\/]+$/, // STORE_BLOG_TAG
  ],
};

/**
 * Check if a route is navigable (has an implemented page)
 * @param href - The route to check
 * @returns true if the route is navigable, false otherwise
 */
export const isRouteNavigable = (href: string): boolean => {
  // Remove locale from href for checking
  const parts = href.split("/").filter(Boolean);
  const localeRe = /^[a-z]{2}(?:-[A-Za-z]{2})?$/;
  const hasLocale = parts[0] && localeRe.test(parts[0]);
  const cleanHref = hasLocale ? `/${parts.slice(1).join("/")}` || "/" : href;

  // Check exact routes
  if (NAVIGABLE_ROUTES.exact.has(cleanHref)) return true;

  // Check pattern matches
  return NAVIGABLE_ROUTES.patterns.some((pattern) => pattern.test(cleanHref));
};
