#!/bin/bash
# is it required to add your user to sudoers

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

if [ -f /var/ram/koa-utils/started ];
then
  # already created
  exit
fi
# else, install & start


mkdir -p /var/ram/koa-utils/node_modules
rm -rf node_modules/*
sync
mkdir node_modules
sudo mount --bind /var/ram/koa-utils/node_modules node_modules

# Yarn 4 (Corepack, versione fissata in package.json "packageManager"): il lockfile non contiene host
# (resolution "pkg@npm:x.y.z"), quindi non c'e' piu' nulla da riscrivere. Il proxy si usa solo per
# questa shell, via env: .yarnrc.yml resta su registry.npmjs.org. Yarn 4 rifiuta http:// se l'host
# non e' in unsafeHttpWhitelist.
export YARN_NPM_REGISTRY_SERVER=http://yarnproxy.gio.lan:4873
export YARN_UNSAFE_HTTP_WHITELIST=yarnproxy.gio.lan


yarn install

# create control file
touch /var/ram/koa-utils/started

