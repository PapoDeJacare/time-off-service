export const DAY_DECIMAL_PRECISION = 2;

export const roundDays = (value: number): number =>
  Number.parseFloat(value.toFixed(DAY_DECIMAL_PRECISION));
