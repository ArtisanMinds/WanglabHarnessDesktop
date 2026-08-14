# Resources

This directory is bundled into the installer as `resources/**`.

At runtime, the application downloads everything it needs into the OS user-data
directory (the Tauri app-data dir for identifier
`io.github.hairyf.deepseek-harness-desktop`, e.g. `%APPDATA%/io.github.hairyf.deepseek-harness-desktop/` on Windows):

- `runtime/` — the bundled Node.js runtime (downloaded on first run)
- `dsh-core/` — the packaged DeepSeek Harness distribution (downloaded from the
  `hairyf/deepseek-harness-pkg` release feed)
- `dsh-home/` — the isolated `$DSH_HOME` used by the running `dsh` process
- `logs/` — application and `dsh` service logs
- `config/` — desktop settings (port, auto-start, etc.)

No manual Node.js or pnpm installation is required.
