import type { IRoleColumnCheck } from './IRoleColumnCheck.mjs'
import type { IRoleObjectCheck } from './IRoleObjectCheck.mjs'

/** One expected grant after its shape was checked. */
export type IRoleCheck = IRoleColumnCheck | IRoleObjectCheck
