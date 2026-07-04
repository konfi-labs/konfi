import { render } from "react-email";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoteNotificationEmail } from "./NoteNotification";

const normalizeRenderedHtml = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/\s+/g, " ");

describe("NoteNotificationEmail", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_URL", "https://admin.example.com");
    vi.stubEnv("NEXT_PUBLIC_LEGAL_COMPANY_NAME", "Acme Print Sp. z o.o.");
    vi.stubEnv("NEXT_PUBLIC_VAT_ID", "PL1234567890");
    vi.stubEnv("NEXT_PUBLIC_COMPANY_STREET_ADDRESS", "Market Street 1");
    vi.stubEnv("NEXT_PUBLIC_COMPANY_POSTAL_CODE", "00-100");
    vi.stubEnv("NEXT_PUBLIC_COMPANY_CITY", "Warsaw");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders the created-note email with the shared admin design", async () => {
    const html = normalizeRenderedHtml(
      await render(
        <NoteNotificationEmail
          event="created"
          noteContent={"Pilny kontakt z klientem.\nUstalić nowy termin."}
          noteName="Kontakt z klientem"
          url="https://admin.example.com/notes?currentNote=note-123"
        />,
      ),
    );

    expect(html).toContain("Nowa notatka");
    expect(html).toContain(
      "W panelu administracyjnym pojawiła się nowa notatka.",
    );
    expect(html).toContain("Kontakt z klientem");
    expect(html).toContain("Pilny kontakt z klientem.");
    expect(html).toContain("Ustalić nowy termin.");
    expect(html).toContain("Otwórz notatkę");
    expect(html).toContain('"Geist"');
  });

  it("renders the updated-note copy", async () => {
    const html = normalizeRenderedHtml(
      await render(
        <NoteNotificationEmail
          event="updated"
          noteContent="Zmieniono priorytet notatki."
          noteName="Priorytet produkcji"
          url="https://admin.example.com/notes?currentNote=note-456"
        />,
      ),
    );

    expect(html).toContain("Zaktualizowano notatkę");
    expect(html).toContain(
      "Notatka została zaktualizowana w panelu administracyjnym.",
    );
    expect(html).toContain("Priorytet produkcji");
  });
});
