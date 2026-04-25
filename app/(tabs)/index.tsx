import React, { useCallback, useEffect, useState } from "react";
import {
  Text,
  View,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Alert,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Toast } from "@/components/toast";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useMail } from "@/lib/mail-context";
import {
  formatMailDate,
  formatMailboxDisplay,
  getMailPreview,
  getMailRecipientsDisplay,
  getSenderDisplay,
} from "@/lib/mail-parser";
import type { ParsedMail } from "@/lib/api";

type Tab = "inbox" | "sent";

export default function InboxScreen() {
  const colors = useColors();
  const router = useRouter();
  const {
    state,
    refreshMails,
    loadSentMails,
    refreshSentMails,
    clearInbox,
    clearSentItems,
    deleteMailById,
    deleteSentMailById,
    clearError,
    clearSuccess,
    activeAccount,
  } = useMail();

  const [tab, setTab] = useState<Tab>("inbox");

  useEffect(() => {
    if (state.isInitialized && state.isAdminMode) {
      router.replace("/admin");
    }
  }, [router, state.isAdminMode, state.isInitialized]);

  useEffect(() => {
    if (tab === "sent" && activeAccount?.address && state.sentMails.length === 0) {
      loadSentMails();
    }
  }, [
    tab,
    activeAccount?.address,
    state.sentMails.length,
    loadSentMails,
  ]);

  const handleRefresh = useCallback(() => {
    if (tab === "inbox") refreshMails();
    else refreshSentMails();
  }, [tab, refreshMails, refreshSentMails]);

  const handleMailPress = useCallback(
    (mail: ParsedMail) => {
      router.push({
        pathname: "/mail-detail",
        params: { mailId: mail.id.toString(), source: tab },
      });
    },
    [router, tab]
  );

  const handleLongPressMail = useCallback(
    (mail: ParsedMail) => {
      Alert.alert(
        "删除邮件",
        mail.subject || "(无主题)",
        [
          { text: "取消", style: "cancel" },
          {
            text: "删除",
            style: "destructive",
            onPress: () =>
              tab === "inbox"
                ? deleteMailById(mail.id)
                : deleteSentMailById(mail.id),
          },
        ]
      );
    },
    [tab, deleteMailById, deleteSentMailById]
  );

  const handleClearAll = useCallback(() => {
    const label = tab === "inbox" ? "收件箱" : "发件箱";
    Alert.alert(
      `清空${label}`,
      `确定要清空当前邮箱的${label}吗？此操作不可恢复。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "清空",
          style: "destructive",
          onPress: () => (tab === "inbox" ? clearInbox() : clearSentItems()),
        },
      ]
    );
  }, [tab, clearInbox, clearSentItems]);

  const renderMailItem = useCallback(
    ({ item }: { item: ParsedMail }) => {
      const sender =
        tab === "inbox"
          ? getSenderDisplay(item)
          : formatMailboxDisplay(item.to?.[0]) ||
            getMailRecipientsDisplay(item) ||
            "收件人";
      const preview = getMailPreview(item, 80);
      const date = formatMailDate(item.date || item.createdAt);
      const hasAttachments = (item.attachments?.length || 0) > 0;

      return (
        <Pressable
          onPress={() => handleMailPress(item)}
          onLongPress={() => handleLongPressMail(item)}
          delayLongPress={350}
          style={({ pressed }) => [
            styles.mailItem,
            {
              backgroundColor: colors.surface,
              borderBottomColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>
              {sender.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.mailContent}>
            <View style={styles.mailHeader}>
              <Text
                style={[styles.senderName, { color: colors.foreground }]}
                numberOfLines={1}
              >
                {tab === "sent" ? `→ ${sender}` : sender}
              </Text>
              <Text style={[styles.mailDate, { color: colors.muted }]}>
                {date}
              </Text>
            </View>
            <Text
              style={[styles.mailSubject, { color: colors.foreground }]}
              numberOfLines={1}
            >
              {item.subject || "(无主题)"}
            </Text>
            <View style={styles.mailFooter}>
              <Text
                style={[styles.mailPreview, { color: colors.muted }]}
                numberOfLines={1}
              >
                {preview || "(无内容)"}
              </Text>
              {hasAttachments && (
                <IconSymbol
                  name="paperclip"
                  size={14}
                  color={colors.muted}
                  style={{ marginLeft: 4 }}
                />
              )}
            </View>
          </View>
        </Pressable>
      );
    },
    [colors, handleMailPress, handleLongPressMail, tab]
  );

  // Not configured state
  if (!state.isConfigured && state.isInitialized) {
    return (
      <ScreenContainer>
        <View style={styles.emptyContainer}>
          <IconSymbol name="gearshape.fill" size={56} color={colors.muted} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            欢迎使用 CloudMail
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
            请先在「设置」中配置 Worker 地址
          </Text>
        </View>
        <Toast message={state.error} type="error" onDismiss={clearError} />
      </ScreenContainer>
    );
  }

  // No active account
  if (!activeAccount && state.isInitialized) {
    return (
      <ScreenContainer>
        <View style={styles.emptyContainer}>
          <IconSymbol name="at" size={56} color={colors.muted} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            暂无邮箱
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
            请在「邮箱」中创建一个邮箱地址
          </Text>
        </View>
        <Toast message={state.error} type="error" onDismiss={clearError} />
      </ScreenContainer>
    );
  }

  const data = tab === "inbox" ? state.mails : state.sentMails;
  const isLoading = tab === "inbox" ? state.isLoadingMails : state.isLoadingSent;

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            邮件
          </Text>
          {activeAccount && (
            <Text
              style={[styles.headerSubtitle, { color: colors.muted }]}
              numberOfLines={1}
            >
              {activeAccount.address}
            </Text>
          )}
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={handleClearAll}
            style={({ pressed }) => [
              styles.iconBtn,
              { opacity: pressed ? 0.5 : 1 },
            ]}
          >
            <IconSymbol name="trash" size={20} color={colors.error} />
          </Pressable>
          <Pressable
            onPress={handleRefresh}
            style={({ pressed }) => [
              styles.iconBtn,
              { opacity: pressed ? 0.5 : 1 },
            ]}
          >
            <IconSymbol name="arrow.clockwise" size={22} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      {/* Segmented tabs */}
      <View style={styles.segmentWrap}>
        <View
          style={[
            styles.segmentTrack,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          {(["inbox", "sent"] as Tab[]).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[
                styles.segmentItem,
                {
                  backgroundColor: tab === t ? colors.primary : "transparent",
                },
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  {
                    color: tab === t ? "#FFFFFF" : colors.foreground,
                  },
                ]}
              >
                {t === "inbox" ? `收件箱 (${state.mails.length})` : `发件箱 (${state.sentMails.length})`}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Mail List */}
      {isLoading && data.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>
            加载邮件中...
          </Text>
        </View>
      ) : (
        <FlatList
          data={data}
          renderItem={renderMailItem}
          keyExtractor={(item) => `${tab}-${item.id}`}
          refreshControl={
            <RefreshControl
              refreshing={
                tab === "inbox"
                  ? state.isRefreshing ||
                    (state.isLoadingMails && state.mails.length > 0)
                  : state.isLoadingSent && state.sentMails.length > 0
              }
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          contentContainerStyle={
            data.length === 0 ? styles.emptyList : undefined
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <IconSymbol
                name={tab === "inbox" ? "tray.fill" : "paperplane.fill"}
                size={56}
                color={colors.muted}
              />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {tab === "inbox" ? "收件箱为空" : "发件箱为空"}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                {tab === "inbox" ? "下拉刷新或等待新邮件" : "在「发送」里发邮件，会在这里看到"}
              </Text>
            </View>
          }
        />
      )}

      <Toast message={state.error} type="error" onDismiss={clearError} />
      <Toast
        message={state.successMessage}
        type="success"
        onDismiss={clearSuccess}
      />
    </ScreenContainer>
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
  headerLeft: { flex: 1, marginRight: 8 },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconBtn: { padding: 8 },
  segmentWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  segmentTrack: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 4,
    borderWidth: 1,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "600",
  },
  mailItem: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  mailContent: { flex: 1 },
  mailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 3,
  },
  senderName: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
  },
  mailDate: { fontSize: 12 },
  mailSubject: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 3,
  },
  mailFooter: {
    flexDirection: "row",
    alignItems: "center",
  },
  mailPreview: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
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
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
});
