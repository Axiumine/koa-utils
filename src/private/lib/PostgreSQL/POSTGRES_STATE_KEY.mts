/**
 * The key under which every copy of this package finds the registry of the PostgreSQL kit on `globalThis`. A registry
 * symbol, so two copies loaded from two places agree on it without sharing a module.
 */
export const POSTGRES_STATE_KEY = Symbol.for('@axiumine/koa-utils/postgres-state')
