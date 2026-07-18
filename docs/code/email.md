# Email (SocketLabs)

This section documents the transactional email client used to send account-lifecycle emails (signup verification, password reset, OTP, account moderation notices, dev-team alerts) through [SocketLabs](https://www.socketlabs.com/). The package exposes a single class, `SocketLabsLib`, which wraps `@socketlabs/email`'s `SocketLabsClient`/`BasicMessage`, builds each message's Italian-language copy, wraps it in an HTML template, and reports delivery failures to Sentry. All send methods funnel through the same private `sendEmail` helper, so template wrapping and Sentry error capture are centralized.

## `SocketLabsLib`

**Import:** `import { SocketLabsLib } from '@axiumine/koa-utils/email/SocketlabsLib'`

> The `package.json` `exports` key is `./email/SocketlabsLib` (lower-case `labs`) even though the source file is `src/email/SocketLabsLib.mts` and the exported class is `SocketLabsLib` (upper-case `Labs`). Import using the exact casing of the export key, not the filename or class name.

**Signature:**
```ts
export class SocketLabsLib {
	private StringObj: StringLib
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

- Creates `new SocketLabsClient(parseInt(process.env.SOCKETLABS_SERVER_ID || '0'), process.env.SOCKETLABS_SERVER_APIKEY, { requestTimeout: 120, numberOfRetries: 3 })`.
- Reads `process.env.PLATFORM_NAME` into `platformName` (used in subjects/bodies and as the `emailFromName`).
- Reads `process.env.APP_DOMAIN` into `linkBase` (base URL used to build verification/reset links).
- Reads `process.env.EMAIL_FROM` into `emailFrom` (the `From` address for every message).
- If `htmlHeader1` / `htmlHeader2` / `htmlFooter` are not supplied (or are `''`), falls back to the private `htmlHeader1()` / `htmlHeader2()` / `htmlFooter()` boilerplate (an XHTML 1.0 Transitional doctype + a 600px centered table body). These three fallback fragments become `emailHtmlHeader1`, `emailHtmlHeader2`, `emailHtmlFooter` and are concatenated around every outgoing message body as `emailHtmlHeader1 + subject + emailHtmlHeader2 + htmlBody + emailHtmlFooter` (see `sendEmail` below).
- Calls `dotenv.config()` at module load time.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| htmlHeader1 | string | First half of a custom HTML header (rendered before the subject). Defaults to the built-in fallback when `''`. |
| htmlHeader2 | string | Second half of a custom HTML header (rendered after the subject, before the body). Defaults to the built-in fallback when `''`. |
| htmlFooter | string | Custom HTML footer appended after the body. Defaults to the built-in fallback when `''`. |

**Notes:** Env vars read at construction: `SOCKETLABS_SERVER_ID`, `SOCKETLABS_SERVER_APIKEY`, `PLATFORM_NAME`, `APP_DOMAIN`, `EMAIL_FROM`. `alertDevTeam` additionally reads `DEV_TEAM_EMAIL` at send time. `client` is typed `any` (eslint-disabled) because `@socketlabs/email`'s `SocketLabsClient` type isn't imported directly for the field. All public send methods below are instance methods of this class, invoked as `new SocketLabsLib().sendXxx(...)`.

### `sendEmailVerify(emailTo, hash, name = '')`

**Signature:**
```ts
async sendEmailVerify(emailTo: string, hash: string, name: string = ''): Promise<boolean>
```

Sends the signup verification email. Builds `link = ${linkBase}/check/verify-email/${encodeURI(emailTo)}/${hash}` and an HTML anchor via `StringObj.makeLink(link)`. Subject is `Conferma l'email per ${platformName}`; body text (Italian) asks the recipient to confirm registration by opening the link.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| emailTo | string | Recipient address. |
| hash | string | Verification hash embedded in the confirmation link. |
| name | string | Optional recipient name; prefixed with a space via `fixName` and interpolated as `Ciao${nameFixed},`. |

**Returns:** `Promise<boolean>` — `true` if SocketLabs accepted the send, `false` if the send call rejected (captured to Sentry inside `sendEmail`).

### `sendEmailChangeVerify(emailTo, hash, name = '')`

**Signature:**
```ts
async sendEmailChangeVerify(emailTo: string, hash: string, name: string = ''): Promise<boolean>
```

Sends the email-change verification email, used when a user changes their login email. Link is `${linkBase}/check/verify-change-email/${encodeURI(emailTo)}/${hash}`. Subject reuses the same `Conferma l'email per ${platformName}` copy as `sendEmailVerify`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| emailTo | string | Recipient address (the new email being confirmed). |
| hash | string | Verification hash embedded in the confirmation link. |
| name | string | Optional recipient name, same `fixName` treatment. |

**Returns:** `Promise<boolean>` — send success/failure.

**Notes:** The HTML body literal contains a stray `" +` sequence from an incomplete string-concatenation cleanup (`...accedi.<br><br>" +\n      'Puoi confermare...`) — this is copied verbatim into the outgoing email HTML rather than being valid template syntax; it is a pre-existing source quirk, not corrected here.

### `sendWelcome(emailTo)`

**Signature:**
```ts
async sendWelcome(emailTo: string): Promise<boolean>
```

Sends a welcome email after successful signup/activation. Subject: `Benvenuto su ${platformName}`. Body links to the platform home (`StringObj.makeLink(linkBase, platformName)`).

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

Notifies the user their account has been disabled. Fixed Italian copy: subject `Il tuo account è stato disabilitato`; body `Ciao, ci spiace ma il tuo account è stato disabilitato. Contattaci per maggiori informazioni.`

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

Notifies the user their account has been banned. Fixed Italian copy: subject `Il tuo account è stato bannato`; body `Ciao, ci spiace ma il tuo account è stato bannato. Contattaci per maggiori informazioni.`

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

Sends an internal alert to the dev team when a 500-level error occurs. Recipient is always `process.env.DEV_TEAM_EMAIL` (ignores any concept of `emailTo`). Subject: `${platformName} errore 500`; body embeds the raw `err` string in both text and HTML (`'errore 500 ' + err`, `'<p>errore 500 <br><br>' + err + '</p>'`) — not HTML-escaped.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| err | string | Error message/detail to report, interpolated directly (unescaped) into the email body. |

**Returns:** `Promise<boolean>` — send success/failure.

**Notes:** Env var `DEV_TEAM_EMAIL` is read at call time.

### `wrongHash(emailTo, times)`

**Signature:**
```ts
async wrongHash(emailTo: string, times: number): Promise<boolean>
```

Notifies the user that they submitted an incorrect activation/verification hash, and how many attempts remain. If `times > 5`, calls `throwInternalError()` instead of sending. Otherwise, `remainingTimes = 5 - times` and the body reads `Ti rimangono altri ${remainingTimes} tentativi.`

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

Notifies the user they've exceeded the allowed number of email-verification attempts and must repeat the registration request. Fixed Italian copy, subject `Troppi tentativi di verifica della tua email`.

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

Notifies the user that the activation link they're using is more than 3 days old and expired, and that they must repeat the registration request. Subject: `Link di attivazione scaduto`.

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

Notifies the user their account is already active/valid and they can log in directly. Subject: `Account già valido`.

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

Sends an OTP-based subscription-activation email. Subject: `` Attiva il tuo account ${platformName}} `` (note the literal trailing `}` left in the template string — a pre-existing typo, preserved). Builds `url = ${linkBase}'/x/emailVerify` (note the stray `'` character embedded in the URL — also a pre-existing source quirk) and includes both a clickable link and the raw `otp` code in the body.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| emailTo | string | Recipient address. |
| otp | string | One-time activation code shown in the email body. |

