/**
 * Password rules — single source of truth. Mirrors the server's validator
 * in server/routes/auth.js. Any change here should be reflected there too.
 *
 * Required:
 *   - 8+ characters
 *   - at least one lowercase
 *   - at least one uppercase
 *   - at least one digit
 *   - at least one special character
 */
export function validatePassword(pw) {
  if (!pw || pw.length < 8) return 'Password must be at least 8 characters';
  if (!/[a-z]/.test(pw)) return 'Password must include a lowercase letter';
  if (!/[A-Z]/.test(pw)) return 'Password must include an uppercase letter';
  if (!/[0-9]/.test(pw)) return 'Password must include a number';
  if (!/[^a-zA-Z0-9]/.test(pw)) return 'Password must include a special character';
  return null;
}

/** Return a 0–4 strength score + label for UI indicators. */
export function passwordStrength(pw) {
  if (!pw) return { score: 0, label: '' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  score = Math.min(4, score);
  const labels = ['Too weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
  return { score, label: labels[score] };
}

export const HEIGHT_CM_RANGE = [50, 250];
export const WEIGHT_KG_RANGE = [20, 250];

/**
 * Profile body measurements. Inputs are already normalised: cm (number|null,
 * null = cleared), weightKg (number|null, null = untouched). Returns
 * 'height' | 'weight' for the first out-of-range field, else null.
 */
export function validateBody({ cm, weightKg } = {}) {
  if (cm != null && !(cm >= HEIGHT_CM_RANGE[0] && cm <= HEIGHT_CM_RANGE[1])) return 'height';
  if (weightKg != null && !(weightKg >= WEIGHT_KG_RANGE[0] && weightKg <= WEIGHT_KG_RANGE[1])) return 'weight';
  return null;
}
