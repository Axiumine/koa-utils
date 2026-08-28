/**
 * Tests for private/dataSources/redisNodeUrl.mts
 *
 * Chain: redisNodeUrl(host, port) → isRedisTlsRequired() → pick 'rediss' or 'redis' → interpolate
 * scheme://host:port.
 *
 * Fn exist only so this scheme choice is covered. Its 1 call site is `createCluster` arm of
 * dataSources/Redis.mts, `c8 ignore`d wholesale — needs REDIS_IS_CLUSTER=1 + 3 live nodes. Inline
 * template there would park the arm's only security-relevant decision outside coverage, so specs
 * here are the coverage for it.
 *
 * Host/port pass-through, `undefined` included, is pinned deliberately: previous inline template
 * emitted literal 'undefined' for unset env var, and this change must not quietly alter that.
 */
import { redisNodeUrl } from '@private/dataSources/redisNodeUrl.mjs'
import { expect } from 'chai'

import { restoreRedisTls, saveRedisTls } from '../../helpers/redisTls.mjs'

// ---------------------------------------------------------------------------

describe('redisNodeUrl', () => {
	let savedTls: string | undefined

	beforeEach(() => {
		savedTls = saveRedisTls()
	})

	afterEach(() => {
		restoreRedisTls(savedTls)
	})

	it('builds a plaintext redis:// URL when REDIS_TLS is unset', () => {
		delete process.env.REDIS_TLS

		expect(redisNodeUrl('node1.internal', '6379')).to.equal('redis://node1.internal:6379')
	})

	it('builds a rediss:// URL when REDIS_TLS is "true"', () => {
		process.env.REDIS_TLS = 'true'

		expect(redisNodeUrl('node1.internal', '6379')).to.equal('rediss://node1.internal:6379')
	})

	it('stays plaintext for a REDIS_TLS value that is not exactly "true"', () => {
		process.env.REDIS_TLS = '1'

		expect(redisNodeUrl('node2.internal', '6380')).to.equal('redis://node2.internal:6380')
	})

	it('interpolates undefined host and port unchanged', () => {
		// Regression guard, not a wish. Previous inline template produced literal 'undefined' for an
		// unset REDIS_DB1_HOST, and callers rely on the resulting connect error to surface the missing
		// variable. Adding validation here would change observable failure mode of cluster boot.
		delete process.env.REDIS_TLS

		expect(redisNodeUrl(undefined, undefined)).to.equal('redis://undefined:undefined')
	})

	it('reads REDIS_TLS per call, so all 3 root nodes share one scheme', () => {
		process.env.REDIS_TLS = 'true'

		const nodes = [
			redisNodeUrl('n1', '6379'),
			redisNodeUrl('n2', '6380'),
			redisNodeUrl('n3', '6381')
		]

		expect(nodes).to.deep.equal(['rediss://n1:6379', 'rediss://n2:6380', 'rediss://n3:6381'])
	})
})
