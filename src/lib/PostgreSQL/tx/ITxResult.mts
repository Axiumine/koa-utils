/** What a statement answers: the rows, the count the server reports and the command tag. */
export interface ITxResult<TRow = Record<string, unknown>> {
	readonly rows: TRow[]
	readonly rowCount: number | null
	readonly command: string
}
