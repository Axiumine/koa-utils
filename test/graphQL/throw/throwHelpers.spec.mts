import { throwAccessTokenExpiredOrDeleted } from '@throw/throwAccessTokenExpiredOrDeleted.mjs'
import { throwAccessTokenRequired } from '@throw/throwAccessTokenRequired.mjs'
import { throwAlreadyDone } from '@throw/throwAlreadyDone.mjs'
import { throwAlreadyTakenError } from '@throw/throwAlreadyTakenError.mjs'
import { throwConflictError } from '@throw/throwConflictError.mjs'
import { throwErrorWrongUserInput } from '@throw/throwErrorWrongUserInput.mjs'
import { throwForbiddenError } from '@throw/throwForbiddenError.mjs'
import { throwGoneError } from '@throw/throwGoneError.mjs'
import { throwGraphQLError } from '@throw/throwGraphQLError.mjs'
import { throwInternalError } from '@throw/throwInternalError.mjs'
import { throwMethodNotAllowedError } from '@throw/throwMethodNotAllowedError.mjs'
import { throwMissingMalformedInvalidToken } from '@throw/throwMissingMalformedInvalidToken.mjs'
import { throwNotAcceptableError } from '@throw/throwNotAcceptableError.mjs'
import { throwNotFoundError } from '@throw/throwNotFoundError.mjs'
import { throwNotImplementedError } from '@throw/throwNotImplementedError.mjs'
import { throwPaymentRequiredError } from '@throw/throwPaymentRequiredError.mjs'
import { throwPreconditionFailedNoAuthCookie } from '@throw/throwPreconditionFailedNoAuthCookie.mjs'
import { throwPreconditionFailedNoAuthHeader } from '@throw/throwPreconditionFailedNoAuthHeader.mjs'
import { throwRefreshTokenExpiredOrDeleted } from '@throw/throwRefreshTokenExpiredOrDeleted.mjs'
import { throwRefreshTokenRequired } from '@throw/throwRefreshTokenRequired.mjs'
import { throwRefreshTokenSignatureRequired } from '@throw/throwRefreshTokenSignatureRequired.mjs'
import { throwTooManyRequestsError } from '@throw/throwTooManyRequestsError.mjs'
import { throwUnauthorizedError } from '@throw/throwUnauthorizedError.mjs'
import { throwUnprocessableContentError } from '@throw/throwUnprocessableContentError.mjs'
import { throwUnsupportedMediaTypeError } from '@throw/throwUnsupportedMediaTypeError.mjs'

import { expectGraphQLError } from '../../helpers/assertGraphQLError.mjs'

const ERR_OOPS = 'Oops'
const ERR_MISCONFIGURED =
	'We have misconfigured some services. Our technicians are already fixing the problem. Please try again later.'

