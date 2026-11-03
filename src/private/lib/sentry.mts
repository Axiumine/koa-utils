import { createSentryClient } from '@private/lib/createSentryClient.mjs'
import { importOptional } from '@private/lib/importOptional.mjs'

// @sentry/node is an optional peer. Top-level await is safe: every `exports` entry has only `import` and `types`
// conditions, so no CommonJS consumer can load this package. One ESM instance, so call sites stay synchronous and run
// in the same order as with a static import (see `tryCatchRethrow`, `scanVirus`).
const client = createSentryClient(await importOptional('@sentry/node', () => import('@sentry/node')))

// Same names and signatures as the SDK: a module swaps `import * as Sentry from '@sentry/node'` for this file and its
// `Sentry.captureException(...)` calls stay as they are.
export const captureException = client.captureException
export const captureMessage = client.captureMessage
export const withScope = client.withScope
