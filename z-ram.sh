#!/bin/bash
# is it required to add your user to sudoers

#load nvm
. ~/.nvm/nvm.sh
. ~/.profile
. ~/.bashrc

# set node
nvm use v24.14.0
node --version

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

# yarn.lock nel repo punta sempre al registry pubblico (registry.yarnpkg.com), cosi' chi non ha
# il proxy puo' lavorare. yarn v1 scarica dagli URL "resolved" del lockfile ignorando il registry
# configurato: quindi qui li riscriviamo verso il proxy e, a fine install, li rimettiamo canonici.
export REGISTRY_MIRROR=http://yarnproxy.gio.lan:4873
node scripts/registry-rewrite.mjs mirror
trap 'node scripts/registry-rewrite.mjs canonical' EXIT


yarn install

# create control file
touch /var/ram/koa-utils/started

