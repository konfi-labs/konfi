import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useRef, useState } from "react";
import {
  StorefrontAssistantView,
  type AssistantChatMessage,
  type StorefrontAssistantLabels,
} from "../../../store/app/[lng]/components/assistant/StorefrontAssistantView";

const labels: StorefrontAssistantLabels = {
  ariaLabel: "Zapytaj asystenta AI",
  close: "Zamknij",
  contact: "Kontakt",
  contactPage: "Strona kontaktu",
  headerTitle: "Asystent AI",
  heroPlaceholder: "Opisz, czego potrzebujesz do druku...",
  inputPlaceholder: "Napisz wiadomość...",
  open: "Otwórz asystenta AI",
  productLink: "Otwórz",
  quickContact: "Dane kontaktowe",
  quickFiles: "Jak przygotować pliki?",
  send: "Wyślij wiadomość",
  thinking: "Asystent przygotowuje odpowiedź",
};

const initialMessages: AssistantChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "Napisz, co chcesz wydrukować. Mogę zasugerować produkty, podać dane kontaktowe i wyjaśnić podstawy przygotowania plików.",
  },
  {
    id: "user",
    role: "user",
    content: "Potrzebuję 500 wizytówek na papierze matowym.",
  },
  {
    id: "assistant",
    role: "assistant",
    content:
      "To najbliższe publiczne produkty. Otwórz konfigurator, aby samodzielnie wybrać papier, nakład, uszlachetnienia i dostawę.\n\n* **Example City:** quotes@example.com\n* Strona kontaktu: /pl/help/contact.",
    contact: {
      contactUrl: "/pl/help/contact",
      email: "quotes@example.com",
      phone: "511 049 626",
    },
    products: [
      {
        category: "Wizytówki",
        name: "Wizytówki standardowe",
        url: "/pl/products/wizytowki-standardowe",
      },
      {
        category: "Wizytówki",
        name: "Wizytówki ozdobne",
        url: "/pl/products/wizytowki-ozdobne",
      },
    ],
  },
];

function StoreAssistantFixture({
  isSubmitting = false,
}: {
  isSubmitting?: boolean;
}) {
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const [chatInputValue, setChatInputValue] = useState("");
  const [heroInputValue, setHeroInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(true);

  return (
    <Box minH="680px" pt={4}>
      <StorefrontAssistantView
        chatInputValue={chatInputValue}
        chatScrollRef={chatScrollRef}
        heroInputValue={heroInputValue}
        isOpen={isOpen}
        isSubmitting={isSubmitting}
        labels={labels}
        lng="pl"
        messages={initialMessages}
        onChatInputChange={setChatInputValue}
        onClose={() => setIsOpen(false)}
        onHeroInputChange={setHeroInputValue}
        onOpen={() => setIsOpen(true)}
        onQuickPrompt={(message) => {
          setHeroInputValue(message);
          setIsOpen(true);
        }}
        onSubmitChat={(event) => {
          event?.preventDefault();
        }}
        onSubmitHero={(event) => {
          event?.preventDefault();
          setIsOpen(true);
        }}
      />
    </Box>
  );
}

const meta = {
  title: "Store/Assistant",
  component: StoreAssistantFixture,
  parameters: {
    appTheme: "store",
    nextjs: {
      appDirectory: true,
      navigation: {
        asPath: "/pl",
        pathname: "/[lng]",
        query: { lng: "pl" },
        segments: [["lng", "pl"]],
      },
    },
  },
} satisfies Meta<typeof StoreAssistantFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ChatOpen: Story = {};
export const Thinking: Story = {
  args: {
    isSubmitting: true,
  },
};
