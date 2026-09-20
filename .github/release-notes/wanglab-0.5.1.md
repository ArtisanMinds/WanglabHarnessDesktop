# Wanglab Harness Desktop 0.5.1

Syncs DeepSeek Harness Desktop **v0.15.8**, including the updates since v0.15.5.

- Removes Documentation from Help on Windows, Linux, and the macOS native menu.
- Adds direct navigation to configuration panels and configurable text editors for model settings.
- Updates model reasoning options, role compatibility, and mouse selection behavior.
- Adds startup checks and backed-up recovery for unresolved plugin patch entries.
- Uses the new built-in connection plugin for the embedded Desktop interface.
- Improves worktree session migration, workspace rewind locking, and Core backup preservation.
- Updates the pet component to 0.2.2 while retaining Pets / Market, 25–200% sizing, no default pet, and application-only pet storage.
- Preserves Wanglab provider routes, the restricted GPT / Claude catalogs, independent DeepSeek / Grok suppliers, and the English About Us introduction.

Upstream continues to recommend **Core 0.1.5-rc.2**. This release uses the existing paired Wanglab Core `dsh-0.1.5-rc.2-wanglab040` with Node **22.22.0**. Matching installations are reused; older installations are upgraded automatically.

Exit Wanglab Harness Desktop from the system tray, run the 0.5.1 installer over the existing installation, and reopen the app. Profiles, conversations, provider settings, and downloaded pets are preserved.
