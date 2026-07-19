/**
 * Tests for private/lib/makeBodyJson.mts
 *
 * Chain: makeBodyJson(message, description) → JSON.stringify({ message, description })
 *
 * Pure function, no collaborators, no branches. Coverage goal is simply to invoke it
 * and assert the returned JSON string shape for a handful of representative inputs.
 */
import { makeBodyJson } from '@private/lib/makeBodyJson.mjs'
import { expect } from 'chai'

// ---------------------------------------------------------------------------

describe('makeBodyJson', () => {
	it('returns a JSON string with message and description fields', () => {
		const result = makeBodyJson('Bad Request', 'The request was malformed')

		expect(result).to.equal(JSON.stringify({ message: 'Bad Request', description: 'The request was malformed' }))
		expect(JSON.parse(result)).to.deep.equal({ message: 'Bad Request', description: 'The request was malformed' })
	})

	it('handles empty strings for both arguments', () => {
		const result = makeBodyJson('', '')

		expect(result).to.equal(JSON.stringify({ message: '', description: '' }))
		expect(JSON.parse(result)).to.deep.equal({ message: '', description: '' })
	})

	it('preserves special characters that require JSON escaping', () => {
		const message = 'Error: "quoted" \\ backslash \n newline'
		const description = 'Line1\nLine2\t"tab and quote"'

		const result = makeBodyJson(message, description)

		expect(result).to.equal(JSON.stringify({ message, description }))
		expect(JSON.parse(result)).to.deep.equal({ message, description })
	})
})
