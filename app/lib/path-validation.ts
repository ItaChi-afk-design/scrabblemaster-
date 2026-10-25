export function hasMalformedPercentEncoding(pathSegment: string) {
  try {
    decodeURIComponent(pathSegment);
    return false;
  } catch {
    return true;
  }
}
