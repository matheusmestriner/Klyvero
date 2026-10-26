/** Digits only. */
export function digitsOf(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '');
}

/**
 * Digits with the country code, assuming Brazil when the number is written the local way:
 * 2-digit area code + 9 (mobile) or 2-5 (landline) + the rest. An explicit "+" or "00" prefix
 * is always respected, so "+1 415 555 0100" is never turned into a Brazilian number.
 */
function withCountry(value: string | null | undefined) {
  const raw = (value ?? '').trim();
  let digits = digitsOf(raw);
  if (raw.startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);
  const mobile = digits.length === 11 && digits[2] === '9';
  const landline = digits.length === 10 && '2345'.includes(digits[2]);
  if (mobile || landline) digits = `55${digits}`;
  return digits;
}

/**
 * Canonical key used to decide whether two phone strings are the same line.
 * "+55 (11) 99999-0000", "11999990000" and "551199990000" (old Brazilian mobile
 * numbers WhatsApp still reports without the ninth digit) all map to the same key.
 */
export function phoneKey(value: string | null | undefined) {
  let digits = withCountry(value);
  if (digits.length === 13 && digits.startsWith('55') && digits[4] === '9') digits = digits.slice(0, 4) + digits.slice(5);
  return digits;
}

/** Number as the WhatsApp bridge expects it: country code included, digits only. */
export function toWhatsappNumber(value: string | null | undefined) {
  return withCountry(value);
}
