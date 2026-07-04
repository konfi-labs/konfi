"use client";

import { useAuth } from "@/context/auth";
import { useT } from "@/i18n/client";
import {
  StorefrontAssistantResponse,
  StorefrontAssistantRequestBody,
} from "@/lib/storefront-assistant/types";
import { Locale } from "@konfi/types";
import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { addStorefrontAssistantSubmitListener } from "./storefront-assistant-events";
import {
  AssistantChatMessage,
  StorefrontAssistantLabels,
  StorefrontAssistantView,
} from "./StorefrontAssistantView";

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toAssistantMessage(
  response: StorefrontAssistantResponse,
): AssistantChatMessage {
  return {
    id: createMessageId(),
    role: "assistant",
    content: response.answer,
    contact: response.contact,
    products: response.products,
  };
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

interface AssistantAudioContextRef {
  current: AudioContext | null;
}

function getAssistantAudioContext(
  audioContextRef: AssistantAudioContextRef,
): AudioContext | undefined {
  if (typeof window === "undefined") return undefined;

  const AudioContextConstructor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextConstructor) return undefined;

  const context = audioContextRef.current ?? new AudioContextConstructor();
  audioContextRef.current = context;

  return context;
}

async function prepareAssistantReadySound(
  audioContextRef: AssistantAudioContextRef,
) {
  const context = getAssistantAudioContext(audioContextRef);
  if (!context) return;

  if (context.state === "suspended") {
    await context.resume().catch(() => undefined);
  }
}

async function playAssistantReadySound(
  audioContextRef: AssistantAudioContextRef,
) {
  await prepareAssistantReadySound(audioContextRef);

  const context = audioContextRef.current;
  if (!context || context.state !== "running") return;

  const now = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.035, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
  gain.connect(context.destination);

  [660, 880].forEach((frequency, index) => {
    const startTime = now + index * 0.08;
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startTime);
    oscillator.connect(gain);
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.22);
  });
}

interface StorefrontAssistantProps {
  lng: string;
  showHeroInput?: boolean;
}

export function StorefrontAssistant({
  lng,
  showHeroInput = true,
}: StorefrontAssistantProps) {
  const { t } = useT();
  const { appCheckToken, user } = useAuth();
  const [heroInputValue, setHeroInputValue] = useState("");
  const [chatInputValue, setChatInputValue] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [messages, setMessages] = useState<AssistantChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: t("store.assistant.welcome", {
        defaultValue:
          "Tell me what you want to print. I can suggest products, share contact details and explain basic file preparation.",
      }),
    },
  ]);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const isSendingRef = useRef(false);
  const isMountedRef = useRef(true);
  const requestAbortRef = useRef<AbortController | null>(null);
  const pendingSubmitMessagesRef = useRef<string[]>([]);
  const sendMessageRef = useRef<(message: string) => void>(() => undefined);

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

  useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      requestAbortRef.current?.abort();
      pendingSubmitMessagesRef.current = [];
      void audioContextRef.current?.close().catch(() => undefined);
    };
  }, []);

  const sendMessage = useCallback(
    async (rawMessage: string) => {
      const message = rawMessage.trim();
      if (!message) return;

      if (isSendingRef.current) {
        pendingSubmitMessagesRef.current.push(message);
        return;
      }

      isSendingRef.current = true;
      setIsOpen(true);
      setIsSubmitting(true);
      setMessages((current) => [
        ...current,
        { id: createMessageId(), role: "user", content: message },
      ]);
      void prepareAssistantReadySound(audioContextRef);
      const abortController = new AbortController();
      requestAbortRef.current = abortController;

      try {
        if (!user || user.isAnonymous) {
          throw new Error(
            t("store.assistant.authRequired", {
              defaultValue: "Log in to a regular account to use the assistant.",
            }),
          );
        }

        const requestBody: StorefrontAssistantRequestBody = {
          conversationId,
          message,
          locale: Object.values(Locale).includes(lng as Locale)
            ? (lng as Locale)
            : Locale.pl,
        };
        const headers = new Headers({
          authorization: `Bearer ${await user.getIdToken()}`,
          "content-type": "application/json",
        });

        if (appCheckToken?.token) {
          headers.set("x-firebase-appcheck", appCheckToken.token);
        }

        const response = await fetch("/api/storefront-assistant", {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(
            payload?.error ||
              t("store.assistant.unavailable", {
                defaultValue: "Assistant is unavailable right now.",
              }),
          );
        }

        const payload = (await response.json()) as StorefrontAssistantResponse;
        if (payload.conversationId) {
          setConversationId(payload.conversationId);
        }
        setMessages((current) => [...current, toAssistantMessage(payload)]);
        void playAssistantReadySound(audioContextRef);
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }

        setMessages((current) => [
          ...current,
          {
            id: createMessageId(),
            role: "assistant",
            content:
              error instanceof Error
                ? error.message
                : t("store.assistant.unavailable", {
                    defaultValue: "Assistant is unavailable right now.",
                  }),
            isError: true,
          },
        ]);
      } finally {
        isSendingRef.current = false;
        if (requestAbortRef.current === abortController) {
          requestAbortRef.current = null;
        }

        if (!isMountedRef.current) {
          return;
        }

        setIsSubmitting(false);
        const nextMessage = pendingSubmitMessagesRef.current.shift();
        if (nextMessage) {
          setTimeout(() => sendMessageRef.current(nextMessage), 0);
        }
      }
    },
    [appCheckToken?.token, conversationId, lng, t, user],
  );

  useEffect(() => {
    sendMessageRef.current = (message) => {
      void sendMessage(message);
    };
  }, [sendMessage]);

  useEffect(() => {
    return addStorefrontAssistantSubmitListener((event) => {
      void sendMessage(event.detail.message);
    });
  }, [sendMessage]);

  function handleHeroSubmit(event?: FormEvent<HTMLDivElement>) {
    event?.preventDefault();
    const message = heroInputValue;
    setHeroInputValue("");
    void sendMessage(message);
  }

  function handleChatSubmit(event?: FormEvent<HTMLDivElement>) {
    event?.preventDefault();
    const message = chatInputValue;
    setChatInputValue("");
    void sendMessage(message);
  }

  function handleQuickPrompt(message: string) {
    setHeroInputValue("");
    void sendMessage(message);
  }

  return (
    <StorefrontAssistantView
      chatInputValue={chatInputValue}
      chatScrollRef={chatScrollRef}
      heroInputValue={heroInputValue}
      isOpen={isOpen}
      isSubmitting={isSubmitting}
      labels={labels}
      lng={lng}
      messages={messages}
      showHeroInput={showHeroInput}
      onChatInputChange={setChatInputValue}
      onClose={() => setIsOpen(false)}
      onHeroInputChange={setHeroInputValue}
      onOpen={() => setIsOpen(true)}
      onQuickPrompt={handleQuickPrompt}
      onSubmitChat={handleChatSubmit}
      onSubmitHero={handleHeroSubmit}
    />
  );
}
