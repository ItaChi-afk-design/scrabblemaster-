export function isCurrentRequest(requestId: number, currentRequestId: number) {
  return requestId === currentRequestId;
}
