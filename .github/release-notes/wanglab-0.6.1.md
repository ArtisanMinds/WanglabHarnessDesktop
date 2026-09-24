# Wanglab Harness Desktop 0.6.1

This maintenance release fixes the first startup after upgrading from 0.5.1 to 0.6.0.

- Retired internal plugins are removed before `dsh-tauri-running-changes` is installed, so the profile no longer carries stale `dsh-tauri-connection` or `dsh-tauri-turnrewind` links into the install step.
- Internal plugin cleanup and installation now share the same serialized startup operation for both upgrade and regular launch paths.
- The embedded WebDriver server is registered only when `TAURI_WEBDRIVER_PORT` is explicitly set for desktop E2E tests. Production builds no longer listen on port 4445.

Core remains `0.1.5-rc.3`. Profiles, conversations, provider settings, plugins, and downloaded pets are preserved.
