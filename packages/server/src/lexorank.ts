/**
 * Lexorank — lexicographic ranking for sortable lists.
 *
 * Format: `bucket|rank` where bucket is a single digit (0-2, currently fixed
 * to 0) and rank is a lowercase-alpha string ordered lexicographically.
 */

const BUCKET = '0';
const MIN_CHAR = 'a';               // code 97
const MAX_CHAR = 'z';               // code 122
const ALPHABET_SIZE = 26;           // a-z
const RANK_LENGTH = 6;              // default rank width

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pad `s` on the right with MIN_CHAR to length `len`. */
function padRight(s: string, len: number): string {
  while (s.length < len) s += MIN_CHAR;
  return s;
}

/**
 * Compute a midpoint rank string between two rank strings `a` and `b`.
 *
 * - `a` < `b` lexicographically (caller must guarantee).
 * - If `a` is empty it is treated as the absolute minimum.
 * - If `b` is empty it is treated as the absolute maximum.
 * - When `a` and `b` are adjacent the result is longer (one extra char).
 */
export function midpoint(a: string, b: string): string {
  // Normalise to equal length
  const maxLen = Math.max(a.length, b.length, 1);
  const aa = a ? padRight(a, maxLen) : MIN_CHAR.repeat(maxLen);
  let bb = b ? padRight(b, maxLen) : '';

  // Convert rank strings to digit arrays (base-26)
  const digitsA = Array.from(aa, (ch) => ch.charCodeAt(0) - 97);
  const digitsB = bb
    ? Array.from(bb, (ch) => ch.charCodeAt(0) - 97)
    : new Array(maxLen).fill(ALPHABET_SIZE - 1); // 'z' = max valid char

  // Sum digits as a big base-26 number, then halve.
  // We work with integers to avoid floating-point drift.
  let carry = 0;
  const sum: number[] = [];
  for (let i = maxLen - 1; i >= 0; i--) {
    const s = digitsA[i] + digitsB[i] + carry;
    carry = Math.floor(s / ALPHABET_SIZE);
    sum.unshift(s % ALPHABET_SIZE);
  }
  // carry is at most 1 here (since both values < base^len)

  // Divide the sum by 2 to get the midpoint.
  let remainder = carry; // propagate leading carry into division
  const mid: number[] = [];
  for (const d of sum) {
    const cur = remainder * ALPHABET_SIZE + d;
    mid.push(Math.floor(cur / 2));
    remainder = cur % 2;
  }

  // If there is a remainder we need one extra digit of precision.
  if (remainder) {
    mid.push(Math.floor(ALPHABET_SIZE / 2)); // 'm'
  }

  let result = mid.map((d) => String.fromCharCode(d + 97)).join('');

  // Trim trailing MIN_CHARs but keep at least one char
  result = result.replace(/a+$/, '') || MIN_CHAR;

  // Safety: if result equals a or b we extend by one char
  if (result === aa || result === (bb || '')) {
    result += String.fromCharCode(97 + Math.floor(ALPHABET_SIZE / 2));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Return a seed rank suitable for the very first item: `0|hzzzzz`. */
export function generateInitialRank(): string {
  return `${BUCKET}|hzzzzz`;
}

/**
 * Generate a rank string between two existing lexoranks.
 *
 * - `before == null` → insert at the very beginning.
 * - `after  == null` → insert at the very end.
 * - Both provided   → insert between them.
 */
export function generateRankBetween(
  before: string | null,
  after: string | null,
): string {
  const rankA = before ? before.split('|')[1] : '';
  const rankB = after ? after.split('|')[1] : '';
  return `${BUCKET}|${midpoint(rankA, rankB)}`;
}

/**
 * Evenly redistribute lexorank values across `items` (order preserved).
 * Useful when the gap between adjacent ranks is exhausted.
 */
export function rebalance(
  items: Array<{ id: string }>,
): Array<{ id: string; position: string }> {
  if (items.length === 0) return [];

  const results: Array<{ id: string; position: string }> = [];

  for (let i = 0; i < items.length; i++) {
    // Treat index as a fraction of the total range and convert to base-26.
    const fraction = (i + 1) / (items.length + 1);
    const rankChars: string[] = [];
    let frac = fraction;
    for (let d = 0; d < RANK_LENGTH; d++) {
      frac *= ALPHABET_SIZE;
      const digit = Math.floor(frac);
      rankChars.push(String.fromCharCode(97 + digit));
      frac -= digit;
    }
    const rank = rankChars.join('');
    results.push({ id: items[i].id, position: `${BUCKET}|${rank}` });
  }

  return results;
}

/**
 * Comparator for two lexorank strings — use with `Array.prototype.sort`.
 */
export function compareLexorank(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
