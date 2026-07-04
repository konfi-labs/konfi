import { CourierService } from "./courier-service";

export class SmsNotificationRecipientCourierService extends CourierService {
  private sms: boolean = false;

  setSms(sms: boolean): this {
    this.sms = sms;
    return this;
  }

  setSmsNotificationRecipient(sms: boolean): this {
    return this.setSms(sms);
  }

  toArray(): Record<string, unknown> {
    return {
      SMS_NOTIFICATION_RECIPIENT: this.sms,
    };
  }
}
