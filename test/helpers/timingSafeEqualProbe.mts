/**
 * Probe for the constant-time compare at the call sites of `safeEqualSecret`.
 *
 * Revert of a call site to `===` / `!==` leave every behavioural spec green: same verdict for same
 * input. Only a forced verdict tell them apart. Stub `crypto.timingSafeEqual` → verdict decide branch
 * iff call site go through `safeEqualSecret`. Plain compare ignore stub → branch follow the strings.
 */
import { expect } from 'chai'
import crypto from 'node:crypto'
import { syncBuiltinESMExports } from 'node:module'
import sinon from 'sinon'

/** Replace `crypto.timingSafeEqual` with a fixed verdict. Pair with {@link releaseTimingSafeEqual} in afterEach. */
export function stubTimingSafeEqual(verdict: boolean): sinon.SinonStub {
	const stub = sinon.stub(crypto, 'timingSafeEqual').callsFake(() => verdict)
	// named import in safeEqualSecret read live binding → sync needed after stub
	syncBuiltinESMExports()
	return stub
}

/** Restore every sinon stub, then re-sync the ESM named exports of `node:crypto`. */
export function releaseTimingSafeEqual(): void {
	sinon.restore()
	syncBuiltinESMExports()
}

/** Call site reached the compare exactly once, with 2 sha256 digests of 32 bytes each. */
export function expectOneDigestCompare(stub: sinon.SinonStub): void {
	expect(stub.calledOnce, 'timingSafeEqual calls').to.equal(true)
	const [left, right] = stub.firstCall.args as [Buffer, Buffer]
	expect(left.length).to.equal(32)
	expect(right.length).to.equal(32)
}
