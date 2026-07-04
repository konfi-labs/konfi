import { Metadata } from "next";
import OrderFolderSettings from "./order-folder-settings";

export const metadata: Metadata = {
  title: "Channel Settings - Order Folders",
};

export default function ChannelSettingsPage() {
  return <OrderFolderSettings />;
}
