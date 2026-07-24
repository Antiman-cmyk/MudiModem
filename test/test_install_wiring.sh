#!/bin/sh
# Static assertions on install.sh / uninstall.sh LCD wiring. No device needed.
set -eu
cd "$(dirname "$0")/.."
fail() { echo "FAIL: $1" >&2; exit 1; }

grep -q 'src/lcd/mudi.py' install.sh            || fail "install.sh does not deploy mudi.py"
grep -q 'src/lcd/mudi-watch.py' install.sh      || fail "install.sh does not deploy mudi-watch.py"
grep -q 'src/lcd/mudi.init' install.sh          || fail "install.sh does not deploy mudi.init"
grep -q 'src/lcd/mudi-watch.init' install.sh    || fail "install.sh does not deploy mudi-watch.init"
grep -q 'src/lcd/mudi.config' install.sh        || fail "install.sh does not seed mudi.config"
# default OFF: installer must NOT enable/start the mudi service
grep -q '/etc/init.d/mudi enable' install.sh    && fail "install.sh must NOT enable mudi (default off)"
grep -q '/etc/init.d/mudi start'  install.sh    && fail "install.sh must NOT start mudi (default off)"
# sysupgrade registration of the four LCD files
for p in /usr/bin/mudi.py /usr/bin/mudi-watch.py /etc/init.d/mudi /etc/init.d/mudi-watch; do
  grep -q "$p" install.sh || fail "install.sh missing sysupgrade entry: $p"
done
# uninstall hands the panel back and removes the files
grep -q '/etc/init.d/gl_screen start' uninstall.sh || fail "uninstall.sh must restore gl_screen"
grep -q '/usr/bin/mudi.py' uninstall.sh            || fail "uninstall.sh must remove mudi.py"
grep -q '/etc/config/mudi' uninstall.sh            && fail "uninstall.sh must NOT delete user config /etc/config/mudi"
echo "install wiring OK"
