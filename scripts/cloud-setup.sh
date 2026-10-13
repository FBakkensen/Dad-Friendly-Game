#!/usr/bin/env bash
# Cursor cloud agent install script (.cursor/environment.json "install").
# Idempotent. Works on the .cursor/Dockerfile image and, as a fallback, on
# Cursor's default image: it installs the .nvmrc Node with nvm and records
# JAVA_HOME / CHROME_PATH in ~/.bashrc, since exported variables don't survive a Build.
set -euo pipefail
cd "$(dirname "$0")/.."
want="$(cat .nvmrc)"

if [ "$(node --version 2>/dev/null)" != "v$want" ]; then
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] || curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install "$want"
  nvm alias default "$want"
  nvm use "$want"
fi

java21=""
for dir in "${JAVA_HOME_21_X64:-}" /usr/lib/jvm/temurin-21-jdk-amd64 /usr/lib/jvm/java-21-openjdk-amd64; do
  if [ -n "$dir" ] && [ -x "$dir/bin/java" ]; then java21="$dir"; break; fi
done
chrome="$(command -v google-chrome || true)"

marker="# dad-friendly-game cloud env"
if ! grep -qF "$marker" "$HOME/.bashrc" 2>/dev/null; then
  {
    echo "$marker"
    echo '[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" && nvm use --silent default >/dev/null'
    [ -n "$java21" ] && echo "export JAVA_HOME_21_X64=$java21"
    [ -n "$chrome" ] && echo "export CHROME_PATH=$chrome"
  } >> "$HOME/.bashrc"
fi
[ -n "$java21" ] && export JAVA_HOME_21_X64="$java21"
[ -n "$chrome" ] && export CHROME_PATH="$chrome"

npm ci
node scripts/env-report.mjs --strict
