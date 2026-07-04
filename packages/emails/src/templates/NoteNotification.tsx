import { Button, Heading, Hr, Section, Text } from "react-email";
import { Layout } from "../components/Layout";
import { type EmailBrand, getSharedStyles } from "../components/theme";

export type NoteNotificationEvent = "created" | "updated";

export interface NoteNotificationProps {
  brand?: EmailBrand;
  event?: NoteNotificationEvent;
  noteName: string;
  noteContent: string;
  url: string;
}

function getNoteCopy(event: NoteNotificationEvent, noteName: string) {
  const safeNoteName = noteName.trim() || "Bez tytułu";

  if (event === "updated") {
    return {
      body: "Notatka została zaktualizowana w panelu administracyjnym.",
      heading: "Zaktualizowano notatkę",
      preview: `Zaktualizowano notatkę: ${safeNoteName}`,
    };
  }

  return {
    body: "W panelu administracyjnym pojawiła się nowa notatka.",
    heading: "Nowa notatka",
    preview: `Nowa notatka: ${safeNoteName}`,
  };
}

export function NoteNotificationEmail({
  brand = "admin",
  event = "created",
  noteName,
  noteContent,
  url,
}: NoteNotificationProps) {
  const sharedStyles = getSharedStyles(brand);
  const copy = getNoteCopy(event, noteName);
  const safeNoteName = noteName.trim() || "Bez tytułu";
  const noteParagraphs = noteContent
    .split(/\r?\n/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  return (
    <Layout brand={brand} preview={copy.preview}>
      <Heading as="h1" style={sharedStyles.heading}>
        {copy.heading}
      </Heading>
      <Text style={sharedStyles.paragraph}>{copy.body}</Text>
      <Text style={sharedStyles.badge}>{safeNoteName}</Text>
      {noteParagraphs.length > 0 && (
        <Section style={{ ...sharedStyles.panel, marginTop: "0" }}>
          {noteParagraphs.map((paragraph, index) => (
            <Text
              key={`${index}-${paragraph}`}
              style={{
                ...sharedStyles.paragraph,
                marginBottom: "0",
                marginTop: "0",
              }}
            >
              {paragraph}
            </Text>
          ))}
        </Section>
      )}
      <Hr style={sharedStyles.divider} />
      <Section style={sharedStyles.ctaSection}>
        <Button href={url} style={sharedStyles.button}>
          Otwórz notatkę
        </Button>
      </Section>
    </Layout>
  );
}

export default NoteNotificationEmail;
