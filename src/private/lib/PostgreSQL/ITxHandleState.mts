/** What the handle of one attempt shares with the attempt: whether it still works, and its first failed statement. */
export interface ITxHandleState {
	open: boolean
	failed: boolean
	failure: unknown
}
