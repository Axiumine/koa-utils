# src/koa — agent rules

Repo-wide rules in root `CLAUDE.md`. Editing this file → Rule 0 there first (caveman ultra via `caveman:caveman` skill; skill missing = blocked).

## Tokens, cookies, Redis

- Redis keys: prefix all with `${process.env.REDIS_KEY}`. Refresh → `${REDIS_KEY}refresh:<uuid>`, access → `${REDIS_KEY}access:<uuid>`.
- `verifySignedRefreshToken` return `refresh:<uuid>` — `refresh:` prefix already included. Never double-prefix.
- `redData?.disabled` / `redData?.deleted` truthy for strings `'true'` **and** `'false'` — Redis store all as string. Storage code set them only when actually blocking. Keep that way.
- `tokenOptions.secure = false` intentional — TLS terminate at Nginx, `secure` set there. Never change in source.
- No constant replacing `accessTokenExpiry()` 30–90 min jitter.

## Pitfalls

- `tdwKoaErrorHandler` skip body for status `[100,101,102,204,205,304]`. New 304-returning route → clients must not expect JSON.
- `src/koa/router/verifyEmail.mts` carry **no** `/* c8 ignore start/stop */`. Block existed because first statement was ESM live binding sinon cannot stub → try-body dead code in suite. Deps injected now, 3 paths covered. Never reintroduce ignore. Never go back to importing collaborators direct.
- `routerVerifyEmail` guards live in `src/private/lib/access/`. Every guard redirect to `EMAIL_CHECK_LINK` — a second redirect target on this unauthenticated route creates an account-existence oracle. See `src/private/CLAUDE.md` before changing any guard's redirect.

## Docs, same commit

|Changed|Update|
|---|---|
|`src/koa/*.mts`, `router/**`|`docs/code/koa-core.md`|
|`middleware/**`|`docs/code/koa-middleware.md`|
