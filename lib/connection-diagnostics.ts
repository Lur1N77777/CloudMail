export type ConnectionTestStage = "settings" | "admin";

export type ConnectionDiagnosticCode =
  | "site_password_rejected"
  | "admin_password_rejected"
  | "unsupported_backend"
  | "network_timeout"
  | "network_unreachable"
  | "rate_limited"
  | "worker_error"
  | "request_rejected";

export type ConnectionDiagnostic = {
  code: ConnectionDiagnosticCode;
  title: string;
  message: string;
  suggestion: string;
};

type ErrorLike = {
  message?: string;
  status?: number;
  path?: string;
};

export function describeConnectionError(
  error: unknown,
  stage: ConnectionTestStage
): ConnectionDiagnostic {
  const candidate = (error || {}) as ErrorLike;
  const status = Number(candidate.status || 0);
  const message = String(candidate.message || "");
  const lowerMessage = message.toLowerCase();

  if ([404, 405, 501].includes(status)) {
    return {
      code: "unsupported_backend",
      title: "后端接口不兼容",
      message: "Worker 可以访问，但缺少 CloudMail 所需的兼容接口。",
      suggestion: "确认 Worker 版本及部署来源，并重新部署与当前客户端兼容的版本。",
    };
  }

  if (status === 401 || status === 403) {
    if (stage === "settings") {
      return {
        code: "site_password_rejected",
        title: "站点密码未通过",
        message: "Worker 在读取公开设置阶段拒绝了请求。",
        suggestion: "若 Worker 配置了 PASSWORDS，请填写站点密码；未配置时保持为空。",
      };
    }
    return {
      code: "admin_password_rejected",
      title: "管理员密码未通过",
      message: "公开设置读取成功，但管理员认证被 Worker 拒绝。",
      suggestion: "请确认该档案的管理员密码与 Worker ADMIN_PASSWORDS 完全一致。",
    };
  }

  if (status === 429) {
    return {
      code: "rate_limited",
      title: "请求过于频繁",
      message: "Worker 暂时限制了连接测试请求。",
      suggestion: "稍候再试，不要连续重复点击测试连接。",
    };
  }

  if (
    lowerMessage.includes("timeout") ||
    lowerMessage.includes("超时") ||
    lowerMessage.includes("aborted")
  ) {
    return {
      code: "network_timeout",
      title: "连接超时",
      message: "在限定时间内没有收到 Worker 响应。",
      suggestion: "检查网络、Worker 域名和 Cloudflare 服务状态后重试。",
    };
  }

  if (status >= 500) {
    return {
      code: "worker_error",
      title: "Worker 服务异常",
      message: `Worker 返回 HTTP ${status}，请求已到达服务端但未正常完成。`,
      suggestion: "检查最近的 Worker 部署、D1/KV 绑定和 Cloudflare 日志。",
    };
  }

  if (!status) {
    return {
      code: "network_unreachable",
      title: "无法连接 Worker",
      message: "客户端未收到有效的 HTTP 响应。",
      suggestion: "检查 Worker 地址、HTTPS 证书、网络和 DNS。",
    };
  }

  return {
    code: "request_rejected",
    title: "连接测试未通过",
    message: `Worker 返回 HTTP ${status}。`,
    suggestion: "检查 Worker 配置和版本后重试。",
  };
}
