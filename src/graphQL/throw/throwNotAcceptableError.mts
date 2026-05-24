import { ERR_MISCONFIGURED, ERR_OOPS } from '@private/graphQL/Consts.mjs'
import { throwGraphQLError } from '@throw/throwGraphQLError.mjs'

export const throwNotAcceptableError = () => {
	throw throwGraphQLError(406, ERR_OOPS, ERR_MISCONFIGURED)
}
