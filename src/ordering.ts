/**
 * Locale-independent ordering utilities.
 *
 * Hash-addressed outputs (context index root hash, context locks, handoffs,
 * evidence records, repository manifests) must be byte-identical across
 * environments. The runtime default locale of `String.prototype.localeCompare`
 * depends on the host environment, so every ordering that feeds persisted,
 * compared or hashed content uses Unicode code-unit comparison instead.
 */
export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
