import { Heading, Hr, Section, Text } from "react-email";
import { Layout } from "../components/Layout";
import { type EmailBrand, getSharedStyles } from "../components/theme";

export interface StalledOrdersReminderProps {
  brand?: EmailBrand;
  orderLines: string[];
  subject: string;
}

const defaultOrderLines = [
  "nr.123 w kanale sprzedazy Main (4 dni po terminie)",
  "nr.124 w kanale sprzedazy Main (2 dni po terminie)",
];

const orderListStyle: React.CSSProperties = {
  margin: "24px 0",
};

export function StalledOrdersReminder({
  brand = "admin",
  orderLines = defaultOrderLines,
  subject = "Zalegle zamowienia - Podglad",
}: StalledOrdersReminderProps) {
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
        Poniżej znajduje się lista zamówień, które przekroczyły termin
        realizacji:
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

export default StalledOrdersReminder;