**Returns:** `Promise<boolean>` — send success/failure.

### `sendConfermaResetPwd(emailTo, name = '')`

**Signature:**
```ts
async sendConfermaResetPwd(emailTo: string, name: string = ''): Promise<boolean>
```

Confirms that a password reset has completed and the user can now log in. Subject: `Reset della password per ${platformName}`. Links to `linkBase` (the platform home), not a hash-specific URL.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| emailTo | string | Recipient address. |
| name | string | Optional recipient name, `fixName`-prefixed. |

**Returns:** `Promise<boolean>` — send success/failure.

### `sendConfermaResetPwdHash(email, name, hash)`

**Signature:**
```ts
async sendConfermaResetPwdHash(email: string, name: string, hash: string): Promise<boolean | null>
```

Legacy password-reset confirmation email hard-coded for "YourCompany" rather than the configured `platformName`. Subject is always `'Reset della password per YourCompany'` (the `message.subject` field is separately overridden to `'Conferma cambio password per YourCompany'` right before sending — the earlier `subject` local is only used inside the HTML body via `getHtmlHeader(subject)`). Builds `linkReset = linkBase + '/index.php?q=reset&hash=' + hash + '&email=' + encodeURI(email)`. Unlike the other send methods, the HTML body here is built with the public `getHtmlHeader(subject)` / `getHtmlFooter()` helpers (a full standalone `<html>...</html>` document) rather than relying only on the constructor's `emailHtmlHeader1/2`/`emailHtmlFooter` fallback — because `sendEmail` unconditionally wraps whatever `htmlBody` it's given with `emailHtmlHeader1 + subject + emailHtmlHeader2 + htmlBody + emailHtmlFooter`, the final message ends up with the fallback template wrapped around a second, complete HTML document. This double-wrapping is a pre-existing behavior, not a bug introduced here. Send errors are caught locally: on failure, `Sentry.captureException(e)` is called and the method returns `null` instead of throwing.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| email | string | Recipient address. |
| name | string | Recipient name (no default; always interpolated as `'Ciao ' + name`). |
| hash | string | Reset-confirmation hash embedded in `linkReset`. |

