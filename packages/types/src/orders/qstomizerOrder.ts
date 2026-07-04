export interface QstomizerOrders {
  order_id: number;
  order_date: string;
  status_id: number;
  status_date: string;
  hex_color: string;
  template_id: number;
  product_title: string;
  comments: string;
  user_agent: string;
}

export interface QstomizerOrder {
  customization_date: string;
  status_id: number;
  status_date: string;
  hex_color: string;
  template_id: number;
  comments: string;
  user_agent: string;
  orders: {
    shopify_order_id: number;
    shopify_order_name: string;
    shopify_id_product: number;
    shopify_variant_id: number;
    quantity: number;
  }[];
  sides: {
    side_id: number;
    side_name: string;
    image_url: string;
    design_url: string;
    generator_tool: string;
    nodes: Node[];
  }[];
  options_selected: {
    variation_id: string;
    option1: string;
    option1_value: string;
    option2: string;
    option2_value: string;
    option3: string | null;
    option3_value: string | null;
    color: string;
    color_des: string;
    variantSelected: {
      id: number;
      product_id: number;
      title: string;
      price: string;
      sku: string;
      position: number;
      inventory_policy: string;
      compare_at_price: string | null;
      fulfillment_service: string;
      inventory_management: string;
      option1: string;
      option2: string;
      option3: string | null;
      created_at: string;
      updated_at: string;
      taxable: boolean;
      barcode: string | null;
      grams: number;
      image_id: number | null;
      weight: number;
      weight_unit: string;
      inventory_item_id: number;
      inventory_quantity: number;
      old_inventory_quantity: number;
      requires_shipping: boolean;
      admin_graphql_api_id: string;
      qty: number;
    };
    isProductSummary: boolean;
  };
}

type Node = {
  type: "image" | "text" | "shape";
  formatOrigen?: string;
  id: string;
  position: {
    x: number;
    y: number;
  };
  fill?: string;
  hasStroke?: boolean;
  stroke?: string;
  strokeWidth?: number;
  align?: string;
  fontSize?: number;
  fontFamily?: string;
  text?: string;
  fillpattern?: string;
  scale: {
    x: number;
    y: number;
  };
  rotation: number;
  size: {
    width: number;
    height: number;
  };
  src: string;
  keepRatio: boolean;
  lineHeight?: number;
  globalScale: number;
  shadowEnabled?: boolean;
  shadowColor?: string;
  shadowOffset?: {
    x: number;
    y: number;
  };
  shadowBlur?: number;
  isEditable?: boolean;
  originalFileUrl?: string;
};
