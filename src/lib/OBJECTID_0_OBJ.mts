import { OBJECTID_0_STR } from '@lib/Constants.mjs'
import { Types } from 'mongoose'

/**
 * The all-zero sentinel id as a Mongoose `Types.ObjectId`. It has its own subpath so that `lib/Constants` and the
 * helpers that import it do not load `mongoose`.
 */
export const OBJECTID_0_OBJ = new Types.ObjectId(OBJECTID_0_STR)
