export { render } from "react-email";
export { formatSenderAddress } from "./sender";

// Shared components
export { Layout } from "./components/Layout";

// Templates
export { NewOrderCustomer } from "./templates/NewOrderCustomer";
export type { NewOrderCustomerProps } from "./templates/NewOrderCustomer";

export { NewOrderAdmin } from "./templates/NewOrderAdmin";
export type { NewOrderAdminProps } from "./templates/NewOrderAdmin";

export { B2BInquiryAdmin } from "./templates/B2BInquiryAdmin";
export type { B2BInquiryAdminProps } from "./templates/B2BInquiryAdmin";

export { B2BAcceptanceCustomer } from "./templates/B2BAcceptanceCustomer";
export type { B2BAcceptanceCustomerProps } from "./templates/B2BAcceptanceCustomer";

export { StatusChange } from "./templates/StatusChange";
export type { StatusChangeProps } from "./templates/StatusChange";

export { AttachmentNotification } from "./templates/AttachmentNotification";
export type { AttachmentNotificationProps } from "./templates/AttachmentNotification";

export { StalledOrdersReminder } from "./templates/StalledOrdersReminder";
export type { StalledOrdersReminderProps } from "./templates/StalledOrdersReminder";

export { NoPaymentDocumentReminder } from "./templates/NoPaymentDocumentReminder";
export type { NoPaymentDocumentReminderProps } from "./templates/NoPaymentDocumentReminder";

export { UnpaidReport } from "./templates/UnpaidReport";
export type { UnpaidReportProps } from "./templates/UnpaidReport";

export { FakturowniaTurnoverReport } from "./templates/FakturowniaTurnoverReport";
export type { FakturowniaTurnoverReportProps } from "./templates/FakturowniaTurnoverReport";

export { RatingRequest } from "./templates/RatingRequest";
export type { RatingRequestProps } from "./templates/RatingRequest";

export { ProformaPaid } from "./templates/ProformaPaid";
export type { ProformaPaidProps } from "./templates/ProformaPaid";

export { AbandonedCartReminder } from "./templates/AbandonedCartReminder";
export type { AbandonedCartReminderProps } from "./templates/AbandonedCartReminder";

export { NoteNotificationEmail } from "./templates/NoteNotification";
export type {
  NoteNotificationEvent,
  NoteNotificationProps,
} from "./templates/NoteNotification";

export { InboundEmailAgentResponse } from "./templates/InboundEmailAgentResponse";
export type { InboundEmailAgentResponseProps } from "./templates/InboundEmailAgentResponse";

export { ComplaintNotification } from "./templates/ComplaintNotification";
export type { ComplaintNotificationProps } from "./templates/ComplaintNotification";

export { OrderItemProblemNotification } from "./templates/OrderItemProblemNotification";
export type { OrderItemProblemNotificationProps } from "./templates/OrderItemProblemNotification";

export { CampaignNotification } from "./templates/CampaignNotification";
export type { CampaignNotificationProps } from "./templates/CampaignNotification";

export { NewsletterPromotion } from "./templates/NewsletterPromotion";
export type { NewsletterPromotionProps } from "./templates/NewsletterPromotion";
