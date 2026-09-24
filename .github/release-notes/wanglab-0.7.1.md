# Wanglab Harness Desktop 0.7.1

Fixes the Core conversation identity that remained upstream-branded in 0.7.0.

- Identifies the model-facing coding agent as Wanglab Harness.
- Uses the model provider selected by the user instead of claiming a fixed `deepseek-flash` model in the persona.
- Displays the system context source as `Wanglab Harness` instead of the internal npm package name.
- Removes the remaining upstream brand references from model-visible Web GUI, checkout, and skill context.
- Preserves internal package identifiers and existing session compatibility.

This release installs the corrected paired Core `dsh-0.1.5-rc.3-wanglab071`, built from commit `5e25795c5d22ff9005737527e1da1ee1f8229db7` with Node **22.22.0**. The Core archive passed localization, model routing, native terminal, startup, ZIP integrity, and SHA-256 checks. Profiles, conversations, provider settings, plugins, and downloaded pets are preserved.
