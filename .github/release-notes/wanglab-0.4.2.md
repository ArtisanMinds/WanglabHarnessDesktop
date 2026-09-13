# Wanglab Harness Desktop 0.4.2

Fixes the `CORE_INSTALL_REQUIRED` startup loop after upgrading from 0.4.0 to 0.4.1 when Core 0.1.5-rc.2 and its paired commit are already installed but the saved release tag still refers to 0.1.2-rc.1.

- Installation and startup now share the same paired Core checks. When the installed version, entry file, and full commit match, installation repairs the stale or missing tag without downloading or replacing Core files.
- A matching tag alone cannot skip installation when the commit, manifest, or entry file is missing or incorrect.
- Diagnostics report the version from the installed Core manifest before falling back to the saved tag.
- Windows regression checks cover mixed release records, repair without a download, actual frontend startup, settings preservation, and existing sessions.

Core remains **0.1.5-rc.2**, paired tag `dsh-0.1.5-rc.2-wanglab040`, with Node **22.22.0**. The desktop installer does not embed the Core archive.

For a blocked installation, exit Wanglab Harness Desktop from the system tray, run the 0.4.2 installer over the existing installation, and reopen the app. The installer preserves user profiles, conversations, provider settings, and pets.
