# 贡献指南

感谢你对渡鸦感兴趣！不管是提 Issue、修 Bug 还是加新功能，都非常欢迎。

## 🐛 报告问题

- 先搜一下 [现有 Issue](https://github.com/jack021124/Rosever_Launcher/issues)，避免重复
- 提 Bug 走 [🐛 Bug 报告模板](../../issues/new?template=bug_report.yml)，把版本号、系统、复现步骤写清楚
- 想法 / 提问 / 交流请到 [Discussions](https://github.com/jack021124/Rosever_Launcher/discussions)

## 🛠️ 提交代码

### 环境准备

- Node.js ≥ 20
- npm ≥ 10
- Windows 10+（打包仅支持 Windows）

```bash
git clone https://github.com/jack021124/Rosever_Launcher.git
cd Rosever_Launcher
npm install
```

### 开发流程

1. **建分支**：从 `main` 拉一条分支
   ```bash
   git checkout -b feat/my-feature
   ```
2. **本地开发**：
   ```bash
   npm run dev          # 启动 launcher 热重载
   ```
3. **提交前自检**（务必通过）：
   ```bash
   npm run typecheck    # 类型检查
   npm run build        # 构建
   ```
4. **改了 UI 的**：更新截图
   ```bash
   cd apps/launcher
   SERVER_ROOT="<你的 BetterRA 目录>" npm run screenshot
   ```
5. **提 PR**：推到自己的 fork，向 `main` 发起 Pull Request

### 代码风格

- 遵循现有 TypeScript + Tailwind 写法，不要引入新风格
- 注释密度参考周围代码（已有中文注释的地方继续中文）
- commit 信息中文 / 英文皆可，建议命令式（如 `新增 / 修复 / 重构`）

## 📦 版本发布

版本号集中管理在 `apps/launcher/package.json` 的 `version` 字段，遵循语义化版本：

- **major**：不兼容的破坏性改动
- **minor**：向后兼容的新功能
- **patch**：向后兼容的 bug 修复

发布时同步更新 README 顶部徽章 + 版本历史段。

## 📄 许可证

贡献的代码将按 [GPL-3.0](./LICENSE) 许可证发布。提交 PR 即表示同意在此许可证下授权。
