// Display times in the app's local zone (the server runs in UTC).
const ZONE = process.env.DISPLAY_TIMEZONE || "America/Los_Angeles";

const short = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** e.g. "Oct 4, 11:31 AM"; "" for null. */
export function fmtTime(d: Date | null | undefined): string {
  return d ? short.format(d) : "";
}
