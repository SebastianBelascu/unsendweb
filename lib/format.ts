import { differenceInCalendarDays, format, isToday, isYesterday } from "date-fns";

/**
 * Inbox-style relative timestamp, matching the native clients:
 * today → "h:mm a", yesterday → "Yesterday", within a week → weekday,
 * same year → "MMM d", else "MMM d, yyyy".
 */
export function threadTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  const days = differenceInCalendarDays(new Date(), d);
  if (days < 7) return format(d, "EEE");
  if (d.getFullYear() === new Date().getFullYear()) return format(d, "MMM d");
  return format(d, "MMM d, yyyy");
}
