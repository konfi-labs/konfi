import {
  ACCOUNT_SETTINGS,
  ADMIN_ATTRIBUTES_CREATE,
  ADMIN_B2B,
  ADMIN_CAMPAIGNS_CREATE,
  ADMIN_CAMPAIGNS_UPDATE,
  ADMIN_CATALOG,
  ADMIN_CATALOG_PRODUCTS_CREATE,
  ADMIN_CATALOG_PRODUCTS_EDIT,
  ADMIN_CATALOG_PRODUCTS_RATINGS,
  ADMIN_CHANGELOG,
  ADMIN_CHANNELS,
  ADMIN_CONFIG,
  ADMIN_CONFIG_AI_INSTRUCTIONS,
  ADMIN_CONFIG_ATTRIBUTES,
  ADMIN_CONFIG_ATTRIBUTES_CREATE,
  ADMIN_CONFIG_CMS,
  ADMIN_CONFIG_MEMBERS,
  ADMIN_CONFIG_PRODUCT_TYPES,
  ADMIN_CONFIG_SHIPPING,
  ADMIN_CONFIG_STORE,
  ADMIN_CONFIG_TAXES,
  ADMIN_CONFIG_WAREHOUSES,
  ADMIN_CUSTOMERS,
  ADMIN_INTERNAL_ORDERS,
  ADMIN_INTERNAL_ORDERS_CREATE,
  ADMIN_ORDERS,
  ADMIN_ORDERS_CREATE,
  ADMIN_RMA_REQUESTS,
  ADMIN_PRODUCTS,
  ADMIN_PRODUCTS_CREATE,
  ADMIN_PROMOTIONS,
  ADMIN_PROMOTIONS_CREATE,
  ADMIN_PROMOTIONS_UPDATE,
  ADMIN_QUOTES,
  ADMIN_QUOTES_CREATE,
  ADMIN_TOOLS,
  ADMIN_TOOLS_IMPOSE,
  ADMIN_TOOLS_MCP,
  ADMIN_TOOLS_PRZELEWY24,
  ADMIN_TOOLS_STARTER_TEMPLATES,
  ADMIN_TOOLS_STRIPE,
  AUTH_FORGOT,
  AUTH_LOGIN,
  AUTH_REGISTER,
  STORE_ABOUT_US,
  STORE_ACCOUNT,
  STORE_ACCOUNT_ADDRESSES,
  STORE_ACCOUNT_ORDERS,
  STORE_ACCOUNT_RATINGS,
  STORE_B2B,
  STORE_B2B_PRODUCTS,
  STORE_CART,
  STORE_CHECKOUT,
  STORE_CONTACT,
  STORE_FAQ,
  STORE_GENERAL_CONDITIONS_OF_SALE,
  STORE_HELP,
  STORE_PRIVACY_POLICY,
  STORE_PRODUCTS,
  STORE_PROMOTION_PRODUCTS,
  STORE_REASONS_FOR_REJECTIONS,
  STORE_REGULATIONS,
} from "../routes";

