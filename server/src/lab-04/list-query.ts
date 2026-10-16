const UTC_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;

/** Parse a UTC ISO timestamp only when JavaScript preserves every supplied calendar component. */
export function parseUtcTimestamp(value: string): Date | undefined {
  const match = UTC_TIMESTAMP.exec(value);
  if (!match) return undefined;

  const [, year, month, day, hour, minute, second, fraction = ""] = match;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return undefined;

  const expected = [Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)];
  const actual = [parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), parsed.getUTCHours(), parsed.getUTCMinutes(), parsed.getUTCSeconds()];
  if (actual.some((component, index) => component !== expected[index])) return undefined;

  const expectedMilliseconds = Number(fraction.padEnd(3, "0") || "0");
  if (parsed.getUTCMilliseconds() !== expectedMilliseconds) return undefined;
  return parsed;
}
