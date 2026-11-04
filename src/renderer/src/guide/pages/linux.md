# {{app}} on Linux

{{app}} runs on 64-bit Linux, Intel/AMD (x64) and ARM (arm64), with any desktop: GNOME, KDE Plasma, Cinnamon, Xfce and others, on Wayland or X11. It needs glibc 2.31 or later: Ubuntu 22.04, Debian 12, Fedora 36 and later, and the distributions built on them. Distributions with musl, such as Alpine, aren't supported.

## Installing

The install script puts the AppImage in `~/Applications`, adds {{app}} to your desktop's app list with its icon (in `~/.local/share`), and the `{{cli}}` command to `~/.local/bin`; it never asks for sudo:

```
curl -fsSL https://raw.githubusercontent.com/{{repo}}/main/install.sh | sh
```

Running it again updates {{app}}; `sh install.sh --uninstall` removes it and keeps your settings in `{{configDir}}`. {{app}} never updates itself, but it can tell you when a new version is out, and **Update** runs this command for you; see [Updates and privacy](updates).

On Debian and Ubuntu you can install the `.deb` from the release instead (`sudo apt install ./{{app}}-linux-x64.deb`). It installs to `/opt/{{app}}`, needs no FUSE, and sets up the sandbox by itself. **On Ubuntu 23.10 and later, use the `.deb`:** the AppImage works there too, but only after you list it for the sandbox once (see [The sandbox](linux#the-sandbox)). Updates are the same: install the newer `.deb`; the update notice shows the command. **Install Command Line Tool…** in the **File** menu adds the `{{cli}}` command. Use one of the two, not both.

## What's different from macOS

- **Keys:** Ctrl takes the place of the Command key, except where the shell needs Ctrl with that letter: those shortcuts are Ctrl+Shift (Ctrl+Shift+L, Ctrl+Shift+W and so on), and **Check again** is F5. In terminals, Ctrl+Shift+C and Ctrl+Shift+V copy and paste. See [Keyboard shortcuts](shortcuts).
- **The menu** is in the window: **File**, **Edit**, **View**, **Window** and **Help**. **Install Command Line Tool…** and **Quit** are in **File**; **About**, **Check for Updates…** and **Check for Updates Automatically** in **Help**.
- **Closing the window quits {{app}}**, asking first while something runs. See [Closing the window](resume#closing-the-window).
- **Badges:** the window title starts with how many workspaces need you, and docks that show badges show it on the icon too. See [Badges](notifications#badges).
- **Show in folder** opens the folder in your file manager, and links and files open in your default apps (through `xdg-open`).

## The AppImage doesn't start

**It mentions FUSE or fusermount.** The AppImage mounts itself with FUSE, which needs the `fusermount3` (or `fusermount`) program; most desktops have it, and it doesn't need the old FUSE 2 library. Install it, then start {{app}} again:

- Ubuntu, Debian: `sudo apt install fuse3`
- Fedora: `sudo dnf install fuse3`
- Arch: `sudo pacman -S fuse3`

Without FUSE, `~/Applications/{{app}}.AppImage --appimage-extract-and-run` starts it too, a little slower.

**It mentions the sandbox ("chrome-sandbox", "SUID sandbox").** See [The sandbox](linux#the-sandbox).

## The sandbox

{{app}}'s windows run in Chromium's sandbox, which needs the user namespaces of the Linux kernel. {{app}} never turns the sandbox off. Ubuntu 23.10 and later let only listed apps use user namespaces:

- **The `.deb`** lists itself when it's installed. On these systems it's the better choice. In a container such as distrobox or toolbox, where it can't list itself, it sets up Chromium's other sandbox, `chrome-sandbox`, instead.
- **The AppImage** has to be listed once. The install script prints these commands when it's needed:

```
printf '%s\n' 'abi <abi/4.0>,' 'include <tunables/global>' 'profile {{linuxExe}}-appimage /tmp/{.mount_*,appimage_extracted_*}/{AppRun,{{linuxExe}}} flags=(unconfined) {' '  userns,' '}' | sudo tee /etc/apparmor.d/{{linuxExe}}-appimage
sudo apparmor_parser -r /etc/apparmor.d/{{linuxExe}}-appimage
```

If you listed the AppImage with an earlier version of these commands, run them again: the AppImage's launcher (`AppRun`) has to be listed too.

Without the listing, the AppImage's launcher starts {{app}} with `--no-sandbox`. {{app}} then shows a bar at the top of the window, **Running without Chromium's sandbox**, until it starts with the sandbox on. Add the listing or install the `.deb`, then quit {{app}} and start it again.

## Keys that do nothing

Input methods can take some keys before {{app}} sees them. IBus, the default on GNOME, opens its emoji picker with Super+., Ctrl+. or Ctrl+Shift+E, depending on its version and settings, and Ctrl+Shift+U types Unicode characters, so {{app}} doesn't use that one. If **Open in editor** doesn't respond to its key, use its button, or turn the input method's shortcut off: run `ibus-setup` and clear it on the **Emoji** tab (on GNOME 46 and later, Settings › Keyboard › Keyboard Shortcuts may list it instead).

## Wayland and X11

{{app}} uses Wayland when your session does and X11 otherwise; you don't need to choose. If the window misbehaves on Wayland (blurry with fractional scaling, a wrong icon, missing title bar buttons), start it on X11 to compare: `~/Applications/{{app}}.AppImage --ozone-platform=x11` (or `{{linuxExe}} --ozone-platform=x11` with the `.deb`).

## The Changes count updates slowly

Linux limits how many folders a user may watch for changes (inotify), and editors, Claude Code and file sync tools share that limit. When it's used up, {{app}} says so once and checks the Changes count every few seconds instead. To raise it:

```
echo fs.inotify.max_user_watches=524288 | sudo tee /etc/sysctl.d/90-inotify.conf
sudo sysctl --system
```

## Your environment

{{app}} reads your login shell's environment at startup, so `claude`, `git` and the rest are found as in a terminal: bash reads `~/.bash_profile` (or `~/.profile`), zsh `~/.zprofile` and `~/.zshrc`, fish its `config.fish`. Terminals inside {{app}} start your shell as your terminal app does.
