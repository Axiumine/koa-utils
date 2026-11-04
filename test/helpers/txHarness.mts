import type { ITxCounterName } from '@lib/PostgreSQL/tx/ITxCounterName.mjs'
import type { ITxOptions } from '@lib/PostgreSQL/tx/ITxOptions.mjs'

import { appErrors } from './appErrors.mjs'
import { FakeTxWorld } from './fakeTxPool.mjs'
import { recordingLogger } from './recordingLogger.mjs'

// planted values. Spec look for them in every error, serialisation, log line
export const DRIVER_TEXT = 'could not serialize access due to concurrent update PLANTED-ROW-4242'
export const CONSTRAINT = 'planted_constraint_name_uq'
export const VALUE = 'planted-bound-value-s3cret'

export const noWait = (): Promise<void> => Promise.resolve()

// fake pool + recorded logger + recorded counter + options (no wait between retries). overrides win
export function txSetup(overrides: Partial<ITxOptions> = {}) {
	const log = recordingLogger()
	const counts: ITxCounterName[] = []
	const world = new FakeTxWorld()
	const options: ITxOptions = {
		logger: log.logger,
		errors: appErrors,
		counter: (name) => void counts.push(name),
		retryDelay: noWait,
		...overrides
	}
	return { log, counts, world, options }
}
