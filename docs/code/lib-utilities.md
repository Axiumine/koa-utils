# Lib — Utility Classes

This section documents the small, dependency-free helper classes in `src/lib/`: `ArrayLib`, `DateLib`, `NumLib` and `StringLib`, plus the standalone `buildPrefixedRedisKey` function in `src/lib/Redis/`. They provide array diffing, legacy date parsing/formatting, locale-tolerant number parsing, string/HTML/random-value helpers used throughout the resolvers and middleware, and Redis key prefixing. **Import note:** despite the shared naming convention, only `DateLib` and `NumLib` expose `static` methods callable directly on the class; `ArrayLib` and `StringLib` declare plain instance methods, so consumers must `new` them first (e.g. `new StringLib().makeLink(...)`); `buildPrefixedRedisKey` is a plain function, not a class member. `RedisBoolean` and its `toRedisBooleanValue` / `fromRedisBooleanValue` codec are documented in [Lib — DB Error Mapping & Redis Booleans](./lib-datasource-errors.md), not here.

## `ArrayLib`

**Import:** `import { ArrayLib } from '@axiumine/koa-utils/lib/ArrayLib'`

**Signature:**
```ts
export class ArrayLib {
	constructor()
	arrDiff(arr1: string[], arr2: string[]): string[]
}
```

A tiny array-comparison helper. All members are **instance** methods (no `static`), so it must be instantiated: `new ArrayLib().arrDiff(a, b)`.

### `arrDiff(arr1, arr2)`

**Signature:**
```ts
arrDiff(arr1: string[], arr2: string[]): string[]
```

Sorts the two input arrays by length (ascending), builds a `Set` from the shorter one, then returns every element of the longer array that is **not** present in that set. This is a one-directional difference (elements unique to the longer array with respect to the shorter one) rather than a full symmetric difference — elements that exist only in the shorter array are never returned.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| arr1 | string[] | First array to compare. |
| arr2 | string[] | Second array to compare. |

**Returns:** `string[]` — elements of the longer of the two arrays that are absent from the shorter array's value set.

## `DateLib`

**Import:** `import { DateLib } from '@axiumine/koa-utils/lib/DateLib'`

**Signature:**
```ts
export const DateLib = class DateLib {
	constructor()
	static getDate(dateNum: Date): { year: number; date: Date }
	static minElapsed(dt: Date): number
	static timeDiffMin(lastReq: number, now: number): number
}
```

Legacy date-parsing and elapsed-time helpers. All members are `static` — call them directly on the class (`DateLib.timeDiffMin(...)`), no instantiation needed.

### `DateLib.getDate(dateNum)`

**Signature:**
```ts
static getDate(dateNum: Date): { year: number; date: Date }
```

Calls `.toString()` on the input and slices fixed-width substrings out of the result as if it were a compact 14-digit `YYYYMMDDHHmmss` numeric string (`year` = chars 0-4, `month` = 4-6, `day` = 6-8, `hours` = 8-10, `min` = 10-12, `sec` = 12-14), then rebuilds a UTC `Date` via `Date.UTC(year, month - 1, day, hours, min, sec)`. This only produces a correct result if the value's string form is actually such a numeric string — a real JS `Date` instance's own `.toString()` (e.g. `"Wed Jul 18 2026 ..."`) will **not** parse correctly despite the parameter being typed `Date`. Treat the type annotation as legacy/loose rather than literal.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| dateNum | Date | Value whose `.toString()` output is expected to be a 14-digit `YYYYMMDDHHmmss` numeric string. |

**Returns:** `{ year: number; date: Date }` — the parsed 4-digit year and a UTC `Date` built from the parsed components.

### `DateLib.minElapsed(dt)`

**Signature:**
```ts
static minElapsed(dt: Date): number
```

Computes how many whole minutes have elapsed between `dt` and the current time by delegating to `DateLib.timeDiffMin`. Has a debug side effect: it logs both the comparison timestamp and the current time via `console.debug` (Italian comments: "stampa date di confronto" / print dates for comparison) before returning.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| dt | Date | The reference timestamp to compare against "now". |

**Returns:** `number` — elapsed whole minutes between `dt` and now (order-independent, always non-negative).

**Notes:** Emits `console.debug` output on every call (per project convention this must not be stripped).

### `DateLib.timeDiffMin(lastReq, now)`

**Signature:**
```ts
static timeDiffMin(lastReq: number, now: number): number
```

