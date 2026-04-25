import React, { useMemo, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { DetailMetaRow } from "@/components/detail-meta-row";
import { MailBodyView } from "@/components/mail-body-view";
import { MiniToast } from "@/components/mini-toast";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { adminDeleteMail, adminDeleteSentMail } from "@/lib/api";
import { getAdminMailEntry, removeAdminMailEntry } from "@/lib/admin-mail-store";
import { copyTextToClipboard } from "@/lib/clipboard";
import { downloadMailBody, openMailFile, shareMailBody } from "@/lib/mail-download";
import { useColors } from "@/hooks/use-colors";
import {
  formatMailboxDisplay,
  getMailRecipientsDisplay,
  getSenderDisplay,
  getVerificationCode,
} from "@/lib/mail-parser";

function getKindLabel(kind?: "inbox" | "sendbox" | "unknown") {
  if (kind === "sendbox") return "管理员发件";
  if (kind === "unknown") return "未创建地址收件";
  return "管理员收件";
}

function formatShanghaiDateTime(dateStr?: string) {
  if (!dateStr) return "—";

  try {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) {
      return dateStr;
    }

    const parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(date);

    const get = (type: string) => parts.find((item) => item.type === type)?.value || "00";
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")} 上海时间`;
  } catch {
    return dateStr;
  }
}

