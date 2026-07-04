import { AbstractMethod } from "./abstract-method";
import { RequestBody } from "../types/interfaces";

export class GetOrders extends AbstractMethod {
  private page: number = 1;
  private pageSize: number = 100;
  private status?: string;
  private packs: boolean = false;
  private items: boolean = false;
  private files: boolean = false;
  private orderNumber?: string;

  getName(): string {
    return "get_orders";
  }

  getRequestData(): RequestBody {
    if (this.orderNumber) {
      return {
        orderno: this.orderNumber,
      };
    }

    const payload: RequestBody = {
      packs: this.packs,
      pagesize: this.pageSize,
      page: this.page,
      items: this.items,
      files: this.files,
    };

    if (this.status) {
      payload.status = this.status;
    }

    return payload;
  }

  setPage(page: number): this {
    this.page = Number.isFinite(page) && page >= 1 ? Math.trunc(page) : 1;
    return this;
  }

  setPageSize(pageSize: number): this {
    this.pageSize =
      Number.isFinite(pageSize) && pageSize >= 1 ? Math.trunc(pageSize) : 100;
    return this;
  }

  setLimit(limit: number): this {
    return this.setPageSize(limit);
  }

  setStatus(status: string): this {
    const trimmed = status?.toString().trim();
    this.status = trimmed && trimmed.length > 0 ? trimmed : undefined;
    return this;
  }

  setPacks(packs: boolean): this {
    this.packs = packs;
    return this;
  }

  setItems(items: boolean): this {
    this.items = items;
    return this;
  }

  setFiles(files: boolean): this {
    this.files = files;
    return this;
  }

  setDateFrom(_dateFrom: string): this {
    return this;
  }

  setDateTo(_dateTo: string): this {
    return this;
  }

  setOrderNumber(orderNumber: string): this {
    const trimmed = orderNumber?.toString().trim();
    this.orderNumber = trimmed && trimmed.length > 0 ? trimmed : undefined;
    return this;
  }

  setOrderno(orderNumber: string): this {
    return this.setOrderNumber(orderNumber);
  }
}
