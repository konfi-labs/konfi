import {
  Button,
  Column,
  Heading,
  Img,
  Row,
  Section,
  Text,
} from "react-email";
import { Layout } from "../components/Layout";
import {
  type EmailBrand,
  type EmailLocale,
  getSharedStyles,
} from "../components/theme";

export interface AbandonedCartReminderProps {
  buttonLabel?: string;
  cartUrl?: string;
  greeting?: string;
  heading?: string;
  intro?: string;
  items: Array<{
    description: string;
    id: string;
    imageUrl?: string;
    productName?: string;
    quantity: number;
  }>;
  brand?: EmailBrand;
  locale?: EmailLocale;
  name: string;
  outro?: string;
  preview?: string;
  quantityLabel?: string;
}

const itemsSection: React.CSSProperties = {
  margin: "24px 0",
};

const normalizeLine = (value?: string) => {
  const normalized = value?.trim();

  return normalized ? normalized : undefined;
};

export function AbandonedCartReminder({
  brand = "store",
  buttonLabel = "Go to cart",
  name,
  cartUrl,
  greeting = "Hello",
  heading = "You have products in your cart",
  intro = "You left products in your cart. Return to it to complete your order:",
  items,
  locale = "en",
  outro = "Complete your order before the configuration or product availability changes.",
  preview = "You have products in your cart",
  quantityLabel = "Quantity",
}: AbandonedCartReminderProps) {
  const sharedStyles = getSharedStyles(brand);
  return (
    <Layout brand={brand} locale={locale} preview={preview}>
      <Heading as="h1" style={sharedStyles.heading}>
        {heading}
      </Heading>
      <Text style={sharedStyles.paragraph}>
        {greeting} {name},
      </Text>
      <Text style={sharedStyles.paragraph}>{intro}</Text>
      <Section style={itemsSection}>
        {items?.map((item) => {
          const itemTitle = normalizeLine(item.productName) || item.description;
          const itemDescription = normalizeLine(item.description);
          const showDescription =
            itemDescription &&
            itemTitle.trim().toLowerCase() !== itemDescription.toLowerCase();
          const itemDetails = (
            <>
              <Text style={sharedStyles.itemTitle}>{itemTitle}</Text>
              {showDescription && (
                <Text style={sharedStyles.itemDescription}>
                  {itemDescription}
                </Text>
              )}
              <Text style={sharedStyles.itemQuantity}>
                {quantityLabel}: {item.quantity}
              </Text>
            </>
          );

          return (
            <Section key={item.id} style={sharedStyles.itemPanel}>
              {item.imageUrl ? (
                <Row>
                  <Column style={sharedStyles.itemImageColumn}>
                    <Img
                      alt={itemTitle}
                      height="92"
                      src={item.imageUrl}
                      style={sharedStyles.itemImage}
                      width="92"
                    />
                  </Column>
                  <Column style={sharedStyles.itemTextColumn}>{itemDetails}</Column>
                </Row>
              ) : (
                itemDetails
              )}
            </Section>
          );
        })}
      </Section>
      <Text style={sharedStyles.paragraph}>{outro}</Text>
      {cartUrl && (
        <Section style={sharedStyles.ctaSection}>
          <Button href={cartUrl} style={sharedStyles.button}>
            {buttonLabel}
          </Button>
        </Section>
      )}
    </Layout>
  );
}

export default AbandonedCartReminder;
