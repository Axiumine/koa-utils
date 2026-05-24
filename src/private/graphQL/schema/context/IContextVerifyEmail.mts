export interface IContextVerifyEmail {
	params: {
		email: string;
		hash: string;
	},

	redirect(
		value: string,
	): void
}

