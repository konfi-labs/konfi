import i18next from "@/i18n/i18next";
import { Metadata } from "next";
import ChatPage from "./chat-page";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return <ChatPage id={id} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, "translation");
  return {
    title: t("ROUTES.aiAssistant"),
  };
}
