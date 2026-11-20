// Plate math, shared by the Gym Tools calculator and the inline split under
// a barbell exercise. Display only: the logged weight stays the total.

const PLATES = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lbs: [45, 35, 25, 10, 5, 2.5],
};

export function platesFor(unit) {
  return unit === 'kg' ? PLATES.kg : PLATES.lbs;
}

/** Default bar for a unit (Olympic bar). */
export function defaultBar(unit) {
  return unit === 'kg' ? 20 : 45;
}

/**
 * Greedy plates for one side of the bar. `remainder` is the total weight that
 * cannot be loaded with the available plates (0 when exact), rounded to 2
 * decimals. A total at or under the bar gives no plates.
 */
export function platesPerSide(total, bar, unit) {
  const t = Number(total) || 0;
  const b = Number(bar) || 0;
  let left = (t - b) / 2;
  const perSide = [];
  if (left > 0) {
    for (const plate of platesFor(unit)) {
      while (left >= plate - 0.001) {
        perSide.push(plate);
        left -= plate;
      }
    }
  }
  const used = perSide.reduce((s, p) => s + p, 0) * 2 + b;
  return { perSide, remainder: Math.round((t - used) * 100) / 100 };
}

/** [25, 5, 5] -> "25 + 5 + 5". */
export function formatPerSide(perSide) {
  return perSide.join(' + ');
}
