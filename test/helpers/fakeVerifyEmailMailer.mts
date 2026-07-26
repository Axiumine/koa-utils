import { IVerifyEmailMailer } from '@lib/access/verifyEmailMailer.mjs'
import sinon from 'sinon'

/** Every method of {@link IVerifyEmailMailer}, as sinon stubs. */
export interface IFakeVerifyEmailMailer extends IVerifyEmailMailer {
	emailAlreadyValid: sinon.SinonStub
	wrongHash: sinon.SinonStub
	tooMuchVerifyRequests: sinon.SinonStub
	hashReqTooOld: sinon.SinonStub
	accountDisabled: sinon.SinonStub
	sendWelcome: sinon.SinonStub
}

/**
 * Mailer whose six methods are stubs resolving `undefined`.
 *
 * Prefer this over stubbing `SocketLabsLib.prototype`. The prototype route reach whatever the guard's
 * module-level default binding is, and that binding is debounced per address + template for the whole
 * process → two specs asserting a send to the same address are order-dependent, and the second to run
 * see no send at all. An injected fake carry no window, no shared state.
 */
export const fakeVerifyEmailMailer = (): IFakeVerifyEmailMailer => ({
	emailAlreadyValid: sinon.stub().resolves(),
	wrongHash: sinon.stub().resolves(),
	tooMuchVerifyRequests: sinon.stub().resolves(),
	hashReqTooOld: sinon.stub().resolves(),
	accountDisabled: sinon.stub().resolves(),
	sendWelcome: sinon.stub().resolves()
})
