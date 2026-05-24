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

yarn install

# create control file
touch /var/ram/koa-utils/started

