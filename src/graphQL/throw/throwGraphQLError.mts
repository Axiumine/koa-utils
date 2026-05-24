import { GraphQLError } from 'graphql'

export const throwGraphQLError = (
	status: number,
	title: string,
	description: string = ''
) => {
	throw new GraphQLError(title, {
		extensions: {
			http: { status },
			description
		}
	})
}
