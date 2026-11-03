#!/usr/bin/env node
/**
 * Rewrites the registry host inside the `resolved` URLs of yarn.lock.
 *
 * Why: Yarn v1 downloads tarballs from the absolute `resolved` URL stored in the
 * lockfile and ignores the configured registry for them. A lockfile written
 * through a private mirror therefore breaks every developer who cannot reach it.
 *
 * Convention:
 *   - the COMMITTED yarn.lock always points at the public registry (canonical);
 *   - a developer behind a mirror sets REGISTRY_MIRROR, rewrites to the mirror
 *     before installing and back to canonical afterwards;
 *   - a developer without a mirror does nothing: plain `yarn install` works.
 *
 * Usage:   REGISTRY_MIRROR=http://host:4873 node scripts/registry-rewrite.mjs <command> [lockfile]
 *   mirror     canonical -> REGISTRY_MIRROR   (local use, before install)
 *   canonical  REGISTRY_MIRROR -> canonical   (before commit)
 *   check      exit 1 if any registry tarball URL is not canonical (hook / CI);
 *              needs no REGISTRY_MIRROR
 */
import { readFileSync, writeFileSync } from 'node:fs'

const CANONICAL = 'https://registry.npmjs.org'
// registry tarball shape: <host>/<name>/-/<file>.tgz or <host>/@scope/<name>/-/<file>.tgz
const TARBALL = /^(\s*resolved ")(https?:\/\/[^/"]+)(\/(?:@[^/"]+\/)?[^/"]+\/-\/[^"]+")/

const [command, lockfile = 'yarn.lock'] = process.argv.slice(2)
const mirror = (process.env.REGISTRY_MIRROR ?? '').replace(/\/+$/, '')

function fail(message) {
	console.error(`registry-rewrite: ${message}`)
	process.exit(1)
}

if (!['mirror', 'canonical', 'check'].includes(command)) {
	fail('usage: registry-rewrite.mjs <mirror|canonical|check> [lockfile]')
}
if (command !== 'check' && !/^https?:\/\/[^/]+/.test(mirror)) {
	fail('set REGISTRY_MIRROR to the mirror base URL, e.g. http://host:4873')
}

const lines = readFileSync(lockfile, 'utf8').split('\n')
let changed = 0
let foreign = 0

const out = lines.map((line) => {
	const match = TARBALL.exec(line)
	if (!match) return line
	const [whole, head, host, tail] = match

	if (command === 'check') {
		if (host !== CANONICAL) foreign++
		return line
	}
	const [from, to] = command === 'mirror' ? [CANONICAL, mirror] : [mirror, CANONICAL]
	if (host !== from) return line
	changed++
	return head + to + tail + line.slice(whole.length)
})

if (command === 'check') {
	if (foreign > 0) {
		fail(`${foreign} resolved URL(s) in ${lockfile} are not ${CANONICAL}; run "yarn registry:canonical"`)
	}
	console.log(`registry-rewrite: ${lockfile} is canonical`)
} else {
	if (changed > 0) writeFileSync(lockfile, out.join('\n'))
	console.log(`registry-rewrite: ${command}: ${changed} URL(s) rewritten in ${lockfile}`)
}
