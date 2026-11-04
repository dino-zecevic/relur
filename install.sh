#!/bin/sh
# Installs, updates or removes Relur on a Mac or on Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/relur-dev/relur/main/install.sh | sh
#   sh install.sh --uninstall        removes the app and the launcher, keeps your settings
#   sh install.sh --from <file|dir>  installs a local build instead (npm run install-app)
#   sh install.sh --yes              quits a running Relur without asking, and doesn't offer to open it
#
# macOS: the app goes to /Applications (or ~/Applications). Installing also
# removes Orrery (the app's previous name) and its launcher, after quitting
# it, so the two never run side by side with separate settings; Relur copies
# Orrery's settings when it first starts.
#
# Linux: the AppImage goes to ~/Applications, with a desktop entry and icons
# in ~/.local/share, so it shows in the desktop's app list. Never sudo.
#
# Generated from scripts/install.template.sh by scripts/gen-install.ts with
# the values in src/shared/brand.ts; edit those, not install.sh.
set -eu

APP='Relur'
HELPER='relur-helper'
LINUX_EXE='relur-desktop'
BASE_URL="${RELUR_INSTALL_BASE_URL:-https://github.com/relur-dev/relur/releases/latest/download}"
LAUNCHER="$HOME/.local/bin/relur"
MARK="# $APP command line tool"
OLD_APP='Orrery'
OLD_LAUNCHER="$HOME/.local/bin/orrery"
OLD_MARK="# $OLD_APP command line tool"
OS=$(uname -s)
if [ "$OS" = Darwin ]; then
  SETTINGS="$HOME/Library/Application Support/$APP"
else
  SETTINGS="${XDG_CONFIG_HOME:-$HOME/.config}/relur"
fi
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
DESKTOP_FILE="$DATA/applications/$LINUX_EXE.desktop"
DESKTOP_MARK="# $APP desktop entry"

say() { printf '%s\n' "$@"; }
usage() {
  cat <<USAGE
Installs or updates $APP from the latest release, and points the command line
tool at it: on macOS into /Applications (or ~/Applications), on Linux the
AppImage into ~/Applications, with its desktop entry.
  --uninstall        remove the app and the launcher; your settings stay
  --from <file|dir>  install a local build (a .zip or .AppImage, or a dist/ folder)
  --yes              quit a running $APP without asking, and don't offer to
                     open it at the end
USAGE
}
fail() { printf '%s\n' "$*" >&2; exit 1; }

# macOS: /Applications when it can be written to, else ~/Applications.
# Linux: ~/Applications. Never sudo.
target_dir() {
  if [ -n "${RELUR_INSTALL_DIR:-}" ]; then say "$RELUR_INSTALL_DIR"
  elif [ "$OS" != Darwin ]; then say "$HOME/Applications"
  elif [ -w /Applications ]; then say /Applications
  else say "$HOME/Applications"
  fi
}

# This machine's architecture; on a Mac, Apple Silicon even when this shell runs under Rosetta.
cpu_arch() {
  if [ "$OS" = Darwin ]; then
    if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || true)" = 1 ]; then say arm64; else say x64; fi
    return
  fi
  case "$(uname -m)" in
    x86_64 | amd64) say x64 ;;
    aarch64 | arm64) say arm64 ;;
    *) fail "$APP is built for x64 and arm64 Linux, not $(uname -m)." ;;
  esac
}

# The release asset for this machine.
asset_name() {
  if [ "$OS" = Darwin ]; then say "$APP-mac-$(cpu_arch).zip"; else say "$APP-linux-$(cpu_arch).AppImage"; fi
}

# Linux: the pid of the running copy of the AppImage at $1, from the lock file
# Chromium keeps in the settings folder ("<host>-<pid>"), when that process
# was started from that AppImage.
appimage_pid() {
  lock=$(readlink "$SETTINGS/SingletonLock" 2>/dev/null) || return 1
  pid=${lock##*-}
  case "$pid" in '' | *[!0-9]*) return 1 ;; esac
  tr '\0' '\n' <"/proc/$pid/environ" 2>/dev/null | grep -qxF "APPIMAGE=$1" || return 1
  say "$pid"
}

# running <target>: whether that copy runs (macOS: <dir>/<name>.app, Linux: the AppImage).
running() {
  if [ "$OS" = Darwin ]; then pgrep -f "$1/Contents/MacOS/" >/dev/null 2>&1
  else appimage_pid "$1" >/dev/null
  fi
}

