export type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type StorageProvider = () => BrowserStorage;

export type StoredJsonResult<Value> =
  | { status: "ok"; value: Value | null }
  | { status: "corrupt" }
  | { status: "unavailable" };

export function readStoredJson<Value>(
  getStorage: StorageProvider,
  key: string,
  isValue: (value: unknown) => value is Value,
): StoredJsonResult<Value> {
  let serialized: string | null;
  try {
    serialized = getStorage().getItem(key);
  } catch {
    return { status: "unavailable" };
  }

  if (serialized === null) return { status: "ok", value: null };

  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return { status: "corrupt" };
  }

  return isValue(value) ? { status: "ok", value } : { status: "corrupt" };
}

export function writeStoredJson(
  getStorage: StorageProvider,
  key: string,
  value: unknown,
): boolean {
  try {
    getStorage().setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeStoredValue(getStorage: StorageProvider, key: string): boolean {
  try {
    getStorage().removeItem(key);
    return true;
  } catch {
    return false;
  }
}
