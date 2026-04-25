import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Text,
  View,
  FlatList,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Switch,
  Modal,
  ScrollView,
} from "react-native";
import { Pressable } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { TabSwipeScreen } from "@/components/tab-swipe-screen";
import { Toast } from "@/components/toast";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useMail } from "@/lib/mail-context";
import type { MailAccount } from "@/lib/api";
import { buildMailboxName, normalizeMailboxPrefix } from "@/lib/mailbox-name";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

async function copyToClipboard(text: string) {
  try {
    const Clipboard = await import("expo-clipboard");
    await Clipboard.setStringAsync(text);
  } catch {}
}

type ImportMode = "credential" | "password";

export default function AddressesScreen() {
  const colors = useColors();
  const {
    state,
    loadSettings,
    createNewAddress,
    switchAccount,
    deleteAccount,
    importByCredential,
    importByPassword,
    clearError,
    clearSuccess,
  } = useMail();

  // ── Create modal ──
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedDomain, setSelectedDomain] = useState("");
  const [customPrefix, setCustomPrefix] = useState("");
  const [useSubdomain, setUseSubdomain] = useState(false);
  const [subdomainPrefix, setSubdomainPrefix] = useState("");
  const [useRandomSubdomain, setUseRandomSubdomain] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showDomainPicker, setShowDomainPicker] = useState(false);

  // ── Credential display ──
  const [createdInfo, setCreatedInfo] = useState<{
    address: string;
    jwt: string;
    password?: string;
  } | null>(null);

  // ── Import modal ──
  const [showImportModal, setShowImportModal] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("credential");
  const [credentialInput, setCredentialInput] = useState("");
  const [importEmail, setImportEmail] = useState("");
  const [importPassword, setImportPassword] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  // ── View current credential modal ──
  const [viewAccount, setViewAccount] = useState<MailAccount | null>(null);

  const domains = state.settings?.domains || [];
  const domainLabels = state.settings?.domainLabels || [];
  const randomSubdomainDomains = state.settings?.randomSubdomainDomains || [];

  const domainItems = useMemo(
    () =>
      domains.map((d, i) => ({
        value: d,
        label: domainLabels[i] && domainLabels[i] !== d ? `${domainLabels[i]}（${d}）` : d,
        supportsRandom: randomSubdomainDomains.includes(d),
      })),
    [domains, domainLabels, randomSubdomainDomains]
  );

  useEffect(() => {
    if (state.isConfigured) loadSettings();
  }, [state.isConfigured, loadSettings]);

  useEffect(() => {
    if (domains.length === 0) {
      setSelectedDomain("");
      return;
    }
    if (!selectedDomain || !domains.includes(selectedDomain)) {
      setSelectedDomain(domains[0]);
    }
  }, [domains, selectedDomain]);

  const currentDomainSupportsRandom =
    !!selectedDomain && randomSubdomainDomains.includes(selectedDomain);

  const previewAddress = useMemo(() => {
    const name = buildMailboxName(newName.trim() || "name", customPrefix);
    const base = useSubdomain && subdomainPrefix.trim()
      ? `${subdomainPrefix.trim()}.${selectedDomain || "domain.com"}`
      : selectedDomain || "domain.com";
    return `${name}@${base}`;
  }, [customPrefix, newName, selectedDomain, subdomainPrefix, useSubdomain]);

  const handleCreate = useCallback(async () => {
    if (!newName.trim() || !selectedDomain) return;

    setIsCreating(true);
    try {
      const mailboxName = buildMailboxName(newName.trim(), customPrefix);
      const domain = useSubdomain && subdomainPrefix.trim()
        ? `${subdomainPrefix.trim()}.${selectedDomain}`
        : selectedDomain;

      const result = await createNewAddress({
        name: mailboxName,
        domain,
        enablePrefix: false,
        enableRandomSubdomain: useRandomSubdomain && currentDomainSupportsRandom,
      });

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setShowCreateModal(false);
      setNewName("");
      setCustomPrefix("");
      setSubdomainPrefix("");
      setUseSubdomain(false);
      setUseRandomSubdomain(false);

      // Show credential modal for backup
      setCreatedInfo(result);
    } catch {
      // Error handled by context toast
    } finally {
      setIsCreating(false);
    }
  }, [
    customPrefix,
    newName,
    selectedDomain,
    useSubdomain,
    subdomainPrefix,
    useRandomSubdomain,
    currentDomainSupportsRandom,
    createNewAddress,
  ]);

  const handleImport = useCallback(async () => {
    setIsImporting(true);
    try {
      if (importMode === "credential") {
        if (!credentialInput.trim()) return;
        await importByCredential(credentialInput.trim());
      } else {
        if (!importEmail.trim() || !importPassword) return;
        await importByPassword(importEmail.trim(), importPassword);
      }
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setShowImportModal(false);
      setCredentialInput("");
      setImportEmail("");
      setImportPassword("");
    } catch {
      // Error in context
    } finally {
      setIsImporting(false);
    }
  }, [
    importMode,
    credentialInput,
    importEmail,
    importPassword,
    importByCredential,
    importByPassword,
  ]);

  const handleCopyText = useCallback(async (text: string) => {
    await copyToClipboard(text);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const handleDelete = useCallback(
    (index: number, address: string) => {
      Alert.alert(
        "移除邮箱",
        `要移除 ${address} 吗？`,
        [
          { text: "取消", style: "cancel" },
          {
            text: "仅本地移除",
            onPress: () => deleteAccount(index, { removeOnServer: false }),
          },
          {
            text: "从服务器删除",
            style: "destructive",
            onPress: () => deleteAccount(index, { removeOnServer: true }),
          },
        ]
      );
    },
    [deleteAccount]
  );

  const renderAccountItem = useCallback(
    ({ item, index }: { item: MailAccount; index: number }) => {
      const isActive = index === state.activeAccountIndex;
      return (
        <Pressable
          onPress={() => switchAccount(index)}
          style={({ pressed }) => [
            styles.accountItem,
            {
              backgroundColor: isActive ? `${colors.primary}10` : colors.surface,
              borderColor: isActive ? colors.primary : colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <View style={styles.accountInfo}>
            <View style={styles.accountHeader}>
              {isActive && (
                <IconSymbol
                  name="checkmark.circle.fill"
                  size={18}
                  color={colors.primary}
                  style={{ marginRight: 6 }}
                />
              )}
              <Text
                style={[
                  styles.accountAddress,
                  { color: isActive ? colors.primary : colors.foreground },
                ]}
                numberOfLines={1}
              >
                {item.address}
              </Text>
            </View>
            <Text style={[styles.accountDate, { color: colors.muted }]}>
              创建于 {new Date(item.createdAt).toLocaleDateString("zh-CN")}
              {item.password ? "  ·  含密码" : ""}
            </Text>
          </View>
          <View style={styles.accountActions}>
            <Pressable
              onPress={() => setViewAccount(item)}
              style={({ pressed }) => [
                styles.iconButton,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <IconSymbol name="key.fill" size={18} color={colors.muted} />
            </Pressable>
            <Pressable
              onPress={() => handleCopyText(item.address)}
              style={({ pressed }) => [
                styles.iconButton,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <IconSymbol name="doc.on.doc" size={18} color={colors.muted} />
            </Pressable>
            <Pressable
              onPress={() => handleDelete(index, item.address)}
              style={({ pressed }) => [
                styles.iconButton,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <IconSymbol name="trash.fill" size={18} color={colors.error} />
            </Pressable>
          </View>
        </Pressable>
      );
    },
    [state.activeAccountIndex, colors, switchAccount, handleCopyText, handleDelete]
  );

  if (!state.isConfigured) {
    return (
      <TabSwipeScreen tab="addresses">
        <ScreenContainer>
          <View style={styles.emptyContainer}>
            <IconSymbol name="gearshape.fill" size={56} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              请先配置服务器
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
              在「设置」中填入 Worker 地址
            </Text>
          </View>
        </ScreenContainer>
      </TabSwipeScreen>
    );
  }

  return (
    <TabSwipeScreen tab="addresses">
      <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          邮箱管理
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setShowImportModal(true)}
            style={({ pressed }) => [
              styles.headerButton,
              {
                borderColor: colors.primary,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <IconSymbol
              name="arrow.down.circle"
              size={16}
              color={colors.primary}
            />
            <Text style={[styles.headerButtonText, { color: colors.primary }]}>
              导入
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              loadSettings();
              setShowCreateModal(true);
            }}
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <IconSymbol name="plus.circle.fill" size={16} color="#FFFFFF" />
            <Text style={styles.addButtonText}>新建</Text>
          </Pressable>
        </View>
      </View>

      {/* Account List */}
      <FlatList
        data={state.accounts}
        renderItem={renderAccountItem}
        keyExtractor={(item, idx) => `${item.address}-${idx}`}
        contentContainerStyle={
          state.accounts.length === 0 ? styles.emptyList : styles.listContainer
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <IconSymbol name="at" size={56} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              暂无邮箱
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
              点击右上角「新建」创建，或「导入」已有邮箱
            </Text>
          </View>
        }
      />

      {/* Create Modal */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.background },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                创建邮箱
              </Text>
              <Pressable onPress={() => setShowCreateModal(false)}>
                <IconSymbol
                  name="xmark.circle.fill"
                  size={26}
                  color={colors.muted}
                />
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalBody}
              keyboardShouldPersistTaps="handled"
            >
              {domains.length === 0 ? (
                <View
                  style={[
                    styles.warningBox,
                    {
                      backgroundColor: `${colors.warning}15`,
                      borderColor: colors.warning,
                    },
                  ]}
                >
                  <IconSymbol
                    name="exclamationmark.triangle.fill"
                    size={18}
                    color={colors.warning}
                  />
                  <Text style={[styles.warningText, { color: colors.foreground }]}>
                    服务器未返回可用域名。请到「设置」页点击「测试连接」查看详情，或确认 Worker 的 DOMAINS 环境变量已正确配置。
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={[styles.inputLabel, { color: colors.foreground }]}>
                    邮箱名称
                  </Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        color: colors.foreground,
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="输入邮箱名称"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  <Text style={[styles.inputLabel, { color: colors.foreground }]}>
                    选择域名
                  </Text>
                  <Pressable
                    onPress={() => setShowDomainPicker(!showDomainPicker)}
                    style={[
                      styles.domainSelector,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.domainText, { color: colors.foreground }]}>
                      @{selectedDomain || "选择域名"}
                    </Text>
                    <IconSymbol
                      name="chevron.right"
                      size={18}
                      color={colors.muted}
                    />
                  </Pressable>

                  {showDomainPicker && (
                    <View
                      style={[
                        styles.domainList,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <ScrollView style={styles.domainScroll} nestedScrollEnabled>
                        {domainItems.map((item) => (
                          <Pressable
                            key={item.value}
                            onPress={() => {
                              setSelectedDomain(item.value);
                              setShowDomainPicker(false);
                            }}
                            style={({ pressed }) => [
                              styles.domainOption,
                              {
                                backgroundColor:
                                  item.value === selectedDomain
                                    ? `${colors.primary}15`
                                    : "transparent",
                                opacity: pressed ? 0.7 : 1,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.domainOptionText,
                                {
                                  color:
                                    item.value === selectedDomain
                                      ? colors.primary
                                      : colors.foreground,
                                },
                              ]}
                            >
                              @{item.label}
                            </Text>
                            {item.supportsRandom && (
                              <View
                                style={[
                                  styles.badge,
                                  {
                                    backgroundColor: `${colors.success}20`,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.badgeText,
                                    { color: colors.success },
                                  ]}
                                >
                                  随机子域名
                                </Text>
                              </View>
                            )}
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {/* Custom subdomain */}
                  <View style={[styles.optionRow, { borderColor: colors.border }]}>
                    <View style={styles.optionInfo}>
                      <Text style={[styles.optionLabel, { color: colors.foreground }]}>
                        自定义子域名
                      </Text>
                      <Text style={[styles.optionDesc, { color: colors.muted }]}>
                        在域名前添加自定义前缀
                      </Text>
                    </View>
                    <Switch
                      value={useSubdomain}
                      onValueChange={(v) => {
                        setUseSubdomain(v);
                        if (v) setUseRandomSubdomain(false);
                      }}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  {useSubdomain && (
                    <TextInput
                      style={[
                        styles.textInput,
                        {
                          color: colors.foreground,
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                          marginTop: 8,
                        },
                      ]}
                      value={subdomainPrefix}
                      onChangeText={setSubdomainPrefix}
                      placeholder="子域名前缀，如 team"
                      placeholderTextColor={colors.muted}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  )}

                  {/* Random subdomain */}
                  {currentDomainSupportsRandom && (
                    <View style={[styles.optionRow, { borderColor: colors.border }]}>
                      <View style={styles.optionInfo}>
                        <Text style={[styles.optionLabel, { color: colors.foreground }]}>
                          随机子域名
                        </Text>
                        <Text style={[styles.optionDesc, { color: colors.muted }]}>
                          自动挂在随机子域名下（建议仅收件使用）
                        </Text>
                      </View>
                      <Switch
                        value={useRandomSubdomain}
                        onValueChange={(v) => {
                          setUseRandomSubdomain(v);
                          if (v) setUseSubdomain(false);
                        }}
                        trackColor={{ false: colors.border, true: colors.primary }}
                        thumbColor="#FFFFFF"
                      />
                    </View>
                  )}

                  <View style={styles.optionInfo}>
                    <Text style={[styles.optionLabel, { color: colors.foreground }]}>
                      自定义前缀
                    </Text>
                    <Text style={[styles.optionDesc, { color: colors.muted }]}>
                      可选，创建为 {normalizeMailboxPrefix(customPrefix) || "prefix"}.name@domain
                    </Text>
                  </View>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        color: colors.foreground,
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                        marginTop: 8,
                      },
                    ]}
                    value={customPrefix}
                    onChangeText={setCustomPrefix}
                    placeholder="邮箱名前缀，如 vip"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  {/* Preview */}
                  <View
                    style={[
                      styles.previewBox,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.previewLabel, { color: colors.muted }]}>
                      预览地址
                    </Text>
                    <Text style={[styles.previewAddress, { color: colors.primary }]}>
                      {previewAddress}
                    </Text>
                  </View>

                  <Pressable
                    onPress={handleCreate}
                    disabled={
                      isCreating || !newName.trim() || !selectedDomain
                    }
                    style={({ pressed }) => [
                      styles.createButton,
                      {
                        backgroundColor:
                          isCreating || !newName.trim()
                            ? colors.muted
                            : colors.primary,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    {isCreating ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.createButtonText}>创建邮箱</Text>
                    )}
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Import Modal */}
      <Modal
        visible={showImportModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowImportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                导入邮箱
              </Text>
              <Pressable onPress={() => setShowImportModal(false)}>
                <IconSymbol
                  name="xmark.circle.fill"
                  size={26}
                  color={colors.muted}
                />
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalBody}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.segment}>
                {(["credential", "password"] as ImportMode[]).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setImportMode(m)}
                    style={[
                      styles.segmentItem,
                      {
                        backgroundColor:
                          importMode === m ? colors.primary : colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        {
                          color: importMode === m ? "#FFFFFF" : colors.foreground,
                        },
                      ]}
                    >
                      {m === "credential" ? "凭证导入" : "密码登录"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {importMode === "credential" ? (
                <>
                  <Text style={[styles.inputLabel, { color: colors.foreground }]}>
                    邮箱凭证 (JWT)
                  </Text>
                  <TextInput
                    style={[
                      styles.textArea,
                      {
                        color: colors.foreground,
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    value={credentialInput}
                    onChangeText={setCredentialInput}
                    placeholder="粘贴从其他设备导出的邮箱凭证"
                    placeholderTextColor={colors.muted}
                    multiline
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </>
              ) : (
                <>
                  <Text style={[styles.inputLabel, { color: colors.foreground }]}>
                    邮箱地址
                  </Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        color: colors.foreground,
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    value={importEmail}
                    onChangeText={setImportEmail}
                    placeholder="name@example.com"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                  />
                  <Text style={[styles.inputLabel, { color: colors.foreground }]}>
                    地址密码
                  </Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        color: colors.foreground,
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    value={importPassword}
                    onChangeText={setImportPassword}
                    placeholder="创建时生成或手动设置的密码"
                    placeholderTextColor={colors.muted}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </>
              )}

              <Pressable
                onPress={handleImport}
                disabled={
                  isImporting ||
                  (importMode === "credential"
                    ? !credentialInput.trim()
                    : !importEmail.trim() || !importPassword)
                }
                style={({ pressed }) => [
                  styles.createButton,
                  {
                    backgroundColor: isImporting ? colors.muted : colors.primary,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                {isImporting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.createButtonText}>
                    {importMode === "credential" ? "导入凭证" : "登录"}
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Created info / View credential Modal */}
      <Modal
        visible={!!createdInfo || !!viewAccount}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setCreatedInfo(null);
          setViewAccount(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                {createdInfo ? "邮箱已创建" : "邮箱凭证"}
              </Text>
              <Pressable
                onPress={() => {
                  setCreatedInfo(null);
                  setViewAccount(null);
                }}
              >
                <IconSymbol
                  name="xmark.circle.fill"
                  size={26}
                  color={colors.muted}
                />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              {createdInfo && (
                <Text style={[styles.warningText, { color: colors.warning, marginBottom: 12 }]}>
                  请把凭证和密码妥善保存，凭证是恢复邮箱的唯一途径。
                </Text>
              )}

              <CredField
                label="邮箱地址"
                value={createdInfo?.address || viewAccount?.address || ""}
                onCopy={handleCopyText}
                colors={colors}
              />
              <CredField
                label="地址凭证 (JWT)"
                value={createdInfo?.jwt || viewAccount?.jwt || ""}
                onCopy={handleCopyText}
                colors={colors}
                monospace
                multiline
              />
              {(createdInfo?.password || viewAccount?.password) && (
                <CredField
                  label="地址密码"
                  value={createdInfo?.password || viewAccount?.password || ""}
                  onCopy={handleCopyText}
                  colors={colors}
                  monospace
                />
              )}
              {!createdInfo?.password && !viewAccount?.password && (
                <Text style={[styles.mutedHint, { color: colors.muted, marginTop: 8 }]}>
                  本地未保存地址密码。若服务端开启了地址密码，请到「设置 → 账户」里查看 send_balance 或修改密码。
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Toast message={state.error} type="error" onDismiss={clearError} />
      <Toast message={state.successMessage} type="success" onDismiss={clearSuccess} />
      </ScreenContainer>
    </TabSwipeScreen>
  );
}

// ── Credential display sub-component ──
function CredField({
  label,
  value,
  onCopy,
  colors,
  monospace,
  multiline,
}: {
  label: string;
  value: string;
  onCopy: (text: string) => void;
  colors: ReturnType<typeof useColors>;
  monospace?: boolean;
  multiline?: boolean;
}) {
  if (!value) return null;
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.inputLabel, { color: colors.muted, marginTop: 4 }]}>
        {label}
      </Text>
      <View
        style={[
          styles.credBox,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <Text
          selectable
          style={{
            color: colors.foreground,
            fontFamily: monospace ? "Courier" : undefined,
            fontSize: 13,
            flex: 1,
          }}
          numberOfLines={multiline ? undefined : 1}
        >
          {value}
        </Text>
        <Pressable
          onPress={() => onCopy(value)}
          style={({ pressed }) => ({
            padding: 6,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <IconSymbol name="doc.on.doc" size={18} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  headerButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    gap: 4,
  },
  headerButtonText: {
    fontSize: 13,
    fontWeight: "600",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  listContainer: { padding: 16 },
  accountItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  accountInfo: { flex: 1 },
  accountHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  accountAddress: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  accountDate: {
    fontSize: 12,
    marginTop: 4,
  },
  accountActions: {
    flexDirection: "row",
    gap: 4,
  },
  iconButton: { padding: 8 },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyList: { flexGrow: 1 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: "700" },
  modalBody: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    minHeight: 90,
    textAlignVertical: "top",
  },
  domainSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  domainText: { fontSize: 15 },
  domainList: {
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 8,
    overflow: "hidden",
  },
  domainScroll: { maxHeight: 200 },
  domainOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  domainOptionText: { fontSize: 14, fontWeight: "500" },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: { fontSize: 11, fontWeight: "600" },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    marginTop: 8,
  },
  optionInfo: { flex: 1, marginRight: 12 },
  optionLabel: { fontSize: 14, fontWeight: "600" },
  optionDesc: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  previewBox: {
    marginTop: 16,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  previewLabel: { fontSize: 12, marginBottom: 4 },
  previewAddress: { fontSize: 15, fontWeight: "600" },
  createButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 20,
    marginBottom: 30,
  },
  createButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  warningBox: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 16,
    alignItems: "flex-start",
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  mutedHint: {
    fontSize: 12,
    lineHeight: 17,
  },
  segment: {
    flexDirection: "row",
    marginTop: 16,
    borderRadius: 10,
    overflow: "hidden",
    gap: 8,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
  },
  segmentText: { fontSize: 14, fontWeight: "600" },
  credBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
});
