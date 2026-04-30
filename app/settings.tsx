import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Text,
  View,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  Switch,
  Platform,
  Modal,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";

import { ScreenContainer } from "@/components/screen-container";
import { Toast } from "@/components/toast";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useMail } from "@/lib/mail-context";
import {
  adminLogin as verifyAdminLogin,
  fetchSettings as fetchWorkerSettings,
  type WorkerProfile,
} from "@/lib/api";
import { useThemeContext, type ThemePreference } from "@/lib/theme-provider";
import * as Haptics from "expo-haptics";

const REFRESH_OPTIONS = [
  { label: "10 秒", value: 10 },
  { label: "30 秒", value: 30 },
  { label: "60 秒", value: 60 },
  { label: "2 分钟", value: 120 },
  { label: "5 分钟", value: 300 },
  { label: "关闭", value: 0 },
];

const THEME_OPTIONS: { label: string; value: ThemePreference }[] = [
  { label: "跟随系统", value: "system" },
  { label: "浅色", value: "light" },
  { label: "深色", value: "dark" },
  { label: "OLED 黑", value: "oled" },
];

function getThemeLabel(scheme: ThemePreference) {
  if (scheme === "system") return "系统";
  if (scheme === "oled") return "OLED 黑";
  return scheme === "dark" ? "深色" : "浅色";
}

function createDraftWorkerProfile(index = 1): WorkerProfile {
  return {
    id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: `账号 ${index}`,
    workerUrl: "",
    adminPassword: "",
    sitePassword: "",
    domains: [],
    domainLabels: [],
    defaultDomains: [],
    randomSubdomainDomains: [],
    status: "unchecked",
  };
}

function normalizeDraftWorkerProfile(profile: WorkerProfile): WorkerProfile {
  return {
    ...profile,
    name: profile.name.trim() || "未命名账号",
    workerUrl: profile.workerUrl.trim().replace(/\/+$/, ""),
    adminPassword: profile.adminPassword.trim(),
    sitePassword: (profile.sitePassword || "").trim(),
    domains: Array.isArray(profile.domains) ? profile.domains : [],
    domainLabels: Array.isArray(profile.domainLabels) ? profile.domainLabels : [],
    defaultDomains: Array.isArray(profile.defaultDomains) ? profile.defaultDomains : [],
    randomSubdomainDomains: Array.isArray(profile.randomSubdomainDomains)
      ? profile.randomSubdomainDomains
      : [],
  };
}

function getWorkerProfileTestFingerprint(profile: WorkerProfile) {
  const normalized = normalizeDraftWorkerProfile(profile);
  return [
    normalized.workerUrl,
    normalized.adminPassword,
    normalized.sitePassword || "",
  ].join("\n");
}

