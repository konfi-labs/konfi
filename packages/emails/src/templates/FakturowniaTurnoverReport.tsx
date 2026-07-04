import { Button, Heading, Hr, Section, Text } from "react-email";
import { Layout } from "../components/Layout";
import { type EmailBrand, getSharedStyles } from "../components/theme";

export interface FakturowniaTurnoverReportProps {
  brand?: EmailBrand;
  date: string;
  departmentCount: number;
  hasDepartmentReports: boolean;
  subject: string;
  url: string;
}

export function FakturowniaTurnoverReport({
  brand = "admin",
  date,
  departmentCount,
  hasDepartmentReports,
  subject,
  url,
}: FakturowniaTurnoverReportProps) {
  const sharedStyles = getSharedStyles(brand);

  return (
    <Layout brand={brand} preview={subject}>
      <Heading as="h1" style={sharedStyles.heading}>
        {subject}
      </Heading>
      <Text style={sharedStyles.paragraph}>
        Raport obrotu Fakturownia za dzień {date} został dołączony do tej
        wiadomości jako załącznik PDF.
      </Text>

      {hasDepartmentReports && (
        <Section style={sharedStyles.panel}>
          <Text style={sharedStyles.statRow}>
            <span style={sharedStyles.statLabel}>Raporty działów: </span>
            <span style={sharedStyles.statValue}>{departmentCount}</span>
          </Text>
        </Section>
      )}

      <Hr style={sharedStyles.divider} />
      <Section style={sharedStyles.ctaSection}>
        <Button href={url} style={sharedStyles.button}>
          Otwórz Fakturownię
        </Button>
      </Section>
    </Layout>
  );
}

export default FakturowniaTurnoverReport;