**Returns:** `Promise<boolean \| null>` — the boolean `sendEmail` result on success, or `null` if `sendEmail` throws (comment in source: "se invio va a buon fine, ritorna l'hash, altrimenti null" — despite the comment mentioning "l'hash", the actual return value is the boolean send result, not the hash).

### `sendEmailReset(emailTo, hash, name = '')`

**Signature:**
```ts
async sendEmailReset(emailTo: string, hash: string, name: string = ''): Promise<boolean>
```

Sends the "reset your password" email with a hash-bearing link. Link: `${linkBase}/x/reset/${encodeURI(emailTo)}/${hash}`. Subject: `Reset della password per ${platformName}`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| emailTo | string | Recipient address. |
| hash | string | Reset hash embedded in the link. |
| name | string | Optional recipient name, `fixName`-prefixed. |

**Returns:** `Promise<boolean>` — send success/failure.

### `htmlFooter()`

**Signature:**
```ts
htmlFooter(): string
```

Public "fallback footer" fragment: `'</p></td>' + '  </tr>' + ' </table>' + '</body>'`. Marked with a `/** fallback footer */` doc comment but, unlike its counterparts `htmlHeader1()`/`htmlHeader2()` (which are `private`), this method has no `private` modifier and is callable externally. Its body is identical to `getHtmlFooter()`.

**Returns:** `string` — closing `</p></td></tr></table></body>` HTML fragment.

### `sendOTP(emailTo, otp)`

**Signature:**
```ts
async sendOTP(emailTo: string, otp: string): Promise<string | null>
```

Sends a one-time-password email hard-coded for "YourCompany" (does not use `platformName`). Subject is always `'Codice OTP per YourCompany'`; body text is always `'Per confermare la tua iscrizione su YourCompany, inserisci il seguente codice OTP: ' + otp` (text and HTML).

**Parameters:**

| Name | Type | Description |
|---|---|---|
| emailTo | string | Recipient address. |
| otp | string | One-time password code shown in the email body. |

**Returns:** `Promise<string \| null>` — always `null` (the function has no path that returns a non-null value; both the success path and the `catch` block set `ret = null`). Errors from `sendEmail` are caught and reported to Sentry via `Sentry.captureException(e)` rather than propagated.

### `sendEmailPostSegnalato(infoUtente, idPost)`

**Signature:**
```ts
async sendEmailPostSegnalato(infoUtente: IInfoUtente, idPost: number | string): Promise<boolean>
```

Sends an internal notification that a post has been reported/flagged, always to the hard-coded address `'dummy@example.com'` (ignores `EMAIL_FROM`/`DEV_TEAM_EMAIL` conventions used elsewhere). Subject: `'Post ' + idPost + ' segnalato'`. Body interpolates the reporting user's name/surname/id from `infoUtente`. Uses `getHtmlHeader(subject)` / `getHtmlFooter()` to build the HTML body (same double-wrapping consideration as `sendConfermaResetPwdHash`, since `sendEmail` re-wraps it again).

**Parameters:**

| Name | Type | Description |
|---|---|---|
| infoUtente | `IInfoUtente` | Info about the user who filed the report (module-internal interface — shape below). |
| idPost | number \| string | Identifier of the reported post, interpolated into subject/body. |