Returns the absolute difference between two epoch-millisecond timestamps, floored down to whole minutes.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| lastReq | number | First timestamp, in epoch milliseconds. |
| now | number | Second timestamp, in epoch milliseconds. |

**Returns:** `number` — `Math.floor(|lastReq - now| / 60000)`, i.e. whole minutes between the two timestamps regardless of which is larger.

## `NumLib`

**Import:** `import { NumLib } from '@axiumine/koa-utils/lib/NumLib'`

**Signature:**
```ts
export class NumLib {
	constructor()
	static parseFloatFixed(val: string): number
}
```

Single-purpose numeric helper for locale-tolerant decimal parsing. Its member is `static`.

### `NumLib.parseFloatFixed(val)`

**Signature:**
```ts
static parseFloatFixed(val: string): number
```

Replaces every comma (`,`) in the input with a period (`.`) — since native `parseFloat` only recognizes `.` as the decimal separator — then parses the result with `parseFloat`. Use this for user-entered numbers that may use a European-style comma decimal separator (e.g. `"3,14"` → `3.14`).

**Parameters:**

| Name | Type | Description |
|---|---|---|
| val | string | Numeric string, potentially using `,` as the decimal separator. |

**Returns:** `number` — the parsed floating-point value, or `NaN` if the (comma-normalized) string isn't numeric.

## `StringLib`

**Import:** `import { StringLib } from '@axiumine/koa-utils/lib/StringLib'`

**Signature:**
```ts
export class StringLib {
	constructor()
	cleanHtml(str: string): string
	cleanHtmlUndefined(str: string | undefined): string | undefined
	randomString(length: number): string
	getRandomOTP(): string
	getRandomArbitrary(min: number, max: number): number
	isoToTimestamp(isoStr: Date): number
	isoFormatDMY(data: string): string
	isoFormatDateTime(data: string): string
	makeLink(link: string, linkText?: string): string
}
```

String/HTML sanitizing, random-value generation, date formatting and link-building helpers. All members are **instance** methods (no `static`); instantiate with `new StringLib()` before calling.

### `cleanHtml(str)`

**Signature:**
```ts
cleanHtml(str: string): string
```

Strips every HTML tag from the string using the regex `/(<([^>]+)>)/gi`, replacing each match with an empty string. Does not decode entities or sanitize attributes beyond tag removal.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| str | string | Input string potentially containing HTML markup. |

**Returns:** `string` — the input with all `<tag>` occurrences removed.

### `cleanHtmlUndefined(str)`

**Signature:**
```ts
cleanHtmlUndefined(str: string | undefined): string | undefined
```

Same tag-stripping behavior as `cleanHtml`, but passes `undefined` straight through unchanged instead of throwing, for optional string fields.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| str | string \| undefined | Input string, or `undefined`. |

**Returns:** `string \| undefined` — `undefined` if the input was `undefined`, otherwise the HTML-stripped string.

### `randomString(length)`

**Signature:**
```ts
randomString(length: number): string
```

Generates a cryptographically random string of exactly `length` characters: draws `length` bytes from `node:crypto`'s `randomBytes`, then maps each byte to one character of a 32-character alphabet (`0123456789abcdefghijklmnopqrstuv`, a subset of base36) via `byte % 32`. Since `256 % 32 === 0` the mapping is uniform with no modulo bias, so no rejection/retry branch is needed, and one byte always produces exactly one output character (no accumulate-then-truncate step). This is the generator behind every password-reset and email-confirmation hash in the package; it replaced a `Math.random()`-based implementation in v4.0.0 because `Math.random()` is not a CSPRNG — V8 implements it as xorshift128+, whose internal state is recoverable from a modest number of observed outputs, after which every future value is predictable, which made those hashes guessable regardless of their length. At 5 bits of entropy per character, a 50-character hash carries 250 bits.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| length | number | Desired output string length. |

**Returns:** `string` — a cryptographically random string of exactly `length` characters, drawn from the 32-character alphabet `0123456789abcdefghijklmnopqrstuv`.

### `getRandomOTP()`

**Signature:**
```ts
getRandomOTP(): string
```

Generates a 6-digit numeric one-time-password by calling `this.getRandomArbitrary(100000, 999999)` and stringifying the result.

**Returns:** `string` — a 6-digit numeric OTP (as a string, no leading zeros possible since the range starts at `100000`).

