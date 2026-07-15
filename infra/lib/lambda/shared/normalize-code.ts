export function normalizeCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (!normalized) {
    throw new Error('code is required');
  }
  return normalized;
}
