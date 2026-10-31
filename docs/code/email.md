# Email (SocketLabs)

This section documents the transactional email client used to send account-lifecycle emails (signup verification, password reset, OTP, account moderation notices, dev-team alerts) through [SocketLabs](https://www.socketlabs.com/). The package exposes a single class, `SocketLabsLib`, which wraps `@socketlabs/email`'s `SocketLabsClient`/`BasicMessage`, builds each message's copy (a mix of hard-coded strings and `platformName`-templated text), wraps it in an HTML template, and reports delivery failures to Sentry. The copy itself is built by small internal modules under `src/private/email/` (see [Internal Helpers](./internal.md#email--message-builders-and-html-escaping)), so each public method only names the builder and the recipient. All public send methods funnel through the same private `sendTemplate` helper, so template wrapping and Sentry error capture are centralized. Every value a method places in the HTML part is HTML-escaped (see [HTML escaping](#html-escaping)).

## `SocketLabsLib`

**Import:** `import { SocketLabsLib } from '@axiumine/koa-utils/email/SocketLabsLib'`

**Signature:**
```ts
export class SocketLabsLib {
	private readonly platformName: string
	private readonly linkBase: string
	private readonly emailFrom: string
	private client: any
	private readonly emailHtmlHeader1: string
	private readonly emailHtmlHeader2: string
	private readonly emailHtmlFooter: string

	constructor(htmlHeader1: string = '', htmlHeader2: string = '', htmlFooter: string = '')
}
```

Constructs a SocketLabs client and prepares the reusable HTML wrapper used by every send method. On instantiation it:

- Creates `new SocketLabsClient(parseInt(process.env.SOCKETLABS_SERVER_ID || '0'), \`${process.env.SOCKETLABS_SERVER_APIKEY}\`, { requestTimeout: 120, numberOfRetries: 3 })` — the API key is wrapped in a template literal, so when `SOCKETLABS_SERVER_APIKEY` is unset the client receives the string `"undefined"`, not JavaScript `undefined`.
- Reads `process.env.PLATFORM_NAME` into `platformName` (used in subjects/bodies and as the `emailFromName`).
- Reads `process.env.APP_DOMAIN` into `linkBase` (base URL used to build verification/reset links). It is not checked here: `new SocketLabsLib()` succeeds whatever `APP_DOMAIN` holds, and the base is validated when a send method builds a link from it (see [Link base validation](#link-base-validation)).
- Reads `process.env.EMAIL_FROM` into `emailFrom` (the `From` address for every message).
- If `htmlHeader1` / `htmlHeader2` / `htmlFooter` are not supplied (or are `''`), falls back to the internal boilerplate `FALLBACK_HEADER_1` / `FALLBACK_HEADER_2` / `FALLBACK_FOOTER` (an XHTML 1.0 Transitional doctype + a 600px centered table body, defined in `src/private/email/htmlFrame.mts`). These three fragments become `emailHtmlHeader1`, `emailHtmlHeader2`, `emailHtmlFooter` and are concatenated around every outgoing message body as `emailHtmlHeader1 + escapeHtml(subject) + emailHtmlHeader2 + htmlBody + emailHtmlFooter` (see `sendTemplate` below). The three fragments you pass in are inserted as HTML unchanged.
- Calls `dotenv.config()` at module load time.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| htmlHeader1 | string | First half of a custom HTML header (rendered before the subject). Defaults to the built-in fallback when `''`. Inserted as HTML, not escaped. |
| htmlHeader2 | string | Second half of a custom HTML header (rendered after the subject, before the body). Defaults to the built-in fallback when `''`. |
| htmlFooter | string | Custom HTML footer appended after the body. Defaults to the built-in fallback when `''`. |

**Notes:** Env vars read at construction: `SOCKETLABS_SERVER_ID`, `SOCKETLABS_SERVER_APIKEY`, `PLATFORM_NAME`, `APP_DOMAIN`, `EMAIL_FROM`. `alertDevTeam` additionally reads `DEV_TEAM_EMAIL` at send time. `client` is typed `any` (eslint-disabled) because `@socketlabs/email`'s `SocketLabsClient` type isn't imported directly for the field. All public send methods below are instance methods of this class, invoked as `new SocketLabsLib().sendXxx(...)`.

### HTML escaping

Every value a send method places in the HTML part is escaped for its context; the plain-text part and the subject line carry the raw value, because they are not HTML. One internal helper does the escaping, `escapeHtml` in `src/private/email/escapeHtml.mts`: it maps `&`, `<`, `>`, `"` and `'` to `&amp;`, `&lt;`, `&gt;`, `&quot;` and `&#39;` and leaves every other character, non-ASCII included, as it is. Text that is fixed in the library (the copy of the moderation notices, for example) is not escaped, so nothing is escaped twice.

| Value | Where it lands in the HTML part | Handling |
|---|---|---|
| `name` (every method that takes one) | greeting text | `escapeHtml` of the greeting (` ${name}`) |
| `err` of `alertDevTeam` | paragraph text | `escapeHtml` |
| `otp` of `sendSubscriptionEmail` and `sendOTP` | paragraph text | `escapeHtml` |
| `PLATFORM_NAME` (`platformName`) | paragraph text and link text | `escapeHtml` |
| the finished link (`linkBase` or `APP_DOMAIN`, `linkPath`, the address, the hash) | `href='...'` and the visible link text | `escapeHtml` of the whole URL, once as attribute value and once as text. The address inside the URL stays `encodeURI`-encoded as before, so the plain-text link is byte-identical; `encodeURIComponent` is not used because it would rewrite `@` and `+` in that link. |
| the subject | the `<title>` between the two header halves | `escapeHtml` (the subject line itself is unchanged) |
| `title` of `getHtmlHeader` | `<title>` | `escapeHtml` |
| `idPost`, `name`, `surname` and `_id` of `sendEmailPostReported` | paragraph text | `escapeHtml` |
| `times` of `wrongHash` | paragraph text | not escaped: it is a number |

Observable change in the HTML part only: a name, message, code or link that contains `&`, `<`, `>`, `"` or `'` now appears escaped in the HTML source (it renders as typed in the mail client). For example `&` inside the query string of the legacy reset link of `sendResetPwdConfirmationHash` is `&amp;` in the `href` and in the link text. Pass plain text, not text you escaped yourself: a value that already holds entities (a name of `O&#39;Brien`, a `PLATFORM_NAME` of `Tom &amp; Jerry`) is escaped again and its entity shows literally (`O&amp;#39;Brien`). Versions through 7.1.0 told you to escape such values before passing them; that advice is withdrawn for `name`, `err`, `otp`, the ids, the subject, `PLATFORM_NAME` and the per-call `linkBase`. Not escaped, by design: the `htmlHeader1`, `htmlHeader2` and `htmlFooter` fragments you pass to the constructor, which are inserted as HTML unchanged. The `linkBase` you supply (and `APP_DOMAIN`) is escaped with the rest of the URL, so a quote or angle bracket in it cannot leave the attribute, and its scheme is checked before it is used (next section).

### Link base validation

Every link a send method builds starts from a base: the `linkBase` argument of `sendEmailVerify` and `sendEmailReset`, or `APP_DOMAIN` (read once in the constructor) for those two when `linkBase` is omitted and always for `sendEmailChangeVerify`, `sendWelcome`, `sendSubscriptionEmail`, `sendResetPwdConfirmation` and `sendResetPwdConfirmationHash`. Escaping does not make a base safe: a `javascript:` base survives `escapeHtml` and becomes the target of the link. So before a base is placed in a link or an `href`, `httpLinkBase` (`src/private/email/messageParts.mts`) checks it with the WHATWG URL parser (`URL.parse`), judging the parsed URL and not a string prefix. A base passes only if all three hold:

- its parsed scheme is `http:` or `https:` (the parser lower-cases it, so `HTTPS://...` passes);
- the parsed URL has no user name and no password, because `https://good@evil.example` goes to `evil.example` while reading as `good`;
- the string contains no control character, no whitespace and no backslash, because the parser strips or rewrites those (`" javascript:..."` and `"java\tscript:..."` parse to the `javascript:` scheme, `\` becomes `/`), and the base is emitted as written, so what is checked has to be what is sent.

Everything else is refused: any other scheme (`javascript:` in any case or spelling, `data:`, `vbscript:`, `file:`, `ftp:`, `mailto:`, `ws:`, `blob:`), a scheme-relative `//evil.example`, a path, a host with no scheme (`example.com`, `localhost:3000`), the empty string, and the string `undefined` that an unset `APP_DOMAIN` turns into. A refused base makes the send method reject with `throwInternalError()`: HTTP status 500, title `Internal Server Error`, description `Error reported to Dev Team.` (see [`throwInternalError`](./graphql-errors.md#throwinternalerror)). No message is built and nothing is sent. A passing base is used exactly as given, with no lower-casing and no slash added, so every mail that was sent before is byte-for-byte the same.

Two consequences to know. `APP_DOMAIN` is checked when a link is built, not in the constructor, so a process with an unset or schemeless `APP_DOMAIN` still starts and still sends the mails that carry no link (`accountDisabled`, `wrongHash`, `sendOTP`, ...); a send that needs the base now rejects with the 500 above where it used to mail a broken link. A caller that wraps the send, such as `signUp` (inside its transaction) or the fire-and-forget reset mail, sees that rejection like any other send failure. Two post-commit callers catch it instead and report it to Sentry: `updatePassword` (the confirmation mail) and `enableEmailAccess` (the welcome mail of the email-verification link). In both the data change has already committed, so a rejection there must not turn a successful request into an error. For the verification link this means a deployment with a bad `APP_DOMAIN` still activates the account and redirects to `/x/registration-done`; only the welcome mail is lost. And a good per-call `linkBase` does not depend on `APP_DOMAIN`: it is the only base those two methods read when it is given.

### `sendEmailVerify(emailTo, hash, name = '', linkBase = APP_DOMAIN, linkPath = '/check/verify-email')`

**Signature:**
```ts
async sendEmailVerify(
	emailTo: string,
	hash: string,
	name: string = '',
	linkBase: string = this.linkBase,
	linkPath: string = '/check/verify-email'
): Promise<boolean>
```

Sends the signup verification email. Builds `link = ${linkBase}${linkPath}/${encodeURI(emailTo)}/${hash}` and an HTML anchor built from the escaped link (`htmlLink(link)`, which calls `StringLib.makeLink`). Subject is `Confirm your email for ${platformName}`; body text asks the recipient to confirm registration by opening the link.

`linkBase` and `linkPath` were added in 5.8.0 and are the only two link segments in this class that are not fixed at construction. They exist because one backend can register accounts for more than one front-end — a customer site alongside an operator panel, say — and each audience's confirmation link has to land on that audience's own domain, which a single constructor-time `APP_DOMAIN` read cannot express. Both default to the pre-5.8.0 behaviour exactly, so existing callers are unaffected.

A trailing slash on `linkBase` and a missing leading slash on `linkPath` are normalised away before the join: the caller supplies configuration, not a pre-joined URL, so `//check` and `example.comcheck` are corrected rather than surfaced to a user mid-registration.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| emailTo | string | Recipient address. |
| hash | string | Verification hash embedded in the confirmation link. |
| name | string | Optional recipient name; prefixed with a space (`fixName`) and interpolated as `Hi${nameFixed},`; escaped in the HTML part. |
| linkBase | string | Scheme + host the confirmation link points at. Defaults to the instance's `linkBase`, i.e. `APP_DOMAIN`. Must be an absolute `http:` / `https:` URL, otherwise the call rejects with the 500 `Internal Server Error` (see [Link base validation](#link-base-validation)). Trailing slashes are stripped. |
| linkPath | string | Route prefix the receiving service listens on. Defaults to `/check/verify-email`. A leading slash is added when absent. |

**Returns:** `Promise<boolean>` — `true` if SocketLabs accepted the send, `false` if the send call rejected (captured to Sentry inside `sendTemplate`).

### `sendEmailChangeVerify(emailTo, hash, name = '')`

**Signature:**
```ts
async sendEmailChangeVerify(emailTo: string, hash: string, name: string = ''): Promise<boolean>
```

Sends the email-change verification email, used when a user changes their login email. Link is `${linkBase}/check/verify-change-email/${encodeURI(emailTo)}/${hash}`. Subject reuses the same `Confirm your email for ${platformName}` copy as `sendEmailVerify`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| emailTo | string | Recipient address (the new email being confirmed). |
| hash | string | Verification hash embedded in the confirmation link. |
| name | string | Optional recipient name, same `fixName` treatment; escaped in the HTML part. |

**Returns:** `Promise<boolean>` — send success/failure.

### `sendWelcome(emailTo)`

**Signature:**
```ts
async sendWelcome(emailTo: string): Promise<boolean>
```

Sends a welcome email after successful signup/activation. Subject: `Welcome to ${platformName}`. Body links to the platform home (`htmlLink(linkBase, platformName)`, both escaped). Its link base is `APP_DOMAIN`, checked by [Link base validation](#link-base-validation): when `APP_DOMAIN` is unset or is not an absolute `http(s)` URL the call rejects with the 500 `Internal Server Error` instead of resolving `false`. The one library caller, `enableEmailAccess`, catches that rejection and reports it to Sentry, because the account is already activated when the mail is sent.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| emailTo | string | Recipient address. |

**Returns:** `Promise<boolean>` — send success/failure.

### `accountDisabled(emailTo)`

**Signature:**
```ts
async accountDisabled(emailTo: string): Promise<boolean>
```

Notifies the user their account has been disabled. Fixed copy: subject `Your account has been disabled`; body `Hi, we are sorry but your account has been disabled. Contact us for more information.`

**Parameters:**

| Name | Type | Description |
|---|---|---|
| emailTo | string | Recipient address. |

**Returns:** `Promise<boolean>` — send success/failure.

### `accountBanned(emailTo)`

**Signature:**
```ts
async accountBanned(emailTo: string): Promise<boolean>
```

Notifies the user their account has been banned. Fixed copy: subject `Your account has been banned`; body `Hi, we are sorry but your account has been banned. Contact us for more information.`

**Parameters:**

| Name | Type | Description |
|---|---|---|
| emailTo | string | Recipient address. |

**Returns:** `Promise<boolean>` — send success/failure.

### `alertDevTeam(err)`

**Signature:**
```ts
async alertDevTeam(err: string): Promise<boolean>
```

Sends an internal alert to the dev team when a 500-level error occurs. Recipient is always `process.env.DEV_TEAM_EMAIL` (ignores any concept of `emailTo`). Subject: `${platformName} error 500`; body embeds `err` in the text part as is (`'error 500 ' + err`) and in the HTML part escaped (`'<p>error 500 <br><br>' + escapeHtml(err) + '</p>'`). A value that is not a string is converted with `String()`, as the old concatenation did.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| err | string | Error message/detail to report. Raw in the text part, HTML-escaped in the HTML part. |

**Returns:** `Promise<boolean>` — send success/failure.

**Notes:** Env var `DEV_TEAM_EMAIL` is read at call time.

### `wrongHash(emailTo, times)`

**Signature:**
```ts
async wrongHash(emailTo: string, times: number): Promise<boolean>
```

Notifies the user that they submitted an incorrect activation/verification hash, and how many attempts remain. If `times > 5`, calls `throwInternalError()` instead of sending. Otherwise, `remainingTimes = 5 - times`; subject is `Wrong activation link` and the body reads `Hi, you or someone else is trying to verify your email with a wrong link. You have ${remainingTimes} attempts remaining.`

**Parameters:**

| Name | Type | Description |
|---|---|---|
| emailTo | string | Recipient address. |
| times | number | Number of failed hash attempts so far. |

**Returns:** `Promise<boolean>` — send success/failure (when `times <= 5`).

**Throws:** `500 Internal Server Error` (via `throwInternalError()` from `@throw/throwInternalError.mjs`, message `Error reported to Dev Team.`) — when `times > 5`.

### `tooMuchVerifyRequests(emailTo)`

**Signature:**
```ts
async tooMuchVerifyRequests(emailTo: string): Promise<boolean>
```

Notifies the user they've exceeded the allowed number of email-verification attempts and must repeat the registration request. Fixed copy, subject `Too many attempts to verify your email`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| emailTo | string | Recipient address. |

**Returns:** `Promise<boolean>` — send success/failure.

### `hashReqTooOld(emailTo)`

**Signature:**
```ts
async hashReqTooOld(emailTo: string): Promise<boolean>
```

Notifies the user that the activation link they're using is more than 3 days old and expired, and that they must repeat the registration request. Subject: `Activation link expired`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| emailTo | string | Recipient address. |

**Returns:** `Promise<boolean>` — send success/failure.

### `emailAlreadyValid(emailTo)`

**Signature:**
```ts
async emailAlreadyValid(emailTo: string): Promise<boolean>
```

Notifies the user their account is already active/valid and they can log in directly. Subject: `Account already valid`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| emailTo | string | Recipient address. |

**Returns:** `Promise<boolean>` — send success/failure.

**Notes:** Sent from `signUp`'s duplicate-account path alongside a 409 throw (see `graphQL/schema/mutations/signUp.mts` — both the "already valid" email and the 409 error are intentional for privacy/timing reasons; do not remove either side).

### `sendSubscriptionEmail(emailTo, otp)`

**Signature:**
```ts
async sendSubscriptionEmail(emailTo: string, otp: string): Promise<boolean>
```

Sends an OTP-based subscription-activation email. Subject: `` Activate your ${platformName} account ``. Builds `url = ${linkBase}/x/emailVerify` and includes both a clickable link and the `otp` code in the body (`otp` is escaped in the HTML part).

**Parameters:**

| Name | Type | Description |
|---|---|---|
| emailTo | string | Recipient address. |
| otp | string | One-time activation code shown in the email body; HTML-escaped in the HTML part. |

**Returns:** `Promise<boolean>` — send success/failure.

### `sendResetPwdConfirmation(emailTo, name = '')`

**Signature:**
```ts
async sendResetPwdConfirmation(emailTo: string, name: string = ''): Promise<boolean>
```

Confirms that a password reset has completed and the user can now log in. Subject: `Password reset for ${platformName}`. Links to `linkBase` (the platform home), not a hash-specific URL.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| emailTo | string | Recipient address. |
| name | string | Optional recipient name, `fixName`-prefixed. |

**Returns:** `Promise<boolean>` — send success/failure.

### `sendResetPwdConfirmationHash(email, name, hash)`

**Signature:**
```ts
async sendResetPwdConfirmationHash(email: string, name: string, hash: string): Promise<boolean>
```

Legacy password-reset confirmation email. Subject: `` Password change confirmation for ${platformName} ``, used both as the sent subject and inside the HTML body via `getHtmlHeader(subject)` (the title is escaped). Builds `linkReset = linkBase + '/index.php?q=reset&hash=' + hash + '&email=' + encodeURI(email)`; the plain-text part does not carry it, and in the HTML part the whole URL is escaped, so its `&` separators read `&amp;`. Unlike the other send methods, the HTML body here is built with the public `getHtmlHeader(subject)` / `getHtmlFooter()` helpers (a full standalone `<html>...</html>` document) rather than relying only on the constructor's `emailHtmlHeader1/2`/`emailHtmlFooter` fallback — because `sendTemplate` unconditionally wraps whatever `htmlBody` it's given with `emailHtmlHeader1 + escapeHtml(subject) + emailHtmlHeader2 + htmlBody + emailHtmlFooter`, the final message ends up with the fallback template wrapped around a second, complete HTML document. This double-wrapping is a pre-existing behavior, not a bug introduced here. Send errors are caught locally: on failure, `Sentry.captureException(e)` is called and the method returns `false` instead of throwing.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| email | string | Recipient address. |
| name | string | Recipient name (no default; always interpolated as `'Hi ' + name`, unlike the other methods' `fixName` treatment). HTML-escaped in the HTML part. |
| hash | string | Reset-confirmation hash embedded in `linkReset` (escaped as part of the URL in the HTML part). |

**Returns:** `Promise<boolean>` — the `sendTemplate` result on success, or `false` if the send throws (reported to Sentry).

### `sendEmailReset(emailTo, hash, name = '', linkBase = APP_DOMAIN, linkPath = '/x/reset')`

**Signature:**
```ts
async sendEmailReset(
	emailTo: string,
	hash: string,
	name: string = '',
	linkBase: string = this.linkBase,
	linkPath: string = '/x/reset'
): Promise<boolean>
```

Sends the "reset your password" email with a hash-bearing link. Builds `link = ${linkBase}${linkPath}/${encodeURI(emailTo)}/${hash}`. Subject: `Password reset for ${platformName}`.

`linkBase` and `linkPath` were added in 5.9.0, for the reason `sendEmailVerify` got them in 5.8.0: one backend serving two front-ends has two hosts and a single constructor-time `APP_DOMAIN` read cannot express both, so a customer asking for a reset was mailed the operator panel — a page that cannot complete the reset. The pair has to move together with the verification one, because an account that confirmed its address on one front-end and then resets its password on another has been sent to two different sites for two halves of the same login. Both default to the pre-5.9.0 behaviour exactly, and the same trailing-slash / missing-leading-slash normalisation applies.

⚠️ Unlike `sendEmailVerify`'s, this link is consumed by a **front-end route**, not by a backend router: the page reads the email and hash out of its own path and calls `updatePassword`. `linkPath` therefore names a route in whatever app `linkBase` serves and has to agree with that app's router, not with a service mount point. Nothing on the server fails when it does not — only a person following a dead link ever finds out. Most callers should reach this through [`createResetPwdMailer`](./lib-access.md#resetpwdmailer) rather than passing the two arguments here directly.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| emailTo | string | Recipient address. |
| hash | string | Reset hash embedded in the link. |
| name | string | Optional recipient name, `fixName`-prefixed; escaped in the HTML part. |
| linkBase | string | Scheme + host the reset link points at. Defaults to the instance's `linkBase`, i.e. `APP_DOMAIN`. Must be an absolute `http:` / `https:` URL, otherwise the call rejects with the 500 `Internal Server Error` (see [Link base validation](#link-base-validation)). Trailing slashes are stripped. |
| linkPath | string | Front-end route prefix that renders the new-password form. Defaults to `/x/reset`. A leading slash is added when absent. |

**Returns:** `Promise<boolean>` — send success/failure.

### `htmlFooter()`

**Signature:**
```ts
htmlFooter(): string
```

Public "fallback footer" fragment: `'</p></td>' + '  </tr>' + ' </table>' + '</body>'` (`FALLBACK_FOOTER` in `src/private/email/htmlFrame.mts`). Marked with a `/** fallback footer */` doc comment and callable externally. Its output is identical to `getHtmlFooter()`.

**Returns:** `string` — closing `</p></td></tr></table></body>` HTML fragment.

### `sendOTP(emailTo, otp)`

**Signature:**
```ts
async sendOTP(emailTo: string, otp: string): Promise<boolean>
```

Sends a one-time-password email. Subject: `` OTP code for ${platformName} ``; body text: `` To confirm your subscription on ${platformName}, enter the following OTP code: ${otp} `` (text and HTML; in the HTML part `platformName` and `otp` are escaped).

**Parameters:**

| Name | Type | Description |
|---|---|---|
| emailTo | string | Recipient address. |
| otp | string | One-time password code shown in the email body; HTML-escaped in the HTML part. |

**Returns:** `Promise<boolean>` — the `sendTemplate` result on success, or `false` if the send throws. Errors thrown while sending are caught and reported to Sentry via `Sentry.captureException(e)` rather than propagated.

### `sendEmailPostReported(userInfo, idPost)`

**Signature:**
```ts
async sendEmailPostReported(userInfo: IUserInfo, idPost: number | string): Promise<boolean>
```

Sends an internal notification that a post has been reported/flagged to `process.env.DEV_TEAM_EMAIL`, the same recipient `alertDevTeam` uses. Subject: `'Post ' + idPost + ' reported'`. Body interpolates the reporting user's name/surname/id from `userInfo` and the post id; these come from user data, so they are escaped in the HTML part and raw in the text part. Uses `getHtmlHeader(subject)` / `getHtmlFooter()` to build the HTML body (same double-wrapping consideration as `sendResetPwdConfirmationHash`, since `sendTemplate` re-wraps it again).

**Parameters:**

| Name | Type | Description |
|---|---|---|
| userInfo | `IUserInfo` | Info about the user who filed the report (module-internal interface — shape below). |
| idPost | number \| string | Identifier of the reported post, interpolated into subject/body (escaped in the HTML part and in the HTML `<title>`). |

`IUserInfo` shape: `{ _id: string; personalData: { name: string; surname: string } }`.

**Returns:** `Promise<boolean>` — send success/failure.

**Notes:** `IUserInfo` is declared in this file but not exported and has no `package.json` export entry — it is internal to `SocketLabsLib`. An earlier, near-identical implementation of this method is preserved as a commented-out block above `sendEmailChangeVerify` in the source, along with a `@fixme` note about handling `ECONNABORTED` timeout retries from SocketLabs.

### `getHtmlHeader(title)`

**Signature:**
```ts
getHtmlHeader(title: string): string
```

Public helper that returns a complete standalone HTML document opening (doctype, `<html>`, `<head>` with the given `title` in a `<title>` tag, viewport meta, then `<body>` and an opening 600px-wide centered `<table>`/`<tr>`/`<td>`/`<p>`). Used by `sendResetPwdConfirmationHash` and `sendEmailPostReported` to build their HTML bodies. The `title` argument is HTML-escaped before it goes into `<title>title</title>`; pass plain text, not pre-escaped text.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| title | string | Plain text used as the document `<title>` (also typically the email subject); escaped by the method. |

**Returns:** `string` — opening HTML fragment ending mid-`<p>`, to be closed by `getHtmlFooter()`.

### `getHtmlFooter()`

**Signature:**
```ts
getHtmlFooter(): string
```

Public closing counterpart to `getHtmlHeader`: `'</p></td>' + '  </tr>' + ' </table>' + '</body>'`. Identical output to `htmlFooter()`.

**Returns:** `string` — closing `</p></td></tr></table></body>` HTML fragment.

### `sendTemplate(emailTo, content)` — private

**Import:** _internal — not exported_.

**Signature:**
```ts
private async sendTemplate(emailTo: string, content: IEmailContent): Promise<boolean>
```

Called by every public send method (`sendEmailVerify`, `sendEmailChangeVerify`, `sendWelcome`, `accountDisabled`, `accountBanned`, `alertDevTeam`, `wrongHash`, `tooMuchVerifyRequests`, `hashReqTooOld`, `emailAlreadyValid`, `sendSubscriptionEmail`, `sendResetPwdConfirmation`, `sendResetPwdConfirmationHash`, `sendEmailReset`, `sendOTP`, `sendEmailPostReported`). Builds a `BasicMessage` from `@socketlabs/email`: sets from-address/name (`emailFrom` / `platformName`), the subject, the text body, and an HTML body computed as `emailHtmlHeader1 + escapeHtml(subject) + emailHtmlHeader2 + htmlBody + emailHtmlFooter` (every message is wrapped in the constructor's header/footer template, with the HTML-escaped subject re-inserted between the two header halves), then sets the recipient and calls `client.send(basicMessage)`. The subject line and the text body are set unescaped.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| emailTo | string | Recipient address. |
| content | `IEmailContent` | `{ subject, textBody, htmlBody }` as built by the internal message modules; every value inside `htmlBody` is already escaped. Module-internal interface, `src/private/email/IEmailContent.mts`. |

**Returns:** `Promise<boolean>` — `true` on successful SocketLabs API acknowledgement; `false` if the send promise rejects.

**Notes:** On rejection, calls `Sentry.captureException(e, { extra: { detail: 'Error in sending the email' } })` and resolves `false` rather than rethrowing — callers never see the underlying SocketLabs error object directly. `sendOTP` and `sendResetPwdConfirmationHash` additionally run the send through the internal `orFalse` helper, which turns any throw into a Sentry report and `false`.
