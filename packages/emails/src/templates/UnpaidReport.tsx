import { Button, Heading, Text, Section, Hr } from "react-email";
import { Layout } from "../components/Layout";
import { type EmailBrand, getSharedStyles } from "../components/theme";

export interface UnpaidReportProps {
  brand?: EmailBrand;
  date: string;
  fromDate: string;
  departmentName?: string;
  totalOutstanding: string;
  totalInvoices: number;
  totalBuyers: number;
  currency: string;
  hasDepartmentReports: boolean;
  departmentCount: number;
  url: string;
  subject: string;
}

export function UnpaidReport({
  brand = "admin",
  date,
  fromDate,
  departmentName,
  totalOutstanding,
  totalInvoices,
  totalBuyers,
  currency,
  hasDepartmentReports,
  departmentCount,
  url,
  subject,
}: UnpaidReportProps) {
  const sharedStyles = getSharedStyles(brand);
  return (
    <Layout brand={brand} preview={subject}>
      <Heading as="h1" style={sharedStyles.heading}>
        {subject}
      </Heading>
      <Text style={sharedStyles.paragraph}>
        Raport przeterminowanych faktur za okres od {fromDate} do {date}
        {departmentName ? ` dla działu ${departmentName}` : ""}.
      </Text>

      <Section style={sharedStyles.panel}>
        <Text style={sharedStyles.statRow}>
          <span style={sharedStyles.statLabel}>Łączna kwota zaległa: </span>
          <span style={sharedStyles.statValue}>
            {totalOutstanding} {currency}
          </span>
        </Text>
        <Text style={sharedStyles.statRow}>
          <span style={sharedStyles.statLabel}>Liczba faktur: </span>
          <span style={sharedStyles.statValue}>{totalInvoices}</span>
        </Text>
        <Text style={sharedStyles.statRow}>
          <span style={sharedStyles.statLabel}>Liczba kontrahentów: </span>
          <span style={sharedStyles.statValue}>{totalBuyers}</span>
        </Text>
        {hasDepartmentReports && (
          <Text style={sharedStyles.statRow}>
            <span style={sharedStyles.statLabel}>Raporty działów: </span>
            <span style={sharedStyles.statValue}>{departmentCount}</span>
          </Text>
        )}
      </Section>

      <Hr style={sharedStyles.divider} />
      <Text style={sharedStyles.paragraph}>
        Szczegółowy raport został dołączony do tej wiadomości jako załącznik PDF.
      </Text>
      <Section style={sharedStyles.ctaSection}>
        <Button href={url} style={sharedStyles.button}>
          Otwórz Fakturownię
        </Button>
      </Section>
    </Layout>
  );
}

export default UnpaidReport;
