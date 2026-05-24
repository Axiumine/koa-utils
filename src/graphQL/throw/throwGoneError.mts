import { ERR_MISCONFIGURED, ERR_OOPS } from '@private/graphQL/Consts.mjs'
import { throwGraphQLError } from '@throw/throwGraphQLError.mjs'

export const throwGoneError = (desc: string = ERR_MISCONFIGURED) => {
	throw throwGraphQLError(410, ERR_OOPS, desc)
}
