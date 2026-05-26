# Installing Orbit

Orbit is in alpha. Installers ship from the
[Releases page](https://github.com/galaxyproject/loom/releases) — pick the
latest tag and download the artifact for your machine.

Linux installers (`.deb` / `.rpm`) are included starting with the first
alpha release. Windows is not yet supported natively — see the
[Windows (via WSL2)](#windows-via-wsl2) section below.

## macOS

Two builds are published per release:

| File                        | When to pick it                                                   |
| --------------------------- | ----------------------------------------------------------------- |
| `Orbit-<version>-arm64.dmg` | Apple Silicon Macs (M1/M2/M3/M4) — anything from late 2020 onward |
| `Orbit-<version>-x64.dmg`   | Intel Macs                                                        |

Not sure which? Open the Apple menu → About This Mac. "Chip: Apple M..." → arm64.
"Processor: Intel..." → x64.

### Install

1. Download the matching `.dmg` from the Releases page.
2. Double-click the DMG, drag **Orbit** to the **Applications** folder.
3. Eject the DMG (drag its icon to the trash).

### First launch (Gatekeeper)

The current alpha builds are **unsigned** — Apple's Gatekeeper will block
the first launch:

> "Orbit can't be opened because Apple cannot check it for malicious software."

To run it the first time:

1. Open the **Applications** folder in Finder.
2. **Right-click** (or Control-click) **Orbit** → choose **Open**.
3. The dialog now offers an **Open** button — click it.

macOS remembers the decision. Subsequent launches work via Spotlight,
Launchpad, or a double-click, with no further prompts.

If you don't see the Open option in the right-click menu, run:

```bash
xattr -dr com.apple.quarantine /Applications/Orbit.app
```

This removes the quarantine attribute Gatekeeper sets on downloads.

### Updates

Orbit checks for new releases on startup. When a newer version is
available, a banner appears at the top of the window with a link to the
Releases page. Click the link, download the new DMG, and replace the old
app in Applications (drag-and-drop will prompt you to overwrite).

There is no auto-installer — unsigned apps can't be patched by macOS's
update mechanism. Manual download is one click after the banner appears.

### Uninstall

Drag **Orbit** from **Applications** to the **Trash**. Per-user state
lives under:

- `~/.orbit/` — window position, version-check cache.
- `~/.loom/` — agent configuration, API keys (encrypted via macOS
  Keychain), session history.

Remove those directories to fully reset the app.

## Linux

Two package formats are published per release:

| File                            | When to pick it                                          |
| ------------------------------- | -------------------------------------------------------- |
| `orbit_<version>_amd64.deb`     | Debian, Ubuntu, Linux Mint, Pop!\_OS, and derivatives    |
| `orbit-<version>.x86_64.rpm`    | Fedora, RHEL, CentOS, openSUSE                           |
| `Orbit-linux-x64-<version>.zip` | Any distro — extract and run the `orbit` binary directly |

### Install (.deb — Debian/Ubuntu)

```bash
sudo dpkg -i orbit_<version>_amd64.deb
sudo apt-get install -f   # resolves any missing dependencies
orbit                     # launch from terminal, or find it in your app launcher
```

### Install (.rpm — Fedora/RHEL)

```bash
sudo rpm -i orbit-<version>.x86_64.rpm
orbit
```

### Install (.zip — any distro)

```bash
unzip Orbit-linux-x64-<version>.zip -d ~/orbit
~/orbit/orbit
```

### Uninstall

```bash
sudo dpkg -r orbit          # Debian/Ubuntu
sudo rpm -e orbit           # Fedora/RHEL
```

Per-user state lives under `~/.orbit/` and `~/.loom/` — remove those to fully reset.

---

## Windows (via WSL2)

Native Windows builds are not yet available. Windows 11 users with
**WSL2 + WSLg** can run the Linux `.deb` build directly — WSLg provides
native GUI support with no X server setup required.

### Prerequisites

1. **WSL2** — run `wsl --install` in an elevated PowerShell if not already set up.
2. **WSLg** — bundled with WSL2 on Windows 11 (build 22000+). Run `wsl --update` to ensure it's current.
3. **Ubuntu** (or another Debian-based distro) inside WSL2.

### Install inside WSL2

Open your WSL2 terminal and run:

```bash
# Download the .deb from the Releases page, then:
sudo dpkg -i orbit_<version>_amd64.deb
sudo apt-get install -f
orbit
```

The Orbit window opens on your Windows desktop via WSLg — no further configuration needed.

### Notes

- File paths inside WSL2 are at `/mnt/c/...` from within the terminal. Point Orbit's working directory at a path inside WSL2 (`~/analyses/`) for best performance — cross-filesystem I/O over `/mnt/c` is slower.
- Keychain-based API key encryption is not available in WSL2 (no `safeStorage`). API keys are stored in plaintext in `~/.loom/config.json` inside the WSL2 filesystem. Use filesystem permissions (`chmod 600`) to restrict access.

---

## Reporting installer issues

If the DMG won't open, the app crashes on launch, or Gatekeeper behaves
differently than described, please file an issue at
[github.com/galaxyproject/loom/issues](https://github.com/galaxyproject/loom/issues)
with: macOS version, Mac model (Apple menu → About This Mac), the exact
filename downloaded, and any error text.
