/**
 * The layout of the shared registry. It changes only when the shape of {@link IPostgresState} or of a slot changes in a
 * way that an older copy cannot read: copies with the same layout share one registry, copies with another refuse each
 * other with `DbStateError` instead of splitting the state.
 */
export const POSTGRES_STATE_LAYOUT = 1