### `getRandomArbitrary(min, max)`

**Signature:**
```ts
getRandomArbitrary(min: number, max: number): number
```

Returns a cryptographically random integer via `node:crypto`'s `randomInt`, not `Math.random()`. Truncates both bounds to integers (`lo = Math.trunc(min)`, `range = Math.max(0, Math.trunc(max) - lo)`); if `range` is `0` it returns `lo` directly, otherwise it delegates to `randomInt(lo, lo + range)`, which is uniform over `[lo, lo + range)` with no low-end bias. This backs `getRandomOTP()`, so one-time passwords are unpredictable rather than derived from the pre-v4.0.0 `Math.random()` implementation.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| min | number | Inclusive lower bound (truncated to an integer via `Math.trunc`). |
| max | number | Exclusive upper bound (truncated to an integer via `Math.trunc`). |

**Returns:** `number` — a cryptographically random integer in `[Math.trunc(min), Math.trunc(max))`, or `Math.trunc(min)` if that range is empty.

### `isoToTimestamp(isoStr)`

**Signature:**
```ts
isoToTimestamp(isoStr: Date): number
```

Returns `isoStr.getTime()`. Despite the parameter name, it expects an already-constructed `Date` instance (not an ISO string) — the commented-out code above it shows an older version that parsed a string via `new Date(isoStr)` first; that conversion has been removed.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| isoStr | Date | A `Date` instance (name is a holdover from a prior string-based signature). |

**Returns:** `number` — epoch milliseconds (`Date.prototype.getTime()`).

### `isoFormatDMY(data)`

**Signature:**
```ts
isoFormatDMY(data: string): string
```

Parses `data` with `new Date(data)` and formats it as `D/M/YYYY` using UTC getters (`getUTCDate`, `getUTCMonth`, `getUTCFullYear`); no zero-padding on day or month.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| data | string | A date string parseable by the `Date` constructor. |

**Returns:** `string` — the date formatted as `D/M/YYYY` (UTC, unpadded).

### `isoFormatDateTime(data)`

**Signature:**
```ts
isoFormatDateTime(data: string): string
```

Parses `data` with `new Date(data)` and formats it as `D/M/YYYY H:MM:SS`. The date portion (day/month/year) uses **UTC** getters, but the time portion (hours/minutes/seconds) uses **local** getters (`getHours`, `getMinutes`, `getSeconds`) — a mixed UTC/local quirk, preserved as-is. Minutes and seconds are zero-padded to two digits when `< 10`; hours and day/month are not padded.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| data | string | A date string parseable by the `Date` constructor. |

**Returns:** `string` — `D/M/YYYY H:MM:SS`, with the date in UTC and the time in the host's local timezone.

### `makeLink(link, linkText)`

**Signature:**
```ts
makeLink(link: string, linkText: string = ''): string
```

Builds an HTML anchor tag opening in a new tab: `<a target='_blank' href='${link}'>${linkText === '' ? link : linkText}</a>`. If `linkText` is omitted (or an empty string), the link URL itself is used as the visible text.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| link | string | URL to use as the `href`. |
| linkText | string | Visible link text; defaults to `''`, which falls back to displaying `link` itself. |

**Returns:** `string` — an `<a target='_blank' href="...">...</a>` HTML string.

## `buildPrefixedRedisKey`

**Import:** `import { buildPrefixedRedisKey } from '@axiumine/koa-utils/lib/Redis/buildPrefixedRedisKey'`

**Signature:**
```ts
export function buildPrefixedRedisKey(prefix: 'access:' | 'refresh:', token: string): string
```

A standalone function (not a class member). Builds a Redis session key by adding its namespace prefix (`'access:'` or `'refresh:'`) — unless `token` already carries it, in which case `token` is returned unchanged. `ctx.state.user.refreshToken` / `accessToken` arrive already prefixed from this package's own `authenticatedLogoutHandler` / `authenticatedAuthorizationHandler`, but a consumer wiring `ctx.state.user` by hand may pass a bare uuid; accepting both shapes means the caller never builds `'refresh:refresh:<uuid>'` and deletes a key that was never written.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| prefix | 'access:' \| 'refresh:' | The Redis key namespace to ensure is present. |
| token | string | A raw uuid, or a token that may already carry `prefix`. |

**Returns:** `string` — `token` unchanged if it already starts with `prefix`, otherwise `` `${prefix}${token}` ``.
