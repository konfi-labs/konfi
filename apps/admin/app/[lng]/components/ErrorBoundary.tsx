import { useT } from "@/i18n/client";
import { Button, Center, Code } from "@chakra-ui/react";
import { EmptyState, MaterialSymbol } from "@konfi/components";

export function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useT();

  return (
    <Center
      h={"50vh"}
      justifyContent={"center"}
      textAlign={"center"}
      flexDirection={"column"}
    >
      <EmptyState
        icon={
          <MaterialSymbol
            style={{
              fontSize: "140px",
              opacity: 0.1,
            }}
          >
            error
          </MaterialSymbol>
        }
        title={t("admin.somethingWentWrong", {
          defaultValue: "Something went wrong",
        })}
        description={JSON.stringify(error)}
      >
        <Button onClick={() => reset()}>
          {t("common.refresh", { defaultValue: "Refresh" })}
        </Button>
      </EmptyState>
    </Center>
  );
}
