"use client";

export const STOREFRONT_ASSISTANT_SUBMIT_EVENT = "storefront-assistant:submit";

export interface StorefrontAssistantSubmitEventDetail {
  message: string;
}

type StorefrontAssistantSubmitListener = (
  event: CustomEvent<StorefrontAssistantSubmitEventDetail>,
) => void;

const pendingMessages: string[] = [];
let listenerCount = 0;
let pendingFlushScheduled = false;

function createStorefrontAssistantSubmitEvent(message: string) {
  return new CustomEvent<StorefrontAssistantSubmitEventDetail>(
    STOREFRONT_ASSISTANT_SUBMIT_EVENT,
    {
      detail: { message },
    },
  );
}

export function submitStorefrontAssistantMessage(message: string) {
  if (listenerCount === 0) {
    pendingMessages.push(message);
    return;
  }

  dispatchStorefrontAssistantSubmitMessage(message);
}

export function isStorefrontAssistantSubmitEvent(
  event: Event,
): event is CustomEvent<StorefrontAssistantSubmitEventDetail> {
  return (
    event instanceof CustomEvent &&
    typeof event.detail === "object" &&
    event.detail !== null &&
    "message" in event.detail &&
    typeof event.detail.message === "string"
  );
}

export function addStorefrontAssistantSubmitListener(
  listener: StorefrontAssistantSubmitListener,
) {
  const eventListener = (event: Event) => {
    if (!isStorefrontAssistantSubmitEvent(event)) return;
    listener(event);
  };

  listenerCount += 1;
  window.addEventListener(STOREFRONT_ASSISTANT_SUBMIT_EVENT, eventListener);
  schedulePendingMessagesFlush();

  return () => {
    listenerCount = Math.max(0, listenerCount - 1);
    window.removeEventListener(
      STOREFRONT_ASSISTANT_SUBMIT_EVENT,
      eventListener,
    );
  };
}

function dispatchStorefrontAssistantSubmitMessage(message: string) {
  window.dispatchEvent(createStorefrontAssistantSubmitEvent(message));
}

function schedulePendingMessagesFlush() {
  if (pendingFlushScheduled || pendingMessages.length === 0) {
    return;
  }

  pendingFlushScheduled = true;
  queueMicrotask(() => {
    pendingFlushScheduled = false;

    if (listenerCount === 0) {
      return;
    }

    const messagesToFlush = pendingMessages.splice(0);
    flushPendingMessages(messagesToFlush);
  });
}

function flushPendingMessages(messages: string[]) {
  const [message, ...remainingMessages] = messages;
  if (!message) {
    return;
  }

  setTimeout(() => {
    if (listenerCount > 0) {
      dispatchStorefrontAssistantSubmitMessage(message);
    } else {
      pendingMessages.unshift(message, ...remainingMessages);
      return;
    }

    flushPendingMessages(remainingMessages);
  }, 0);
}
