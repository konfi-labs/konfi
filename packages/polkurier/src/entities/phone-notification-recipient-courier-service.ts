import { CourierService } from "./courier-service";

export class PhoneNotificationRecipientCourierService extends CourierService {
  private phone: boolean = false;

  setPhone(phone: boolean): this {
    this.phone = phone;
    return this;
  }

  setPhoneNotification(phone: boolean): this {
    return this.setPhone(phone);
  }

  toArray(): Record<string, unknown> {
    return {
      PHONE_NOTIFICATION_RECIPIENT: this.phone,
    };
  }
}
