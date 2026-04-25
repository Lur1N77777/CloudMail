# CloudMail 邮箱创建 / 收信 / 验证码提取接口说明

> 基于当前项目源码整理，核心来源：
>
> - `lib\api.ts`
> - `lib\mail-parser.ts`
> - `lib\mail-context.tsx`
> - `app\(tabs)\addresses.tsx`

---

## 1. 基础约定

### 1.1 API 基址

所有接口都以你配置的 Worker 地址为基址：

```text
BASE_URL = <workerUrl>
```

对应实现：

- `lib\api.ts:239`

### 1.2 通用请求头

当前客户端会自动带这些头：

```http
Content-Type: application/json
x-lang: zh
```

可选头：

```http
x-custom-auth: <sitePassword>      # 如果站点启用了站点密码
x-admin-auth: <adminPassword>      # 管理员接口
Authorization: Bearer <jwt>        # 用户邮箱 JWT
x-user-token: <jwt>                # 与 Authorization 同时发送
```

对应实现：

- `lib\api.ts:211`

---

## 2. 创建邮箱前，先获取站点配置

### 2.1 获取配置

优先接口：

```http
GET /open_api/settings
```

回退接口：

```http
GET /api/settings
```

客户端就是按这个顺序探测的。

对应实现：

- `lib\api.ts:304`
- `lib\api.ts:317`

### 2.2 你需要重点关心的字段

```json
{
  "domains": ["example.com"],
  "defaultDomains": ["example.com"],
  "domainLabels": ["主域名"],
  "randomSubdomainDomains": ["example.com"],
  "enableAddressPassword": true,
  "enableCreateAddressSubdomainMatch": false,
  "cfTurnstileSiteKey": "...",
  "needAuth": false
}
```

重点字段解释：

- `domains`：当前建议可用域名列表
- `defaultDomains`：若 `domains` 为空，客户端会用它兜底
- `domainLabels`：域名显示名称
- `randomSubdomainDomains`：允许“随机子域名”模式的根域
- `enableAddressPassword`：新邮箱是否可能返回地址密码
- `enableCreateAddressSubdomainMatch`：和子域名创建策略有关，是否严格匹配由服务端决定
- `cfTurnstileSiteKey`：主要是 Web 前端注册/验证时的人机校验，不是收邮件主链路必需

测试也验证了：

- 优先 `/open_api/settings`
- `domains` 为空时回退到 `defaultDomains`
- `/open_api/settings` 不存在时回退 `/api/settings`

对应测试：

- `lib\__tests__\api.test.ts:190`
- `lib\__tests__\api.test.ts:223`
- `lib\__tests__\api.test.ts:253`

---

## 3. 创建邮箱接口

## 3.1 普通创建

```http
POST /api/new_address
```

请求体：

```json
{
  "name": "alice",
  "domain": "example.com",
  "enablePrefix": true,
  "enableRandomSubdomain": false
}
```

返回：

```json
{
  "jwt": "<address-jwt>",
  "address": "prefix.alice@example.com",
  "address_id": 123,
  "password": "optional-password"
}
```

对应实现：

- `lib\api.ts:339`

## 3.2 管理员创建

```http
POST /admin/new_address
```

请求体与普通创建一致，但请求头需要：

```http
x-admin-auth: <adminPassword>
```

客户端逻辑是：只要配置里存在管理员密码，就走 `/admin/new_address`。

对应实现：

- `lib\api.ts:353`

## 3.3 返回值字段说明

- `jwt`：最重要。后续拉取该邮箱收件箱就靠它
- `address`：服务端最终创建出来的邮箱地址，**尤其随机子域名模式一定要以它为准**
- `address_id`：管理员模式下很有用，可再调用管理员接口查询凭证 / 列地址
- `password`：只有部分服务端配置会返回

类型定义：

- `lib\api.ts:114`

---

## 4. 三种邮箱创建方式

## 4.1 子域名邮箱

### 调用方式

客户端会把最终 `domain` 拼成：

```text
<subdomainPrefix>.<selectedDomain>
```

再提交：

```json
{
  "name": "alice",
  "domain": "sub.example.com",
  "enablePrefix": true,
  "enableRandomSubdomain": false
}
```

对应 UI 逻辑：

- `app\(tabs)\addresses.tsx`
- `app\admin.tsx`

脚本里等价于：

```js
domain = `${subdomainPrefix}.${selectedDomain}`;
```

### 示例

```json
{
  "name": "order",
  "domain": "otp.example.com",
  "enablePrefix": true,
  "enableRandomSubdomain": false
}
```

可能得到：

```json
{
  "address": "prefix.order@otp.example.com",
  "jwt": "..."
}
```

---

## 4.2 随机子域名邮箱