describe("Route constants", () => {
  it("should have correct STORE_PRODUCTS route", () => {
    expect(STORE_PRODUCTS).toBe("/products");
  });

  it("should generate correct STORE_PROMOTION_PRODUCTS route", () => {
    const campaignId = "123";
    expect(STORE_PROMOTION_PRODUCTS(campaignId)).toBe(
      `/products?campaignId=${campaignId}`,
    );
  });

  it("should have correct STORE_B2B route", () => {
    expect(STORE_B2B).toBe("/b2b");
  });

  it("should have correct STORE_B2B_PRODUCTS route", () => {
    expect(STORE_B2B_PRODUCTS).toBe("/b2b/products");
  });

  it("should have correct STORE_ACCOUNT route", () => {
    expect(STORE_ACCOUNT).toBe("/account");
  });

  it("should have correct STORE_ACCOUNT_ORDERS route", () => {
    expect(STORE_ACCOUNT_ORDERS).toBe("/account/orders");
  });

  it("should have correct STORE_ACCOUNT_ADDRESSES route", () => {
    expect(STORE_ACCOUNT_ADDRESSES).toBe("/account/addresses");
  });

  it("should have correct STORE_ACCOUNT_RATINGS route", () => {
    expect(STORE_ACCOUNT_RATINGS).toBe("/account/ratings");
  });

  it("should have correct STORE_HELP route", () => {
    expect(STORE_HELP).toBe("/help");
  });

  it("should have correct STORE_FAQ route", () => {
    expect(STORE_FAQ).toBe("/help/faq");
  });

  it("should have correct STORE_REASONS_FOR_REJECTIONS route", () => {
    expect(STORE_REASONS_FOR_REJECTIONS).toBe("/help/reasons-for-rejections");
  });

  it("should have correct STORE_PRIVACY_POLICY route", () => {
    expect(STORE_PRIVACY_POLICY).toBe("/help/privacy-policy");
  });

  it("should have correct STORE_REGULATIONS route", () => {
    expect(STORE_REGULATIONS).toBe("/help/regulations");
  });

  it("should have correct STORE_GENERAL_CONDITIONS_OF_SALE  route", () => {
    expect(STORE_GENERAL_CONDITIONS_OF_SALE).toBe(
      "/help/general-conditions-of-sale",
    );
  });

  it("should have correct STORE_CONTACT route", () => {
    expect(STORE_CONTACT).toBe("/help/contact");
  });

  it("should have correct STORE_ABOUT_US route", () => {
    expect(STORE_ABOUT_US).toBe("/about-us");
  });

  it("should have correct STORE_CART route", () => {
    expect(STORE_CART).toBe("/cart");
  });

  it("should have correct STORE_CHECKOUT route", () => {
    expect(STORE_CHECKOUT).toBe("/checkout");
  });

  it("should have correct ACCOUNT_SETTINGS route", () => {
    expect(ACCOUNT_SETTINGS).toBe("/account/settings");
  });

  it("should have correct AUTH_LOGIN route", () => {
    expect(AUTH_LOGIN).toBe("/auth/login");
  });

  it("should have correct AUTH_REGISTER route", () => {
    expect(AUTH_REGISTER).toBe("/auth/register");
  });

  it("should have correct AUTH_FORGOT route", () => {
    expect(AUTH_FORGOT).toBe("/auth/forgot");
  });

  it("should have correct ADMIN_CUSTOMERS route", () => {
    expect(ADMIN_CUSTOMERS).toBe("/customers");
  });

  it("should have correct ADMIN_QUOTES route", () => {
    expect(ADMIN_QUOTES).toBe("/quotes");
  });

  it("should have correct ADMIN_QUOTES_CREATE route", () => {
    expect(ADMIN_QUOTES_CREATE).toBe("/quotes/create");
  });

  it("should have correct ADMIN_ORDERS route", () => {
    expect(ADMIN_ORDERS).toBe("/orders");
  });

  it("should have correct ADMIN_ORDERS_CREATE route", () => {
    expect(ADMIN_ORDERS_CREATE).toBe("/orders/create");
  });

  it("should have correct ADMIN_RMA_REQUESTS route", () => {
    expect(ADMIN_RMA_REQUESTS).toBe("/complaints/rma");
  });

  it("should have correct ADMIN_INTERNAL_ORDERS route", () => {
    expect(ADMIN_INTERNAL_ORDERS).toBe("/internal-orders");
  });

  it("should have correct ADMIN_INTERNAL_ORDERS_CREATE route", () => {
    expect(ADMIN_INTERNAL_ORDERS_CREATE).toBe("/internal-orders/create");
  });

  it("should have correct ADMIN_CATALOG route", () => {
    expect(ADMIN_CATALOG).toBe("/catalog");
  });

  it("should have correct ADMIN_CATALOG_PRODUCTS_CREATE route", () => {
    expect(ADMIN_CATALOG_PRODUCTS_CREATE).toBe("/catalog/products/create");
  });

  it("should have correct ADMIN_CATALOG_PRODUCTS_EDIT route", () => {
    expect(ADMIN_CATALOG_PRODUCTS_EDIT).toBe("/catalog/products/edit");
  });

  it("should generate correct ADMIN_CATALOG_PRODUCTS_RATINGS route", () => {
    const id = "123";
    expect(ADMIN_CATALOG_PRODUCTS_RATINGS(id)).toBe(
      `/catalog/products/${id}/ratings`,
    );
  });

  it("should have correct ADMIN_PROMOTIONS route", () => {
    expect(ADMIN_PROMOTIONS).toBe("/promotions");
  });

  it("should have correct ADMIN_PROMOTIONS_CREATE route", () => {
    expect(ADMIN_PROMOTIONS_CREATE).toBe("/promotions/create");
  });

  it("should generate correct ADMIN_PROMOTIONS_UPDATE route", () => {
    const id = "123";
    expect(ADMIN_PROMOTIONS_UPDATE(id)).toBe(`/promotions/${id}/edit`);
  });

  it("should have correct ADMIN_CAMPAIGNS_CREATE route", () => {
    expect(ADMIN_CAMPAIGNS_CREATE).toBe("/campaigns/create");
  });

  it("should generate correct ADMIN_CAMPAIGNS_UPDATE route", () => {
    const id = "123";
    expect(ADMIN_CAMPAIGNS_UPDATE(id)).toBe(`/campaigns/${id}/edit`);
  });

  it("should have correct ADMIN_CONFIG route", () => {
    expect(ADMIN_CONFIG).toBe("/configuration");
  });

  it("should have correct ADMIN_CONFIG_AI_INSTRUCTIONS route", () => {
    expect(ADMIN_CONFIG_AI_INSTRUCTIONS).toBe("/configuration/ai-instructions");
  });

  it("should have correct ADMIN_CONFIG_PRODUCT_TYPES route", () => {
    expect(ADMIN_CONFIG_PRODUCT_TYPES).toBe("/configuration/product-types");
  });

  it("should have correct ADMIN_CONFIG_MEMBERS route", () => {
    expect(ADMIN_CONFIG_MEMBERS).toBe("/configuration/members");
  });

  it("should have correct ADMIN_CONFIG_SHIPPING route", () => {
    expect(ADMIN_CONFIG_SHIPPING).toBe("/configuration/shipping");
  });

  it("should have correct ADMIN_CONFIG_WAREHOUSES route", () => {
    expect(ADMIN_CONFIG_WAREHOUSES).toBe("/configuration/warehouses");
  });

  it("should have correct ADMIN_CONFIG_STORE route", () => {
    expect(ADMIN_CONFIG_STORE).toBe("/configuration/store");
  });

  it("should have correct ADMIN_CONFIG_TAXES route", () => {
    expect(ADMIN_CONFIG_TAXES).toBe("/configuration/taxes");
  });

  it("should have correct ADMIN_CHANNELS route", () => {
    expect(ADMIN_CHANNELS).toBe("/channels");
  });

  it("should have correct ADMIN_B2B route", () => {
    expect(ADMIN_B2B).toBe("/configuration/b2b");
  });

  it("should have correct ADMIN_PRODUCTS route", () => {
    expect(ADMIN_PRODUCTS).toBe("/catalog/products");
  });

  it("should have correct ADMIN_PRODUCTS_CREATE route", () => {
    expect(ADMIN_PRODUCTS_CREATE).toBe("/catalog/products/create");
  });

  it("should have correct ADMIN_CONFIG_ATTRIBUTES route", () => {
    expect(ADMIN_CONFIG_ATTRIBUTES).toBe("/configuration/attributes");
  });

  it("should have correct ADMIN_CONFIG_ATTRIBUTES_CREATE route", () => {
    expect(ADMIN_CONFIG_ATTRIBUTES_CREATE).toBe(
      "/configuration/attributes/create",
    );
  });

  it("should have correct ADMIN_CONFIG_CMS route", () => {
    expect(ADMIN_CONFIG_CMS).toBe("/configuration/cms");
  });

  it("should have correct ADMIN_ATTRIBUTES_CREATE route", () => {
    expect(ADMIN_ATTRIBUTES_CREATE).toBe("/catalog/attributes/create");
  });

  it("should have correct ADMIN_TOOLS route", () => {
    expect(ADMIN_TOOLS).toBe("/tools");
  });

  it("should have correct ADMIN_TOOLS_IMPOSE route", () => {
    expect(ADMIN_TOOLS_IMPOSE).toBe("/tools/impose");
  });

  it("should have correct ADMIN_TOOLS_MCP route", () => {
    expect(ADMIN_TOOLS_MCP).toBe("/tools/mcp");
  });

  it("should have correct ADMIN_TOOLS_STARTER_TEMPLATES route", () => {
    expect(ADMIN_TOOLS_STARTER_TEMPLATES).toBe("/tools/starter-templates");
  });

  it("should have correct ADMIN_TOOLS_STRIPE route", () => {
    expect(ADMIN_TOOLS_STRIPE).toBe("/tools/stripe");
  });

  it("should have correct ADMIN_TOOLS_PRZELEWY24 route", () => {
    expect(ADMIN_TOOLS_PRZELEWY24).toBe("/tools/przelewy24");
  });
});
