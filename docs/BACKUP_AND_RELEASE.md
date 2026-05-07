# CloudMail 备份与双远程发布流程

本文档用于把 CloudMail 同步到 **GitHub 主仓库 + Gitee 镜像仓库**，并保留每个版本可回滚的标签。

## 推荐结构

- **GitHub**：主仓库，保存源码、Tag、Release 和 APK。
- **Gitee**：镜像备份仓库，保存源码和 Tag，便于国内访问和容灾。
- **本地 `releases/`**：只保留最近 3 个 APK；长期安装包以 GitHub Release 为准。

APK 不提交到 Git 源码仓库，统一通过 GitHub Release 分发。

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

以 `v1.1.2` 为例：

```bash
pnpm check
pnpm test

git add -A
git commit -m "发布 v1.1.2"
git tag -a v1.1.2 -m "CloudMail v1.1.2"

git push origin main --tags
git push gitee main --tags
```

然后：

1. 在 GitHub Release 创建 `v1.1.2`。
2. 上传 APK 到 GitHub Release。
3. 可选：在 Gitee Release 手动上传同一个 APK。
4. 本地 `releases/` 只保留最近 3 个 APK。

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
