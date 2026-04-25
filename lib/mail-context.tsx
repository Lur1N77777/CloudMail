import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { AppState } from "react-native";
import {
  getConfig,
  saveConfig,
  getAccounts,
  saveAccounts,
  getActiveAccountIndex,
  setActiveAccountIndex as storeActiveIndex,
  addAccount as storeAddAccount,
  removeAccount as storeRemoveAccount,
  fetchSettings,
  fetchUserAddressSettings,
  createAddress,
  fetchMailHistory,
  fetchMails,
  fetchSentMails,
  fetchSentMailHistory,
  deleteMail as apiDeleteMail,
  deleteSentMail as apiDeleteSentMail,
  clearInbox as apiClearInbox,
  clearSentItems as apiClearSentItems,
  sendMail as apiSendMail,
  requestSendMailAccess as apiRequestSendMailAccess,
  loginWithCredential as apiLoginWithCredential,
  loginWithAddressPassword as apiLoginWithAddressPassword,
  changeAddressPassword as apiChangeAddressPassword,
  setAutoReply as apiSetAutoReply,
  deleteAddressAdmin,
  deleteAddressUser,
  adminLogin as apiAdminLogin,
  type MailAccount,
  type ParsedMail,
  type SiteSettings,
  type SendMailPayload,
  type AutoReply,
  type UserAddressSettings,
} from "./api";
import { readMailboxCache, writeMailboxCache } from "./mail-cache";
import { mergeMailLists, sortMailsDesc } from "./mail-list-utils";
import { parseMailBatch } from "./mail-parser";

// ─── State ──────────────────────────────────────────────────────
interface MailState {
  // Config
  workerUrl: string;
  adminPassword: string;
  sitePassword: string;
  refreshInterval: number;
  isConfigured: boolean;

  // Accounts
  accounts: MailAccount[];
  activeAccountIndex: number;

  // Site settings (per-worker)
  settings: SiteSettings | null;

  // Per-address user settings (auto_reply, send_balance)
  userSettings: UserAddressSettings | null;

  // Mails
  mails: ParsedMail[];
  sentMails: ParsedMail[];
  isLoadingMails: boolean;
  isRefreshing: boolean;
  isLoadingSent: boolean;

  // UI
  error: string | null;
  successMessage: string | null;
  isInitialized: boolean;

  // Admin
  isAdminMode: boolean;
}

const initialState: MailState = {
  workerUrl: "",
  adminPassword: "",
  sitePassword: "",
  refreshInterval: 30,
  isConfigured: false,
  accounts: [],
  activeAccountIndex: 0,
  settings: null,
  userSettings: null,
  mails: [],
  sentMails: [],
  isLoadingMails: false,
  isRefreshing: false,
  isLoadingSent: false,
  error: null,
  successMessage: null,
  isInitialized: false,
  isAdminMode: false,
};

// ─── Actions ────────────────────────────────────────────────────
type Action =
  | { type: "INIT"; payload: Partial<MailState> }
  | {
      type: "SET_CONFIG";
      payload: {
        workerUrl: string;
        adminPassword: string;
        sitePassword: string;
        refreshInterval: number;
      };
    }
  | { type: "SET_SETTINGS"; payload: SiteSettings }
  | { type: "SET_USER_SETTINGS"; payload: UserAddressSettings | null }
  | {
      type: "SET_ACCOUNTS";
      payload: { accounts: MailAccount[]; activeIndex: number };
    }
  | { type: "SET_ACTIVE_INDEX"; payload: number }
  | { type: "SET_MAILS"; payload: ParsedMail[] }
  | { type: "SET_SENT_MAILS"; payload: ParsedMail[] }
  | { type: "SET_LOADING_MAILS"; payload: boolean }
  | { type: "SET_LOADING_SENT"; payload: boolean }
  | { type: "SET_REFRESHING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_SUCCESS"; payload: string | null }
  | { type: "SET_ADMIN_MODE"; payload: boolean }
  | { type: "CLEAR_MESSAGES" };

