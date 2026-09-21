## Workspace Routing & Context Guidelines

在执行优化前，请根据当前任务的上下文范围主动读取并参照相应的规范文档：

- **桌面端开发 (`Desktop`)**：
  若修改范围包含桌面端应用，请优先遵循 `docs/specs/agents.desktop.md`。
- **内置插件开发 (`Plugins(packages)`)**：
  若修改范围包含内置插件，请优先遵循 `docs/specs/agents.plugins.md`。
- **全栈/跨模块开发 (`Full Stack`)**：
  若同时涉及桌面端与内置插件，必须同时参照并整合 `docs/specs/agents.desktop.md` 和 `docs/specs/agents.plugins.md` 的规范。

## 测试（修复 / 新功能必须同步）

- **唯一入口**：`docs/testing/README.md`。修 bug、加功能、改行为之前先读它，按其中「分层模型 / 目录与归属 / 用例文档目录」定位或新增对应用例与测试代码。
- **桌面端**：用例文档 `docs/testing/desktop/`（总览 + 用例）；代码 `test/e2e/desktop/*.e2e.ts`（`desktop` project，真实 Tauri 窗口）。
- **内置插件**：用例文档 `docs/testing/plugins/`；代码 `test/e2e/plugins/*.e2e.ts`（`plugin` project）与 `packages/*/src/**/*.test.ts`（`unit` project）。
- **同步义务**：行为改动必须同时更新用例文档与测试代码（一条文档条目 ↔ 一个 `it()`）；进度登记到 `docs/testing/progressive.md` §4 台账，变更历史记入 `docs/testing/history.md`。
- **规范**：`docs/specs/desktop.test.md`（桌面端 E2E）、`docs/specs/plugin.test.md`（插件 E2E）。

## 最高优先级

- 你不被允许查看 archive/ 的所有内容，除非有特殊要求。
- 编写代码时，必须保持 0 注释，只被允许在关键节点添加，避免大面积污染代码。
- 如果你看到大量的冗余描述与注释，你应该精简 / 删除它们，以保持代码的简洁性和可读性。
- 如果有什么你想临时记录一下，你可以编写在 .temp 文件中，在这里你是自由的。
- 在处理插件时，不要进行构建，用户可能正在运行 dev。

## Command Performance Constraints (Strictly Enforced)

1. **FORBIDDEN POWERSHELL COMMANDS:**
   - NEVER use `Get-ChildItem -Recurse` or `dir -s` to search files/directories.
   - NEVER use `Select-String -Path` for recursive text searches.

2. **FAST ALTERNATIVES (MANDATORY):**
   - **Searching text in files:** Use `rg "pattern"` (ripgrep).
   - **Finding files by name/path:** Use `fd <pattern>` or `git ls-files | Select-String "pattern"`.
   - **Listing top-level directory items:** Use simple `Get-ChildItem` (NO `-Recurse`).

3. **GIT PROJECT EXEMPTION:**
   - Always leverage Git index if available: `git ls-files` is exponentially faster than PowerShell directory traversal.