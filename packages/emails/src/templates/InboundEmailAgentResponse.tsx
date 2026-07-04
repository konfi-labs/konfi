import { Heading, Hr, Section, Text } from "react-email";
import { Layout } from "../components/Layout";
import { type EmailBrand, getSharedStyles } from "../components/theme";

export interface InboundEmailAgentResponseProps {
  brand?: EmailBrand;
  customerDraft: string;
  customerDraftLabel: string;
  heading: string;
  missingDetails: string;
  preview: string;
  rationale: string;
  resource: string;
  statusLine: string;
}

export function InboundEmailAgentResponse({
  brand = "admin",
  customerDraft,
  customerDraftLabel,
  heading,
  missingDetails,
  preview,
  rationale,
  resource,
  statusLine,
}: InboundEmailAgentResponseProps) {
  const sharedStyles = getSharedStyles(brand);
  return (
    <Layout brand={brand} preview={preview}>
      <Heading as="h1" style={sharedStyles.heading}>
        {heading}
      </Heading>
      <Section style={sharedStyles.panel}>
        <Text style={sharedStyles.statRow}>{statusLine}</Text>
        <Text style={sharedStyles.statRow}>{resource}</Text>
        <Text style={sharedStyles.statRow}>{missingDetails}</Text>
        <Text style={{ ...sharedStyles.wrappedParagraph, marginBottom: "0" }}>
          {rationale}
        </Text>
      </Section>
      <Hr style={sharedStyles.divider} />
      <Text style={{ ...sharedStyles.paragraph, fontWeight: "700" }}>
        {customerDraftLabel}
      </Text>
      <Section style={{ ...sharedStyles.panel, marginTop: "0" }}>
        <Text style={{ ...sharedStyles.wrappedParagraph, marginBottom: "0" }}>
          {customerDraft}
        </Text>
      </Section>
    </Layout>
  );
}

export default InboundEmailAgentResponse;
