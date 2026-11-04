/** The answer of a passed assertion. The pool stays open. */
export interface IRoleAssertion {
	readonly role: string
	/** How many entries of `expectedGrants` were checked. */
	readonly grantsChecked: number
}
