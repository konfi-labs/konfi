export function timeToDeadline(deadline: Date): number {
  const currentTime = new Date();
  const currentDay = new Date(
    currentTime.getFullYear(),
    currentTime.getMonth(),
    currentTime.getDate(),
  );
  const deadlineDay = new Date(
    deadline.getFullYear(),
    deadline.getMonth(),
    deadline.getDate(),
  );
  const timeDifference = deadlineDay.getTime() - currentDay.getTime();
  const days = Math.ceil(timeDifference / (1000 * 60 * 60 * 24));
  return days;
}

export type DeadlineColorPalette = "blue" | "orange" | "red";

export function getDeadlineColorPalette(
  deadline: Date,
): DeadlineColorPalette | undefined {
  const daysToDeadline = timeToDeadline(deadline);

  if (daysToDeadline < 0) {
    return "red";
  }

  if (daysToDeadline === 0) {
    return "orange";
  }

  if (daysToDeadline === 1) {
    return "blue";
  }

  return undefined;
}
