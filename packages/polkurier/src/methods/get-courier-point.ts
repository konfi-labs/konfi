import { RequestBody } from "../types/interfaces";
import { AbstractMethod } from "./abstract-method";

export class GetCourierPoint extends AbstractMethod {
  private couriers?: string[];
  private functions?: string[];
  private searchQuery?: string;
  private pointId?: string;
  private limit?: number;
  private page?: number;

  getName(): string {
    return "get_courier_point";
  }

  getRequestData(): RequestBody {
    return {
      couriers: this.couriers,
      functions: this.functions,
      searchquery: this.searchQuery,
      id: this.pointId,
      limit: this.limit,
      page: this.page,
    };
  }

  setCouriers(couriers: string | string[]): this {
    const values = Array.isArray(couriers) ? couriers : [couriers];
    const normalized = values
      .map((item) => item?.toString().trim())
      .filter((item): item is string => Boolean(item && item.length > 0));
    this.couriers = normalized.length > 0 ? normalized : undefined;
    return this;
  }

  setFunctions(functions: string | string[]): this {
    const values = Array.isArray(functions) ? functions : [functions];
    const normalized = values
      .map((item) => item?.toString().trim())
      .filter((item): item is string => Boolean(item && item.length > 0));
    this.functions = normalized.length > 0 ? normalized : undefined;
    return this;
  }

  setSearchQuery(searchQuery: string): this {
    const trimmed = searchQuery?.toString().trim();
    this.searchQuery = trimmed && trimmed.length > 0 ? trimmed : undefined;
    return this;
  }

  setPointId(pointId: string): this {
    const trimmed = pointId?.toString().trim();
    this.pointId = trimmed && trimmed.length > 0 ? trimmed : undefined;
    return this;
  }

  setLimit(limit: number): this {
    this.limit =
      Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : undefined;
    return this;
  }

  setPage(page: number): this {
    this.page =
      Number.isFinite(page) && page >= 0 ? Math.trunc(page) : undefined;
    return this;
  }
}
