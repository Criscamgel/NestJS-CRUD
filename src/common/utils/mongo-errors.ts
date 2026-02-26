export type MongoDuplicateKeyError = {
  code: 11000;
  keyValue?: Record<string, unknown>;
  keyPattern?: Record<string, unknown>;
};

export function isMongoDuplicateKeyError(e: unknown): e is MongoDuplicateKeyError {
  return typeof e === 'object' && e !== null && 'code' in e && (e as any).code === 11000;
}