/**
 * What the function from {@link createSocketLabsSender} resolves to. A failed send does not reject: it resolves to
 * `{ ok: false, code }`, where `code` is a SocketLabs result name (`'Timeout'`, `'InvalidAuthentication'`,
 * `'Warning'`, ...) or `'UnknownError'` when the rejection carries none. The code is all that is exposed: never a
 * response message, the per-recipient results or the raw rejection, which can hold recipients and a receipt.
 */
export type ISocketLabsSendResult = { ok: true } | { ok: false; code: string }