### 前置条件

先看 `/open_api/settings` 返回的：

```json
"randomSubdomainDomains": ["example.com"]
```

只有目标根域出现在这个列表里时，客户端才认为它支持随机子域名。

### 调用方式

```json
{
  "name": "alice",
  "domain": "example.com",
  "enablePrefix": true,
  "enableRandomSubdomain": true
}
```

### 重要说明

随机出来的子域名不是客户端本地算的，而是服务端生成，所以：

- **不要自己假定最终地址**
- 直接以返回的 `address` 为准

例如请求时传的是：

```json
{
  "name": "alice",
  "domain": "example.com",
  "enableRandomSubdomain": true
}
```

返回可能是：

```json
{
  "address": "prefix.alice@x8f2k.example.com",
  "jwt": "..."
}
```

---

## 4.3 自定义域名邮箱

这里分两种理解：

### A. 自定义用户名 + 选择一个可用域名

这是当前客户端最标准的模式：

```json
{
  "name": "myname",
  "domain": "example.com",
  "enablePrefix": false,
  "enableRandomSubdomain": false
}
```

### B. 传入一个脚本自定义 domain

从当前客户端实现看，`domain` 在请求体里就是普通字符串，前端层**没有额外强校验**。

也就是说脚本理论上可以直接 POST：

```json
{
  "name": "alice",
  "domain": "mail.custom-domain.com",
  "enablePrefix": false,
  "enableRandomSubdomain": false
}
```

但是：

- 是否允许创建
- 是否必须在 `settings.domains` 白名单里
- 是否受 `enableCreateAddressSubdomainMatch` 约束

这些都由**服务端最终决定**。

### 建议

脚本产品里建议分两层：

1. **安全模式**：只允许 `settings.domains` / `defaultDomains` 中出现的域名
2. **强制模式**：允许调用方手填 `domain`，但把服务端失败原样抛出

---

## 5. 如何拿到邮箱的 JWT / 凭证

### 5.1 创建时直接拿

最推荐，`/api/new_address` 或 `/admin/new_address` 返回里直接就有：

```json
{
  "jwt": "...",
  "address": "..."
}
```

### 5.2 已有 credential，再校验一次

```http
POST /open_api/credential_login
```

请求：

```json
{
  "credential": "<jwt>"
}
```

返回逻辑上仍可继续用这个 JWT。

对应实现：

- `lib\api.ts:399`

### 5.3 已有邮箱 + 密码，再换 JWT

```http
POST /api/address_login
```

请求体：

```json
{
  "email": "prefix.alice@example.com",
  "password": "<sha256(password)>"
}
```

注意：

- 当前客户端会先做 SHA-256，再发给服务端

对应实现：

- `lib\api.ts:410`

### 5.4 管理员根据 addressId 取凭证

```http
GET /admin/show_password/{addressId}
```

返回：

```json
{
  "jwt": "...",
  "password": "optional",
  "address": "prefix.alice@example.com"
}
```

对应实现：

- `lib\api.ts:845`

---

## 6. 接收邮件 / 拉取验证码

## 6.1 用户态收件箱接口

```http
GET /api/mails?limit=<n>&offset=<n>
```

必须带：

```http
Authorization: Bearer <jwt>
x-user-token: <jwt>
```

对应实现：

- `lib\api.ts:431`

返回格式兼容两种：

### 旧/简单格式

```json
[
  {
    "id": 1,
    "source": "...",
    "raw": "...",
    "created_at": "2026-04-24T12:00:00Z",
    "address": "prefix.alice@example.com",
    "subject": "验证码",
    "metadata": "{...}"
  }
]
```

### 标准分页格式

```json
{
  "results": [
    {
      "id": 1,
      "source": "...",
      "raw": "...",
      "created_at": "2026-04-24T12:00:00Z",
      "address": "prefix.alice@example.com",
      "subject": "验证码",
      "metadata": "{...}"
    }
  ],
  "count": 1
}
```

客户端会统一归一化这两种格式。

定义与归一化逻辑：

- `lib\api.ts:24`
- `lib\api.ts:425`
- `lib\api.ts:587`

## 6.2 全量拉取历史邮件

如果你要脚本一直翻页拉到底，客户端已有现成逻辑：

```http
GET /api/mails?limit=100&offset=0
GET /api/mails?limit=100&offset=100
GET /api/mails?limit=100&offset=200
...
```

直到：

- 当前页空数组
- 或者当前页数量 `< pageSize`

对应实现：

- `lib\api.ts:444`

测试覆盖：

- `lib\__tests__\api.test.ts:414`

## 6.3 管理员态收件箱接口

如果你的脚本以后是“总控后台”模式，不想保存每个邮箱 JWT，可以直接用管理员接口按地址查：

