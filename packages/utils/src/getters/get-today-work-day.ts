export function getTodayWorkDay(): Date {
  const workDay = new Date();

  if (workDay.getDay() === 6) {
    workDay.setDate(workDay.getDate() + 2);
  } else if (workDay.getDay() === 0) {
    workDay.setDate(workDay.getDate() + 1);
  } else if (workDay.getHours() >= 16) {
    workDay.setDate(workDay.getDate() + 1);
  }

  const year = workDay.getFullYear();

  // Skip public holidays
  const publicHolidays = [
    new Date(year, 0, 1, 0, 0, 0, 0),
    new Date(year, 0, 6, 0, 0, 0, 0),
    new Date(year, 2, 31, 0, 0, 0, 0),
    new Date(year, 3, 1, 0, 0, 0, 0),
    new Date(year, 4, 1, 0, 0, 0, 0),
    new Date(year, 4, 3, 0, 0, 0, 0),
    new Date(year, 4, 19, 0, 0, 0, 0),
    new Date(year, 4, 30, 0, 0, 0, 0),
    new Date(year, 7, 15, 0, 0, 0, 0),
    new Date(year, 10, 1, 0, 0, 0, 0),
    new Date(year, 11, 25, 0, 0, 0, 0),
    new Date(year, 11, 26, 0, 0, 0, 0),
  ];

  const compareEst = new Date(workDay);
  compareEst.setHours(0, 0, 0, 0);
  if (publicHolidays.includes(compareEst)) {
    workDay.setDate(workDay.getDate() + 1);
  }

  return workDay;
}
