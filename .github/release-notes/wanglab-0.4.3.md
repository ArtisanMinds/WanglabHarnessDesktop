# Wanglab Harness Desktop 0.4.3

Syncs DeepSeek Harness Desktop **v0.14.1**, including the v0.14.0 changes, and retains the startup recovery introduced in Wanglab 0.4.2.

- Uses the official global panel protocol for extensions and scheduled tasks, including shared selection state and returning to conversations.
- Fixes scheduled task setup with the Agent argument supplied by Core 0.1.5.
- Keeps scheduled-task search and creation controls separate in narrow windows.
- Fixes duplicate insertion when pasting through the right-click menu.
- Uses cursor position polling for pets on Windows to avoid the keyboard hook interfering with IME input.
- Removes the obsolete Session Context Menu preset and includes the upstream Linux AppImage installer handling.
- Repairs stale Core release tags when the installed version, entry file, and full paired commit already match. Other mismatches install the verified paired Core before startup.

Upstream now recommends **Core 0.1.5-rc.2**, matching the existing Wanglab package. Core remains `dsh-0.1.5-rc.2-wanglab040` with Node **22.22.0**; its archive is downloaded separately when needed.

Exit Wanglab Harness Desktop from the system tray, run the 0.4.3 installer over the existing installation, and reopen the app. Users blocked on 0.4.0 or 0.4.1 can upgrade directly; profiles, conversations, provider settings, and pets are preserved.
