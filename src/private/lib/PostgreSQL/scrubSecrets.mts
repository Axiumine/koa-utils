const REDACTED = '[REDACTED]'

/** Replaces every occurrence of a secret in a text with a marker. */
export function scrubSecrets(text: string, secrets: readonly string[]): string {
	return secrets.reduce((current, secret) => current.split(secret).join(REDACTED), text)
}