```http
GET /admin/mails?limit=<n>&offset=<n>&address=<full-email>
```

对应实现：

- `lib\api.ts:702`

列地址接口：

```http
GET /admin/address?limit=<n>&offset=<n>&query=<keyword>
```

对应实现：

- `lib\api.ts:675`

未创建地址收件箱：

```http
GET /admin/mails_unknow?limit=<n>&offset=<n>
```

对应实现：

- `lib\api.ts:736`

---

## 7. 邮件内容解析与验证码提取

## 7.1 邮件解析

客户端会优先解析：

- `raw`
- 否则 `source`

并做 MIME / RFC822 解析，最终得到：

- `subject`
- `from`
- `to`
- `text`
- `html`
- `date`
- `attachments`

对应实现：

- `lib\mail-parser.ts:747`

## 7.2 正文提取优先级

取正文文本时优先级：

1. `mail.text`
2. `mail.html` 转纯文本
3. `mail.raw`

对应实现：

- `lib\mail-parser.ts:652`

## 7.3 验证码提取优先级

当前客户端提取验证码逻辑：

### 第一优先级：`metadata.ai_extract`

如果元数据里有：

```json
{
  "ai_extract": {
    "type": "auth_code",
    "result": "913245"
  }
}
```

直接取这个结果。

对应实现：

- `lib\mail-parser.ts:868`
- `lib\mail-parser.ts:899`

测试覆盖：

- `lib\__tests__\mail-parser.test.ts:231`

### 第二优先级：正文 / 标题正则匹配

当前主要匹配这些场景：

#### 中文

```regex
(?:验证码|校验码|动态码|动态密码|验证代码|登录码|安全码)\s*(?:是|为|:|：)?\s*([A-Z0-9]{4,8})
```

#### 英文

```regex
(?:verification code|security code|one[- ]?time code|login code|passcode|otp)(?:\s+is|\s*[:：-])\s*([A-Z0-9]{4,8})
```

### 第三优先级：关键字 + 候选码兜底

如果标题/正文里出现：

- `验证码`
- `verification`
- `security code`
- `otp`

则会在全文里再找：

```regex
\b[A-Z0-9]{4,8}\b
```

优先返回带数字的候选值。

---

## 8. 你后续做脚本时最推荐的两条主链路

## 8.1 方案 A：创建即保存 JWT（最简单）

1. `GET /open_api/settings`
2. `POST /api/new_address`
3. 保存返回的：
   - `address`
   - `jwt`
   - `address_id`
   - `password`
4. 轮询：
   - `GET /api/mails?limit=20&offset=0`
5. 对最新邮件做 MIME 解析
6. 先看 `metadata.ai_extract`
7. 再走正文正则提取验证码

### 优点

- 链路最短
- 不依赖管理员口令
- 每个邮箱独立

## 8.2 方案 B：管理员总控模式

1. `GET /open_api/settings`
2. `POST /admin/new_address`
3. 保存返回 `address` / `address_id`
4. 如需补拿凭证：
   - `GET /admin/show_password/{addressId}`
5. 收信时直接：
   - `GET /admin/mails?limit=20&offset=0&address=<email>`

### 优点

- 不用为每个邮箱单独维护 JWT
- 适合批量脚本 / 后台系统

---

## 9. 脚本实现时的注意点

1. **一定先拉 settings**
   - 用来获取 `domains`
   - 用来判断 `randomSubdomainDomains`

2. **随机子域名以返回的 address 为准**
   - 不要自己拼最终地址

3. **收件列表兼容两种返回格式**
   - `[]`
   - `{ results, count }`

4. **邮件正文不要只看 `subject`**
   - 很多验证码只在 `text/html` 正文里

5. **优先保留 metadata**
   - 如果服务端已经做了 `ai_extract`，直接复用最稳

6. **如果你走管理员接口**
   - `x-admin-auth` 用的是原始管理员密码，不是 hash

7. **如果你走 `/api/address_login`**
   - 密码需要先做 SHA-256

---

## 10. 补充：官方前端 bundle 中还能看到的 Web 侧接口

在 `frontend\assets\Admin-DL1NEMu-.js` 中，还能看到一套 Web 用户体系接口，例如：

- `/user_api/verify_code`
- `/user_api/register`
- `/user_api/login`
- `/user_api/mails`

这套更偏 **网站用户注册 / 登录 / Web 邮箱页**。

如果你后面的产品是“自动创建邮箱并轮询验证码”，建议优先走本说明主链路里的：

- `/open_api/settings`
- `/api/new_address` / `/admin/new_address`
- `/api/mails` / `/admin/mails`

因为这条链路在当前移动端源码里最明确、最稳定。
