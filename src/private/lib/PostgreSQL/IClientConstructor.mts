import type { IClientShape } from './IClientShape.mjs'

/** The driver's `Client` class as the checked subclass needs it. */
export type IClientConstructor = new (config: Record<string, unknown>) => IClientShape
