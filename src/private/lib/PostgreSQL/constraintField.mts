/** The log field for a constraint name: present only when the error named a plain identifier (see `constraintNameOf`). */
export function constraintField(name: string | undefined): { constraint?: string } {
	return name === undefined ? {} : { constraint: name }
}
