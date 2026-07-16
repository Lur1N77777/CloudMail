# CloudMail 构建与安装指南

这是一个 Expo + React Native 项目。公开发布必须使用 **EAS 云端构建**保存的生产密钥；本地 Gradle 构建仅用于编译、Manifest 和兼容性验证。

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

### 3. 确认项目绑定

```powershell
cd cloudmail
eas project:info
```

当前仓库已绑定 `@loven7/cloudmail`，Project ID 为 `02aa1a6e-d427-460a-878f-0145614afd2a`。不要重新创建 EAS 项目或替换 `app.config.ts` 中的 Project ID。

### 4. 构建生产 AAB 与侧载 APK

```powershell
eas build --platform android --profile production --non-interactive --wait
eas build --platform android --profile apk
```

- `production` 生成 Google Play 所需 `.aab`。
- `apk` 生成 GitHub Release/侧载所需 `.apk`，使用与 AAB 相同的 EAS 生产密钥。
- 构建完成后必须核验包名、版本、权限和签名证书，再上传发行版。

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

> **签名密钥**：managed prebuild 生成的本地 Release 默认使用 debug keystore。它只能作为 CI/本地验证制品，禁止上传为正式发行版。正式版使用 EAS 中已有的私有生产 keystore。

### 验证 APK

```powershell
$buildTools = "$env:ANDROID_HOME\build-tools\36.0.0"
& "$buildTools\aapt2.exe" dump badging .\cloudmail-v1.1.3-secure.apk
& "$buildTools\aapt2.exe" dump permissions .\cloudmail-v1.1.3-secure.apk
& "$buildTools\apksigner.bat" verify --verbose --print-certs .\cloudmail-v1.1.3-secure.apk
```

应确认包名为 `space.manus.cloudmail.t20260418184046`，版本为 `1.1.3 (17)`，没有通知、录音、开机启动、唤醒锁、存储或悬浮窗权限，证书 SHA-256 为 `5B:F4:BF:3A:49:73:2D:2A:5A:D1:F9:57:FB:D7:62:7F:E2:13:78:6E:1F:8B:35:7A:6E:E1:15:78:15:68:CE:EB`。

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

> **注意**：Expo Go 不提供与生产包完全相同的 SecureStore 和原生构建环境。正式验收请使用 EAS APK 或 AAB 安装包。

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

