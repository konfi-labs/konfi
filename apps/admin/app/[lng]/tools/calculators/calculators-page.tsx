"use client";

import { useT } from "@/i18n/client";
import { Tabs } from "@chakra-ui/react";
import { CustomHeading } from "@konfi/components";
import dynamic from "next/dynamic";

const CadPrintCalculator = dynamic(() =>
  import("./CadPrintCalculator").then((mod) => ({
    default: mod.CadPrintCalculator,
  })),
);

export default function CalculatorsPage() {
  const { t } = useT();

  return (
    <>
      <CustomHeading
        heading={t("tools.calculators", { defaultValue: "Calculators" })}
        mb={"8"}
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      <Tabs.Root lazyMount colorPalette="primary" defaultValue="cad-print">
        <Tabs.List mb={4}>
          <Tabs.Trigger value="cad-print">
            {t("calculators.cadPrint.tabTitle", {
              defaultValue: "CAD Print Sizes",
            })}
          </Tabs.Trigger>
          <Tabs.Indicator />
        </Tabs.List>
        <Tabs.Content value="cad-print">
          <CadPrintCalculator />
        </Tabs.Content>
      </Tabs.Root>
    </>
  );
}
