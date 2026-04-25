# CloudMail 构建与安装指南

这是一个 Expo + React Native 项目，要生成可以直接安装的 Android APK，有两条路子：**EAS 云端构建**（推荐）和**本地 Gradle 构建**（需 Android SDK）。

---

## 方式一：EAS 云端构建（推荐，最简单）

不用装任何 Android SDK / Java，Expo 在云端帮你打包。免费额度够个人用。

### 1. 安装 eas-cli

```powershell
npm install -g eas-cli
```

### 2. 登录 Expo 账号

```powershell
eas login
```

没账号就去 [expo.dev](https://expo.dev) 免费注册一个。

### 3. 初次绑定项目

```powershell
cd cloudmail
eas init
```

这一步会往 `app.config.ts` 的 `extra.eas.projectId` 里写入 project id，按提示确认即可。

### 4. 构建 APK

```powershell
eas build --platform android --profile apk
```

- 等 10~20 分钟
- 完成后会在终端打印一个 URL，点进去下载 `.apk` 文件
- `eas.json` 里的 `apk` profile 已经配置成直出 APK（不是 AAB）

### 5. 安装到手机

把 APK 发到手机（微信/QQ/USB），点击安装。第一次会提示"来源不受信任"，允许即可。

---

## 方式二：本地 Gradle 构建（需装 Android SDK）

如果你已经有 Android Studio，可以本地打包，速度更快。

### 前置：

1. 安装 Java JDK 17：https://adoptium.net/（选 Temurin 17 LTS）
2. 安装 Android Studio：https://developer.android.com/studio
3. 环境变量：
   - `JAVA_HOME` 指向 JDK 安装路径
   - `ANDROID_HOME` 指向 Android SDK 路径（通常 `<your-user-home>\\AppData\\Local\\Android\\Sdk`）
   - `PATH` 里加 `%ANDROID_HOME%\platform-tools`

### 步骤：

```powershell
cd cloudmail

# 1. 装依赖（首次必须）
npm install -g pnpm
pnpm install

# 2. 生成原生 android 目录
npx expo prebuild -p android --clean

# 3. 构建 release APK
cd android
.\gradlew assembleRelease

# 4. APK 位置
# android/app/build/outputs/apk/release/app-release.apk
```

> **签名密钥**：首次构建会在 `android/app/` 下生成 debug keystore。要发布正式版，换成你自己的 keystore，或让 Gradle 自动管理。

---

## 开发调试（不打包，用 Expo Go 扫码跑）

如果你只想快速试一下改动、不想每次都重新打包：

```powershell
# 1. 手机装 Expo Go（应用市场）
# 2. 手机和电脑在同一 WiFi
# 3. 启动开发服务器
cd cloudmail
pnpm install   # 首次
npx expo start
# 4. 手机 Expo Go 扫描终端里的二维码
```

> **注意**：Expo Go 里运行时，某些原生模块（如 expo-notifications 的推送）可能受限。正式体验还是建议走 APK。

---

## 常见问题

### 域名列表还是空

打开「设置 → 测试连接」。如果弹窗提示"连接成功但域名为空"：

1. 点「查看原始响应 JSON」，看看服务端返回了什么字段
2. 到 Cloudflare Dashboard → Workers & Pages → 你的 Worker → Settings → Variables，检查：
   - `DOMAINS` 是否存在，值是否是 JSON 数组：`["a.com","b.com"]`
   - 不要写成 `a.com,b.com` 或单个字符串

### 提示"发件余额为 0"

到「发送」Tab，顶部横幅会出现"申请发件权限"按钮，点一下就好。

### 想在家人手机上用

两个办法：
1. APK 直接分享给家人，他们装好后在「邮箱 → 导入」里粘入你导出的**邮箱凭证 (JWT)**（从「邮箱管理 → 🔑 图标」复制）
2. 或者让他们自己创建新邮箱，各自独立用

---

## 目录结构速览

```
cloudmail/
├── app/                  # Expo Router 路由（Tab 页面）
│   ├── (tabs)/
│   │   ├── index.tsx     # 收件箱 / 发件箱
│   │   ├── compose.tsx   # 发送邮件
│   │   ├── addresses.tsx # 邮箱管理、凭证导出/导入
│   │   └── settings.tsx  # Worker 配置、账户、自动回复
│   └── mail-detail.tsx   # 邮件详情
├── lib/
│   ├── api.ts            # API 客户端（所有后端接口）
│   ├── mail-context.tsx  # 全局状态管理
│   ├── mail-parser.ts    # MIME 邮件解析
│   └── sha256.ts         # 纯 JS SHA-256（登录接口用）
├── eas.json              # EAS 构建配置
└── app.config.ts         # Expo 应用配置
```

