// checkForNSFW.mts contains only commented-out code — there are no executable exports.
// This file exists to satisfy the spec glob and documents the intentional coverage gap.

describe('checkForNSFW', () => {
	it('module has no executable exports — entire function body is commented out', () => {
		// The src file contains only a commented-out implementation using sightengine.
		// No live code to test. 100% line coverage on the file is trivially satisfied
		// because there are 0 executable lines.
	})
})
