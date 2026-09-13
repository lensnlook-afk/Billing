/** Convert an API decimal string to paise without floating-point arithmetic. */
export function toPaise(value: string): bigint {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Invalid money amount');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
}
export function fromPaise(value: bigint): string { return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`; }
export function multiply(amount: bigint, quantity: number): bigint { return amount * BigInt(quantity); }
