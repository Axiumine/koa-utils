import { expect } from 'chai'
import { GraphQLError } from 'graphql'

export function expectGraphQLError(
	fn: () => unknown,
	status: number,
	title: string,
	description?: string
) {
	let caught: unknown
	try {
		fn()
	} catch (e) {
		caught = e
	}
	expect(caught, 'expected fn to throw').to.exist
	expect(caught).to.be.instanceOf(GraphQLError)
	const err = caught as GraphQLError
	expect(err.message).to.equal(title)
	const ext = err.extensions as { http?: { status?: number }; description?: string }
	expect(ext.http?.status).to.equal(status)
	if (description !== undefined) {
		expect(ext.description).to.equal(description)
	}
	return err
}

export async function expectGraphQLErrorAsync(
	fn: () => Promise<unknown>,
	status: number,
	title: string,
	description?: string
) {
	let caught: unknown
	try {
		await fn()
	} catch (e) {
		caught = e
	}
	expect(caught, 'expected fn to throw').to.exist
	expect(caught).to.be.instanceOf(GraphQLError)
	const err = caught as GraphQLError
	expect(err.message).to.equal(title)
	const ext = err.extensions as { http?: { status?: number }; description?: string }
	expect(ext.http?.status).to.equal(status)
	if (description !== undefined) {
		expect(ext.description).to.equal(description)
	}
	return err
}
