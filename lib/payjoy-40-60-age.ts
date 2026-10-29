const colombiaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date of the source file, independent of the browser's time zone. */
export function colombiaCalendarDate(now: Date = new Date()): string {
  const parts = colombiaDateFormatter.formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function calendarDayNumber(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1) return null;
  const instant = new Date(0);
  instant.setUTCFullYear(year, month - 1, day);
  instant.setUTCHours(0, 0, 0, 0);
  if (instant.getUTCFullYear() !== year || instant.getUTCMonth() !== month - 1 || instant.getUTCDate() !== day) return null;
  return instant.getTime() / 86_400_000;
}

/** Keep the imported age unchanged in storage; derive today's age only for display. */
export function effectiveLoanAge(
  importedAge: number | null,
  referenceDate: string | null | undefined,
  today: string = colombiaCalendarDate(),
): number | null {
  if (importedAge === null || !Number.isFinite(importedAge)) return null;
  const referenceDay = calendarDayNumber(referenceDate);
  const todayDay = calendarDayNumber(today);
  if (referenceDay === null || todayDay === null) return importedAge;
  return importedAge + Math.max(0, todayDay - referenceDay);
}
