#!/bin/sh

set -e

if [ -e node_modules/.bin/eslint ]; then
	setup=""
else
	echo "## Installing modules..."
	if [ -f yarn.lock ]; then
		setup="yarn --production=false &&"
	else
		setup="NODE_ENV=development npm install &&"
	fi
fi

echo "## Running ESLint"
sh -c "$setup NODE_PATH=node_modules node /index.js"
