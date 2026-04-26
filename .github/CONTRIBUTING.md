# 贡献指南

感谢你愿意帮助改进 CloudMail。

CloudMail 是面向 `cloudflare_temp_email` 兼容 API 的 Cloudflare 临时邮箱移动端管理员 App。为了让维护和发布更稳定，请尽量保持改动清晰、可验证、易回滚。

## 开始之前

- 较大的功能或交互调整，建议先开 issue 讨论思路。
- Pull Request 尽量只解决一个明确问题，避免把 UI 重构、API 调整和清理代码混在一起。
- 不要提交真实密码、管理员 token、API key、邮箱凭证、数据库连接串或私有 Worker 地址。
- APK、构建缓存、Android SDK/JDK、本地日志等生成文件不要提交到 Git。

## 本地开发

安装依赖：

```bash
pnpm install
```

启动开发环境：

```bash
pnpm dev
```

只启动 Expo：

```bash
pnpm dev:metro
```

## 提交前检查

提交 PR 前建议运行：

```bash
pnpm check
pnpm test
```

如果改动涉及 Android 打包，也建议本地构建一次 APK，并确认安装包可以正常启动。

## Pull Request 检查清单

- [ ] 改动范围聚焦在一个目的上。
- [ ] TypeScript 检查通过。
- [ ] 测试通过，或说明为什么暂时没有补测试。
- [ ] 行为、配置或使用方式变化时，同步更新 README / CHANGELOG / 相关文档。
- [ ] 没有提交真实密钥、私有服务地址或个人凭证。
- [ ] 没有提交生成的 APK 文件。

## 语言与文档风格

- 面向普通使用者的文档优先使用中文。
- 技术名词、库名、命令、文件名和 API 名称保留英文更清晰。
- 英文 README 保留给国际用户，但中文 README 是主要入口。