function reducer(state: MailState, action: Action): MailState {
  switch (action.type) {
    case "INIT":
      return { ...state, ...action.payload, isInitialized: true };
    case "SET_CONFIG": {
      const changed =
        state.workerUrl !== action.payload.workerUrl ||
        state.adminPassword !== action.payload.adminPassword ||
        state.sitePassword !== action.payload.sitePassword;
      return {
        ...state,
        ...action.payload,
        isConfigured: !!action.payload.workerUrl,
        settings: changed ? null : state.settings,
      };
    }
    case "SET_SETTINGS":
      return { ...state, settings: action.payload };
    case "SET_USER_SETTINGS":
      return { ...state, userSettings: action.payload };
    case "SET_ACCOUNTS":
      return {
        ...state,
        accounts: action.payload.accounts,
        activeAccountIndex: action.payload.activeIndex,
      };
    case "SET_ACTIVE_INDEX":
      return { ...state, activeAccountIndex: action.payload };
    case "SET_MAILS":
      return { ...state, mails: action.payload };
    case "SET_SENT_MAILS":
      return { ...state, sentMails: action.payload };
    case "SET_LOADING_MAILS":
      return { ...state, isLoadingMails: action.payload };
    case "SET_LOADING_SENT":
      return { ...state, isLoadingSent: action.payload };
    case "SET_REFRESHING":
      return { ...state, isRefreshing: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "SET_SUCCESS":
      return { ...state, successMessage: action.payload };
    case "SET_ADMIN_MODE":
      return { ...state, isAdminMode: action.payload };
    case "CLEAR_MESSAGES":
      return { ...state, error: null, successMessage: null };
    default:
      return state;
  }
}

// ─── Context ────────────────────────────────────────────────────
interface MailContextValue {
  state: MailState;
  initialize: () => Promise<void>;
  updateConfig: (config: {
    workerUrl: string;
    adminPassword: string;
    sitePassword: string;
    refreshInterval: number;
  }) => Promise<void>;
  loadSettings: (options?: {
    throwOnError?: boolean;
  }) => Promise<SiteSettings | null>;
  loadUserSettings: () => Promise<UserAddressSettings | null>;
  createNewAddress: (params: {
    name: string;
    domain: string;
    enablePrefix?: boolean;
    enableRandomSubdomain?: boolean;
  }) => Promise<{ address: string; jwt: string; password?: string }>;
  switchAccount: (index: number) => Promise<void>;
  deleteAccount: (
    index: number,
    options?: { removeOnServer?: boolean }
  ) => Promise<void>;
  loadMails: () => Promise<void>;
  refreshMails: () => Promise<void>;
  loadSentMails: () => Promise<void>;
  refreshSentMails: () => Promise<void>;
  deleteMailById: (mailId: number) => Promise<boolean>;
  deleteSentMailById: (mailId: number) => Promise<boolean>;
  clearInbox: () => Promise<void>;
  clearSentItems: () => Promise<void>;
  sendEmail: (payload: SendMailPayload) => Promise<void>;
  requestSendMailAccess: () => Promise<void>;
  importByCredential: (credential: string) => Promise<void>;
  importByPassword: (email: string, password: string) => Promise<void>;
  changePassword: (newPassword: string, oldPassword?: string) => Promise<void>;
  saveAutoReply: (autoReply: AutoReply) => Promise<void>;
  enterAdminMode: (password: string) => Promise<void>;
  exitAdminMode: () => void;
  clearError: () => void;
  clearSuccess: () => void;
  activeAccount: MailAccount | null;
}

const MailContext = createContext<MailContextValue | null>(null);

export function MailProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mailsRef = useRef<ParsedMail[]>([]);
  const sentMailsRef = useRef<ParsedMail[]>([]);

  useEffect(() => {
    mailsRef.current = state.mails;
  }, [state.mails]);

  useEffect(() => {
    sentMailsRef.current = state.sentMails;
  }, [state.sentMails]);

  const activeAccount =
    state.accounts.length > 0 &&
    state.activeAccountIndex < state.accounts.length
      ? state.accounts[state.activeAccountIndex]
      : null;

  const getMailboxCacheInput = useCallback(
    (account: MailAccount, box: "inbox" | "sent") => ({
      workerUrl: state.workerUrl,
      address: account.address,
      box,
    }),
    [state.workerUrl]
  );

  // ── Initialize ──
  const initialize = useCallback(async () => {
    try {
      const config = await getConfig();
      const accounts = await getAccounts();
      const activeIndex = await getActiveAccountIndex();
      let shouldEnterAdminMode = false;

      if (config.workerUrl && config.adminPassword) {
        try {
          await apiAdminLogin(config.adminPassword);
          shouldEnterAdminMode = true;
        } catch {
          shouldEnterAdminMode = false;
        }
      }

      dispatch({
        type: "INIT",
        payload: {
          workerUrl: config.workerUrl,
          adminPassword: config.adminPassword,
          sitePassword: config.sitePassword,
          refreshInterval: config.refreshInterval,
          isConfigured: !!config.workerUrl,
          accounts,
          activeAccountIndex: Math.min(
            activeIndex,
            Math.max(0, accounts.length - 1)
          ),
          isAdminMode: shouldEnterAdminMode,
        },
      });
    } catch {
      dispatch({ type: "SET_ERROR", payload: "初始化失败" });
    }
  }, []);

  // ── Update Config ──
  const updateConfig = useCallback(
    async (config: {
      workerUrl: string;
      adminPassword: string;
      sitePassword: string;
      refreshInterval: number;
    }) => {
      try {
        await saveConfig(config);
        dispatch({ type: "SET_CONFIG", payload: config });
        dispatch({ type: "SET_SUCCESS", payload: "配置已保存" });
      } catch {
        dispatch({ type: "SET_ERROR", payload: "保存配置失败" });
        throw new Error("保存配置失败");
      }
    },
    []
  );

  // ── Load Site Settings ──
  const loadSettings = useCallback(
    async (options?: { throwOnError?: boolean }) => {
      try {
        const settings = await fetchSettings();
        dispatch({ type: "SET_SETTINGS", payload: settings });
        return settings;
      } catch (err: any) {
        dispatch({
          type: "SET_ERROR",
          payload: err.message || "获取设置失败",
        });
        if (options?.throwOnError) throw err;
        return null;
      }
    },
    []
  );

  // ── Load per-address user settings ──
  const loadUserSettings = useCallback(async () => {
    const accounts = await getAccounts();
    const idx = await getActiveAccountIndex();
    const account = accounts[idx];
    if (!account) {
      dispatch({ type: "SET_USER_SETTINGS", payload: null });
      return null;
    }
    try {
      const settings = await fetchUserAddressSettings(account.jwt);
      dispatch({
        type: "SET_USER_SETTINGS",
        payload: { ...settings, fetched: true },
      });
      return settings;
    } catch {
      // Silent — user settings is an optional feature. Store fetched=true so UI doesn't stall.
      dispatch({
        type: "SET_USER_SETTINGS",
        payload: { fetched: true },
      });
      return null;
    }
  }, []);

  // ── Create Address ──
  const createNewAddress = useCallback(
    async (params: {
      name: string;
      domain: string;
      enablePrefix?: boolean;
      enableRandomSubdomain?: boolean;
    }) => {
      try {
        const result = await createAddress(params);
        const newAccount: MailAccount = {
          address: result.address,
          jwt: result.jwt,
          addressId: result.address_id,
          password: result.password,
          createdAt: new Date().toISOString(),
        };
        await storeAddAccount(newAccount);
        const accounts = await getAccounts();
        const idx = accounts.findIndex((a) => a.address === result.address);
        const activeIndex = idx >= 0 ? idx : accounts.length - 1;
        dispatch({
          type: "SET_ACCOUNTS",
          payload: { accounts, activeIndex },
        });
        dispatch({
          type: "SET_SUCCESS",
          payload: `邮箱 ${result.address} 创建成功`,
        });
        return {
          address: result.address,
          jwt: result.jwt,
          password: result.password,
        };
      } catch (err: any) {
        dispatch({
          type: "SET_ERROR",
          payload: err.message || "创建邮箱失败",
        });
        throw err;
      }
    },
    []
  );

  // ── Switch Account ──
  const switchAccount = useCallback(
    async (index: number) => {
      await storeActiveIndex(index);
      const accounts = await getAccounts();
      const nextAccount = accounts[index];

      dispatch({ type: "SET_ACTIVE_INDEX", payload: index });
      dispatch({ type: "SET_USER_SETTINGS", payload: null });

      if (!nextAccount) {
        dispatch({ type: "SET_MAILS", payload: [] });
        dispatch({ type: "SET_SENT_MAILS", payload: [] });
        return;
      }

      const [cachedInbox, cachedSent] = await Promise.all([
        readMailboxCache(getMailboxCacheInput(nextAccount, "inbox")),
        readMailboxCache(getMailboxCacheInput(nextAccount, "sent")),
      ]);

      dispatch({ type: "SET_MAILS", payload: sortMailsDesc(cachedInbox) });
      dispatch({ type: "SET_SENT_MAILS", payload: sortMailsDesc(cachedSent) });
    },
    [getMailboxCacheInput]
  );

  // ── Delete Account ──
  const deleteAccount = useCallback(
    async (index: number, options?: { removeOnServer?: boolean }) => {
      try {
        if (options?.removeOnServer) {
          const accounts = await getAccounts();
          const account = accounts[index];
          if (account) {
            try {
              if (account.addressId !== undefined) {
                await deleteAddressAdmin(account.addressId);
              } else {
                await deleteAddressUser(account.jwt);
              }
            } catch (err: any) {
              dispatch({
                type: "SET_ERROR",
                payload: `服务器删除失败: ${err.message || "未知错误"}（已从本地移除）`,
              });
            }
          }
        }
        await storeRemoveAccount(index);
        const accounts = await getAccounts();
        const activeIndex = await getActiveAccountIndex();
        dispatch({
          type: "SET_ACCOUNTS",
          payload: { accounts, activeIndex },
        });
        dispatch({ type: "SET_MAILS", payload: [] });
        dispatch({ type: "SET_SENT_MAILS", payload: [] });
        dispatch({ type: "SET_SUCCESS", payload: "邮箱已移除" });
      } catch (err: any) {
        dispatch({ type: "SET_ERROR", payload: err.message || "删除失败" });
      }
    },
    []
  );

  // ── Load Mails ──
  const loadMails = useCallback(async () => {
    const accounts = await getAccounts();
    const activeIndex = await getActiveAccountIndex();
    const account = accounts[activeIndex];
    if (!account) return;

    const cacheInput = getMailboxCacheInput(account, "inbox");
    const cached = await readMailboxCache(cacheInput);
    if (cached.length > 0) {
      dispatch({ type: "SET_MAILS", payload: sortMailsDesc(cached) });
    }

    dispatch({ type: "SET_LOADING_MAILS", payload: true });
    try {
      const rawMails = await fetchMailHistory(account.jwt, {
        pageSize: 100,
        maxPages: 100,
      });
      const parsed = await parseMailBatch(rawMails);
      const nextMails = sortMailsDesc(parsed);
      dispatch({ type: "SET_MAILS", payload: nextMails });
      await writeMailboxCache(cacheInput, nextMails);
    } catch (err: any) {
      dispatch({
        type: "SET_ERROR",
        payload: err.message || "加载邮件失败",
      });
    } finally {
      dispatch({ type: "SET_LOADING_MAILS", payload: false });
    }
  }, [getMailboxCacheInput]);

  // ── Refresh Mails ──
  const refreshMails = useCallback(async () => {
    const accounts = await getAccounts();
    const activeIndex = await getActiveAccountIndex();
    const account = accounts[activeIndex];
    if (!account) return;

    const cacheInput = getMailboxCacheInput(account, "inbox");
    dispatch({ type: "SET_REFRESHING", payload: true });
    try {
      const { results } = await fetchMails(account.jwt, 100, 0);
      const parsed = await parseMailBatch(results);
      const nextMails = mergeMailLists(mailsRef.current, parsed);
      dispatch({
        type: "SET_MAILS",
        payload: nextMails,
      });
      await writeMailboxCache(cacheInput, nextMails);
    } catch {
      // Silently fail on auto-refresh
    } finally {
      dispatch({ type: "SET_REFRESHING", payload: false });
    }
  }, [getMailboxCacheInput]);

  // ── Load Sent Mails ──
  const loadSentMails = useCallback(async () => {
    const accounts = await getAccounts();
    const activeIndex = await getActiveAccountIndex();
    const account = accounts[activeIndex];
    if (!account) return;

    const cacheInput = getMailboxCacheInput(account, "sent");
    const cached = await readMailboxCache(cacheInput);
    if (cached.length > 0) {
      dispatch({ type: "SET_SENT_MAILS", payload: sortMailsDesc(cached) });
    }

    dispatch({ type: "SET_LOADING_SENT", payload: true });
    try {
      const rawMails = await fetchSentMailHistory(account.jwt, {
        pageSize: 100,
        maxPages: 50,
      });
      const parsed = await parseMailBatch(rawMails);
      const nextMails = sortMailsDesc(parsed);
      dispatch({ type: "SET_SENT_MAILS", payload: nextMails });
      await writeMailboxCache(cacheInput, nextMails);
    } catch (err: any) {
      dispatch({
        type: "SET_ERROR",
        payload: err.message || "加载发件箱失败",
      });
    } finally {
      dispatch({ type: "SET_LOADING_SENT", payload: false });
    }
  }, [getMailboxCacheInput]);

  // ── Refresh Sent Mails ──
  const refreshSentMails = useCallback(async () => {
    const accounts = await getAccounts();
    const activeIndex = await getActiveAccountIndex();
    const account = accounts[activeIndex];
    if (!account) return;

    const cacheInput = getMailboxCacheInput(account, "sent");
    dispatch({ type: "SET_LOADING_SENT", payload: true });
    try {
      const { results } = await fetchSentMails(account.jwt, 100, 0);
      const parsed = await parseMailBatch(results);
      const nextMails = mergeMailLists(sentMailsRef.current, parsed);
      dispatch({
        type: "SET_SENT_MAILS",
        payload: nextMails,
      });
      await writeMailboxCache(cacheInput, nextMails);
    } catch {
      // Silently fail on incremental refresh
    } finally {
      dispatch({ type: "SET_LOADING_SENT", payload: false });
    }
  }, [getMailboxCacheInput]);

  // ── Delete Mail ──
  const deleteMailById = useCallback(async (mailId: number) => {
    const accounts = await getAccounts();
    const activeIndex = await getActiveAccountIndex();
    const account = accounts[activeIndex];
    if (!account) return false;

    try {
      await apiDeleteMail(account.jwt, mailId);
      const nextMails = mailsRef.current.filter((m) => m.id !== mailId);
      dispatch({
        type: "SET_MAILS",
        payload: nextMails,
      });
      await writeMailboxCache(getMailboxCacheInput(account, "inbox"), nextMails);
      dispatch({ type: "SET_SUCCESS", payload: "邮件已删除" });
      return true;
    } catch (err: any) {
      dispatch({
        type: "SET_ERROR",
        payload: err.message || "删除邮件失败",
      });
      return false;
    }
  }, [getMailboxCacheInput]);

  // ── Delete Sent Mail ──
  const deleteSentMailById = useCallback(
    async (mailId: number) => {
      const accounts = await getAccounts();
      const activeIndex = await getActiveAccountIndex();
      const account = accounts[activeIndex];
      if (!account) return false;

      try {
        await apiDeleteSentMail(account.jwt, mailId);
        const nextMails = sentMailsRef.current.filter((m) => m.id !== mailId);
        dispatch({
          type: "SET_SENT_MAILS",
          payload: nextMails,
        });
        await writeMailboxCache(getMailboxCacheInput(account, "sent"), nextMails);
        dispatch({ type: "SET_SUCCESS", payload: "已删除" });
        return true;
      } catch (err: any) {
        dispatch({
          type: "SET_ERROR",
          payload: err.message || "删除失败",
        });
        return false;
      }
    },
    [getMailboxCacheInput]
  );

  // ── Clear Inbox ──
  const clearInbox = useCallback(async () => {
    const accounts = await getAccounts();
    const activeIndex = await getActiveAccountIndex();
    const account = accounts[activeIndex];
    if (!account) return;
    try {
      await apiClearInbox(account.jwt);
      dispatch({ type: "SET_MAILS", payload: [] });
      await writeMailboxCache(getMailboxCacheInput(account, "inbox"), []);
      dispatch({ type: "SET_SUCCESS", payload: "收件箱已清空" });
    } catch (err: any) {
      dispatch({ type: "SET_ERROR", payload: err.message || "清空失败" });
    }
  }, [getMailboxCacheInput]);

  // ── Clear Sent ──
  const clearSentItems = useCallback(async () => {
    const accounts = await getAccounts();
    const activeIndex = await getActiveAccountIndex();
    const account = accounts[activeIndex];
    if (!account) return;
    try {
      await apiClearSentItems(account.jwt);
      dispatch({ type: "SET_SENT_MAILS", payload: [] });
      await writeMailboxCache(getMailboxCacheInput(account, "sent"), []);
      dispatch({ type: "SET_SUCCESS", payload: "发件箱已清空" });
    } catch (err: any) {
      dispatch({ type: "SET_ERROR", payload: err.message || "清空失败" });
    }
  }, [getMailboxCacheInput]);

  // ── Send Email ──
  const sendEmail = useCallback(async (payload: SendMailPayload) => {
    const accounts = await getAccounts();
    const activeIndex = await getActiveAccountIndex();
    const account = accounts[activeIndex];
    if (!account) throw new Error("请先选择邮箱地址");

    try {
      await apiSendMail(account.jwt, payload);
      dispatch({ type: "SET_SUCCESS", payload: "邮件发送成功" });
    } catch (err: any) {
      dispatch({ type: "SET_ERROR", payload: err.message || "发送失败" });
      throw err;
    }
  }, []);

  // ── Request Send Mail Access ──
  const requestSendMailAccess = useCallback(async () => {
    const accounts = await getAccounts();
    const activeIndex = await getActiveAccountIndex();
    const account = accounts[activeIndex];
    if (!account) throw new Error("请先选择邮箱地址");
    try {
      await apiRequestSendMailAccess(account.jwt);
      dispatch({ type: "SET_SUCCESS", payload: "已申请发件权限" });
    } catch (err: any) {
      dispatch({
        type: "SET_ERROR",
        payload: err.message || "申请失败",
      });
      throw err;
    }
  }, []);

  // ── Import by Credential (JWT string) ──
  const importByCredential = useCallback(async (credential: string) => {
    try {
      const { jwt } = await apiLoginWithCredential(credential.trim());
      // We don't know the address from just the credential — use /api/settings to fetch it.
      const userSettings = await fetchUserAddressSettings(jwt).catch(() => null);
      const address = userSettings?.address;
      if (!address) {
        throw new Error("无法获取凭证对应的邮箱地址");
      }
      const newAccount: MailAccount = {
        address,
        jwt,
        createdAt: new Date().toISOString(),
      };
      await storeAddAccount(newAccount);
      const accounts = await getAccounts();
      const idx = accounts.findIndex((a) => a.address === address);
      dispatch({
        type: "SET_ACCOUNTS",
        payload: {
          accounts,
          activeIndex: idx >= 0 ? idx : accounts.length - 1,
        },
      });
      dispatch({ type: "SET_SUCCESS", payload: `已导入 ${address}` });
    } catch (err: any) {
      dispatch({
        type: "SET_ERROR",
        payload: err.message || "凭证导入失败",
      });
      throw err;
    }
  }, []);

  // ── Import by Email + Password ──
  const importByPassword = useCallback(
    async (email: string, password: string) => {
      try {
        const { jwt } = await apiLoginWithAddressPassword({ email, password });
        const newAccount: MailAccount = {
          address: email,
          jwt,
          password,
          createdAt: new Date().toISOString(),
        };
        await storeAddAccount(newAccount);
        const accounts = await getAccounts();
        const idx = accounts.findIndex((a) => a.address === email);
        dispatch({
          type: "SET_ACCOUNTS",
          payload: {
            accounts,
            activeIndex: idx >= 0 ? idx : accounts.length - 1,
          },
        });
        dispatch({ type: "SET_SUCCESS", payload: `已导入 ${email}` });
      } catch (err: any) {
        dispatch({
          type: "SET_ERROR",
          payload: err.message || "登录失败",
        });
        throw err;
      }
    },
    []
  );

  // ── Change Password ──
  const changePassword = useCallback(
    async (newPassword: string, oldPassword?: string) => {
      const accounts = await getAccounts();
      const activeIndex = await getActiveAccountIndex();
      const account = accounts[activeIndex];
      if (!account) throw new Error("请先选择邮箱地址");
      try {
        await apiChangeAddressPassword(account.jwt, {
          password: newPassword,
          old_password: oldPassword,
        });
        // Persist the new password so we can show it in the UI
        const next = [...accounts];
        next[activeIndex] = { ...account, password: newPassword };
        await saveAccounts(next);
        dispatch({
          type: "SET_ACCOUNTS",
          payload: { accounts: next, activeIndex },
        });
        dispatch({ type: "SET_SUCCESS", payload: "密码已更新" });
      } catch (err: any) {
        dispatch({
          type: "SET_ERROR",
          payload: err.message || "密码更新失败",
        });
        throw err;
      }
    },
    []
  );

  // ── Save Auto Reply ──
  const saveAutoReply = useCallback(async (autoReply: AutoReply) => {
    const accounts = await getAccounts();
    const activeIndex = await getActiveAccountIndex();
    const account = accounts[activeIndex];
    if (!account) throw new Error("请先选择邮箱地址");
    try {
      await apiSetAutoReply(account.jwt, autoReply);
      dispatch({
        type: "SET_USER_SETTINGS",
        payload: {
          ...(state.userSettings || {}),
          auto_reply: autoReply,
          fetched: true,
        },
      });
      dispatch({ type: "SET_SUCCESS", payload: "自动回复已保存" });
    } catch (err: any) {
      dispatch({
        type: "SET_ERROR",
        payload: err.message || "自动回复保存失败",
      });
      throw err;
    }
  }, [state.userSettings]);

  const clearError = useCallback(() => {
    dispatch({ type: "SET_ERROR", payload: null });
  }, []);
  const clearSuccess = useCallback(() => {
    dispatch({ type: "SET_SUCCESS", payload: null });
  }, []);

  // ── Admin Mode ──
  const enterAdminMode = useCallback(async (password: string) => {
    if (!password.trim()) {
      throw new Error("请输入管理员密码");
    }
    try {
      const trimmedPassword = password.trim();
      await apiAdminLogin(trimmedPassword);
      const latestConfig = await getConfig();
      dispatch({
        type: "SET_CONFIG",
        payload: {
          workerUrl: latestConfig.workerUrl || state.workerUrl,
          adminPassword: trimmedPassword,
          sitePassword: latestConfig.sitePassword,
          refreshInterval: Number.isFinite(latestConfig.refreshInterval)
            ? latestConfig.refreshInterval
            : state.refreshInterval,
        },
      });
      dispatch({ type: "SET_ADMIN_MODE", payload: true });
      dispatch({ type: "SET_SUCCESS", payload: "已进入管理员模式" });
      void saveConfig({ adminPassword: trimmedPassword }).catch(() => {});
    } catch (err: any) {
      dispatch({
        type: "SET_ERROR",
        payload: err.message || "管理员密码校验失败",
      });
      throw err;
    }
  }, [state.workerUrl, state.sitePassword, state.refreshInterval]);

  const exitAdminMode = useCallback(() => {
    dispatch({ type: "SET_ADMIN_MODE", payload: false });
    dispatch({ type: "SET_SUCCESS", payload: "已退出管理员模式" });
  }, []);

  // ── Initialize on mount ──
  useEffect(() => {
    initialize();
  }, [initialize]);

  // ── Load site settings after config restore ──
  useEffect(() => {
    if (!state.isInitialized || !state.isConfigured) return;
    loadSettings();
  }, [state.isInitialized, state.isConfigured, loadSettings]);

  // ── Load mails after account switch ──
  useEffect(() => {
    if (!state.isInitialized || !state.isConfigured || !activeAccount?.address) return;
    loadMails();
    loadUserSettings();
  }, [
    activeAccount?.address,
    loadMails,
    loadUserSettings,
    state.isConfigured,
    state.isInitialized,
  ]);

  // ── Auto Refresh Timer ──
  useEffect(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    if (state.isConfigured && activeAccount?.address && state.refreshInterval > 0) {
      refreshTimerRef.current = setInterval(() => {
        refreshMails();
      }, state.refreshInterval * 1000);
    }
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [
    state.isConfigured,
    activeAccount?.address,
    state.refreshInterval,
    refreshMails,
  ]);

  // ── Refresh on app foreground ──
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (
        nextState !== "active" ||
        !state.isInitialized ||
        !state.isConfigured
      ) {
        return;
      }
      loadSettings();
      if (activeAccount) refreshMails();
    });
    return () => subscription.remove();
  }, [
    activeAccount,
    loadSettings,
    refreshMails,
    state.isConfigured,
    state.isInitialized,
  ]);

  // ── Auto-clear messages ──
  useEffect(() => {
    if (state.error || state.successMessage) {
      const timer = setTimeout(() => {
        dispatch({ type: "CLEAR_MESSAGES" });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [state.error, state.successMessage]);

  const value: MailContextValue = {
    state,
    initialize,
    updateConfig,
    loadSettings,
    loadUserSettings,
    createNewAddress,
    switchAccount,
    deleteAccount,
    loadMails,
    refreshMails,
    loadSentMails,
    refreshSentMails,
    deleteMailById,
    deleteSentMailById,
    clearInbox,
    clearSentItems,
    sendEmail,
    requestSendMailAccess,
    importByCredential,
    importByPassword,
    changePassword,
    saveAutoReply,
    enterAdminMode,
    exitAdminMode,
    clearError,
    clearSuccess,
    activeAccount,
  };

  return (
    <MailContext.Provider value={value}>{children}</MailContext.Provider>
  );
}

export function useMail() {
  const ctx = useContext(MailContext);
  if (!ctx) throw new Error("useMail must be used within MailProvider");
  return ctx;
}