`IInfoUtente` shape: `{ _id: string; personalData: { name: string; surname: string } }`.

**Returns:** `Promise<boolean>` — send success/failure.

**Notes:** `IInfoUtente` is declared in this file but not exported and has no `package.json` export entry — it is internal to `SocketLabsLib`. An earlier, near-identical implementation of this method is preserved as a commented-out block above `sendEmailChangeVerify` (lines ~78-116 of the source) along with a `@fixme` note about handling `ECONNABORTED` timeout retries from SocketLabs.

### `getHtmlHeader(title)`

**Signature:**
```ts
getHtmlHeader(title: string): string
```

Public helper that returns a complete standalone HTML document opening (doctype, `<html>`, `<head>` with the given `title` in a `<title>` tag, viewport meta, then `<body>` and an opening 600px-wide centered `<table>`/`<tr>`/`<td>`/`<p>`). Used by `sendConfermaResetPwdHash` and `sendEmailPostSegnalato` to build their HTML bodies. The `title` argument is interpolated directly into `<title>title</title>` without HTML-escaping.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| title | string | Text used as the document `<title>` (also typically the email subject). |

**Returns:** `string` — opening HTML fragment ending mid-`<p>`, to be closed by `getHtmlFooter()`.

### `getHtmlFooter()`

**Signature:**
```ts
getHtmlFooter(): string
```

Public closing counterpart to `getHtmlHeader`: `'</p></td>' + '  </tr>' + ' </table>' + '</body>'`. Identical output to `htmlFooter()`.

**Returns:** `string` — closing `</p></td></tr></table></body>` HTML fragment.

### `sendEmail(args)` — private

**Import:** _internal — not exported_ (private instance method; only reachable through the public send methods above).

**Signature:**
```ts
private async sendEmail(args: ISendEmail): Promise<boolean>
```

Central send implementation used by every public method. Builds a `BasicMessage` from `@socketlabs/email`: sets from-address/name, subject, text body, and an HTML body computed as `emailHtmlHeader1 + subject + emailHtmlHeader2 + htmlBody + emailHtmlFooter` (i.e. every message is wrapped in the constructor's header/footer template, with the subject re-inserted between the two header halves), then sets the recipient and calls `client.send(basicMessage)`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| args | `ISendEmail` | Fully-assembled message fields (module-internal interface — shape below). |

`ISendEmail` shape: `{ emailFrom: string; emailFromName: string; emailTo: string; subject: string; textBody: string; htmlBody: string }`.

**Returns:** `Promise<boolean>` — `true` on successful SocketLabs API acknowledgement; `false` if the send promise rejects.

**Notes:** On rejection, calls `Sentry.captureException(e, { extra: { detail: 'Error in sending the email' } })` and resolves `false` rather than rethrowing — callers never see the underlying SocketLabs error object directly. `ISendEmail` is not exported and has no `package.json` export entry.

### `htmlHeader1()` — private

**Import:** _internal — not exported_.

**Signature:**
```ts
private htmlHeader1(): string
```

Fallback header fragment (first half) used only when the constructor is called without an explicit `htmlHeader1` argument. Returns the XHTML 1.0 Transitional doctype, `<html lang="it" ...>`, `<head>`, charset meta, and the opening `<title>` tag (left unclosed so the subject can be inserted after it).

**Returns:** `string` — opening HTML/head fragment through `<title>`.

### `htmlHeader2()` — private

**Import:** _internal — not exported_.

**Signature:**
```ts
private htmlHeader2(): string
```

Fallback header fragment (second half), picking up after the subject inserted by `sendEmail`: closes `</title>`, adds the viewport meta, closes `</head></html>`, opens `<body>` and a centered 600px `<table>`/`<tr>`/`<td>`/`<p>`.

**Returns:** `string` — `</title>` through opening `<p>` fragment.

### `fixName(name)` — private

**Import:** _internal — not exported_.

**Signature:**
```ts
private fixName(name: string): string
```

Normalizes an optional recipient name for interpolation into greetings like `` `Ciao${nameFixed},` ``. Returns `` ` ${name}` `` (a single leading space plus the name) when `name !== ''`, otherwise returns `''` so `Ciao${nameFixed}` reads as plain `Ciao` with no double space.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| name | string | Raw recipient name, or `''` for none. |

**Returns:** `string` — `` ` ${name}` `` or `''`.
