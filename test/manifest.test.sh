#!/bin/sh
# Static checks on manifest.txt — the single list of what ships where. No device, no emulation.
set -eu
cd "$(dirname "$0")/.."
fail() { echo "FAIL: $*" >&2; exit 1; }
recs() { sed -e 's/#.*$//' -e '/^[[:space:]]*$/d' manifest.txt; }

# Repo files that are deliberately NOT shipped (dev-box tools). Anything else under src/ or tools/
# must be in the manifest — a new file nobody listed would silently never reach the router.
UNSHIPPED="tools/build.sh tools/deploy.sh tools/verify.sh tools/test-local.sh tools/firmware.sh tools/emu.sh"

seen_dest=""; seen_svc=""; n=0
recs | {
  while read -r t a b c extra; do
    [ -z "${extra:-}" ] || fail "trailing field on: $t $a $b $c $extra"
    case "$t" in
      file|gz|cache|default)
        n=$((n + 1))
        [ -f "$a" ] || fail "source missing: $a"
        case "$c" in 0644|0755) ;; *) fail "$b: mode must be 0644 or 0755 (got '$c')" ;; esac
        case "$b" in
          /www/*|/www) fail "$b is under /www (a firmware upgrade never restores it)" ;;
          /etc/*|/usr/*|/lib/*|/bin/*|/sbin/*) ;;
          *) fail "$b: abfota_update only keeps /etc /usr /lib /bin /sbin paths" ;;
        esac
        case "$b" in *[!A-Za-z0-9._/-]*) fail "$b: unexpected character in path" ;; esac
        case " $seen_dest " in *" $b "*) fail "duplicate destination $b" ;; esac
        seen_dest="$seen_dest $b"
        [ "$t" = gz ] && case "$b" in *.gz) ;; *) fail "gz destination must end in .gz: $b" ;; esac
        if [ "$c" = 0755 ]; then head -n1 "$a" | grep -q '^#!' || fail "$a is 0755 but has no #! line"; fi
        case "$b" in /etc/init.d/*)
          [ "$c" = 0755 ] || fail "$b must be 0755"
          head -n1 "$a" | grep -qx '#!/bin/sh /etc/rc.common' || fail "$a is not an rc.common init script" ;;
        esac ;;
      own)   case "$a" in /etc/*/|/usr/*/|/lib/*/) ;; *) fail "own entry must be a directory under /etc /usr /lib, ending in /: $a" ;; esac ;;
      keepd) [ "$a" = /lib/upgrade/keep.d/mudimodem ] || fail "keepd must be /lib/upgrade/keep.d/mudimodem (abfota_update reads keep.d/*)" ;;
      service)
        grep -qE "^file +[^ ]+ +/etc/init.d/$a +0755" manifest.txt || fail "service $a has no /etc/init.d/$a file entry"
        for act in $(echo "$b" | tr ',' ' '); do case "$act" in enable|start|restart) ;; *) fail "service $a: unknown action $act" ;; esac; done
        seen_svc="$seen_svc $a" ;;
      *) fail "unknown record type '$t'" ;;
    esac
  done
  [ "$n" -gt 20 ] || fail "suspiciously few files ($n)"
  for f in src/etc/init.d/*; do
    case " $seen_svc " in *" $(basename "$f") "*) ;; *) fail "init script $f has no service line" ;; esac
  done
}

for f in $(git ls-files src tools 2>/dev/null || find src tools -type f); do
  case " $UNSHIPPED " in *" $f "*) continue ;; esac
  case "$f" in *.pyc|*/__pycache__/*) continue ;; esac
  grep -qE "^(file|gz|cache|default) +$f " manifest.txt || fail "$f is neither in manifest.txt nor in UNSHIPPED"
done
recs | grep -qE '^file +src/installer/mudimodem-install ' || fail "the installer must ship (uninstall + updates run it)"
recs | grep -qE '^file +manifest.txt ' || fail "manifest.txt must ship (uninstall reads the installed copy)"

# The library refresher must write the copy nginx serves — the manifest's cache destination.
cache=$(recs | awk '$1 == "cache" { print $3 }')
grep -q "DEFAULT_CACHE = \"$cache\"" tools/mudimodem-lib || fail "mudimodem-lib DEFAULT_CACHE must be the manifest's cache path $cache"
# The nginx alias must serve the web payload's own directory.
grep -q 'location ^~ /views/gl-sdk4-ui-mudimodem' src/nginx/mudimodem.conf \
  && grep -q 'location ^~ /mudimodem/' src/nginx/mudimodem.conf \
  && [ "$(grep -c 'root /usr/share/mudimodem/www;' src/nginx/mudimodem.conf)" = 2 ] \
  || fail "nginx alias must map /views/gl-sdk4-ui-mudimodem* and /mudimodem/ onto /usr/share/mudimodem/www"
recs | awk '$1 == "gz" { print $3 }' | while read -r d; do
  case "$d" in /usr/share/mudimodem/www/views/gl-sdk4-ui-mudimodem*.common.js.gz) ;; *) fail "chunk $d is outside the aliased path" ;; esac
done
json_ok() {  # python3 on the dev box, the router's own jsonfilter under tools/emu.sh
  if command -v python3 >/dev/null 2>&1; then python3 -I -c 'import json,sys; json.load(open(sys.argv[1]))' "$1" 2>/dev/null
  else jsonfilter -i "$1" -e '@' >/dev/null 2>&1; fi
}
for m in src/menu/*.json src/etc/mudimodem/*.json version.json; do
  json_ok "$m" || fail "$m is not valid JSON (a bad menu JSON breaks GL's whole admin)"
done
echo "manifest OK"
