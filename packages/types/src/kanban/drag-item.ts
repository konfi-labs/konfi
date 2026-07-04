import { OrderStatus } from "../enums";
import { Order } from "../orders/order";

export interface DragItem {
  index: number;
  id: Order["id"];
  from: keyof typeof OrderStatus;
}
