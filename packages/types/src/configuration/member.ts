import { Base } from "../base";
import { MemberNotificationSettings } from "../notifications";
import type { TenantOwned } from "../tenant";

export interface Member
  extends Omit<Base, "createdBy" | "updatedBy">, TenantOwned {
  name: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  channelIds?: string[];
  notifications?: MemberNotificationSettings;
}

export interface MemberCreate extends Member {}

export interface MemberCreateForm extends Omit<
  MemberCreate,
  "id" | "active" | "createdAt" | "updatedAt" | "active" | "tenantId"
> {}

export interface MemberUpdate extends Omit<
  Member,
  "id" | "active" | "createdAt"
> {}

export interface MemberUpdateForm extends Omit<
  MemberUpdate,
  "createdAt" | "updatedAt" | "active" | "tenantId"
> {}

export type FormMember = Omit<Member, "createdAt" | "updatedAt" | "tenantId">;

export type NestedMember = Omit<
  Member,
  | "createdAt"
  | "updatedAt"
  | "email"
  | "phone"
  | "active"
  | "channelIds"
  | "notifications"
  | "avatarUrl"
  | "tenantId"
>;
