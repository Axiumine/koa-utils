export interface IMariaDbErr {
	parent?: {
		sqlMessage?: string
		code: string
	};
}
