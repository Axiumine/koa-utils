/**
 * Answers "may this notification be sent?" for a key. `true` sends, `false` drops silently.
 *
 * Every `handleIf*` guard in the verify-email chain is reachable from an unauthenticated
 * `GET /check/verify-email/:email/:hash`, and three of them have no counter to lean on:
 * `handleIfEmailAlreadyValid`, `handleIfAccountDeleted` and `handleIfAccountDisabled` mailed the address
 * on *every* request through 5.6.1. Anyone who knew a registered address could make the platform's own
 * SocketLabs account mail its owner once per request — a mail bomb aimed at a third party, plus a
 * sending-reputation problem, out of a GET nobody had to authenticate.
 *
 * The contract is one function so a deployment can replace it. A Redis `SET key NX PX <window>` returning
 * whether the key was created is the obvious cross-instance implementation, and is a one-liner here.
 */
export type TMailThrottle = (key: string) => boolean | Promise<boolean>

/** Options of {@link createMailThrottle}. */
export interface ICreateMailThrottleArgs {
	/** How long a key stays blocked after a send. Default 15 minutes. */
	windowMs?: number
	/** Cap on tracked keys, so an attacker cycling addresses cannot grow the map without bound. Default 5000. */
	maxKeys?: number
}

/**
 * In-process debounce: one send per key per `windowMs`.
 *
 * In-process on purpose — no runtime dependency, nothing to configure, and the amplification it has to
 * stop arrives through one process. Behind several instances it degrades to one mail per instance per
 * window, which is a cap rather than the unbounded fan-out it replaces; pass your own `TMailThrottle`
 * when one mail per address across the fleet matters.
 *
 * State is per instance. `createVerifyEmailFlow` builds one per flow, so two flows never share a window.
 */
export const createMailThrottle = ({
	windowMs = 15 * 60 * 1000,
	maxKeys = 5000
}: ICreateMailThrottleArgs = {}): TMailThrottle => {
	/** key → epoch ms of the send that blocked it. Insertion-ordered, which is what makes the eviction cheap. */
	const sentAt = new Map<string, number>()

	return function maySend(key: string): boolean {
		const now = Date.now()
		const previous = sentAt.get(key)

		if (previous !== undefined && now - previous < windowMs) {
			return false
		}

		// Delete before the set below so the map stays ordered by send time, oldest first.
		sentAt.delete(key)

		if (sentAt.size >= maxKeys) {
			for (const [tracked, at] of sentAt) {
				if (now - at >= windowMs) {
					sentAt.delete(tracked)
				}
			}
		}

		if (sentAt.size >= maxKeys) {
			// Still full, so every tracked key is inside its window: drop the oldest — the first key the
			// insertion-ordered map yields. Refusing to send instead would let a flood of fresh addresses
			// mute the notifications of real ones. `done` is only true for a `maxKeys` of 0, which caps
			// nothing and so has nothing to evict.
			const oldest = sentAt.keys().next()

			if (!oldest.done) {
				sentAt.delete(oldest.value)
			}
		}

		sentAt.set(key, now)
		return true
	}
}

/** Never debounce — one mail per request, as 5.6.1 and earlier did. Pass as `mailThrottle` to opt out. */
export const ALWAYS_MAIL: TMailThrottle = () => true
