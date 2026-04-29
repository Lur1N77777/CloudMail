# CloudMail

<div align="center">
  <img src="./assets/images/icon.png" alt="CloudMail logo" width="96" height="96" />

**V1.1.0 · Cloudflare Temp Email 移动端管理员 App**

[![CI](https://github.com/Lur1N77777/CloudMail/actions/workflows/ci.yml/badge.svg)](https://github.com/Lur1N77777/CloudMail/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Expo](https://img.shields.io/badge/Expo-54-black.svg)](https://expo.dev/)
[![React Native](https://img.shields.io/badge/React%20Native-0.81-61DAFB.svg)](https://reactnative.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6.svg)](https://www.typescriptlang.org/)

[简体中文](./README.md) · [English](./docs/README.en.md)

[下载 APK](https://github.com/Lur1N77777/CloudMail/releases) · [从源码构建](./docs/BUILD.md) · [API 说明](./docs/mailbox-api-report.md)

</div>

## 项目定位

CloudMail 是一个面向 **Cloudflare Temp Email / Cloudflare 临时邮箱** 的 Android 管理端 App，基于 Expo / React Native 开发，主要适配 [dreamhunter2333/cloudflare_temp_email](https://github.com/dreamhunter2333/cloudflare_temp_email) 及其兼容 API。

上游项目提供 Cloudflare Worker 邮箱后端、Web 管理端和邮箱收发能力；CloudMail 则把这些能力整理成更适合手机使用的管理员客户端。它不是新的邮箱后端，也不是 Cloudflare 官方产品，而是围绕 `cloudflare_temp_email` 项目生态开发的移动端管理工具。

CloudMail 当前主流程是 **管理员优先**：首次启动进入管理员设置，配置并校验成功后直接进入管理员后台，普通用户欢迎页不再作为主入口。

## V1.1.0 更新重点

V1.1.0 是一次管理员管理能力增强版本，重点解决大量邮箱、用户筛选、批量处理和垃圾信箱交互问题。

- **管理员按用户查看地址**：适配网页版实际使用的 `/admin/users/bind_address/:user_id` 接口，在地址页选择用户后可查看该用户名下绑定邮箱。
- **大量地址完整索引**：针对 800+ 地址场景优化分组和搜索，不再只依赖当前分页里已加载的数据，分组成员显示更完整。
- **地址批量管理**：支持选择模式、全选当前范围、批量删除地址、清空收件、清空发件、清空全部邮件、删除空邮箱，以及批量加入/移出本地分组。
- **收件内置垃圾信箱**：不新增顶部导航栏，在收件页标题处通过轻量下拉切换 `收件箱 / 垃圾信箱`；本地按完整发件邮箱地址拒收，命中邮件自动归入垃圾信箱。
- **长按操作菜单**：邮件列表不再常驻显示拒收按钮，改为长按邮件打开精致浮层菜单，可拒收发件人、取消拒收或删除邮件。
- **一键全部已读**：收件、未知和垃圾信箱支持一键清除当前 Worker 下本地未读点，并同步到已挂载页面。
- **浮层与动画打磨**：下拉框、长按菜单和相关滑块使用更统一的轻量浮层样式，减少原生弹窗的突兀感。
- **用户筛选稳定性修复**：修复旧请求覆盖新用户视图、地址缓存回放旧列表、刷新/同步状态卡住等竞态问题。
- **手机端细节优化**：继续保留 V1.0.12 的新邮件未读点、验证码复制提示、OLED 黑主题、紧凑列表布局和键盘避让优化。

## 功能亮点

- **Cloudflare Temp Email 移动管理员端**：连接你的 `cloudflare_temp_email` 兼容 Worker/API，在手机上管理临时邮箱系统。
- **管理员后台**：统计、地址、收件、发件、未知收件和发送邮件集中管理。
- **用户维度管理**：读取管理员用户列表，并查看某个用户名下绑定的邮箱地址。
- **邮箱地址管理**：创建自定义邮箱、子域名邮箱、随机子域名邮箱，查看凭证、清空收件箱、删除地址。
- **批量操作**：可按当前筛选结果批量处理地址和地址下邮件，危险操作前提供预览与确认。
- **本地分组**：给邮箱地址分组，并在地址和邮件列表中按分组筛选。
- **收件 / 垃圾信箱**：在收件页内切换普通收件箱和垃圾信箱，通过长按邮件拒收或取消拒收发件人。
- **收件 / 发件 / 未知地址**：查看系统收件、发件记录，以及发往未创建地址的邮件；未知地址可一键创建为正式邮箱。
- **验证码快捷处理**：自动识别常见验证码，一键复制并显示成功提示。
- **新邮件提醒**：本地记录新邮件/已读状态，历史邮件默认不打扰，新刷新出的邮件会显示轻量小圆点。
- **HTML 邮件阅读**：支持富文本 HTML、纯文本、源文本和邮件详情查看。
- **主题与夜间阅读**：支持浅色、普通深色、OLED 黑和跟随系统；深色快捷切换会记住你偏好的黑色类型。
- **自托管友好**：邮箱服务由你自己部署和控制，移动端只连接你的 Worker/API。

## 截图

点击缩略图可以打开原图查看。

| 预览                                                                                                                                         | 说明                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| <a href="./docs/screenshots/admin-dashboard.jpg"><img src="./docs/screenshots/admin-dashboard.jpg" width="220" alt="管理员统计面板" /></a>   | **管理员统计面板**：集中展示可管理地址、收件、发件和未知地址收件数量，支持刷新和顶部标签切换。 |
| <a href="./docs/screenshots/compose-mail.jpg"><img src="./docs/screenshots/compose-mail.jpg" width="220" alt="发件界面" /></a>               | **发送邮件**：选择发件身份，填写收件人、主题和正文。                                                         |
| <a href="./docs/screenshots/settings-server.jpg"><img src="./docs/screenshots/settings-server.jpg" width="220" alt="服务器配置" /></a>       | **管理员设置**：配置 Worker 地址、Admin 密码、站点密码和自动刷新间隔。                                       |
| <a href="./docs/screenshots/settings-appearance.jpg"><img src="./docs/screenshots/settings-appearance.jpg" width="220" alt="外观设置" /></a> | **外观设置**：选择浅色、深色、OLED 黑或跟随系统。                                                            |

## 下载与安装

从 [GitHub Releases](https://github.com/Lur1N77777/CloudMail/releases) 下载最新版 APK。

APK 不直接提交到源码仓库，构建产物通过 GitHub Releases 分发，以保持 Git 历史干净。

## 使用方式

### 1. 准备邮箱服务

CloudMail 需要连接到一个已经部署好的 `cloudflare_temp_email` 兼容服务，也就是你的 Cloudflare 临时邮箱 Worker/API。你需要准备：

- **Worker 地址**：例如 `https://your-worker.example.com`。
- **Admin 密码**：用于进入管理员后台。
- **站点密码**：如果 Worker 配置了 `PASSWORDS`，需要填写。

如果还没有部署后端，请先参考上游项目 [cloudflare_temp_email](https://github.com/dreamhunter2333/cloudflare_temp_email)。

### 2. 首次配置

1. 安装并打开 CloudMail。
2. 首次启动会直接进入 **管理员设置**。
3. 填写 Worker 地址、Admin 密码、站点密码和自动刷新时间。
4. 可在 **外观** 中选择浅色、深色、OLED 黑或跟随系统。
5. 点击测试连接确认 Worker 可用。
6. 保存配置后，CloudMail 会校验管理员密码；成功后自动进入 **管理员后台**。

### 3. 日常使用

- 再次打开应用时，如果配置仍有效，会直接进入管理员后台。
- 在管理员后台右上角点击 **设置** 可随时回到管理员设置页。
- 顶部标签支持点击切换。
- 主题快捷按钮会记住你偏好的深色类型：如果你选择过 OLED 黑，浅色切回深色时会回到 OLED 黑，而不是普通深色。
- 增量刷新出现的新邮件会显示小圆点；打开详情、复制验证码或全部已读后，小圆点会自动消失。
- 在收件页点击标题处的下拉入口，可切换收件箱和垃圾信箱。
- 长按邮件可打开操作菜单；长按地址可进入批量选择模式。

### 4. 管理员页面说明

- **统计**：查看地址数、收件数、发件数和未知地址收件数。
- **地址**：搜索、创建、分组、按用户筛选、查看凭证、清空收件箱、删除邮箱地址和批量管理。
- **收件**：查看全部收件，支持搜索、验证码复制、新邮件标识、垃圾信箱和分组筛选。
- **发件**：查看系统发件记录。
- **未知**：查看发往未创建邮箱地址的邮件，并可一键创建对应邮箱。
- **发送**：选择发件身份并发送邮件。

## 技术栈

- Expo 54 / React Native 0.81
- React 19 / TypeScript 5.9
- Expo Router
- React Native Reanimated / Gesture Handler
- AsyncStorage / SecureStore
- WebView 邮件预览
- Vitest
- 可选 Drizzle 后端工具

## 本地开发

安装依赖：

```bash
pnpm install
```

启动完整开发环境：

```bash
pnpm dev
```

只启动 Expo：

```bash
pnpm dev:metro
```

提交前建议运行：

```bash
pnpm check
pnpm test
```

## 构建 Android APK

完整说明见 [BUILD.md](./docs/BUILD.md)。常用本地构建流程：

```bash
pnpm install
npx expo prebuild -p android --clean
cd android
./gradlew assembleRelease
```

生成的 APK 建议上传到 GitHub Releases，不要提交到 Git 仓库。

## 环境变量

复制示例配置：

```bash
cp .env.example .env.local
```

大多数邮箱连接配置都在应用内完成。环境变量主要用于本地开发、可选 OAuth / 服务端能力、数据库工具、Forge 集成和 AI 相关工具。

不要提交真实密码、管理员 token、邮箱凭证、API key 或数据库连接串。

## 项目文档

- [构建与安装指南](./docs/BUILD.md)
- [更新日志](./docs/CHANGELOG.md)
- [设计说明](./docs/design.md)
- [邮箱 API 报告](./docs/mailbox-api-report.md)
- [路线图](./docs/roadmap.md)
- [安全策略](./.github/SECURITY.md)
- [贡献指南](./.github/CONTRIBUTING.md)

## 致谢

CloudMail 基于 [dreamhunter2333/cloudflare_temp_email](https://github.com/dreamhunter2333/cloudflare_temp_email) 的 Cloudflare 临时邮箱项目生态开发。感谢 [dreamhunter2333](https://github.com/dreamhunter2333) 和上游项目贡献者提供邮箱后端、Web 管理能力和相关 API 行为。

更多致谢信息见 [NOTICE](./docs/NOTICE.md)。

## 许可证

CloudMail 使用 [MIT License](./LICENSE) 开源。请同时查看上游仓库的许可证和使用条款。
