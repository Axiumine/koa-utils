import { ERR_MISCONFIGURED, ERR_OOPS } from '@private/graphQL/Consts.mjs'
import { throwGraphQLError } from '@throw/throwGraphQLError.mjs'

export const throwNotFoundError = (desc: string = ERR_MISCONFIGURED) => {
	throw throwGraphQLError(404, ERR_OOPS, desc)
}
