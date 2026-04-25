import React, { useMemo, useState } from "react";
import {
  Text,
  View,
  ScrollView,
  StyleSheet,
  Alert,
  Pressable,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { DetailMetaRow } from "@/components/detail-meta-row";
import { MailBodyView } from "@/components/mail-body-view";
import { MiniToast } from "@/components/mini-toast";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { downloadMailBody, openMailFile, shareMailBody } from "@/lib/mail-download";
import { useMail } from "@/lib/mail-context";
import {
  formatMailDate,
  formatMailboxDisplay,
  getMailRecipientsDisplay,
  getSenderDisplay,
} from "@/lib/mail-parser";

export default function MailDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const [miniToastMessage, setMiniToastMessage] = useState<string | null>(null);
  const { mailId, source } = useLocalSearchParams<{
    mailId: string;
    source?: string;
  }>();
  const { state, deleteMailById, deleteSentMailById, activeAccount } = useMail();

  const isSent = source === "sent";

  const mail = useMemo(() => {
    const list = isSent ? state.sentMails : state.mails;
    return list.find((m) => m.id.toString() === mailId);
  }, [state.mails, state.sentMails, mailId, isSent]);

  if (!mail) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]}>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            邮件未找到
          </Text>
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

  const sender = getSenderDisplay(mail);
  const date = formatMailDate(mail.date || mail.createdAt);
  const recipients = getMailRecipientsDisplay(mail, {
    preferOwnerAddress: !isSent,
  });
  const primaryParty = isSent
    ? formatMailboxDisplay(mail.to?.[0]) || recipients || "收件人"
    : sender;
  const secondaryLine = isSent
    ? formatMailboxDisplay(mail.from) || mail.ownerAddress || activeAccount?.address || ""
    : formatMailboxDisplay(mail.from, { addressFirst: true });
  const senderAddress = mail.from?.address?.trim() || "";
  const recipientAddresses = (mail.to || [])
    .map((item) => item.address?.trim())
    .filter(Boolean) as string[];
  const recipientLine =
    recipientAddresses.join(", ") || recipients || mail.ownerAddress || "";
  const recipientCopyValue =
    recipientAddresses.join(", ") || mail.ownerAddress || "";

  const handleDelete = () => {
    Alert.alert("删除邮件", "确定要删除这封邮件吗？", [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          const ok = isSent
            ? await deleteSentMailById(mail.id)
            : await deleteMailById(mail.id);

          if (ok) {
            router.back();
          } else {
            Alert.alert("删除失败", "邮件未删除，请稍后重试。");
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

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backButton,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <IconSymbol name="arrow.left" size={22} color={colors.primary} />
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable
            onPress={handleShare}
            style={({ pressed }) => [
              styles.actionButton,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <IconSymbol
              name="square.and.arrow.up"
              size={20}
              color={colors.primary}
            />
          </Pressable>
          <Pressable
            onPress={handleDownload}
            style={({ pressed }) => [
              styles.actionButton,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <IconSymbol
              name="arrow.down.circle"
              size={21}
              color={colors.primary}
            />
          </Pressable>
          <Pressable
            onPress={handleDelete}
            style={({ pressed }) => [
              styles.actionButton,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <IconSymbol name="trash.fill" size={20} color={colors.error} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Subject */}
        <Text style={[styles.subject, { color: colors.foreground }]}>
          {mail.subject || "(无主题)"}
        </Text>

        {/* Sender Info */}
        <View style={[styles.senderRow, { borderBottomColor: colors.border }]}>
          <View style={[styles.senderAvatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.senderAvatarText}>
              {(primaryParty || "M").charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.senderInfo}>
            <Text style={[styles.senderName, { color: colors.foreground }]}>
              {primaryParty}
            </Text>
            <DetailMetaRow
              label="发件人"
              value={senderAddress || secondaryLine || "—"}
              copyValue={senderAddress || undefined}
              compact
            />
            <DetailMetaRow
              label={isSent ? "送达至" : "收件人"}
              value={recipientLine || "—"}
              copyValue={recipientCopyValue || undefined}
              compact
              multiline
            />
            <DetailMetaRow label="时间" value={date} compact />
          </View>
        </View>

        {/* Attachments */}
        {mail.attachments && mail.attachments.length > 0 && (
          <View style={[styles.attachmentSection, { borderBottomColor: colors.border }]}>
            <Text style={[styles.attachmentTitle, { color: colors.foreground }]}>
              附件 ({mail.attachments.length})
            </Text>
            {mail.attachments.map((att, idx) => (
              <View
                key={idx}
                style={[styles.attachmentItem, { backgroundColor: colors.surface }]}
              >
                <IconSymbol name="paperclip" size={16} color={colors.muted} />
                <Text
                  style={[styles.attachmentName, { color: colors.foreground }]}
                  numberOfLines={1}
                >
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
        )}

        {/* Content */}
        <View style={styles.contentSection}>
          <MailBodyView mail={mail} />
        </View>
      </ScrollView>
      <MiniToast
        message={miniToastMessage}
        onDismiss={() => setMiniToastMessage(null)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  backButton: {
    padding: 8,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  subject: {
    fontSize: 22,
    fontWeight: "700",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    letterSpacing: -0.3,
    lineHeight: 30,
  },
  senderRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 0.5,
    alignItems: "flex-start",
  },
  senderAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  senderAvatarText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  senderInfo: {
    flex: 1,
  },
  senderName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  attachmentSection: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  attachmentTitle: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  attachmentItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 6,
    gap: 8,
  },
  attachmentName: {
    fontSize: 13,
    flex: 1,
  },
  attachmentSize: {
    fontSize: 12,
  },
  contentSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  contentText: {
    fontSize: 15,
    lineHeight: 24,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 16,
    marginBottom: 16,
  },
  backButtonAlt: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonAltText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});
