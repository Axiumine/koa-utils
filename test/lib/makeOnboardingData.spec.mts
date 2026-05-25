import { makeOnboardingData } from '@lib/makeOnboardingData.mjs'
import { expect } from 'chai'

describe('makeOnboardingData', () => {
	it('returns step when onboardingDone = true', () => {
		expect(makeOnboardingData({ onboardingDone: true, onboardingStep: 'step3' })).to.equal('step3')
	})

	it('returns empty string when done = true but step undefined', () => {
		expect(makeOnboardingData({ onboardingDone: true })).to.equal('')
	})

	it('returns null when done = false', () => {
		expect(makeOnboardingData({ onboardingDone: false, onboardingStep: 'x' })).to.equal(null)
	})

	it('returns null when done undefined', () => {
		expect(makeOnboardingData({ onboardingStep: 'x' })).to.equal(null)
	})
})