# Quits the copy at $1 (named $2) after asking, with SIGTERM to that copy only:
# the app then stops its sessions and quits (Claude conversations resume later).
quit_app() {
  target=$1
  name=$2
  running "$target" || return 0
  # Its terminals set TERM_PROGRAM: quitting it from one would stop this script too.
  [ "${TERM_PROGRAM:-}" != "$name" ] ||
    fail "This terminal belongs to $name, which has to quit. Run this again from another terminal."
  if [ "$YES" != 1 ]; then
    { exec 3</dev/tty; } 2>/dev/null || fail "$name is running. Quit it, then run this again."
    printf '%s is running. Quit it now? [y/N] ' "$name" >/dev/tty
    read -r answer <&3 || answer=
    exec 3<&-
    case "$answer" in y | Y | yes) ;; *) fail "Nothing changed: $name is still running." ;; esac
  fi
  if [ "$OS" = Darwin ]; then pkill -TERM -f "$target/Contents/MacOS/" || true
  else kill -TERM "$(appimage_pid "$target")" 2>/dev/null || true
  fi
  waited=0
  while running "$target"; do
    waited=$((waited + 1))
    [ "$waited" -lt 120 ] || fail "$name didn't quit. Quit it, then run this again."
    sleep 1
  done
  say "Quit $name."
}

# macOS: the app under its previous name, quit after asking, then removed, so
# the two never run side by side. Its settings folder stays; the app copies it.
remove_old_app() {
  if [ -n "${RELUR_INSTALL_DIR:-}" ]; then set -- "$RELUR_INSTALL_DIR"; else set -- /Applications "$HOME/Applications"; fi
  for dir in "$@"; do
    [ -d "$dir/$OLD_APP.app" ] || continue
    quit_app "$dir/$OLD_APP.app" "$OLD_APP"
    rm -rf "${dir:?}/$OLD_APP.app"
    say "Removed $dir/$OLD_APP.app: $APP replaces it and copies its settings when it first starts."
  done
}

# The command line tool's launcher, as the app writes it (src/main/helper-files.ts).
write_launcher() {
  if [ -e "$LAUNCHER" ] && ! grep -qF "$MARK" "$LAUNCHER"; then
    say "Left $LAUNCHER alone: it isn't $APP's."
    return 0
  fi
  quoted=$(printf '%s' "$1" | sed "s/'/'\\\\''/g")
  mkdir -p "$(dirname "$LAUNCHER")"
  printf "#!/bin/sh\n%s\nexec '%s' \"\$@\"\n" "$MARK" "$quoted" >"$LAUNCHER.tmp"
  chmod 755 "$LAUNCHER.tmp"
  mv "$LAUNCHER.tmp" "$LAUNCHER"
  say "Pointed $LAUNCHER at $1"
  if [ -f "$OLD_LAUNCHER" ] && grep -qF "$OLD_MARK" "$OLD_LAUNCHER"; then
    rm -f "$OLD_LAUNCHER"
    say "Removed $OLD_APP's launcher, $OLD_LAUNCHER"
  fi
  case ":$PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *) say "To use it in your terminal, add this to your shell's startup file:" \
      'export PATH="$HOME/.local/bin:$PATH"' ;;
  esac
}

# Starts the installed app: `open` on macOS, the AppImage in its own session on Linux.
start_app() {
  if [ "$OS" = Darwin ]; then open "$1"
  else
    if command -v setsid >/dev/null 2>&1; then setsid "$1" >/dev/null 2>&1 </dev/null &
    else nohup "$1" >/dev/null 2>&1 </dev/null &
    fi
  fi
}

# At the end of an install: in a terminal, offers to open the app (Enter
# means yes); with --yes or without a terminal, says how to open it.
offer_open() {
  if [ "$YES" != 1 ] && [ -t 1 ] && { exec 3</dev/tty; } 2>/dev/null; then
    printf 'Open %s now? [Y/n] ' "$APP" >/dev/tty
    read -r answer <&3 || answer=n
    exec 3<&-
    case "$answer" in
      '' | y | Y | yes)
        start_app "$1" && say "Opened $APP." && return 0 ;;
    esac
  fi
  if [ "$OS" = Darwin ]; then say "To open $APP, find it in $(dirname "$1") or run: open \"$1\""
  else say "To open $APP, find it in your desktop's app list or run: \"$1\""
  fi
}

install_zip() {
  dir=$(target_dir)
  ditto -x -k "$1" "$work/unpacked"
  [ -d "$work/unpacked/$APP.app" ] || fail "$1 has no $APP.app in it."
  quit_app "$dir/$APP.app" "$APP"
  remove_old_app
  mkdir -p "$dir"
  was=updated
  [ -d "$dir/$APP.app" ] || was=installed
  rm -rf "${dir:?}/$APP.app"
  ditto "$work/unpacked/$APP.app" "$dir/$APP.app"
  say "$APP $was: $dir/$APP.app"
  for other in /Applications "$HOME/Applications"; do
    if [ -z "${RELUR_INSTALL_DIR:-}" ] && [ "$other" != "$dir" ] && [ -d "$other/$APP.app" ]; then
      say "An older copy is still in $other; remove it if you don't need it."
    fi
  done
  write_launcher "$dir/$APP.app/Contents/Resources/helper/$HELPER"
  offer_open "$dir/$APP.app"
}