describe('graphQL/throw/*', () => {
	it('throwGraphQLError builds GraphQLError with status/title/description', () => {
		expectGraphQLError(() => throwGraphQLError(418, 'Teapot', 'short and stout'), 418, 'Teapot', 'short and stout')
	})

	it('throwGraphQLError defaults description to empty string', () => {
		expectGraphQLError(() => throwGraphQLError(500, 'X'), 500, 'X', '')
	})

	it('throwAccessTokenExpiredOrDeleted -> 498 Invalid Token', () => {
		expectGraphQLError(throwAccessTokenExpiredOrDeleted, 498, 'Invalid Token', 'Access Token is expired or deleted by Admin.')
	})

	it('throwAccessTokenRequired -> 499 Token Required', () => {
		expectGraphQLError(throwAccessTokenRequired, 499, 'Token Required', 'Access Token Required.')
	})

	it('throwAlreadyDone -> 204 no body', () => {
		expectGraphQLError(throwAlreadyDone, 204, '', '')
	})

	it('throwAlreadyTakenError -> 409 Conflict (default desc)', () => {
		expectGraphQLError(throwAlreadyTakenError, 409, 'Conflict', 'You have already done this.')
	})

	it('throwAlreadyTakenError accepts custom desc', () => {
		expectGraphQLError(() => throwAlreadyTakenError('nope'), 409, 'Conflict', 'nope')
	})

	it('throwConflictError -> 409 Conflict via throwAlreadyTakenError', () => {
		expectGraphQLError(throwConflictError, 409, 'Conflict', 'You have already done this.')
	})

	it('throwErrorWrongUserInput -> 400 Bad Request', () => {
		expectGraphQLError(() => throwErrorWrongUserInput('bad'), 400, 'Bad Request', 'bad')
	})

	it('throwForbiddenError -> 403 Forbidden', () => {
		expectGraphQLError(throwForbiddenError, 403, 'Forbidden', 'Forbidden.')
	})

	it('throwGoneError -> 410 Oops', () => {
		expectGraphQLError(throwGoneError, 410, ERR_OOPS, ERR_MISCONFIGURED)
		expectGraphQLError(() => throwGoneError('custom'), 410, ERR_OOPS, 'custom')
	})

	it('throwInternalError -> 500 Internal Server Error', () => {
		expectGraphQLError(throwInternalError, 500, 'Internal Server Error', 'Error reported to Dev Team.')
		expectGraphQLError(() => throwInternalError(' (extra)'), 500, 'Internal Server Error', 'Error reported to Dev Team. (extra)')
	})

	it('throwMethodNotAllowedError -> 405 Oops', () => {
		expectGraphQLError(throwMethodNotAllowedError, 405, ERR_OOPS, ERR_MISCONFIGURED)
	})

	it('throwMissingMalformedInvalidToken -> 499 Token Required', () => {
		expectGraphQLError(throwMissingMalformedInvalidToken, 499, 'Token Required', 'Missing/malformed/invalid token.')
	})

	it('throwNotAcceptableError -> 406 Oops', () => {
		expectGraphQLError(throwNotAcceptableError, 406, ERR_OOPS, ERR_MISCONFIGURED)
	})

	it('throwNotFoundError -> 404 Oops, default description', () => {
		expectGraphQLError(throwNotFoundError, 404, ERR_OOPS, ERR_MISCONFIGURED)
		expectGraphQLError(() => throwNotFoundError('missing'), 404, ERR_OOPS, 'missing')
	})

	it('throwNotImplementedError -> 501 Oops', () => {
		expectGraphQLError(throwNotImplementedError, 501, ERR_OOPS, ERR_MISCONFIGURED)
	})

	it('throwPaymentRequiredError -> 402', () => {
		expectGraphQLError(throwPaymentRequiredError, 402, 'Payment Required', 'You must have a subscription to use this feature.')
	})

	it('throwPreconditionFailedNoAuthCookie -> 412', () => {
		expectGraphQLError(throwPreconditionFailedNoAuthCookie, 412, 'Precondition Failed', 'No authorization cookie.')
	})

	it('throwPreconditionFailedNoAuthHeader -> 412', () => {
		expectGraphQLError(throwPreconditionFailedNoAuthHeader, 412, 'Precondition Failed', 'No authorization header.')
	})

	it('throwRefreshTokenExpiredOrDeleted -> 498', () => {
		expectGraphQLError(throwRefreshTokenExpiredOrDeleted, 498, 'Invalid Token', 'Refresh Token is expired or deleted by Admin.')
	})

	it('throwRefreshTokenRequired -> 499', () => {
		expectGraphQLError(throwRefreshTokenRequired, 499, 'Token Required', 'Refresh Token Required.')
	})

	it('throwRefreshTokenSignatureRequired -> 499', () => {
		expectGraphQLError(throwRefreshTokenSignatureRequired, 499, 'Token Required', 'Refresh Token Signature Required.')
	})

	it('throwTooManyRequestsError -> 429', () => {
		expectGraphQLError(throwTooManyRequestsError, 429, 'Too Many Requests', '')
		expectGraphQLError(() => throwTooManyRequestsError('wait'), 429, 'Too Many Requests', 'wait')
	})

	it('throwUnauthorizedError -> 401', () => {
		expectGraphQLError(throwUnauthorizedError, 401, 'Unauthorized', 'You are unauthorized.')
		expectGraphQLError(() => throwUnauthorizedError('nope'), 401, 'Unauthorized', 'nope')
	})

	it('throwUnprocessableContentError -> 422', () => {
		expectGraphQLError(
			throwUnprocessableContentError,
			422,
			'Unprocessable Content',
			'We are unable to process the instructions contained in the request.'
		)
		expectGraphQLError(() => throwUnprocessableContentError('bad'), 422, 'Unprocessable Content', 'bad')
	})

	it('throwUnsupportedMediaTypeError -> 415', () => {
		expectGraphQLError(
			throwUnsupportedMediaTypeError,
			415,
			'Unsupported Media Type',
			'The chosen media type is not supported. Please change the media type.'
		)
	})
})
