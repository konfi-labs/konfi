import { Heading, Hr, Section, Text } from "react-email";
import { Layout } from "../components/Layout";
import { type EmailBrand, getSharedStyles } from "../components/theme";

export interface NoPaymentDocumentReminderProps {
  brand?: EmailBrand;
  orderLines: string[];
  subject: string;
}

const defaultOrderLines = [
  "nr.201 w kanale sprzedazy B2B",
  "nr.202 w kanale sprzedazy B2B",
];

const orderListStyle: React.CSSProperties = {
  margin: "24px 0",
};

export function NoPaymentDocumentReminder({
  brand = "admin",
  orderLines = defaultOrderLines,
  subject = "Brakujace dokumenty platnosci - Podglad",
}: NoPaymentDocumentReminderProps) {
  const sharedStyles = getSharedStyles(brand);
  const orderLineStyle: React.CSSProperties = {
    ...sharedStyles.itemPanel,
    fontSize: "14px",
    lineHeight: "22px",
    color: sharedStyles.statValue.color,
    margin: "0 0 10px",
  };
  return (
    <Layout brand={brand} preview={subject}>
      <Heading as="h1" style={sharedStyles.heading}>
        {subject}
      </Heading>
      <Text style={sharedStyles.paragraph}>
        Poniżej znajduje się lista zamówień, które nadal nie mają przypisanego
        dokumentu płatności:
      </Text>
      <Hr style={sharedStyles.divider} />
      <Section style={orderListStyle}>
        {orderLines.map((orderLine, index) => (
          <Text
            key={`${index}-${orderLine}`}
            style={{
              ...orderLineStyle,
              marginBottom: index === orderLines.length - 1 ? "0" : "10px",
            }}
          >
            {orderLine}
          </Text>
        ))}
      </Section>
    </Layout>
  );
}

export default NoPaymentDocumentReminder;
