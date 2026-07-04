"use client";

import { useT } from "@/i18n/client";
import type { StorefrontButtonStyle } from "@konfi/types";
import type { FormEvent } from "react";
import { useState } from "react";
import { submitStorefrontAssistantMessage } from "./storefront-assistant-events";
import {
  StorefrontAssistantHeroInput,
  type StorefrontAssistantLabels,
} from "./StorefrontAssistantView";

export function StorefrontAssistantHero({
  buttonStyle = "solid",
}: {
  buttonStyle?: StorefrontButtonStyle;
}) {
  const { t } = useT();
  const [heroInputValue, setHeroInputValue] = useState("");

  const labels: StorefrontAssistantLabels = {
    ariaLabel: t("store.assistant.ariaLabel", {
      defaultValue: "Ask the AI assistant",
    }),
    close: t("common.close", { defaultValue: "Close" }),
    contact: t("store.assistant.contact", { defaultValue: "Contact" }),
    contactPage: t("store.assistant.contactPage", {
      defaultValue: "Contact page",
    }),
    headerTitle: t("store.assistant.title", {
      defaultValue: "AI Assistant",
    }),
    heroPlaceholder: t("store.assistant.heroPlaceholder", {
      defaultValue: "Describe what you need printed…",
    }),
    inputPlaceholder: t("store.assistant.inputPlaceholder", {
      defaultValue: "Write a message…",
    }),
    open: t("store.assistant.open", {
      defaultValue: "Open AI assistant",
    }),
    productLink: t("store.assistant.productLink", {
      defaultValue: "Open",
    }),
    quickContact: t("store.assistant.quickContact", {
      defaultValue: "Contact details",
    }),
    quickFiles: t("store.assistant.quickFiles", {
      defaultValue: "How to prepare files?",
    }),
    send: t("store.assistant.send", { defaultValue: "Send message" }),
    thinking: t("store.assistant.thinking", {
      defaultValue: "Assistant is preparing an answer",
    }),
  };

  function submitMessage(message: string) {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;

    setHeroInputValue("");
    submitStorefrontAssistantMessage(trimmedMessage);
  }

  function handleHeroSubmit(event?: FormEvent<HTMLDivElement>) {
    event?.preventDefault();
    submitMessage(heroInputValue);
  }

  return (
    <StorefrontAssistantHeroInput
      heroInputValue={heroInputValue}
      isSubmitting={false}
      buttonStyle={buttonStyle}
      labels={labels}
      onHeroInputChange={setHeroInputValue}
      onQuickPrompt={submitMessage}
      onSubmitHero={handleHeroSubmit}
    />
  );
}
