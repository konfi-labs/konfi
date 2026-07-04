import { useT } from "@/i18n/client";
import { Box, Text } from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { OrderStatus } from "@konfi/types";
import { TODAY } from "@konfi/utils";
import { Timestamp } from "firebase/firestore";

type DeadlineProps = {
  createdAt: Timestamp;
  deadline: Timestamp;
  status: keyof typeof OrderStatus;
};

const Deadline = ({ createdAt, deadline, status }: DeadlineProps) => {
  const { t, i18n } = useT();
  const progress =
    ((TODAY() - createdAt.toMillis()) /
      (deadline.toMillis() - createdAt.toMillis())) *
    100;
  const diffTime = Math.abs(TODAY() - deadline.toMillis());
  const days = Math.floor(diffTime / (24 * 60 * 60 * 1000));
  return (
    <Box minW={"175px"}>
      <Text as={"span"}>
        <MaterialSymbol fontSize={"18px"}>schedule</MaterialSymbol>{" "}
        {deadline.toDate().toLocaleDateString(i18n.resolvedLanguage, {
          weekday: "short",
          day: "numeric",
          month: "short",
        })}{" "}
      </Text>
      <Text
        as={"span"}
        color={
          progress >= 66
            ? ["READY", "FULFILLED", "DRAFT"].includes(status)
              ? "success"
              : "red"
            : "gray"
        }
      >
        {!["READY", "FULFILLED", "DRAFT"].includes(status)
          ? Math.sign(days)
            ? `-${days} ${t("time.days")}`
            : `+${days} ${t("time.days")}`
          : `0 ${t("time.days")}`}
      </Text>
    </Box>
  );
};

export default Deadline;
