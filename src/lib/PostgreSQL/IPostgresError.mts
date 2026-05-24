export interface IPostgresError extends Error {
	code?: string;
	detail?: string;
	constraint?: string;
	hint?: string;
}
