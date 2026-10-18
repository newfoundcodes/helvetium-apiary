import { CronExpressionError } from './errors.js';
import type { CronField, CronPattern } from './types/cron.js';

export type { CronPattern } from './types/cron.js';

const aliases: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

const months: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const weekdays: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function parseToken(
  raw: string,
  names: Record<string, number>,
  min: number,
  max: number,
  sundaySeven = false,
): number {
  const token = raw.toLowerCase();
  let value = names[token] ?? Number(token);

  if (!Number.isInteger(value)) {
    throw new CronExpressionError(`Invalid cron value: ${raw}`);
  }

  if (sundaySeven && value === 7) {
    value = 0;
  }

  if (value < min || value > max) {
    throw new CronExpressionError(`Cron value ${raw} outside ${min}-${max}`);
  }

  return value;
}

function addRange(
  set: Set<number>,
  start: number,
  end: number,
  step: number,
  min: number,
  max: number,
  sundaySeven: boolean,
): void {
  if (step <= 0 || !Number.isInteger(step)) {
    throw new CronExpressionError('Cron step must be a positive integer');
  }

  if (start > end) {
    throw new CronExpressionError('Cron ranges must be ascending');
  }

  for (let n = start; n <= end; n += step) {
    let value = n;
    if (sundaySeven && value === 7) {
      value = 0;
    }

    if (value >= min && value <= max) {
      set.add(value);
    }
  }
}

function parseField(
  source: string,
  min: number,
  max: number,
  names: Record<string, number> = {},
  sundaySeven = false,
): CronField {
  const values = new Set<number>();
  const wildcard = source === '*';

  for (const part of source.split(',')) {
    const [body, stepRaw] = part.split('/');
    const step = stepRaw === undefined ? 1 : Number(stepRaw);

    if (!body) {
      throw new CronExpressionError(`Invalid cron field: ${source}`);
    }

    if (body === '*') {
      addRange(values, min, max, step, min, max, sundaySeven);
      continue;
    }

    const dash = body.indexOf('-');
    if (dash >= 0) {
      const a = parseToken(body.slice(0, dash), names, min, max, sundaySeven);
      const b = parseToken(body.slice(dash + 1), names, min, max, sundaySeven);

      addRange(values, a, b, step, min, max, sundaySeven);
      continue;
    }

    if (stepRaw !== undefined) {
      throw new CronExpressionError('Cron steps require * or a range');
    }

    values.add(parseToken(body, names, min, max, sundaySeven));
  }

  if (values.size === 0) {
    throw new CronExpressionError(`Cron field has no values: ${source}`);
  }

  return { values, wildcard };
}

export function parseCron(expression: string): CronPattern {
  const normalized = aliases[expression.trim().toLowerCase()] ?? expression.trim();
  const parts = normalized.split(/\s+/);

  if (parts.length !== 5 && parts.length !== 6) {
    throw new CronExpressionError('Cron expression must have 5 fields, or 6 fields with seconds');
  }

  const hasSeconds = parts.length === 6;
  const [sec, min, hour, day, month, dow] = hasSeconds ? parts : ['0', ...parts];
  return {
    seconds: parseField(sec!, 0, 59),
    minutes: parseField(min!, 0, 59),
    hours: parseField(hour!, 0, 23),
    days: parseField(day!, 1, 31),
    months: parseField(month!, 1, 12, months),
    weekdays: parseField(dow!, 0, 7, weekdays, true),
    hasSeconds,
  };
}

function zonedParts(
  date: Date,
  timezone?: string,
): { second: number; minute: number; hour: number; day: number; month: number; weekday: number } {
  if (!timezone || timezone === 'UTC') {
    return {
      second: date.getUTCSeconds(),
      minute: date.getUTCMinutes(),
      hour: date.getUTCHours(),
      day: date.getUTCDate(),
      month: date.getUTCMonth() + 1,
      weekday: date.getUTCDay(),
    };
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    second: '2-digit',
    minute: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    day: '2-digit',
    month: '2-digit',
    weekday: 'short',
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    second: Number(map.second),
    minute: Number(map.minute),
    hour: Number(map.hour),
    day: Number(map.day),
    month: Number(map.month),
    weekday: weekdays[(map.weekday ?? '').slice(0, 3).toLowerCase()] ?? 0,
  };
}

export function cronMatches(pattern: CronPattern | string, date: Date, timezone?: string): boolean {
  const p = typeof pattern === 'string' ? parseCron(pattern) : pattern;
  const z = zonedParts(date, timezone);

  if (
    !p.seconds.values.has(z.second) ||
    !p.minutes.values.has(z.minute) ||
    !p.hours.values.has(z.hour) ||
    !p.months.values.has(z.month)
  ) {
    return false;
  }

  const dom = p.days.values.has(z.day);
  const dow = p.weekdays.values.has(z.weekday);

  const dayMatches =
    p.days.wildcard && p.weekdays.wildcard
      ? true
      : p.days.wildcard
        ? dow
        : p.weekdays.wildcard
          ? dom
          : dom || dow;
  return dayMatches;
}

export function nextCronOccurrence(
  expression: string | CronPattern,
  after: Date | number = Date.now(),
  timezone?: string,
  maxIterations = 5_000_000,
): Date {
  const pattern = typeof expression === 'string' ? parseCron(expression) : expression;
  const step = pattern.hasSeconds ? 1000 : 60_000;

  let time = (typeof after === 'number' ? after : after.getTime()) + step;
  time = pattern.hasSeconds ? Math.floor(time / 1000) * 1000 : Math.floor(time / 60_000) * 60_000;

  for (let i = 0; i < maxIterations; i++, time += step) {
    const date = new Date(time);
    if (cronMatches(pattern, date, timezone)) {
      return date;
    }
  }

  throw new CronExpressionError('No cron occurrence found within search limit');
}

export function describeCron(expression: string): string {
  const p = parseCron(expression);
  return `${p.hasSeconds ? '6-field' : '5-field'} cron expression: ${expression}`;
}
