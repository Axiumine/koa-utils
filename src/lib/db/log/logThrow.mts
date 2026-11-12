/**
 * Kept for backwards compatibility only: this function writes nothing.
 *
 * It used to build a `LogThrow` document and discard it. The `.save()` call was commented out, so nothing
 * reached MongoDB, and the mail-on-error idea noted in the body was never implemented. The arguments are
 * still accepted, and ignored, so that existing call sites keep compiling.
 *
 * @deprecated No-op. Nothing is logged: remove the call, or write the document yourself through the `LogThrow` model.
 */
export const logThrow: (log: string, errLevel: number) => void = function () {
	// Deliberately empty, see the doc above. The original intent, never implemented:
	// send email, check last send email to avoid flooding (check last send email in collection with TTL / create a variable that stays available on every call to this function (lastSendEmail ?))
	// check db with config, e.g.: admin sets block on sending email because they're fixing the problem
}