# A desktop entry's Exec value: the path in double quotes, with ", `, $ and \ escaped.
desktop_exec() {
  printf '"%s"' "$(printf '%s' "$1" | sed 's/[\\"`$]/\\&/g')"
}

# Linux: what the AppImage needs from this system, said before it's needed.
linux_notes() {
  # The AppImage mounts itself with FUSE: it needs fusermount (fuse3 or fuse).
  if ! command -v fusermount3 >/dev/null 2>&1 && ! command -v fusermount >/dev/null 2>&1; then
    say "" "$APP's AppImage needs FUSE to start, and this system has no fusermount. Install it:" \
      "  Ubuntu, Debian: sudo apt install fuse3" \
      "  Fedora:         sudo dnf install fuse3" \
      "  Arch:           sudo pacman -S fuse3" \
      "Or start it without FUSE: \"$1\" --appimage-extract-and-run"
  fi
  # Ubuntu 23.10 and later: Chromium's sandbox needs user namespaces, which
  # AppArmor allows only to listed programs. The .deb lists itself. The
  # AppImage's profile covers its AppRun too: AppRun (electron-builder's) adds
  # --no-sandbox when `unshare -Ur true` fails, and the programs a profile in
  # unconfined mode starts stay in it. The app never turns the sandbox off.
  apparmor="/etc/apparmor.d/$LINUX_EXE-appimage"
  if [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || true)" = 1 ] &&
    ! grep -qs AppRun "$apparmor"; then
    deb="$APP-linux-$(cpu_arch).deb"
    say "" "This system lets only listed apps use the sandbox $APP runs in. The .deb sets that up" \
      "by itself, so it's the better choice here (then remove the AppImage with --uninstall):" \
      "  curl -fLO $BASE_URL/$deb && sudo apt install ./$deb" \
      "To keep the AppImage instead, list it once:" \
      "  printf '%s\\n' 'abi <abi/4.0>,' 'include <tunables/global>' 'profile $LINUX_EXE-appimage /tmp/{.mount_*,appimage_extracted_*}/{AppRun,$LINUX_EXE} flags=(unconfined) {' '  userns,' '}' | sudo tee $apparmor" \
      "  sudo apparmor_parser -r $apparmor"
  fi
  if [ -x "/opt/$APP/$LINUX_EXE" ]; then
    say "" "The .deb of $APP is installed too, in /opt/$APP, so the app list shows it twice. Keep one: sudo apt remove relur"
  fi
}

install_appimage() {
  dir=$(target_dir)
  target="$dir/$APP.AppImage"
  quit_app "$target" "$APP"
  mkdir -p "$dir"
  # Next to the old one, so its folder is where it runs from (some /tmp can't run programs).
  cp "$1" "$target.new"
  chmod 755 "$target.new"
  # The helper and icons, from inside the AppImage; extracting needs no FUSE.
  (cd "$work" && "$target.new" --appimage-extract 'resources/helper/*' >/dev/null 2>&1 &&
    "$target.new" --appimage-extract 'usr/share/icons/*' >/dev/null 2>&1) ||
    { rm -f "$target.new"; fail "$1 isn't a $APP AppImage that runs on this system."; }
  [ -x "$work/squashfs-root/resources/helper/$HELPER" ] ||
    { rm -f "$target.new"; fail "$1 has no $HELPER in it."; }
  was=updated
  [ -f "$target" ] || was=installed
  mv "$target.new" "$target"
  say "$APP $was: $target"

  # The helper where the app keeps it (src/main/helper-files.ts), for the launcher.
  mkdir -p "$SETTINGS/helper"
  cp "$work/squashfs-root/resources/helper/$HELPER" "$SETTINGS/helper/$HELPER.tmp"
  chmod 755 "$SETTINGS/helper/$HELPER.tmp"
  mv "$SETTINGS/helper/$HELPER.tmp" "$SETTINGS/helper/$HELPER"

  # Icons and the desktop entry, so the app list, the dock and the window show it.
  if [ -d "$work/squashfs-root/usr/share/icons/hicolor" ]; then
    for icon in "$work"/squashfs-root/usr/share/icons/hicolor/*/apps/"$LINUX_EXE".png; do
      [ -f "$icon" ] || continue
      size=$(basename "$(dirname "$(dirname "$icon")")")
      mkdir -p "$DATA/icons/hicolor/$size/apps"
      cp "$icon" "$DATA/icons/hicolor/$size/apps/$LINUX_EXE.png"
    done
  fi
  mkdir -p "$(dirname "$DESKTOP_FILE")"
  cat >"$DESKTOP_FILE.tmp" <<DESKTOP
[Desktop Entry]
$DESKTOP_MARK, written by install.sh
Name=$APP
Comment=Parallel Claude Code sessions in git worktrees
Exec=$(desktop_exec "$target") %U
Icon=$LINUX_EXE
Type=Application
Terminal=false
Categories=Development;
StartupWMClass=$LINUX_EXE
DESKTOP
  mv "$DESKTOP_FILE.tmp" "$DESKTOP_FILE"
  update-desktop-database "$(dirname "$DESKTOP_FILE")" >/dev/null 2>&1 || true
  gtk-update-icon-cache -q -t "$DATA/icons/hicolor" >/dev/null 2>&1 || true
  say "Added $APP to the app list: $DESKTOP_FILE"

  write_launcher "$SETTINGS/helper/$HELPER"
  linux_notes "$target"
  offer_open "$target"
}

# Checks a download against SHA256SUMS: sha256sum on Linux, shasum on a Mac.
check_sum() {
  expected=$(awk -v f="$2" '$2 == f { print $1 }' "$work/SHA256SUMS")
  [ -n "$expected" ] || fail "SHA256SUMS has no line for $2."
  if command -v sha256sum >/dev/null 2>&1; then actual=$(sha256sum "$1" | awk '{ print $1 }')
  else actual=$(shasum -a 256 "$1" | awk '{ print $1 }')
  fi
  [ "$actual" = "$expected" ] || fail "$2 doesn't match its checksum; nothing was installed."
  say "Checksum matches."
}

download() {
  asset=$(asset_name)
  say "Downloading $asset from $BASE_URL"
  curl -fsSL "$BASE_URL/$asset" -o "$work/$asset" || fail "Couldn't download $BASE_URL/$asset"
  curl -fsSL "$BASE_URL/SHA256SUMS" -o "$work/SHA256SUMS" || fail "Couldn't download $BASE_URL/SHA256SUMS"
  check_sum "$work/$asset" "$asset"
  install_from "$work/$asset"
}

install_from() {
  if [ "$OS" = Darwin ]; then install_zip "$1"; else install_appimage "$1"; fi
}

uninstall() {
  removed=0
  if [ "$OS" = Darwin ]; then
    if [ -n "${RELUR_INSTALL_DIR:-}" ]; then set -- "$RELUR_INSTALL_DIR"; else set -- /Applications "$HOME/Applications"; fi
    for dir in "$@"; do
      [ -d "$dir/$APP.app" ] || continue
      quit_app "$dir/$APP.app" "$APP"
      rm -rf "${dir:?}/$APP.app"
      say "Removed $dir/$APP.app"
      removed=1
    done
  else
    target="$(target_dir)/$APP.AppImage"
    if [ -f "$target" ]; then
      quit_app "$target" "$APP"
      rm -f "$target"
      say "Removed $target"
      removed=1
    fi
    if [ -f "$DESKTOP_FILE" ] && grep -qF "$DESKTOP_MARK" "$DESKTOP_FILE"; then
      rm -f "$DESKTOP_FILE"
      rm -f "$DATA"/icons/hicolor/*/apps/"$LINUX_EXE".png
      update-desktop-database "$(dirname "$DESKTOP_FILE")" >/dev/null 2>&1 || true
      say "Removed $APP from the app list"
    fi
    rm -rf "${SETTINGS:?}/helper"
  fi
  [ "$removed" = 1 ] || say "$APP wasn't installed."
  if [ -f "$LAUNCHER" ] && grep -qF "$MARK" "$LAUNCHER"; then
    rm -f "$LAUNCHER"
    say "Removed $LAUNCHER"
  fi
  say "Kept your settings in $SETTINGS"
}

case "$OS" in
  Darwin | Linux) ;;
  *) fail "$APP runs on macOS and Linux." ;;
esac
YES=0
FROM=
ACTION=install
while [ $# -gt 0 ]; do
  case "$1" in
    --uninstall) ACTION=uninstall ;;
    --yes) YES=1 ;;
    --from) [ $# -gt 1 ] || fail "--from needs a file or a folder"; FROM=$2; shift ;;
    -h | --help) usage; exit 0 ;;
    *) fail "Unknown option $1 (see --help)" ;;
  esac
  shift
done

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

if [ "$ACTION" = uninstall ]; then
  uninstall
elif [ -n "$FROM" ]; then
  # A folder means a dist/ folder: this machine's build in it.
  [ -d "$FROM" ] && FROM="$FROM/$(asset_name)"
  [ -f "$FROM" ] || fail "There is no $FROM"
  # An absolute path: the AppImage is extracted from inside another folder.
  case "$FROM" in /*) ;; *) FROM="$PWD/$FROM" ;; esac
  install_from "$FROM"
else
  download
fi
