/**
 * What the function from {@link createSocketLabsSender} resolves to. A failed send does not reject: it resolves to
 * `{ ok: false, code }`, where `code` is the `name` of the SDK's result enum (`'Timeout'`, `'InvalidAuthentication'`,
 * `'Warning'`, ...) or `'UnknownError'` when the rejection carries none. The code is all that is exposed: never the
 * SDK's response message, the per-recipient results or the raw rejection, which can hold recipients and a receipt.
 */
export type ISocketLabsSendResult = { ok: true } | { ok: false; code: string }
