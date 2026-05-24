import { GraphQLError } from 'graphql'

export const customFormatErrorFn = (err: GraphQLError | Error) => {
	if (err instanceof GraphQLError) {
		throw new GraphQLError(err.message, {
			extensions: err.extensions
		})
	}

	return err
}
