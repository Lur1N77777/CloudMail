# CloudMail

CloudMail 是一个面向临时邮箱/自建邮箱服务的移动端管理工具，基于 Expo 和 React Native 构建。它重点面向管理员使用场景，支持邮箱地址管理、收发邮件、未知收件地址处理、验证码快速查看，以及 HTML 邮件预览。

## 主要功能

- 管理员模式：集中管理邮箱地址、收件箱、发件箱和未知收件地址。
- 邮箱地址管理：创建邮箱、随机邮箱、子域名邮箱，并支持本地分组管理。
- 邮件管理：查看收件、发件、未知收件邮件，支持搜索、缓存和增量刷新。
- 邮件详情：支持 HTML、纯文本、富文本内容查看，验证码可快捷复制。
- 发送邮件：支持从指定邮箱地址发件。
- 移动端体验：适配深色/浅色模式、紧凑卡片和移动端导航。

## 技术栈

- Expo / React Native
- TypeScript
- Expo Router
- AsyncStorage / SecureStore
- Vitest
- Drizzle（可选后端能力）

## 快速开始

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

运行类型检查和测试：

```bash
pnpm check
pnpm test
```

## 配置环境变量

复制示例配置：

```bash
cp .env.example .env.local
```

移动端连接邮箱服务主要通过应用内设置完成。`.env.example` 中的变量主要用于本地开发、OAuth、数据库、Forge 或 AI 相关可选能力。

不要把真实密码、token、API key、数据库连接串提交到 Git。

## 构建 Android APK

详细步骤见 [BUILD.md](./BUILD.md)。

常用本地构建流程：

```bash
pnpm install
npx expo prebuild -p android --clean
cd android
./gradlew assembleRelease
```

生成的 APK 不提交到源码仓库。公开发布时建议上传到 GitHub Releases。

## 发布包

本地 `releases/` 目录可保存最近构建出的 APK，但 APK 文件会被 Git 忽略。仓库只保留 `releases/README.md` 用于说明发布策略。

## 文档

- [构建与安装指南](./BUILD.md)
- [设计文档](./docs/design.md)
- [API 使用说明](./docs/mailbox-api-report.md)
- [路线图](./docs/roadmap.md)

## 贡献

欢迎提交 issue 和 pull request。开始前请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 安全

如果发现安全问题，请查看 [SECURITY.md](./SECURITY.md) 中的报告方式。不要在公开 issue 中粘贴真实 token、密码或邮箱凭证。

## License

MIT
