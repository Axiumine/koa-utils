// checkForNSFW.mts hold only commented-out code — no executable exports. This spec exist to satisfy the
// spec glob + document the intentional coverage gap.

describe('checkForNSFW', () => {
	it('module has no executable exports — entire function body is commented out', () => {
		// src file hold only a commented-out impl using sightengine. No live code → 100% line coverage trivially
		// satisfied: 0 executable lines.
	})
})
