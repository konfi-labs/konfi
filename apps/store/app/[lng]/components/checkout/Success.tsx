import { Box, Center, Heading, Text } from "@chakra-ui/react";
import { PaymentType, type PaymentMethodId } from "@konfi/types";
import { STORE_ACCOUNT_ORDERS } from "@konfi/utils";
import { useEffect, useState } from "react";
import { useStoreRuntimeConfig } from "@/context/runtime-config";
import { useT } from "@/i18n/client";
import { readRuntimeString } from "@/lib/runtime-config";
import { MaterialSymbol } from "@konfi/components";
import { ButtonLink } from "@konfi/components";

const Success = ({
  url,
  paymentType,
}: {
  url: string;
  paymentType: PaymentMethodId;
}) => {
  const [countdown, setCountdown] = useState(3);
  const { t, i18n } = useT();
  const runtimeConfig = useStoreRuntimeConfig();
  const showPaymentInfo =
    paymentType === PaymentType.BANK_TRANSFER ||
    paymentType === PaymentType.DEFERRED;
  const legalCompanyName =
    readRuntimeString(
      runtimeConfig.legal,
      "legalCompanyName",
      "legalName",
      "companyName",
      "name",
    ) ?? process.env.NEXT_PUBLIC_LEGAL_COMPANY_NAME;
  const bankName =
    readRuntimeString(runtimeConfig.metadata, "bankName") ??
    readRuntimeString(runtimeConfig.legal, "bankName") ??
    process.env.NEXT_PUBLIC_BANK_NAME;
  const bankAccountNumber =
    readRuntimeString(runtimeConfig.metadata, "bankAccountNumber") ??
    readRuntimeString(runtimeConfig.legal, "bankAccountNumber") ??
    process.env.NEXT_PUBLIC_BANK_ACCOUNT_NUMBER;

  useEffect(() => {
    if (countdown > 0) {
      setTimeout(() => setCountdown(countdown - 1), 1000);
    }
  }, [countdown]);

  return (
    <Center
      h={"50vh"}
      justifyContent={"center"}
      textAlign={"center"}
      flexDirection={"column"}
      gap={4}
    >
      <Box position={"relative"}>
        <Box mb={4} borderRadius={"full"} py={8} boxShadow={"inner"}>
          <MaterialSymbol
            style={{
              fontSize: "140px",
              opacity: 0.1,
            }}
          >
            check
          </MaterialSymbol>
        </Box>
        <Heading>
          {t("store.checkout.success", { defaultValue: "Success!" })}
        </Heading>
        <Text>
          {t("store.checkout.thankYou", {
            defaultValue: "Thank you for placing your order.",
          })}
        </Text>
      </Box>
      {showPaymentInfo && (
        <Box fontWeight={600}>
          <Text mb={2}>
            {t("store.checkout.bankDetails", {
              defaultValue: "Bank transfer details:",
            })}{" "}
          </Text>
          {legalCompanyName}
          <br />
          {bankName}
          <br />
          {t("store.checkout.accountNumber", {
            defaultValue: "Account number:",
          })}{" "}
          {bankAccountNumber}
        </Box>
      )}
      {url && countdown > 0 && (
        <Text>
          {t("store.checkout.redirectCountdown", {
            defaultValue:
              "You will be redirected to the payment page in {{count}} seconds.",
            count: countdown,
          })}
        </Text>
      )}
      {url && (
        <>
          <Text>
            {t("store.checkout.redirectManual", {
              defaultValue:
                "If you were not automatically redirected to the payment page, click the button below.",
            })}
          </Text>
          <ButtonLink
            lng={i18n.resolvedLanguage}
            href={url}
            isExternal
            colorPalette={"primary"}
            variant={"blurGlow"}
            ariaLabel={t("store.checkout.goToPayment", {
              defaultValue: "Go to Payment",
            })}
          >
            <MaterialSymbol>https</MaterialSymbol>
            {t("store.checkout.goToPayment", { defaultValue: "Go to Payment" })}
          </ButtonLink>
        </>
      )}
      {!url && !showPaymentInfo && (
        <ButtonLink
          lng={i18n.resolvedLanguage}
          href={STORE_ACCOUNT_ORDERS}
          ariaLabel={t("store.checkout.goToOrders", {
            defaultValue: "Go to Orders",
          })}
          colorPalette={"primary"}
          variant={"blurGlow"}
        >
          {t("store.checkout.goToOrders", { defaultValue: "Go to Orders" })}
        </ButtonLink>
      )}
    </Center>
  );
};

export default Success;