export default function AdminMailDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const [miniToastMessage, setMiniToastMessage] = useState<string | null>(null);
  const { cacheKey } = useLocalSearchParams<{ cacheKey?: string }>();

  const entry = useMemo(
    () => (cacheKey ? getAdminMailEntry(cacheKey) : undefined),
    [cacheKey]
  );

  const mail = entry?.mail;
  const kind = entry?.kind;
  const code = mail ? getVerificationCode(mail) : null;
  const isSentView = kind === "sendbox";
  const kindLabel = getKindLabel(kind);
  const sender = mail ? getSenderDisplay(mail) : "";
  const recipients = mail
    ? getMailRecipientsDisplay(mail, { preferOwnerAddress: !isSentView })
    : "";
  const fromDisplay = isSentView
    ? formatMailboxDisplay(mail?.from, { addressFirst: true }) || mail?.ownerAddress || "—"
    : formatMailboxDisplay(mail?.from, { addressFirst: true }) || sender || "—";
  const toDisplay = isSentView
    ? recipients || mail?.ownerAddress || "—"
    : mail?.ownerAddress || recipients || "—";
  const fromCopyValue = mail?.from?.address?.trim() || "";
  const toAddressValues = (mail?.to || [])
    .map((item) => item.address?.trim())
    .filter(Boolean) as string[];
  const toCopyValue = toAddressValues.join(", ") || mail?.ownerAddress?.trim() || "";
  const shanghaiTime = formatShanghaiDateTime(mail?.date || mail?.createdAt);

  if (!mail || !cacheKey) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]}>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.muted }]}>邮件未找到</Text>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButtonAlt,
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={styles.backButtonAltText}>返回</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  const handleDelete = () => {
    Alert.alert("删除邮件", "确定删除这封管理员邮件吗？", [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          try {
            if (kind === "sendbox") {
              await adminDeleteSentMail(mail.id);
            } else {
              await adminDeleteMail(mail.id);
            }
            removeAdminMailEntry(cacheKey);
            router.back();
          } catch (err: any) {
            Alert.alert("删除失败", err?.message || "邮件未删除，请稍后重试。");
          }
        },
      },
    ]);
  };

  const handleDownload = async () => {
    try {
      const result = await downloadMailBody(mail);
      if (Platform.OS === "android") {
        try {
          await openMailFile(result);
          setMiniToastMessage(`已保存并打开 ${result.filename}`);
          return;
        } catch {
          setMiniToastMessage(`已保存 ${result.filename}`);
          return;
        }
      }

      setMiniToastMessage(Platform.OS === "web" ? `已下载 ${result.filename}` : `已保存 ${result.filename}`);
    } catch (err: any) {
      Alert.alert("下载失败", err?.message || "邮件下载失败，请稍后重试。");
    }
  };

  const handleShare = async () => {
    try {
      const result = await shareMailBody(mail);
      setMiniToastMessage(`已打开分享面板 · ${result.filename}`);
    } catch (err: any) {
      Alert.alert("分享失败", err?.message || "无法打开系统分享面板。");
    }
  };

  const handleCopyCode = async () => {
    if (!code) return;
    const ok = await copyTextToClipboard(code);
    if (ok) {
      setMiniToastMessage("已复制");
    } else {
      Alert.alert("复制失败", code);
    }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="arrow.left" size={22} color={colors.primary} />
        </Pressable>
        <View style={styles.headerMeta}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>邮件详情</Text>
          <Text style={[styles.headerSubtitle, { color: colors.muted }]} numberOfLines={1}>
            {kindLabel}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={handleShare}
            style={({ pressed }) => [styles.actionButton, { opacity: pressed ? 0.6 : 1 }]}
          >
            <IconSymbol name="square.and.arrow.up" size={20} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={handleDownload}
            style={({ pressed }) => [styles.actionButton, { opacity: pressed ? 0.6 : 1 }]}
          >
            <IconSymbol name="arrow.down.circle" size={21} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={handleDelete}
            style={({ pressed }) => [styles.actionButton, { opacity: pressed ? 0.6 : 1 }]}
          >
            <IconSymbol name="trash.fill" size={20} color={colors.error} />
          </Pressable>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroSection}>
          <Text style={[styles.subject, { color: colors.foreground }]}>
            {mail.subject || "(无主题)"}
          </Text>

          <View
            style={[
              styles.summaryCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <SummaryRow
              label="发件人"
              value={fromCopyValue || fromDisplay}
              copyValue={fromCopyValue || undefined}
            />
            <SummaryRow
              label="收件人"
              value={toCopyValue || toDisplay}
              copyValue={toCopyValue || undefined}
              multiline
            />
            <SummaryRow label="时间" value={shanghaiTime} />
          </View>
        </View>

        <View style={styles.bodySection}>
          <MailBodyView mail={mail} />
        </View>

        {code ? (
          <Pressable
            onPress={handleCopyCode}
            style={({ pressed }) => [
              styles.codeCard,
              {
                backgroundColor: `${colors.primary}10`,
                borderColor: `${colors.primary}26`,
                opacity: pressed ? 0.82 : 1,
              },
            ]}
          >
            <View style={styles.codeCardTextWrap}>
              <Text style={[styles.codeLabel, { color: colors.primary }]}>验证码</Text>
              <Text style={[styles.codeValue, { color: colors.foreground }]}>{code}</Text>
            </View>
            <View style={[styles.codeCopyBtn, { backgroundColor: colors.primary }]}>
              <IconSymbol name="doc.on.doc" size={14} color="#FFFFFF" />
            </View>
          </Pressable>
        ) : null}

        {mail.attachments && mail.attachments.length > 0 ? (
          <View style={styles.attachmentSection}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>附件</Text>
            {mail.attachments.map((att, idx) => (
              <View
                key={`${mail.id}-${idx}`}
                style={[
                  styles.attachmentItem,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <IconSymbol name="paperclip" size={16} color={colors.muted} />
                <Text style={[styles.attachmentName, { color: colors.foreground }]} numberOfLines={1}>
                  {att.filename || `附件 ${idx + 1}`}
                </Text>
                {att.size ? (
                  <Text style={[styles.attachmentSize, { color: colors.muted }]}>
                    {(att.size / 1024).toFixed(1)} KB
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {(mail.messageId || mail.ownerAddress || kindLabel) ? (
          <View
            style={[
              styles.moreCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.moreTitle, { color: colors.foreground }]}>更多信息</Text>
            {mail.ownerAddress ? (
              <SummaryRow
                label={isSentView ? "发件地址" : "系统地址"}
                value={mail.ownerAddress}
                copyValue={mail.ownerAddress}
              />
            ) : null}
            {mail.messageId ? (
              <SummaryRow label="Message-ID" value={mail.messageId} multiline />
            ) : null}
            <SummaryRow label="邮件类型" value={kindLabel} />
          </View>
        ) : null}
      </ScrollView>
      <MiniToast
        message={miniToastMessage}
        onDismiss={() => setMiniToastMessage(null)}
      />
    </ScreenContainer>
  );
}

function SummaryRow({
  label,
  value,
  multiline = false,
  copyValue,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  copyValue?: string;
}) {
  return (
    <DetailMetaRow
      label={label}
      value={value}
      copyValue={copyValue}
      multiline={multiline}
      compact
    />
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
  },
  backButton: {
    padding: 8,
  },
  headerMeta: {
    flex: 1,
    marginHorizontal: 6,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  actionButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 28,
  },
  heroSection: {
    paddingHorizontal: 14,
    paddingTop: 14,
    gap: 10,
  },
  subject: {
    fontSize: 21,
    fontWeight: "700",
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  summaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 2,
  },
  bodySection: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  codeCard: {
    marginHorizontal: 14,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  codeCardTextWrap: {
    flex: 1,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 4,
  },
  codeValue: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  codeCopyBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentSection: {
    paddingHorizontal: 14,
    paddingTop: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  attachmentItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  attachmentName: {
    flex: 1,
    fontSize: 13,
  },
  attachmentSize: {
    fontSize: 11,
  },
  moreCard: {
    marginHorizontal: 14,
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  moreTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 15,
    marginBottom: 14,
  },
  backButtonAlt: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
  },
  backButtonAltText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
