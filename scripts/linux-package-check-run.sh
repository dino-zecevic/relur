#!/usr/bin/env bash
# Runs inside the container built by linux-package-check.Dockerfile, as root,
# with the packages in /dist. Each step runs as the `ubuntu` user, with
# Chromium's sandbox on: the container allows user namespaces
# (seccomp=unconfined) and FUSE (/dev/fuse), as a desktop does. Every step
# has a time limit, so an app that hangs fails the check instead of the job.
set -euo pipefail

arch=$(uname -m | sed 's/x86_64/x64/; s/aarch64/arm64/')
deb=$(ls /dist/*-linux-"$arch".deb)
name=$(basename "$(ls /dist/*-linux-"$arch".AppImage)" "-linux-$arch.AppImage")
# A copy, so it can be changed: under Docker's emulation of another
# architecture (PLATFORM=linux/amd64 on an arm64 Mac) the kernel refuses
# AppImages, whose ELF header carries the magic bytes AI\2 where qemu's
# binfmt rule expects zeros. Zeroing them changes nothing else; natively
# the AppImage runs as it is.
app=/tmp/$(basename /dist/*-linux-"$arch".AppImage)
cp /dist/*-linux-"$arch".AppImage "$app"
chmod 755 "$app"
if (cd /tmp && timeout 60 "$app" --appimage-version >/dev/null 2>&1); [ $? = 126 ]; then
  printf '\0\0\0' | dd of="$app" bs=1 seek=8 count=3 conv=notrunc 2>/dev/null
  echo "emulated $arch: zeroed the AppImage's magic bytes in a copy"
fi
as_user=(runuser -u ubuntu -- env HOME=/home/ubuntu SHELL=/bin/bash PATH=/home/ubuntu/.local/bin:/usr/local/bin:/usr/bin:/bin)
# within SECONDS COMMAND...: runs it, and stops it and its children when it takes longer.
within() {
  local secs=$1 status=0
  shift
  timeout -k 10 "$secs" "$@" || status=$?
  if [ "$status" = 124 ] || [ "$status" = 137 ]; then echo "FAILED: still running after ${secs}s, stopped: $*" >&2; fi
  return "$status"
}
step() { printf '\n== %s\n' "$*"; }

step "install.sh --from the AppImage"
within 300 "${as_user[@]}" sh /check/install.sh --from "$app" --yes
installed=/home/ubuntu/Applications/$name.AppImage
exe=$(sed -n 's/^StartupWMClass=//p' /home/ubuntu/.local/share/applications/*.desktop)
desktop=/home/ubuntu/.local/share/applications/$exe.desktop
grep -qxF "Exec=\"$installed\" %U" "$desktop"
ls /home/ubuntu/.local/share/icons/hicolor/*/apps/"$exe".png >/dev/null
cli=$(ls /home/ubuntu/.local/bin)
within 60 "${as_user[@]}" "$cli" --version
echo "desktop entry $desktop, launcher $cli: ok"

step "the installed AppImage starts its self-test (FUSE, sandbox on)"
within 300 "${as_user[@]}" xvfb-run -a "$installed" --self-test

step "and without FUSE (--appimage-extract-and-run)"
within 300 "${as_user[@]}" xvfb-run -a "$installed" --appimage-extract-and-run --self-test

step "its window's class matches the desktop entry (StartupWMClass=$exe), and renderers are sandboxed"
within 300 "${as_user[@]}" bash /check/window.sh "$installed" "$exe"

step "Update finds the AppImage's id and version, as it checks a download (spec §15.7)"
version=$(dpkg-deb -f "$deb" Version)
helper=/home/ubuntu/.config/$cli/helper/$cli-helper
identity=$(cd /tmp && within 60 "${as_user[@]}" "$helper" identity appimage "$installed")
echo "$identity"
[ "$identity" = "$exe $version" ] || { echo "FAILED: expected \"$exe $version\"" >&2; exit 1; }

step "install.sh --uninstall keeps the settings"
within 120 "${as_user[@]}" sh /check/install.sh --uninstall --yes
test ! -e "$installed" && test ! -e "$desktop" && test ! -e "/home/ubuntu/.local/bin/$cli"
test -d "/home/ubuntu/.config/$cli"
echo ok

# As in a distrobox or toolbox: no AppArmor profile can be loaded here, so
# where the host restricts user namespaces (Ubuntu 23.10+), the .deb makes
# chrome-sandbox setuid instead (spec §15.6). The release also tries the .deb
# on the runner itself (scripts/linux-package-check-deb.sh).
step "the .deb installs with apt in a container and starts its self-test"
within 300 apt-get install -y -qq "$deb" >/dev/null
test -x "/usr/bin/$exe"
echo "chrome-sandbox: $(stat -c '%U %a' "$(dirname "$(readlink -f "/usr/bin/$exe")")/chrome-sandbox")"
grep -qxF "StartupWMClass=$exe" "/usr/share/applications/$exe.desktop"
within 300 "${as_user[@]}" xvfb-run -a "$exe" --self-test

echo
echo "linux package check passed: $(basename "$app"), $(basename "$deb")"
