export interface Analytics {
  popularProducts: {
    ids: string[];
  };
}

export type PopularProducts = Analytics["popularProducts"];
