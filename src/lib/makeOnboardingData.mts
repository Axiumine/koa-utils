import { IOnboarding } from '@lib/MongoDB/IOnboarding.mjs'

export function makeOnboardingData(data: IOnboarding): string | null {
	return data.onboardingDone ? (data.onboardingStep ?? '') : null
}
