/**
 * Split a total evenly across `n` people in minor-unit precision (paisa).
 * Returns an array of `n` whole-rupee amounts that sum exactly to `total`.
 * Any remainder from rounding goes to the first share (typically the payer's reduction).
 */
export function splitEvenly(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  const shares = Array<number>(n).fill(base);
  for (let i = 0; i < remainder; i++) shares[i] += 1;
  return shares;
}

/**
 * Given a total and a list of participants (excluding payer), each participant
 * pays an equal share. Returns shares as integer PKR.
 */
export function splitForParticipants(total: number, participantCount: number): number[] {
  if (participantCount <= 0) return [];
  return splitEvenly(Math.round(total / (participantCount + 1) * participantCount), participantCount);
}
