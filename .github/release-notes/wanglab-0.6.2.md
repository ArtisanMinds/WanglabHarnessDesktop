# Wanglab Harness Desktop 0.6.2

This maintenance release fixes a false installer download failure after an update has already downloaded and passed SHA-256 verification.

- The updater reuses the release manifest fetched at the start of the download instead of requesting it again after the installer is complete.
- A transient manifest request can no longer turn a successful download into a visible failure or leave the update dialog on "Update Now".
- Cached installers are checked against the manifest SHA-256 before they are offered or opened. Invalid cached files are removed and downloaded again.

Core remains `0.1.5-rc.3`. Profiles, conversations, provider settings, plugins, and downloaded pets are preserved.
