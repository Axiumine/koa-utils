import { ERR_MISCONFIGURED, ERR_OOPS } from '@private/graphQL/Consts.mjs'
import { throwGraphQLError } from '@throw/throwGraphQLError.mjs'

export const throwMethodNotAllowedError = () => {
	throw throwGraphQLError(405, ERR_OOPS, ERR_MISCONFIGURED)
}
