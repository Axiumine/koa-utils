/** What `assertAffected` reads of a statement's answer: the count the server reports. An `ITxResult` fits. */
export interface IAffectedResult {
	readonly rowCount: number | null
}
