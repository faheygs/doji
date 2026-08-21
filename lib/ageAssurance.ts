export const MINIMUM_AGE = 13;
export const MAXIMUM_AGE = 120;

export type BirthDateAssessment =
  | { ok: true; isoDate: string }
  | { ok: false; message: string };

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Strictly validates the onboarding MM/DD/YYYY field. This is only a helpful
 * client check; Postgres performs the authoritative age assessment.
 */
export function assessBirthDate(
  value: string,
  today = new Date(),
): BirthDateAssessment {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return { ok: false, message: 'Enter your birthday as MM/DD/YYYY.' };

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    return { ok: false, message: 'Enter a valid birthday.' };
  }

  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;
  const todayDay = today.getDate();
  let age = todayYear - year;
  if (todayMonth < month || (todayMonth === month && todayDay < day)) age -= 1;

  if (age < MINIMUM_AGE) {
    return { ok: false, message: 'You must be at least 13 to use Doji.' };
  }
  if (age > MAXIMUM_AGE) {
    return { ok: false, message: 'Enter a valid birthday.' };
  }

  return {
    ok: true,
    isoDate: `${year.toString().padStart(4, '0')}-${month
      .toString()
      .padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
  };
}

export function formatBirthDateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Reassesses the ISO date carried transiently through account creation. */
export function assessIsoBirthDate(value: unknown, today = new Date()): BirthDateAssessment {
  if (typeof value !== 'string') {
    return { ok: false, message: 'Enter your birthday as MM/DD/YYYY.' };
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { ok: false, message: 'Enter your birthday as MM/DD/YYYY.' };
  return assessBirthDate(`${match[2]}/${match[3]}/${match[1]}`, today);
}
