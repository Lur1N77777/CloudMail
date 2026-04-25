<div align="center">
  <img src="./assets/images/icon.png" alt="CloudMail logo" width="96" height="96" />

# CloudMail

面向 Cloudflare 临时邮箱系统的移动端管理员客户端。

[![CI](https://github.com/Lur1N77777/CloudMail/actions/workflows/ci.yml/badge.svg)](https://github.com/Lur1N77777/CloudMail/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Expo](https://img.shields.io/badge/Expo-54-black.svg)](https://expo.dev/)
[![React Native](https://img.shields.io/badge/React%20Native-0.81-61DAFB.svg)](https://reactnative.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6.svg)](https://www.typescriptlang.org/)

[English](./README.md) · [简体中文](./README.zh-CN.md)

[下载 APK](https://github.com/Lur1N77777/CloudMail/releases) · [从源码构建](./BUILD.md) · [API 说明](./docs/mailbox-api-report.md)

</div>

## CloudMail 是什么

CloudMail 是一个基于 Expo / React Native 构建的移动端邮箱管理应用。它面向管理员使用场景，帮助你在手机上集中管理临时邮箱地址、收件箱、发件箱、未知收件地址、验证码邮件和 HTML 邮件内容。

CloudMail 的邮箱后端/API 兼容能力来自 [dreamhunter2333/cloudflare_temp_email](https://github.com/dreamhunter2333/cloudflare_temp_email)。CloudMail 在这个 Cloudflare 临时邮箱系统生态上提供移动端管理员体验。

## 功能亮点

- **管理员优先**：打开应用后连接你的邮箱服务，即可集中管理邮箱地址和邮件。
- **邮箱地址管理**：支持创建自定义邮箱、随机邮箱、子域名邮箱。
- **收件 / 发件 / 未知地址**：查看收件箱、发件箱，以及发往未创建地址的邮件。
- **验证码快捷处理**：识别常见验证码，并支持快速复制。
- **HTML 与文本邮件阅读**：支持富文本 HTML、纯文本和源文本查看。
- **本地分组**：给邮箱地址分组，并按分组筛选邮件。
- **移动端体验**：紧凑卡片、深色/浅色模式、本地缓存、增量刷新。
- **自托管友好**：邮箱服务由你自己部署和控制。

## 截图

截图会在公开 UI 稳定后补充。你可以先下载 Release 里的 APK 体验当前版本。

## 下载

从 [GitHub Releases](https://github.com/Lur1N77777/CloudMail/releases) 下载最新版 APK。

APK 不会直接提交到源码仓库，这样可以保持 Git 历史干净，也方便后续审计和版本管理。

## 上游邮箱系统

CloudMail 面向兼容 [cloudflare_temp_email](https://github.com/dreamhunter2333/cloudflare_temp_email) 的邮箱系统开发。

感谢 [dreamhunter2333](https://github.com/dreamhunter2333) 和上游项目贡献者提供 Cloudflare 临时邮箱系统与相关 API 行为。CloudMail 在此基础上补充移动端管理员客户端体验。

更多致谢信息见 [NOTICE](./NOTICE)。

## 技术栈

- Expo / React Native
- TypeScript
- Expo Router
- AsyncStorage / SecureStore
- WebView 邮件预览
- Vitest
- 可选 Drizzle 后端工具

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

提交 PR 前建议运行：

```bash
pnpm check
pnpm test
```

## 配置环境变量

复制示例配置：

```bash
cp .env.example .env.local
```

大多数邮箱连接配置都在应用内完成。环境变量主要用于本地开发、可选 OAuth / 服务端能力、数据库工具、Forge 集成和 AI 相关工具。

不要提交真实密码、管理员 token、邮箱凭证、API key 或数据库连接串。

## 构建 Android APK

完整说明见 [BUILD.md](./BUILD.md)。

常用本地构建流程：

```bash
pnpm install
npx expo prebuild -p android --clean
cd android
./gradlew assembleRelease
```

生成的 APK 建议上传到 GitHub Releases，不要提交到 Git 仓库。

## 项目文档

- [构建与安装指南](./BUILD.md)
- [设计说明](./docs/design.md)
- [邮箱 API 报告](./docs/mailbox-api-report.md)
- [路线图](./docs/roadmap.md)
- [安全策略](./SECURITY.md)
- [贡献指南](./CONTRIBUTING.md)

## 贡献

欢迎提交 issue 和 pull request。请保持改动聚焦，提交前运行检查，不要在提交中包含密钥或生成的 APK 文件。

## 许可证

CloudMail 使用 [MIT License](./LICENSE) 开源。

上游邮箱系统为 [dreamhunter2333/cloudflare_temp_email](https://github.com/dreamhunter2333/cloudflare_temp_email)。请同时查看上游仓库的许可证和使用条款。

