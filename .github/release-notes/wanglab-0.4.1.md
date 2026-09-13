Fixes startup failure after upgrading to 0.4.0: the paired Core had downloaded and installed successfully, but a stale frontend settings snapshot could overwrite its installation record and trigger CORE_INSTALL_REQUIRED.

Frontend persistence now updates only language and zoom through the backend. Core release metadata is saved together, installation checks the resulting Core before preparing plugins, and settings remain synchronized after the first update. Existing conversations, profiles, provider configuration, and pet selections are preserved.

Uses the same verified Core 0.1.5-rc.2 and Node 22.22.0 as 0.4.0. Users stuck on the startup error can close the application and run the 0.4.1 installer over their existing installation.

Validation includes regression tests for stale frontend snapshots and delayed settings events, plus Windows installation, startup, session migration, and restart checks.
