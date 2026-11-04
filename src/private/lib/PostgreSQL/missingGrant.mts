import type { IRoleAssertionSubject } from '@lib/PostgreSQL/error/IRoleAssertionSubject.mjs'
import type { ITxClient } from '@lib/PostgreSQL/tx/ITxClient.mjs'

import type { IRoleCheck } from './IRoleCheck.mjs'
import { missingColumn } from './missingColumn.mjs'
import { missingObject } from './missingObject.mjs'

/** What `check` finds missing, as a subject naming the object, the privilege and for a column the column; `undefined` when it is held. */
export function missingGrant(client: ITxClient, check: IRoleCheck): Promise<IRoleAssertionSubject | undefined> {
	return check.kind === 'columns' ? missingColumn(client, check) : missingObject(client, check)
}
