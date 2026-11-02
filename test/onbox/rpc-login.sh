#!/bin/sh
# test/onbox/rpc-login.sh — log in to GL's /rpc ON the box and print the sid (tools/verify.sh's
# rpc_login; sent over ssh as `sh -s`, the password in $MM_PW). Only what the 4.10 image ships:
# curl, jsonfilter, openssl, sha256sum. GL's scheme (oui-rpc.lua challenge/login): the hash is
# sha256("<user>:<crypt(password, salt, alg)>:<nonce>").
set -u
user=root
post() { curl -sk -X POST https://127.0.0.1/rpc -H 'Content-Type: application/json' -d "$1"; }
chal=$(post '{"jsonrpc":"2.0","id":1,"method":"challenge","params":{"username":"'"$user"'"}}')
salt=$(printf '%s' "$chal" | jsonfilter -e '@.result.salt' 2>/dev/null)
nonce=$(printf '%s' "$chal" | jsonfilter -e '@.result.nonce' 2>/dev/null)
alg=$(printf '%s' "$chal" | jsonfilter -e '@.result.alg' 2>/dev/null)
[ -n "$salt" ] && [ -n "$nonce" ] || { echo "challenge failed: $chal" >&2; exit 1; }
crypt=$(openssl passwd "-${alg:-5}" -salt "$salt" "$MM_PW") || { echo "openssl passwd failed" >&2; exit 1; }
hash=$(printf '%s:%s:%s' "$user" "$crypt" "$nonce" | sha256sum | cut -d' ' -f1)
res=$(post '{"jsonrpc":"2.0","id":1,"method":"login","params":{"username":"'"$user"'","hash":"'"$hash"'"}}')
sid=$(printf '%s' "$res" | jsonfilter -e '@.result.sid' 2>/dev/null)
[ -n "$sid" ] || { echo "login failed: $res" >&2; exit 1; }
echo "$sid"
