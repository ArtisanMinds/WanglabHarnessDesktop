# Wanglab Harness Desktop 0.7.0

Syncs DeepSeek Harness Desktop **v0.17.0** while preserving Wanglab providers, model catalogs, branding, Pets / Market, and updater recovery.

- Adds the official account menu and opens the system browser automatically when account authorization begins.
- Registers `dsh://open` so the login success page can return to the installed desktop app.
- Limits the desktop carrier marker to the embedded shell iframe, keeping direct browser sessions on the browser fallback path.
- Adopts the new bottom-left settings menu and moves the pet enable / disable action there while retaining Pet status integration, Market, no default pet, and 25-200% sizing.
- Recognizes desktop restart support only when the real restart command is available.

Upstream still recommends **Core 0.1.5-rc.3**. This release reuses the paired Wanglab Core `dsh-0.1.5-rc.3-wanglab060`; matching installations are not downloaded again. Profiles, conversations, provider settings, plugins, and downloaded pets are preserved.
