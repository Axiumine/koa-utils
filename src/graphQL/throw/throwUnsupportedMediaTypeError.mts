import { throwGraphQLError } from '@throw/throwGraphQLError.mjs'

export const throwUnsupportedMediaTypeError = () => {
	throw throwGraphQLError(415, 'Unsupported Media Type', 'The chosen media type is not supported. Please change the media type.')
}