export default function SettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { colorScheme, themePreference, setThemePreference } = useThemeContext();
  const appVersion = Constants.expoConfig?.version ?? "1.0.1";
  const {
    state,
    updateWorkerProfiles,
    loadSettings,
    loadUserSettings,
    changePassword,
    saveAutoReply,
    enterAdminMode,
    clearError,
    clearSuccess,
    activeAccount,
  } = useMail();

  const [workerProfiles, setWorkerProfiles] = useState<WorkerProfile[]>(() =>
    state.workerProfiles.length > 0
      ? state.workerProfiles
      : [createDraftWorkerProfile(1)]
  );
  const workerProfilesRef = useRef(workerProfiles);
  const [activeWorkerProfileId, setActiveWorkerProfileId] = useState(
    state.activeWorkerProfileId || workerProfiles[0]?.id || ""
  );
  const [refreshInterval, setRefreshInterval] = useState(state.refreshInterval);
  const [isSaving, setIsSaving] = useState(false);
  const [testingProfileId, setTestingProfileId] = useState<string | null>(null);
  const [showRawResponse, setShowRawResponse] = useState(false);

  // Password change
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [isChangingPwd, setIsChangingPwd] = useState(false);

  // Auto reply
  const [showAutoReplySection, setShowAutoReplySection] = useState(false);
  const [arEnabled, setArEnabled] = useState(false);
  const [arSubject, setArSubject] = useState("");
  const [arName, setArName] = useState("");
  const [arSourcePrefix, setArSourcePrefix] = useState("");
  const [arMessage, setArMessage] = useState("");
  const [isSavingAr, setIsSavingAr] = useState(false);

  // Admin entry
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPwdInput, setAdminPwdInput] = useState("");
  const [isEnteringAdmin, setIsEnteringAdmin] = useState(false);
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    workerProfilesRef.current = workerProfiles;
  }, [workerProfiles]);

  const handleLogoTap = useCallback(() => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 1500);
    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      setAdminPwdInput(state.adminPassword || "");
      setShowAdminModal(true);
    }
  }, [state.adminPassword]);

  const handleEnterAdmin = useCallback(async () => {
    if (!adminPwdInput.trim()) {
      Alert.alert("提示", "请输入管理员密码");
      return;
    }
    setIsEnteringAdmin(true);
    try {
      await enterAdminMode(adminPwdInput);
      setShowAdminModal(false);
      setAdminPwdInput("");
      router.replace("/admin");
    } catch {
      // error already in toast
    } finally {
      setIsEnteringAdmin(false);
    }
  }, [adminPwdInput, enterAdminMode, router]);

  useEffect(() => {
    if (!state.adminPassword && !showAdminModal) return;
    (router as any).prefetch?.("/admin");
  }, [router, showAdminModal, state.adminPassword]);

  useEffect(() => {
    if (state.isInitialized) {
      const nextProfiles =
        state.workerProfiles.length > 0
          ? state.workerProfiles
          : state.workerUrl
            ? [
                {
                  ...createDraftWorkerProfile(1),
                  id: "legacy_default",
                  name: "默认账号",
                  workerUrl: state.workerUrl,
                  adminPassword: state.adminPassword,
                  sitePassword: state.sitePassword,
                },
              ]
            : [createDraftWorkerProfile(1)];
      setWorkerProfiles(nextProfiles);
      setActiveWorkerProfileId(
        state.activeWorkerProfileId || nextProfiles[0]?.id || ""
      );
      setRefreshInterval(state.refreshInterval);
    }
  }, [
    state.isInitialized,
    state.workerProfiles,
    state.activeWorkerProfileId,
    state.workerUrl,
    state.adminPassword,
    state.sitePassword,
    state.refreshInterval,
  ]);

  // Sync auto-reply form with user settings
  useEffect(() => {
    const ar = state.userSettings?.auto_reply;
    if (ar) {
      setArEnabled(!!ar.enabled);
      setArSubject(ar.subject || "");
      setArName(ar.name || "");
      setArSourcePrefix(ar.source_prefix || "");
      setArMessage(ar.message || "");
    }
  }, [state.userSettings?.auto_reply]);

  const updateWorkerProfileDraft = useCallback(
    (profileId: string, patch: Partial<WorkerProfile>) => {
      setWorkerProfiles((prev) =>
        prev.map((profile) =>
          profile.id === profileId ? { ...profile, ...patch } : profile
        )
      );
    },
    []
  );

  const handleAddWorkerProfile = useCallback(() => {
    setWorkerProfiles((prev) => {
      const next = [...prev, createDraftWorkerProfile(prev.length + 1)];
      if (!activeWorkerProfileId) {
        setActiveWorkerProfileId(next[0].id);
      }
      return next;
    });
  }, [activeWorkerProfileId]);

  const handleDeleteWorkerProfile = useCallback(
    (profileId: string) => {
      if (workerProfiles.length <= 1) {
        Alert.alert("提示", "至少保留一个 Worker 配置");
        return;
      }
      const profile = workerProfiles.find((item) => item.id === profileId);
      Alert.alert("删除 Worker", `删除「${profile?.name || "该账号"}」配置？`, [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: () => {
            setWorkerProfiles((prev) => {
              const next = prev.filter((item) => item.id !== profileId);
              if (activeWorkerProfileId === profileId) {
                setActiveWorkerProfileId(next[0]?.id || "");
              }
              return next;
            });
          },
        },
      ]);
    },
    [activeWorkerProfileId, workerProfiles]
  );

  const handleSave = useCallback(async () => {
    const cleanedProfiles = workerProfiles
      .map(normalizeDraftWorkerProfile)
      .filter((profile) => profile.workerUrl || profile.adminPassword || profile.sitePassword);

    if (cleanedProfiles.length === 0) {
      Alert.alert("提示", "请至少配置一个 Worker");
      return;
    }

    for (const profile of cleanedProfiles) {
      if (!profile.workerUrl) {
        Alert.alert("提示", `请填入「${profile.name}」的 Worker 地址`);
        return;
      }
      if (!profile.adminPassword) {
        Alert.alert("提示", `请填入「${profile.name}」的管理员密码`);
        return;
      }
    }

    const urlSet = new Set<string>();
    for (const profile of cleanedProfiles) {
      const key = profile.workerUrl.toLowerCase();
      if (urlSet.has(key)) {
        Alert.alert("提示", `Worker 地址重复：${profile.workerUrl}`);
        return;
      }
      urlSet.add(key);
    }

    const nextActiveId =
      cleanedProfiles.find((profile) => profile.id === activeWorkerProfileId)?.id ||
      cleanedProfiles[0].id;
    const activeProfile = cleanedProfiles.find(
      (profile) => profile.id === nextActiveId
    )!;

    setIsSaving(true);
    try {
      await updateWorkerProfiles(cleanedProfiles, nextActiveId, refreshInterval);
      await enterAdminMode(activeProfile.adminPassword);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      try {
        await loadSettings();
      } catch {}
      router.replace("/admin");
    } catch {
      // error already in toast
    } finally {
      setIsSaving(false);
    }
  }, [
    activeWorkerProfileId,
    refreshInterval,
    workerProfiles,
    updateWorkerProfiles,
    enterAdminMode,
    loadSettings,
    router,
  ]);

  const handleTestConnection = useCallback(async (profileId: string) => {
    const profile = workerProfiles.find((item) => item.id === profileId);
    if (!profile) return;
    const draft = normalizeDraftWorkerProfile(profile);
    const testFingerprint = getWorkerProfileTestFingerprint(draft);
    if (!draft.workerUrl) {
      Alert.alert("提示", "请先填入 Worker 地址");
      return;
    }
    if (!draft.adminPassword) {
      Alert.alert("提示", "请先填入管理员密码");
      return;
    }
    setTestingProfileId(profileId);
    try {
      const configOverride = {
        workerUrl: draft.workerUrl,
        adminPassword: draft.adminPassword,
        sitePassword: draft.sitePassword || "",
        lang: "zh",
      };
      const settings = await fetchWorkerSettings({ configOverride });
      await verifyAdminLogin(draft.adminPassword, { configOverride });
      const domainCount = settings.domains?.length || 0;
      const checkedProfile: Partial<WorkerProfile> = {
        domains: settings.domains || [],
        domainLabels: settings.domainLabels || [],
        defaultDomains: settings.defaultDomains || [],
        randomSubdomainDomains: settings.randomSubdomainDomains || [],
        status: "connected",
        lastCheckedAt: new Date().toISOString(),
        errorMessage: undefined,
      };
      const latest = workerProfilesRef.current.find((item) => item.id === profileId);
      if (!latest || getWorkerProfileTestFingerprint(latest) !== testFingerprint) {
        return;
      }
      updateWorkerProfileDraft(profileId, checkedProfile);
      if (domainCount > 0) {
        Alert.alert(
          "连接成功",
          `「${draft.name}」检测到 ${domainCount} 个可用域名：\n${settings.domains?.join(", ")}`
        );
      } else {
        Alert.alert(
          "连接成功但域名为空",
          `「${draft.name}」响应正常，但 domains 为空。\n\n请检查该 Worker 的 DOMAINS 环境变量。`
        );
      }
    } catch (err: any) {
      const latest = workerProfilesRef.current.find((item) => item.id === profileId);
      if (!latest || getWorkerProfileTestFingerprint(latest) !== testFingerprint) {
        return;
      }
      updateWorkerProfileDraft(profileId, {
        status: "error",
        lastCheckedAt: new Date().toISOString(),
        errorMessage: err.message || "无法连接",
      });
      Alert.alert(
        "连接失败",
        `${err.message || "无法连接"}\n\n请检查:\n1. Worker 地址是否正确\n2. 是否需要站点密码\n3. 管理员密码是否正确`
      );
    } finally {
      setTestingProfileId(null);
    }
  }, [updateWorkerProfileDraft, workerProfiles]);

  const handleReturnAdmin = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/admin");
  }, [router]);
  const handleChangePassword = useCallback(async () => {
    if (!newPassword.trim()) {
      Alert.alert("提示", "请输入新密码");
      return;
    }
    setIsChangingPwd(true);
    try {
      await changePassword(newPassword, oldPassword || undefined);
      setNewPassword("");
      setOldPassword("");
    } catch {}
    setIsChangingPwd(false);
  }, [newPassword, oldPassword, changePassword]);

  const handleSaveAutoReply = useCallback(async () => {
    setIsSavingAr(true);
    try {
      await saveAutoReply({
        enabled: arEnabled,
        subject: arSubject.trim(),
        name: arName.trim(),
        source_prefix: arSourcePrefix.trim(),
        message: arMessage,
      });
    } catch {}
    setIsSavingAr(false);
  }, [arEnabled, arSubject, arName, arSourcePrefix, arMessage, saveAutoReply]);

  const rawResponseText = state.settings?._raw
    ? JSON.stringify(state.settings._raw, null, 2)
    : "(未获取)";

  return (
    <ScreenContainer>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          管理员设置
        </Text>

        {/* Server Config Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, styles.sectionTitleInline, { color: colors.muted }]}>
            Workers 配置
          </Text>
          <Pressable
            onPress={handleAddWorkerProfile}
            style={({ pressed }) => [
              styles.smallPillButton,
              {
                backgroundColor: `${colors.primary}12`,
                borderColor: `${colors.primary}28`,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <IconSymbol name="plus.circle.fill" size={14} color={colors.primary} />
            <Text style={[styles.smallPillButtonText, { color: colors.primary }]}>添加 Worker</Text>
          </Pressable>
        </View>

        {workerProfiles.map((profile, index) => {
          const isActive = activeWorkerProfileId === profile.id;
          const isTesting = testingProfileId === profile.id;
          const domainText = profile.domains?.length
            ? profile.domains.join(", ")
            : profile.status === "connected"
              ? "未检测到域名"
              : "尚未刷新域名";
          const statusColor =
            profile.status === "connected"
              ? colors.success
              : profile.status === "error"
                ? colors.error
                : colors.muted;
          const statusLabel =
            profile.status === "connected"
              ? "已连接"
              : profile.status === "error"
                ? "连接失败"
                : "未检测";

          return (
            <View
              key={profile.id}
              style={[
                styles.card,
                styles.workerProfileCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: isActive ? colors.primary : colors.border,
                },
              ]}
            >
              <View style={styles.workerProfileHeader}>
                <View style={styles.workerProfileTitleWrap}>
                  <Text style={[styles.workerProfileTitle, { color: colors.foreground }]}>
                    {profile.name?.trim() || `账号 ${index + 1}`}
                  </Text>
                  <Text style={[styles.workerProfileStatus, { color: statusColor }]}>
                    {isActive ? "当前 · " : ""}{statusLabel}
                  </Text>
                </View>
                <View style={styles.workerProfileActions}>
                  {!isActive ? (
                    <Pressable
                      onPress={() => setActiveWorkerProfileId(profile.id)}
                      style={({ pressed }) => [
                        styles.workerTinyButton,
                        {
                          borderColor: colors.primary,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <Text style={[styles.workerTinyButtonText, { color: colors.primary }]}>设为当前</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => handleDeleteWorkerProfile(profile.id)}
                    disabled={workerProfiles.length <= 1}
                    style={({ pressed }) => [
                      styles.workerIconButton,
                      {
                        borderColor: colors.border,
                        opacity: workerProfiles.length <= 1 ? 0.35 : pressed ? 0.65 : 1,
                      },
                    ]}
                  >
                    <IconSymbol name="trash.fill" size={14} color={colors.error} />
                  </Pressable>
                </View>
              </View>

              <View style={[styles.fieldGroup, { borderBottomColor: colors.border }]}>
                <View style={styles.fieldHeader}>
                  <IconSymbol name="person.crop.circle.fill" size={18} color={colors.primary} />
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>账号名称</Text>
                </View>
                <TextInput
                  style={[
                    styles.fieldInput,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      opacity: isTesting ? 0.62 : 1,
                    },
                  ]}
                  value={profile.name}
                  editable={!isTesting}
                  onChangeText={(text) => updateWorkerProfileDraft(profile.id, { name: text })}
                  placeholder="例如：Cloudflare 账号 A"
                  placeholderTextColor={colors.muted}
                />
              </View>

              <View style={[styles.fieldGroup, { borderBottomColor: colors.border }]}>
                <View style={styles.fieldHeader}>
                  <IconSymbol name="globe" size={18} color={colors.primary} />
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Worker 地址</Text>
                </View>
                <TextInput
                  style={[
                    styles.fieldInput,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      opacity: isTesting ? 0.62 : 1,
                    },
                  ]}
                  value={profile.workerUrl}
                  editable={!isTesting}
                  onChangeText={(text) => updateWorkerProfileDraft(profile.id, { workerUrl: text, status: "unchecked" })}
                  placeholder="https://your-worker.example.com"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </View>

              <View style={[styles.fieldGroup, { borderBottomColor: colors.border }]}>
                <View style={styles.fieldHeader}>
                  <IconSymbol name="key.fill" size={18} color={colors.primary} />
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>管理员密码</Text>
                </View>
                <TextInput
                  style={[
                    styles.fieldInput,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      opacity: isTesting ? 0.62 : 1,
                    },
                  ]}
                  value={profile.adminPassword}
                  editable={!isTesting}
                  onChangeText={(text) => updateWorkerProfileDraft(profile.id, { adminPassword: text, status: "unchecked" })}
                  placeholder="管理员密码（必填）"
                  placeholderTextColor={colors.muted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={[styles.fieldGroup, { borderBottomColor: colors.border }]}>
                <View style={styles.fieldHeader}>
                  <IconSymbol name="lock.fill" size={18} color={colors.primary} />
                  <Text style={[styles.fieldLabel, { color: colors.foreground }]}>站点密码</Text>
                </View>
                <TextInput
                  style={[
                    styles.fieldInput,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      opacity: isTesting ? 0.62 : 1,
                    },
                  ]}
                  value={profile.sitePassword || ""}
                  editable={!isTesting}
                  onChangeText={(text) => updateWorkerProfileDraft(profile.id, { sitePassword: text, status: "unchecked" })}
                  placeholder="站点访问密码（可选）"
                  placeholderTextColor={colors.muted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.workerDomainBox}>
                <Text style={[styles.fieldHint, { color: colors.muted }]} numberOfLines={3}>
                  域名：{domainText}
                </Text>
                {profile.errorMessage ? (
                  <Text style={[styles.fieldHint, { color: colors.error }]} numberOfLines={2}>
                    {profile.errorMessage}
                  </Text>
                ) : null}
                <Pressable
                  onPress={() => handleTestConnection(profile.id)}
                  disabled={isTesting}
                  style={({ pressed }) => [
                    styles.workerTestButton,
                    {
                      backgroundColor: isTesting ? colors.muted : colors.primary,
                      opacity: pressed ? 0.82 : 1,
                    },
                  ]}
                >
                  {isTesting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.workerTestButtonText}>测试连接 / 刷新域名</Text>
                  )}
                </Pressable>
              </View>
            </View>
          );
        })}

        {/* Refresh Interval */}
        <Text style={[styles.sectionTitle, { color: colors.muted }]}>
          自动刷新
        </Text>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.refreshGrid}>
            {REFRESH_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setRefreshInterval(opt.value)}
                style={({ pressed }) => [
                  styles.refreshOption,
                  {
                    backgroundColor:
                      refreshInterval === opt.value
                        ? colors.primary
                        : colors.background,
                    borderColor:
                      refreshInterval === opt.value
                        ? colors.primary
                        : colors.border,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.refreshOptionText,
                    {
                      color:
                        refreshInterval === opt.value
                          ? "#FFFFFF"
                          : colors.foreground,
                    },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.88}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.muted }]}>
          外观
        </Text>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.fieldGroup, { borderBottomColor: colors.border }]}>
            <View style={styles.fieldHeader}>
              <IconSymbol
                name={colorScheme === "light" ? "sun.max.fill" : "moon.fill"}
                size={18}
                color={colors.primary}
              />
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                主题模式
              </Text>
            </View>
            <Text style={[styles.fieldHint, styles.themeHintInline, { color: colors.muted }]}>
              当前为{getThemeLabel(colorScheme)}外观
              {themePreference === "system" ? "（跟随系统）" : ""}
              {themePreference === "oled" ? "（深色纯黑变体）" : ""}
            </Text>
            <View style={styles.themeGrid}>
              {THEME_OPTIONS.map((option) => {
                const active = themePreference === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setThemePreference(option.value)}
                    style={({ pressed }) => [
                      styles.themeOption,
                      {
                        backgroundColor: active ? colors.primary : colors.background,
                        borderColor: active ? colors.primary : colors.border,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.themeOptionText,
                        { color: active ? "#FFFFFF" : colors.foreground },
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.82}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.buttonGroup}>
          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: isSaving ? colors.muted : colors.primary,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {isSaving ? "保存中..." : "保存并进入管理后台"}
            </Text>
          </Pressable>
        </View>

        {/* Server Info */}
        {state.settings && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.muted }]}>
              Workers 信息
            </Text>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {state.settings.title && (
                <InfoRow label="站点标题" value={state.settings.title} colors={colors} />
              )}
              <InfoRow label="域名数量" value={`${state.settings.domains?.length || 0}`} colors={colors} />
              {(state.settings.domains?.length || 0) > 0 && (
                <InfoRow
                  label="可用域名"
                  value={state.settings.domains!.join(", ")}
                  colors={colors}
                />
              )}
              <InfoRow
                label="发送邮件"
                value={state.settings.enableSendMail !== false ? "已启用" : "未启用"}
                colors={colors}
                valueColor={state.settings.enableSendMail !== false ? colors.success : colors.error}
              />
              <InfoRow
                label="自动回复"
                value={state.settings.enableAutoReply ? "已启用" : "未启用"}
                colors={colors}
              />
              <InfoRow
                label="地址密码"
                value={state.settings.enableAddressPassword ? "已启用" : "未启用"}
                colors={colors}
              />
              {(state.settings.randomSubdomainDomains?.length || 0) > 0 && (
                <InfoRow
                  label="随机子域名"
                  value={state.settings.randomSubdomainDomains!.join(", ")}
                  colors={colors}
                />
              )}
              <Pressable
                onPress={() => setShowRawResponse(!showRawResponse)}
                style={styles.rawToggle}
              >
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "500" }}>
                  {showRawResponse ? "收起" : "查看"}原始响应 JSON
                </Text>
              </Pressable>
              {showRawResponse && (
                <View
                  style={[
                    styles.rawBox,
                    { backgroundColor: colors.background, borderColor: colors.border },
                  ]}
                >
                  <Text
                    selectable
                    style={{
                      color: colors.foreground,
                      fontFamily: "Courier",
                      fontSize: 11,
                      lineHeight: 16,
                    }}
                  >
                    {rawResponseText}
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* Account section (only when active account) */}
        {activeAccount && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.muted }]}>
              当前邮箱：{activeAccount.address}
            </Text>

            {/* Send balance */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <InfoRow
                label="发件余额"
                value={
                  state.userSettings?.send_balance !== undefined
                    ? `${state.userSettings.send_balance}`
                    : "(未知)"
                }
                colors={colors}
              />
              <InfoRow
                label="已设置自动回复"
                value={state.userSettings?.auto_reply?.enabled ? "是" : "否"}
                colors={colors}
              />
              <Pressable
                onPress={() => loadUserSettings()}
                style={styles.rawToggle}
              >
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "500" }}>
                  刷新账户信息
                </Text>
              </Pressable>
            </View>

            {/* Change password */}
            <Pressable
              onPress={() => setShowPasswordSection(!showPasswordSection)}
              style={[
                styles.collapseHeader,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "600" }}>
                修改地址密码
              </Text>
              <IconSymbol
                name={showPasswordSection ? "chevron.down" : "chevron.right"}
                size={16}
                color={colors.muted}
              />
            </Pressable>
            {showPasswordSection && (
              <View
                style={[
                  styles.collapseBody,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <TextInput
                  style={[
                    styles.fieldInput,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      marginBottom: 10,
                    },
                  ]}
                  value={oldPassword}
                  onChangeText={setOldPassword}
                  placeholder="当前密码（若已设置过）"
                  placeholderTextColor={colors.muted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TextInput
                  style={[
                    styles.fieldInput,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      marginBottom: 10,
                    },
                  ]}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="新密码"
                  placeholderTextColor={colors.muted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable
                  onPress={handleChangePassword}
                  disabled={isChangingPwd}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    {
                      borderColor: colors.primary,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
                    {isChangingPwd ? "更新中..." : "更新密码"}
                  </Text>
                </Pressable>
              </View>
            )}

            {/* Auto reply */}
            {state.settings?.enableAutoReply && (
              <>
                <Pressable
                  onPress={() => setShowAutoReplySection(!showAutoReplySection)}
                  style={[
                    styles.collapseHeader,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      marginTop: 10,
                    },
                  ]}
                >
                  <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "600" }}>
                    自动回复
                  </Text>
                  <IconSymbol
                    name={showAutoReplySection ? "chevron.down" : "chevron.right"}
                    size={16}
                    color={colors.muted}
                  />
                </Pressable>
                {showAutoReplySection && (
                  <View
                    style={[
                      styles.collapseBody,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <View style={styles.autoReplyToggleRow}>
                      <Text style={{ color: colors.foreground, fontSize: 14 }}>
                        启用自动回复
                      </Text>
                      <Switch
                        value={arEnabled}
                        onValueChange={setArEnabled}
                        trackColor={{ false: colors.border, true: colors.primary }}
                        thumbColor="#FFFFFF"
                      />
                    </View>
                    <TextInput
                      style={[
                        styles.fieldInput,
                        {
                          color: colors.foreground,
                          borderColor: colors.border,
                          backgroundColor: colors.background,
                          marginTop: 10,
                        },
                      ]}
                      value={arSubject}
                      onChangeText={setArSubject}
                      placeholder="自动回复主题"
                      placeholderTextColor={colors.muted}
                    />
                    <TextInput
                      style={[
                        styles.fieldInput,
                        {
                          color: colors.foreground,
                          borderColor: colors.border,
                          backgroundColor: colors.background,
                          marginTop: 10,
                        },
                      ]}
                      value={arName}
                      onChangeText={setArName}
                      placeholder="显示名称（可选）"
                      placeholderTextColor={colors.muted}
                    />
                    <TextInput
                      style={[
                        styles.fieldInput,
                        {
                          color: colors.foreground,
                          borderColor: colors.border,
                          backgroundColor: colors.background,
                          marginTop: 10,
                        },
                      ]}
                      value={arSourcePrefix}
                      onChangeText={setArSourcePrefix}
                      placeholder="仅对特定发件人前缀生效（可选）"
                      placeholderTextColor={colors.muted}
                    />
                    <TextInput
                      style={[
                        styles.fieldInput,
                        {
                          color: colors.foreground,
                          borderColor: colors.border,
                          backgroundColor: colors.background,
                          marginTop: 10,
                          minHeight: 100,
                          textAlignVertical: "top",
                          paddingTop: 10,
                        },
                      ]}
                      value={arMessage}
                      onChangeText={setArMessage}
                      placeholder="自动回复正文"
                      placeholderTextColor={colors.muted}
                      multiline
                    />
                    <Pressable
                      onPress={handleSaveAutoReply}
                      disabled={isSavingAr}
                      style={({ pressed }) => [
                        styles.secondaryButton,
                        {
                          borderColor: colors.primary,
                          opacity: pressed ? 0.8 : 1,
                          marginTop: 14,
                        },
                      ]}
                    >
                      <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
                        {isSavingAr ? "保存中..." : "保存自动回复"}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </>
            )}
          </>
        )}
        {/* Admin status */}
        {state.isAdminMode && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.muted }]}>管理员</Text>
            <View
              style={[
                styles.card,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
                <Text style={{ color: colors.muted, fontSize: 14 }}>状态</Text>
                <Text style={{ color: colors.success, fontSize: 14, fontWeight: "600" }}>
                  已连接管理后台
                </Text>
              </View>
              <Pressable
                onPress={handleReturnAdmin}
                style={({ pressed }) => [
                  styles.rawToggle,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "600" }}>
                  返回管理后台 →
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {/* About */}
        <Text style={[styles.sectionTitle, { color: colors.muted }]}>
          关于
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable onPress={handleLogoTap}>
            <View style={styles.aboutContent}>
              <Text style={[styles.aboutTitle, { color: colors.foreground }]}>
                CloudMail
              </Text>
              <Text style={[styles.aboutVersion, { color: colors.muted }]}>
                v{appVersion}
              </Text>
              <Text style={[styles.aboutDesc, { color: colors.muted }]}>
                面向管理员的 CloudMail 管理客户端
              </Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.bottomSpacer} />
        </ScrollView>

      {/* Admin Login Modal */}
      <Modal
        visible={showAdminModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAdminModal(false)}
      >
        <View style={stylesExtra.modalOverlay}>
          <View style={[stylesExtra.modalCard, { backgroundColor: colors.background }]}>
            <Text style={[stylesExtra.modalTitle, { color: colors.foreground }]}>
              管理员登录
            </Text>
            <TextInput
              style={[
                stylesExtra.modalInput,
                {
                  color: colors.foreground,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
              value={adminPwdInput}
              onChangeText={setAdminPwdInput}
              placeholder="管理员密码"
              placeholderTextColor={colors.muted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={handleEnterAdmin}
              returnKeyType="done"
              autoFocus
            />
            <View style={stylesExtra.modalActions}>
              <Pressable
                onPress={() => setShowAdminModal(false)}
                style={({ pressed }) => [
                  stylesExtra.modalCancelBtn,
                  { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                  取消
                </Text>
              </Pressable>
              <Pressable
                onPress={handleEnterAdmin}
                disabled={isEnteringAdmin}
                style={({ pressed }) => [
                  stylesExtra.modalConfirmBtn,
                  {
                    backgroundColor: isEnteringAdmin ? colors.muted : colors.primary,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                {isEnteringAdmin ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={{ color: "#FFF", fontWeight: "600" }}>进入</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

        <Toast message={state.error} type="error" onDismiss={clearError} />
        <Toast message={state.successMessage} type="success" onDismiss={clearSuccess} />
      </ScreenContainer>
  );
}

function InfoRow({
  label,
  value,
  colors,
  valueColor,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
  valueColor?: string;
}) {
  return (
    <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.infoLabel, { color: colors.muted }]}>{label}</Text>
      <Text
        style={[
          styles.infoValue,
          { color: valueColor || colors.foreground },
        ]}
        numberOfLines={3}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 10,
  },
  sectionHeaderRow: {
    marginTop: 24,
    marginBottom: 10,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitleInline: {
    paddingHorizontal: 0,
    marginTop: 0,
    marginBottom: 0,
  },
  smallPillButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  smallPillButtonText: {
    fontSize: 12,
    fontWeight: "800",
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  workerProfileCard: {
    marginBottom: 12,
  },
  workerProfileHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  workerProfileTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  workerProfileTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  workerProfileStatus: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "700",
  },
  workerProfileActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  workerTinyButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  workerTinyButtonText: {
    fontSize: 12,
    fontWeight: "800",
  },
  workerIconButton: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  workerDomainBox: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
  },
  workerTestButton: {
    minHeight: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  workerTestButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  fieldGroup: {
    padding: 16,
    borderBottomWidth: 0.5,
  },
  fieldHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  fieldLabel: { fontSize: 14, fontWeight: "600" },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  fieldHint: {
    fontSize: 12,
    marginTop: 6,
    lineHeight: 16,
  },
  refreshGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 12,
    gap: 8,
  },
  refreshOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  refreshOptionText: { fontSize: 13, fontWeight: "500" },
  themeHintInline: {
    marginTop: 0,
    marginBottom: 12,
  },
  themeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  themeOption: {
    flexGrow: 1,
    flexBasis: "47%",
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  themeOptionText: {
    fontSize: 13,
    fontWeight: "600",
    includeFontPadding: false,
  },
  buttonGroup: {
    paddingHorizontal: 16,
    marginTop: 24,
    gap: 10,
  },
  primaryButton: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  secondaryButtonText: { fontSize: 16, fontWeight: "600" },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  infoLabel: { fontSize: 14, flex: 1 },
  infoValue: {
    fontSize: 13,
    fontWeight: "500",
    maxWidth: "65%",
    textAlign: "right",
  },
  rawToggle: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rawBox: {
    margin: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    maxHeight: 280,
  },
  aboutContent: {
    alignItems: "center",
    padding: 20,
  },
  aboutTitle: { fontSize: 18, fontWeight: "700" },
  aboutVersion: { fontSize: 13, marginTop: 4 },
  aboutDesc: {
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 18,
  },
  bottomSpacer: { height: 40 },
  collapseHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  collapseBody: {
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: -6,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  autoReplyToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
});

const stylesExtra = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginTop: 16,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  modalConfirmBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
  },
});
