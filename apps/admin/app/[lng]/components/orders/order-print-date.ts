type DateLike = Date | { toDate: () => Date } | null | undefined;

interface OrderPrintDateOptions {
  exactTime?: boolean;
  fallbackDateString?: string;
  locale: string;
}

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function parseLocalDateString(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);

  if (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day)
  ) {
    const [hours = "0", minutes = "0"] = timePart?.split(":") ?? [];
    const parsedDate = new Date(
      year,
      month - 1,
      day,
      Number(hours),
      Number(minutes),
    );

    return isValidDate(parsedDate) ? parsedDate : null;
  }

  const parsedDate = new Date(value);
  return isValidDate(parsedDate) ? parsedDate : null;
}

export function toOrderPrintDate(
  value: DateLike,
  fallbackDateString?: string,
): Date | null {
  const date =
    value instanceof Date ? value : value?.toDate ? value.toDate() : null;

  if (date && isValidDate(date)) {
    return date;
  }

  return parseLocalDateString(fallbackDateString);
}

export function formatOrderPrintDate(
  value: DateLike,
  { exactTime, fallbackDateString, locale }: OrderPrintDateOptions,
): string {
  const date = toOrderPrintDate(value, fallbackDateString);

  return date
    ? date.toLocaleDateString(locale, {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: exactTime ? "2-digit" : undefined,
        minute: exactTime ? "2-digit" : undefined,
      })
    : "-";
}
