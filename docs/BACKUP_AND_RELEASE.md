# CloudMail 备份与双远程发布流程

本文档用于把 CloudMail 同步到 **GitHub 主仓库 + Gitee 镜像仓库**，并保留每个版本可回滚的标签。

## 推荐结构

- **GitHub**：主仓库，保存源码、Tag、Release 和 APK。
- **Gitee**：镜像备份仓库，保存源码和 Tag，便于国内访问和容灾。
- **本地 `releases/`**：只保留最近 3 个 APK；长期安装包以 GitHub Release 为准。

APK 不提交到 Git 源码仓库，统一通过 GitHub Release 分发。

## 发布签名原则

- `android/app/build/outputs/apk/release/app-release.apk` 是本地/CI 编译验证制品，当前 managed prebuild 默认使用调试证书，不能作为长期公开发行包。
- GitHub 正式 APK 和 Google Play AAB 必须通过 EAS 的 `production` keystore 构建，且必须核验签名指纹。
- V1.1.2 及更早公开 APK 的证书 SHA-256 为 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`（Android Debug）。
- V1.1.3 起 EAS 生产证书 SHA-256 为 `5B:F4:BF:3A:49:73:2D:2A:5A:D1:F9:57:FB:D7:62:7F:E2:13:78:6E:1F:8B:35:7A:6E:E1:15:78:15:68:CE:EB`。
- 两种证书无法覆盖安装。发布说明必须保留“先备份凭据、卸载旧版、安装新版、重新导入”的迁移步骤。

## 第一次配置 Gitee 远程

先在 Gitee 创建一个空仓库，例如：

```text
https://gitee.com/<你的用户名>/CloudMail.git
```

然后在本地仓库执行：

```bash
git remote add gitee https://gitee.com/<你的用户名>/CloudMail.git
git remote -v
```

如果远程已经存在但地址需要调整：

```bash
git remote set-url gitee https://gitee.com/<你的用户名>/CloudMail.git
```

## 日常同步源码和版本标签

确认当前工作区干净：

```bash
git status -sb
```

同步到 GitHub 和 Gitee：

```bash
git push origin main --tags
git push gitee main --tags
```

也可以使用项目脚本：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/sync-remotes.ps1
```

第一次使用脚本时可直接传入 Gitee 地址：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/sync-remotes.ps1 -GiteeUrl "https://gitee.com/<你的用户名>/CloudMail.git"
```

## 发布新版本标准流程

以 `v1.1.3` 为例：

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm lint
EXPO_NO_DOTENV=1 NODE_ENV=production pnpm exec expo export --platform web --output-dir dist-web --clear

git add -A
git commit -m "release: prepare v1.1.3"
git tag -a v1.1.3 -m "CloudMail v1.1.3"

git push origin main --tags
git push gitee main --tags
```

然后：

1. 从已提交且已打 Tag 的源码执行 `eas build --platform android --profile production --non-interactive --wait`，生成 Google Play AAB。
2. 执行 `eas build --platform android --profile apk --non-interactive --wait`，生成使用同一 EAS 生产密钥的侧载 APK。
3. 下载后使用 `aapt2 dump badging`、`aapt2 dump permissions` 和 `apksigner verify --print-certs` 核验包名、`1.1.3 (17)`、权限和生产证书指纹。
4. 生成 SHA-256 校验文件，在 GitHub Release 创建 `v1.1.3` 并上传正式 APK、AAB（按需）和校验文件。
5. 使用 `scripts/publish-gitee-release.ps1` 在 Gitee Release 上传同一个 APK。
6. 本地 `releases/` 只保留最近 3 个 APK。

GitHub Actions 的 `Android production artifact` 工作流需要仓库 `production` Environment 中配置 `EXPO_TOKEN`。未配置时可由已登录的维护者在本机执行同样的 EAS 命令，但不能把本机登录凭据复制进仓库。

## 在 Gitee 创建发行版并上传 APK

Gitee 的 Release API 不会复用 Git HTTPS 登录状态，需要单独创建 **私人令牌**：

1. 打开 <https://gitee.com/profile/personal_access_tokens>
2. 创建令牌，至少勾选项目/仓库相关权限。
3. 在当前 PowerShell 会话中设置临时环境变量：

```powershell
$env:GITEE_TOKEN="你的 Gitee 私人令牌"
```

发布当前版本到 Gitee：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/publish-gitee-release.ps1
```

发布其他版本时指定参数：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/publish-gitee-release.ps1 `
  -Repo "lurin7/cloud-mail" `
  -Tag "v1.1.3" `
  -Title "CloudMail V1.1.3" `
  -NotesFile "releases/v1.1.3-release-notes.md" `
  -AssetPath "releases/cloudmail-v1.1.3-secure.apk"
```

> 注意：Gitee 发行版附件不建议提交到 Git；APK 仍然放在 Release 附件中。

## 回滚 / Rollback

查看版本：

```bash
git tag --sort=-v:refname
```

临时查看某个版本：

```bash
git checkout v1.1.2
```

从某个版本开修复分支：

```bash
git checkout -b fix/from-v1.1.2 v1.1.2
```

如果需要把主分支回滚到某个版本，建议先创建备份分支，再操作：

```bash
git checkout main
git branch backup/main-before-rollback
git reset --hard v1.1.2
git push origin main --force-with-lease
git push gitee main --force-with-lease
```

> 注意：强制推送会改写远程历史。公开仓库通常更推荐新建修复提交，而不是直接 reset 主分支。

## 不应该上传的内容

不要提交：

- `node_modules/`
- `.env.local`、真实密码、Token、API Key
- `.android-sdk/`
- `.jdk17/`
- `.expo/`
- `.omx/`
- `.playwright-mcp/`
- `.trellis/`
- Android build 临时目录
- 根目录 APK

当前 `.gitignore` 已覆盖这些本地文件。
