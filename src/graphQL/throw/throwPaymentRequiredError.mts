import { throwGraphQLError } from '@throw/throwGraphQLError.mjs'

export const throwPaymentRequiredError = () => {
	throw throwGraphQLError(402, 'Payment Required', 'You must have a subscription to use this feature.')
}
