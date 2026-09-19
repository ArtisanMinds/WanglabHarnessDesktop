# Wanglab Harness Desktop 0.5.0

Syncs DeepSeek Harness Desktop **v0.15.5**, including all changes since v0.14.1.

- Adds model capacity, image input, and reasoning controls. Available model IDs still come from the selected provider endpoint; the capability catalog only enriches those models.
- Adds searchable scheduled run history, unread indicators, and direct navigation to a run's conversation.
- Integrates the installed plugin market into Extensions and updates the panel layout.
- Improves interrupted conversation recovery and worktree cleanup.
- Fixes Windows short-path aliases being mistaken for different worktree locations, preserving existing worktrees and uncommitted files.
- Fixes Windows text-selection freezes, command shim line endings, pnpm store migrations, and internal plugin linking.
- Updates pet bubbles and archive import compatibility while preserving Pets / Market, application-only pet storage, 25–200% sizing, and render-confirmed status. No default pet or pet assets are bundled.
- Preserves Wanglab model routes, independent DeepSeek / Grok suppliers, existing settings, and the English About Us introduction. Grok continues to use the pi-ai route.
- Retains paired Core recovery, including repair of mixed version records from older Desktop releases.

Upstream continues to recommend **Core 0.1.5-rc.2**. This release uses the existing verified Wanglab Core `dsh-0.1.5-rc.2-wanglab040` with Node **22.22.0**. Core is downloaded separately when needed; an already matching installation is reused.

Exit Wanglab Harness Desktop from the system tray, run the 0.5.0 installer over the existing installation, and reopen the app. Users blocked on earlier releases can upgrade directly. Profiles, conversations, provider settings, and downloaded pets are preserved.
