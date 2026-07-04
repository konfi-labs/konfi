import { Base } from "../base";

export interface Message extends Omit<Base, "id" | "name" | "active"> {
  value: string;
}
