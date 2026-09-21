> 该文档已被固定，禁止修改

# 插件基础规范

## 常量归属规范

适用于 `packages/*` 宿主端与客户端两侧（含 `ctx.effect` 标签、样式 ID、槽位名等）。与任何 `.spec.md` 冲突时，**以本规则为准**。

```
├── 仅 1 个文件消费  ──> 定义在消费文件内部（模块级 const，不导出，放置于 import 之后）
├── 同侧多文件消费  ──> 登记至同侧常量模块
│                        ├── Host 侧: src/host/config/constants.ts
│                        └── Client 侧: src/client/constants/index.ts
├── 跨侧 (Host/Client) ──> 统一收录至共享模块: src/shared/constants.ts
└── 0 个文件消费    ──> 直接删除常量（若文件被清空，同步删文件及悬空 import）
```

> **例外说明**：路由 `path` 不放入常量模块，一律在 `routes/index.ts` 中直接书写字面量。所有常量命名须保证全仓语义唯一。