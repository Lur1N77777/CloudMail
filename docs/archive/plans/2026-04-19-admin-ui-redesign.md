# Admin UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将管理员模式改造成与现有邮件界面一致的列表/详情阅读体验，并支持正文预览与验证码快捷复制。

**Architecture:** 保留现有 `app/admin.tsx` 的数据拉取逻辑，但重做 `MailsPanel` 的列表呈现，新增一个独立的 `admin-mail-detail` 页面承载管理员邮件详情。把正文预览与验证码提取沉到 `lib/mail-parser.ts`，并用一个轻量内存 store 在管理员列表页和详情页之间传递已解析邮件数据。

**Tech Stack:** Expo Router, React Native, TypeScript, expo-clipboard, existing `useColors` theme + `mail-parser` helpers.

---

### Task 1: 补齐邮件解析工具

**Files:**
- Modify: `lib\api.ts`
- Modify: `lib\mail-parser.ts`

**Steps:**
1. 给 `ParsedMail` 增加管理员详情页需要的附加字段（如 `ownerAddress` / `mailboxKind` / `verificationCode`）。
2. 在 `mail-parser.ts` 中抽出：HTML 转纯文本、正文预览、验证码提取工具。
3. 保持现有普通收件箱逻辑兼容。
4. 跑 TypeScript 检查。

### Task 2: 增加管理员邮件临时 store

**Files:**
- Create: `lib\admin-mail-store.ts`

**Steps:**
1. 创建一个模块级 Map，用于保存管理员点击的已解析邮件对象。
2. 提供 `set/get/remove` 或 `set/get/clear` 方法。
3. detail 页面只依赖 key，不在路由里塞大正文。

### Task 3: 重做管理员邮件列表 UI

**Files:**
- Modify: `app\admin.tsx`

**Steps:**
1. 调整 header / segmented tabs 视觉，使其更接近 `app/(tabs)/index.tsx`。
2. 改造 `MailsPanel` 的 `renderItem`：加入头像、主题、正文预览、归属地址、验证码 pill。
3. 列表项点击时将邮件写入 admin store，并跳转到管理员详情页。
4. 为验证码 pill 增加复制行为。
5. 保留长按删除。

### Task 4: 新增管理员邮件详情页

**Files:**
- Create: `app\admin-mail-detail.tsx`
- Modify: `app\_layout.tsx`

**Steps:**
1. 新增详情路由并注册到 Stack。
2. 页面布局参考 `app/mail-detail.tsx`，但加管理员信息卡。
3. 展示完整主题、发件/收件信息、邮箱归属、正文、附件。
4. 若命中验证码，展示快捷复制卡片。
5. 提供管理员删除按钮并返回上一页。

### Task 5: 局部清理与测试

**Files:**
- Modify as needed: `app\admin.tsx`
- Modify as needed: `app\admin-mail-detail.tsx`

**Steps:**
1. 跑 `node node_modules/typescript/lib/tsc.js --noEmit --pretty false`
2. 跑 `./node_modules/.bin/eslint 'app/admin.tsx' 'app/admin-mail-detail.tsx' 'lib/mail-parser.ts'`
3. 跑 Android release 构建：`cd android && ./gradlew assembleRelease --no-daemon`
4. 将 `android/app/build/outputs/apk/release/app-release.apk` 复制到根目录 `CloudMail.apk`
