# Wanglab Harness Desktop 0.6.0

Syncs DeepSeek Harness Desktop **v0.16.0**, including all updates since v0.15.8.

- Adopts the upstream 0.1.7 UI and plugin interfaces while keeping compatibility with the paired Core.
- Adds the Run menu and quick application restart action.
- Shows built-in plugins in a separate collapsible group and improves plugin readiness checks and recovery.
- Changes deletion of the default profile to a reset that clears profile data while preserving conversations.
- Adds ungrouped conversation creation under `DSH_HOME/ungrouped` and improves workspace creation and continuation behavior.
- Improves Windows process-log decoding, orphan process cleanup, and non-interactive plugin installation.
- Normalizes MCP stdio configuration to command and arguments.
- Keeps Pets / Market, application-only pet storage, no default pet, and 25-200% sizing. The pet indicator now reflects a visible pet and remains disabled until a pet is selected.
- Keeps Documentation removed from Help, the English About Us introduction, Wanglab provider routes, supplier model discovery, restricted GPT / Claude catalogs, and independent DeepSeek / Grok suppliers.

Upstream recommends **Core 0.1.5-rc.3** for v0.16.0. This release uses paired Wanglab Core `dsh-0.1.5-rc.3-wanglab060` with Node **22.22.0**. Matching installations are reused; older installations are upgraded automatically.

Exit Wanglab Harness Desktop from the system tray, run the 0.6.0 installer over the existing installation, and reopen the app. Profiles, conversations, provider settings, and downloaded pets are preserved.
