import { validateKhronos } from '@private/glb/validateKhronos.mjs'
import { expect } from 'chai'

import { buildGlb, patchGlbJson } from '../../helpers/glbFixtures.mjs'

type IValidate = NonNullable<Parameters<typeof validateKhronos>[1]>
type IMessage = { code: string; message: string; severity: number; pointer?: string }

const fake =
	(numErrors: number, messages: IMessage[]): IValidate =>
	() =>
		Promise.resolve({ issues: { numErrors, messages } })

describe('private/glb/validateKhronos', () => {
	it('a valid file has no reasons', async () => {
		expect(await validateKhronos(await buildGlb())).to.deep.equal([])
	})

	it('a real error of the validator becomes VALIDATOR_ERROR with code, text and pointer', async () => {
		const glb = patchGlbJson(await buildGlb(), (json) => {
			json['accessors'][0].count = 2_000_000_000
		})
		const reasons = await validateKhronos(glb)
		expect(reasons.length).to.be.greaterThan(0)
		const first = reasons[0]
		expect(first?.code).to.equal('VALIDATOR_ERROR')
		expect(first?.pointer).to.equal('/accessors/0')
		expect(first?.message).to.match(/^ACCESSOR_TOO_LONG: /)
	})

	it('warnings, infos and hints never reject', async () => {
		const messages = [1, 2, 3].map((severity) => ({ code: 'X', message: 'm', severity }))
		expect(await validateKhronos(new Uint8Array(), fake(0, messages))).to.deep.equal([])
	})

	it('only errors are kept from a mixed report', async () => {
		const messages: IMessage[] = [
			{ code: 'WARN', message: 'w', severity: 1, pointer: '/a' },
			{ code: 'ERR', message: 'e', severity: 0, pointer: '/b' }
		]
		expect(await validateKhronos(new Uint8Array(), fake(1, messages))).to.deep.equal([
			{ code: 'VALIDATOR_ERROR', message: 'ERR: e', pointer: '/b' }
		])
	})

	it('an error without a pointer has no pointer key', async () => {
		const reasons = await validateKhronos(new Uint8Array(), fake(1, [{ code: 'ERR', message: 'e', severity: 0 }]))
		expect(reasons).to.deep.equal([{ code: 'VALIDATOR_ERROR', message: 'ERR: e' }])
		expect(reasons[0]).to.not.have.property('pointer')
	})

	it('keeps at most 20 errors', async () => {
		const messages = Array.from({ length: 30 }, (_, index) => ({ code: `E${index}`, message: 'm', severity: 0 }))
		const reasons = await validateKhronos(new Uint8Array(), fake(30, messages))
		expect(reasons).to.have.length(20)
		expect(reasons[0]?.message).to.equal('E0: m')
		expect(reasons[19]?.message).to.equal('E19: m')
	})

	it('errors counted but cut off before they were listed still reject', async () => {
		expect(await validateKhronos(new Uint8Array(), fake(3, []))).to.deep.equal([
			{ code: 'VALIDATOR_ERROR', message: 'the glTF Validator reported 3 errors' }
		])
		const infos = [{ code: 'I', message: 'm', severity: 2 }]
		expect((await validateKhronos(new Uint8Array(), fake(2, infos)))[0]?.message).to.equal(
			'the glTF Validator reported 2 errors'
		)
	})

	it('a listed error is not repeated as a count', async () => {
		expect(await validateKhronos(new Uint8Array(), fake(5, [{ code: 'E', message: 'm', severity: 0 }]))).to.have.length(1)
	})

	it('asks the validator for at most 100 messages', async () => {
		let seen: unknown
		const spy: IValidate = (_bytes, options) => {
			seen = options
			return Promise.resolve({ issues: { numErrors: 0, messages: [] } })
		}
		await validateKhronos(new Uint8Array(), spy)
		expect(seen).to.deep.equal({ maxIssues: 100 })
	})

	it('a crash of the validator is VALIDATOR_FAILED, not a throw', async () => {
		const crash: IValidate = () => Promise.reject(new Error('boom'))
		expect(await validateKhronos(new Uint8Array(), crash)).to.deep.equal([
			{ code: 'VALIDATOR_FAILED', message: 'the glTF Validator crashed on the file' }
		])
	})
})
