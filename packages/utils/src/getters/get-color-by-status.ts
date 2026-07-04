import { SystemStyleObject } from "@chakra-ui/react";
import {
  ComplaintStatus,
  OrderFilesStatus,
  OrderStatus,
  PaymentStatus,
} from "@konfi/types";
import { DARK_ALPHA } from "../constants";
export function getColorByStatus(
  value:
    | keyof typeof OrderStatus
    | keyof typeof PaymentStatus
    | keyof typeof OrderFilesStatus
    | keyof typeof ComplaintStatus,
): SystemStyleObject {
  const orangeValues = [
    "PENDING",
    "IN_PROGRESS",
    "WAITING_FOR_FILES",
    "WAITING_FOR_FILES_APPROVAL",
    "UNDER_DESIGN",
    "FOR_VERIFICATION",
    "FOR_PREPARATION",
    "PROCESSING",
    "PARTIALLY_PAID",
  ];
  const blueValues = ["NEW"];
  const yellowValues = ["UNDER_REVIEW"];
  const purpleValues = ["WAITING_FOR_MATERIALS"];
  const greenValues = ["READY", "COMPLETED"];
  const grayValues = ["FULFILLED", "RESOLVED", "FILES_ARE_READY"];
  const redValues = ["CANCELED", "DELAYED"];

  if (blueValues.includes(value))
    return {
      bgColor: { base: "blue.100", _dark: `blue.900${DARK_ALPHA}` },
      color: { base: "blue.900", _dark: "blue.100" },
      colorPalette: "blue",
    };
  else if (orangeValues.includes(value))
    return {
      bgColor: { base: "orange.100", _dark: `orange.900${DARK_ALPHA}` },
      color: { base: "orange.900", _dark: "orange.100" },
      colorPalette: "orange",
    };
  else if (yellowValues.includes(value))
    return {
      bgColor: { base: "yellow.100", _dark: `yellow.900${DARK_ALPHA}` },
      color: { base: "yellow.900", _dark: "yellow.100" },
      colorPalette: "yellow",
    };
  else if (purpleValues.includes(value))
    return {
      bgColor: { base: "purple.100", _dark: `purple.900${DARK_ALPHA}` },
      color: { base: "purple.900", _dark: "purple.100" },
      colorPalette: "purple",
    };
  else if (greenValues.includes(value))
    return {
      bgColor: { base: "green.100", _dark: `green.900${DARK_ALPHA}` },
      color: { base: "green.900", _dark: "green.100" },
      colorPalette: "green",
    };
  else if (grayValues.includes(value))
    return {
      bgColor: { base: "gray.100", _dark: `gray.900${DARK_ALPHA}` },
      color: { base: "gray.900", _dark: "gray.100" },
      colorPalette: "gray",
    };
  else if (redValues.includes(value))
    return {
      bgColor: { base: "red.100", _dark: `red.900${DARK_ALPHA}` },
      color: { base: "red.900", _dark: "red.100" },
      colorPalette: "red",
    };
  else if (value === "DRAFT")
    return {
      bgColor: { base: "gray.900", _dark: `gray.900${DARK_ALPHA}` },
      color: { base: "white", _dark: "white" },
      colorPalette: "gray",
    };
  else if (value === "REFUNDED")
    return {
      bgColor: { base: "purple.900", _dark: `purple.900${DARK_ALPHA}` },
      color: { base: "white", _dark: "white" },
      colorPalette: "purple",
    };
  else
    return {
      bgColor: { base: "white", _dark: `gray.900${DARK_ALPHA}` },
      color: { base: "gray.900", _dark: "gray.200" },
      colorPalette: "gray",
    };
}

export function getOrderPaymentStatusColorPalette(
  paymentStatus?: PaymentStatus | null,
  paymentDocumentId?: string | null,
): string | undefined {
  if (!paymentStatus) {
    return undefined;
  }

  if (paymentStatus === PaymentStatus.COMPLETED && !paymentDocumentId?.trim()) {
    return "purple";
  }

  if (paymentStatus === PaymentStatus.COMPLETED) {
    return "gray";
  }

  return String(getColorByStatus(paymentStatus).colorPalette);
}
