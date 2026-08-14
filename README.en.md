# DeepSeek Harness Desktop

English | [简体中文](README.md)

An unofficial DeepSeek Harness desktop wrapper for Windows x64. The installer bundles Node.js, pnpm, and a pinned version of `@deepseek-ai/dsh`, so users do not need to set up Node.js separately.

> This is a community wrapper, not an official DeepSeek distribution. DeepSeek does not provide support or security endorsement for this project. DeepSeek Harness is still a developer preview.

## Versions

| Component | Version |
|---|---|
| DeepSeek Harness Desktop | `0.1.0` |
| `@deepseek-ai/dsh` | `0.1.0-rc.6` |
| Node.js | `24.4.0` |
| pnpm | `10.8.0` |
| Node.js embedded in the pnpm standalone executable | `20.11.1` |

## Features

- Packages the upstream dsh Web UI as a Windows desktop application.
- Bundles its runtime and serves dsh only on the local loopback address, `127.0.0.1`.
- Adds title-bar entry points for plugin management, the community plugin marketplace, and profile management.
- Groups plugins by bundle and supports configuration toggles, npm/Git installation, and removal of non-core components.
- Reads [awesome-dsh-plugins](https://github.com/AdamPlatin123/awesome-dsh-plugins) with search, caching, and one-click installation.
- Creates, copies, renames, removes, and switches Web profiles.
- Synchronizes management windows with dsh light, dark, and plugin themes.
- Enforces a single application instance and retries a crashed dsh process up to two times.
- Uses native Windows controls, rounded corners, shadows, and edge resizing.

## Requirements

- Windows 10 or Windows 11, x64.
- About 1 GB of free disk space.
- A network connection for model requests, the plugin marketplace, and plugin installation.
- Your own API key for a supported model provider. The quick start below uses the DeepSeek API as an example.

The project currently ships an NSIS installer only. There is no portable build or automatic updater.

## Download and installation

1. Download `DeepSeek Harness Setup 0.1.0.exe` from GitHub Releases.
2. Run the installer and choose an installation directory.
3. The installer creates Desktop and Start Menu shortcuts.

The installer is not code-signed. Windows SmartScreen may show an Unknown Publisher warning. Verify the download source and the SHA-256 value published with the release before selecting **More info → Run anyway**.

## Quick start

1. Start DeepSeek Harness.
2. Open **Settings → Models** and enter the model configuration and API key.
3. Select a dedicated workspace.
4. Review the session permissions and tool approval settings before starting work.
5. Use **Plugin Manager**, **Plugin Marketplace**, and **Environment Manager** in the title bar for desktop-specific management.

DeepSeek Harness is a local agent system, not a read-only chat client. Depending on the permissions you grant, it can read and modify workspace files, run PowerShell or shell commands, access the network, and invoke other tools. Start with an isolated test directory. Do not select your entire user profile, a cloud-drive root, or an important repository without a current backup.

## Plugins

### Bundle plugins

Plugins with a `dsh.bundle` manifest are loaded by the dsh bundle system. The desktop app restarts dsh when required after installation, removal, or configuration changes.

### Non-bundle plugins

The bundled dsh `0.1.0-rc.6` cannot activate insert plugins that do not provide a `dsh.bundle` manifest. The desktop app can install the dependency and retain its mount entry in `cordis.patch.yml`, but the plugin is not functional with this dsh version. The entry is retained only for possible future upstream compatibility.

Removing a non-bundle row may remove only its mount configuration. Dependency files can remain in the corresponding profile.

### Plugin security

Third-party plugins are not sandboxed extensions. They run with the current Windows user's permissions and may access workspaces, application data, environment variables, the network, and local tools. Install only sources you trust, and inspect their code, maintenance status, and release history first.

The marketplace's “verified” state comes from the community list. It does not mean this desktop project performed a code audit, signature verification, hash pinning, or continuous security review.

## Profile environments

Environment Manager can create, copy, rename, remove, and switch Web profiles. Switching profiles restarts dsh.

Current constraints:

- Every application start uses the `web` profile; the previous selection is not restored.
- The UI can create Web profiles only.
- Profile removal bypasses the Recycle Bin and cannot be undone.
- Do not rename or remove the active profile. This release does not fully synchronize that change with the running service.
- Copying a large profile also copies local dependencies and may briefly block the window.

Back up `%APPDATA%\DeepSeekHarness\dsh-home\profiles\` before destructive operations.

## Privacy and local data

Application data is stored under `%APPDATA%\DeepSeekHarness\`:

| Path | Contents |
|---|---|
| `config.json` | Desktop wrapper settings |
| `logs\dsh.log` | dsh standard output and error log |
| `marketplace-cache\marketplace.json` | Plugin marketplace cache |
| `dsh-home\.credentials.yaml` | Model credentials |
| `dsh-home\profiles\` | Profile settings, plugins, and dependencies |
| `dsh-home\storages\` | Sessions and upstream dsh storage |

Model credentials are stored in a local file. They are not protected by Windows Credential Manager or DPAPI. Do not upload the complete `%APPDATA%\DeepSeekHarness\` directory to an issue tracker, cloud drive, or public log. `dsh.log`, sessions, caches, and Chromium data may also contain file paths, command output, or other private content.

The uninstaller does not remove this data. To remove everything, exit the application, back up any profiles you need, and then delete `%APPDATA%\DeepSeekHarness\` manually.

### Network requests and telemetry

- Model requests go to the provider configured by the user.
- The marketplace reads `awesome-dsh-plugins` from GitHub.
- Plugin installation may access npm, GitHub, or a Git URL supplied by the user.
- The bundled dsh profile disables telemetry by default.
- An external `DSH_TELEMETRY_MODE` environment variable can change upstream telemetry behavior; `DSH_TELEMETRY_DISABLED` can force telemetry off.

When full upstream telemetry is enabled, messages, tool arguments, tool results, command output, file content, and local paths may be included. Read the upstream documentation and confirm your organization's data policy before enabling it.

## Known limitations

- Windows x64 only.
- Unsigned installer with an Unknown Publisher warning.
- No automatic updates.
- The bundled dsh release is an RC developer preview and may introduce breaking changes.
- Local ports are selected only from `3080-3090`.
- Startup waits up to 30 seconds.
- Non-bundle plugins do not work with the bundled dsh version.
- Profile management has the active-profile constraints described above.
- Closing every application window stops the local dsh service; there is no tray mode.

Back up `%APPDATA%\DeepSeekHarness\` before upgrades or resets.

## Troubleshooting

### SmartScreen blocks installation

Confirm that the installer came from the project release and verify its SHA-256. The current build is unsigned, so Windows reports an unknown publisher.

### dsh fails to start

1. Check whether every port from `3080` through `3090` is occupied.
2. Read `%APPDATA%\DeepSeekHarness\logs\dsh.log`.
3. Stop stale DeepSeek Harness or bundled Node processes and try again.

### Plugin installation fails

Check the network, npm/Git source, and the output panel. A plugin operation times out after 120 seconds by default. Community plugins may not be compatible with the bundled dsh RC.

### Safe reset

1. Exit the application.
2. Back up `%APPDATA%\DeepSeekHarness\dsh-home\profiles\` and any required sessions.
3. Move `%APPDATA%\DeepSeekHarness\` to another location.
4. Start the application to create a clean data directory.

Delete the backup manually only after confirming it is no longer needed. Do not clear user data without a backup.

## Development

```powershell
npm ci
npm run prepare:resources
npm test
npm run check:release
npm start
npm run dist
```

`prepare:resources` downloads pinned versions of Node.js, pnpm, dsh, and the official license texts for both Node.js runtimes and pnpm into the Git-ignored `resources/` directory. The standalone Windows pnpm executable itself embeds Node.js `20.11.1`.

The resource script validates the existing Node.js, pnpm (including its embedded Node.js), and dsh versions, and checks the license texts against pinned upstream Git blob hashes. Before upgrading a bundled component, still back up and clear its corresponding `resources/` subdirectory, then prepare it again. Public builds should also verify runtime download sources and hashes.

The installer is written to `dist/DeepSeek Harness Setup <version>.exe`. `npm run dist` automatically runs the release gate first, checking Git candidates and packaged resources for sensitive paths and common credential formats. Release only the installer, its SHA-256, release notes, and required license material. Do not publish `dist/win-unpacked` or `builder-debug.yml`.

## Project structure

```text
assets/                 Icon source
build/                  Windows build assets
docs/architecture/      Architecture and renderer contracts
scripts/                Resource preparation and smoke tests
src/main/               Electron main process
src/main/services/      dsh, plugin, marketplace, and profile services
src/preload/            contextBridge and main-window theme probe
src/renderer/           Management windows and shared theme styles
test/                   Vitest tests
```

The main process starts the bundled dsh service and loads its Web UI into the primary window. Three local management windows call main-process services through a constrained preload API. See [`docs/architecture/renderer-contract.md`](docs/architecture/renderer-contract.md) for the detailed boundary.

## Release checklist

1. Synchronize the version in `package.json` and component versions in `scripts/prepare-resources.mjs`.
2. Prepare the runtime from a clean `resources/` directory.
3. Run `npm test`, `npm run check:release`, `npm run smoke:install`, and real install/uninstall checks. The gate scans the actual packaged inputs, including Git-ignored resources.
4. Run `npm run dist`.
5. Verify icons for the executable, installer, shortcuts, and uninstaller.
6. Confirm that Git and the installer contain no `.superpowers` data, credentials, cookies, logs, or user data.
7. Generate the installer SHA-256 and include it in the release.

## License and attribution

This desktop wrapper is licensed under the [MIT License](LICENSE). Distributed third-party components remain under their respective licenses; see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) is developed by DeepSeek and licensed under the MIT License. The DeepSeek name and whale mark belong to their respective owner. Their use in this project identifies compatibility and does not imply official partnership, endorsement, or support.
