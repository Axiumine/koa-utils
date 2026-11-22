#!/bin/bash

#load nvm
. ~/.nvm/nvm.sh
. ~/.profile
. ~/.bashrc

# Node 26 per lo sviluppo (.nvmrc); il software supporta anche Node 24. Node 26 non include Corepack:
# lo attivo con Node 24 (shim in una cartella temporanea nel PATH), poi passo alla versione di .nvmrc.
nvm use 24
COREPACK_SHIMS=$(mktemp -d)
trap 'rm -rf "$COREPACK_SHIMS"' EXIT
corepack enable --install-directory "$COREPACK_SHIMS"
export PATH="$COREPACK_SHIMS:$PATH"
nvm use
node --version
yarn --version

# Yarn 4 (Corepack, versione fissata in package.json "packageManager"): il lockfile non contiene host
# (resolution "pkg@npm:x.y.z"), quindi non c'e' piu' nulla da riscrivere. Il proxy e' facoltativo e si
# usa solo per questa shell, via env: .yarnrc.yml resta su registry.npmjs.org. L'indirizzo non sta nello
# script: lo leggo dal file .env accanto a questo script (ignorato da git, vedi .env.example). Leggo solo
# le due chiavi che servono, cosi' il resto di .env non finisce nell'ambiente di yarn. Se mancano, yarn
# usa registry.npmjs.org. Yarn 4 rifiuta http:// se l'host non e' in unsafeHttpWhitelist.
ENV_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.env"
env_value() {
	[ -f "$ENV_FILE" ] && sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 | tr -d '\r"'"'"
}
MIRROR_SERVER=$(env_value YARN_NPM_REGISTRY_SERVER)
MIRROR_WHITELIST=$(env_value YARN_UNSAFE_HTTP_WHITELIST)
if [ -n "$MIRROR_SERVER" ]; then
	export YARN_NPM_REGISTRY_SERVER="$MIRROR_SERVER"
	[ -n "$MIRROR_WHITELIST" ] && export YARN_UNSAFE_HTTP_WHITELIST="$MIRROR_WHITELIST"
	echo "Mirror npm da .env: $YARN_NPM_REGISTRY_SERVER"
else
	echo "Nessun mirror in .env: yarn usa registry.npmjs.org"
fi

yarn install
