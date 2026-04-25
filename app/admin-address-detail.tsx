import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { MiniToast } from "@/components/mini-toast";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import {
  adminClearInbox,
  adminClearSentItems,
  adminDeleteMail,
  adminDeleteSentMail,
  adminSendMail,
  fetchAdminMails,
  fetchAdminSendbox,
  type ParsedMail,
  type RawMail,
} from "@/lib/api";
import { copyTextToClipboard } from "@/lib/clipboard";
import { setAdminMailEntry } from "@/lib/admin-mail-store";
import { mergeMailLists } from "@/lib/mail-list-utils";
import {
  formatMailDate,
  formatMailboxDisplay,
  getMailPreview,
  getMailRecipientsDisplay,
  getSenderDisplay,
  getVerificationCode,
  parseMail,
} from "@/lib/mail-parser";

type AddressDetailTab = "inbox" | "sent" | "send";

const PAGE_SIZE = 30;

export default function AdminAddressDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ addressId?: string; addressName?: string }>();
  const addressName = typeof params.addressName === "string" ? params.addressName : "";
  const addressId = typeof params.addressId === "string" ? params.addressId : "";
  const [tab, setTab] = useState<AddressDetailTab>("inbox");
  const [miniToastMessage, setMiniToastMessage] = useState<string | null>(null);

  if (!addressName) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]}>
        <View style={styles.emptyWrap}>
          <Text style={[styles.emptyText, { color: colors.muted }]}>地址未找到</Text>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={styles.primaryButtonText}>返回</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="arrow.left" size={22} color={colors.primary} />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>单地址管理</Text>
          <Text
            numberOfLines={1}
            style={[styles.headerSubtitle, { color: colors.muted }]}
          >
            {addressName}
          </Text>
        </View>
        <Pressable
          onPress={async () => {
            const ok = await copyTextToClipboard(addressName);
            if (ok) {
              setMiniToastMessage("地址已复制");
            } else {
              Alert.alert("复制失败", addressName);
            }
          }}
          style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="doc.on.doc" size={18} color={colors.primary} />
        </Pressable>
      </View>

      <View style={styles.summaryWrap}>
        <View
          style={[
            styles.summaryCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.summaryLabel, { color: colors.muted }]}>地址 ID</Text>
          <Text style={[styles.summaryValue, { color: colors.foreground }]}>
            #{addressId || "—"}
          </Text>
        </View>
        <View
          style={[
            styles.summaryCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.summaryLabel, { color: colors.muted }]}>当前地址</Text>
          <Text
            style={[styles.summaryValue, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {addressName}
          </Text>
        </View>
      </View>

      <View style={styles.segmentWrap}>
        <View
          style={[
            styles.segmentTrack,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          {(
            [
              ["inbox", "收件箱"],
              ["sent", "发件箱"],
              ["send", "发邮件"],
            ] as [AddressDetailTab, string][]
          ).map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              style={[
                styles.segmentItem,
                { backgroundColor: tab === key ? colors.primary : "transparent" },
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  { color: tab === key ? "#FFFFFF" : colors.foreground },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {tab === "inbox" ? (
          <AddressMailList
            address={addressName}
            colors={colors}
            kind="inbox"
            onMiniToast={(message) => setMiniToastMessage(message)}
            onClear={async () => {
              await adminClearInbox(addressName);
            }}
          />
        ) : tab === "sent" ? (
          <AddressMailList
            address={addressName}
            colors={colors}
            kind="sent"
            onMiniToast={(message) => setMiniToastMessage(message)}
            onClear={async () => {
              await adminClearSentItems(addressName);
            }}
          />
        ) : (
          <AddressSendPanel address={addressName} colors={colors} />
        )}
      </View>
      <MiniToast
        message={miniToastMessage}
        onDismiss={() => setMiniToastMessage(null)}
      />
    </ScreenContainer>
  );
}

function AddressMailList({
  address,
  colors,
  kind,
  onMiniToast,
  onClear,
}: {
  address: string;
  colors: ReturnType<typeof useColors>;
  kind: "inbox" | "sent";
  onMiniToast: (message: string) => void;
  onClear: () => Promise<void>;
}) {
  const router = useRouter();
  const [data, setData] = useState<ParsedMail[]>([]);
  const [count, setCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const dataRef = useRef<ParsedMail[]>([]);
  const offsetRef = useRef(0);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const load = useCallback(
    async (freshOffset: number = 0) => {
      setIsLoading(true);
      try {
        const page =
          kind === "inbox"
            ? await fetchAdminMails({ address, limit: PAGE_SIZE, offset: freshOffset })
            : await fetchAdminSendbox({
                address,
                limit: PAGE_SIZE,
                offset: freshOffset,
              });

        const parsed = await Promise.all(
          page.results.map(async (item: RawMail) => {
            try {
              const parsedMail = await parseMail(item);
              return {
                ...parsedMail,
                ownerAddress: item.address || address,
                mailboxKind: kind === "inbox" ? "inbox" : "sendbox",
              } as ParsedMail;
            } catch {
              return {
                id: item.id,
                subject: item.subject || "(解析失败)",
                raw: item.raw || item.source || "",
                createdAt: item.created_at,
                ownerAddress: item.address || address,
                mailboxKind: kind === "inbox" ? "inbox" : "sendbox",
              } as ParsedMail;
            }
          })
        );

        const nextData =
          freshOffset === 0 && dataRef.current.length > 0
            ? mergeMailLists(dataRef.current, parsed)
            : freshOffset === 0
              ? parsed
              : mergeMailLists(dataRef.current, parsed);

        setData(nextData);
        setCount(page.count);
        setOffset(
          freshOffset === 0
            ? Math.max(offsetRef.current, page.results.length)
            : freshOffset + page.results.length
        );
      } catch (err: any) {
        Alert.alert("加载失败", err.message || "");
      } finally {
        setIsLoading(false);
      }
    },
    [address, kind]
  );

  useEffect(() => {
    setData([]);
    setCount(0);
    setOffset(0);
    load(0);
  }, [address, kind, load]);

  const handleOpenMail = useCallback(
    (mail: ParsedMail) => {
      const entryKind = kind === "inbox" ? "inbox" : "sendbox";
      const cacheKey = `${entryKind}-${mail.id}-${address}`;
      setAdminMailEntry(cacheKey, { mail, kind: entryKind });
      router.push({
        pathname: "/admin-mail-detail",
        params: { cacheKey },
      });
    },
    [address, kind, router]
  );

  const handleDelete = useCallback(
    (mail: ParsedMail) => {
      Alert.alert("删除邮件", mail.subject || "(无主题)", [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: async () => {
            try {
              if (kind === "inbox") {
                await adminDeleteMail(mail.id);
              } else {
                await adminDeleteSentMail(mail.id);
              }
              setData((prev) => prev.filter((item) => item.id !== mail.id));
              setCount((prev) => Math.max(0, prev - 1));
            } catch (err: any) {
              Alert.alert("删除失败", err.message || "");
            }
          },
        },
      ]);
    },
    [kind]
  );

  const handleClear = useCallback(() => {
    Alert.alert(
      kind === "inbox" ? "清空收件箱" : "清空发件箱",
      `确定清空 ${address} 的${kind === "inbox" ? "收件箱" : "发件箱"}吗？`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "确定",
          style: "destructive",
          onPress: async () => {
            try {
              await onClear();
              setData([]);
              setCount(0);
              setOffset(0);
              Alert.alert("已清空");
            } catch (err: any) {
              Alert.alert("操作失败", err.message || "");
            }
          },
        },
      ]
    );
  }, [address, kind, onClear]);

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => `${kind}-${item.id}`}
      contentContainerStyle={data.length === 0 ? styles.listEmptyContent : undefined}
      refreshControl={
        <RefreshControl
          refreshing={isLoading && data.length > 0}
          onRefresh={() => load(0)}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      ListHeaderComponent={
        <View style={styles.listHeader}>
          <Text style={[styles.listHeaderText, { color: colors.muted }]}>
            共 {count} 封
          </Text>
          <Pressable
            onPress={handleClear}
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>
              {kind === "inbox" ? "清空收件箱" : "清空发件箱"}
            </Text>
          </Pressable>
        </View>
      }
      ListEmptyComponent={
        !isLoading ? (
          <View style={styles.emptyWrap}>
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              {kind === "inbox" ? "这个地址还没有收件" : "这个地址还没有发件"}
            </Text>
          </View>
        ) : null
      }
      ListFooterComponent={
        isLoading ? (
          <ActivityIndicator style={{ marginVertical: 20 }} color={colors.primary} />
        ) : null
      }
      onEndReached={() => {
        if (!isLoading && offset < count) {
          load(offset);
        }
      }}
      onEndReachedThreshold={0.5}
      renderItem={({ item }) => {
        const preview = getMailPreview(item, 100) || "(无内容)";
        const code = getVerificationCode(item);
        const primaryLine =
          kind === "inbox"
            ? getSenderDisplay(item)
            : formatMailboxDisplay(item.to?.[0]) ||
              getMailRecipientsDisplay(item) ||
              "收件人";

        return (
          <Pressable
            onPress={() => handleOpenMail(item)}
            onLongPress={() => handleDelete(item)}
            delayLongPress={350}
            style={({ pressed }) => [
              styles.mailCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.78 : 1,
              },
            ]}
          >
            <View style={styles.mailCardHeader}>
              <View style={styles.mailCardTitleWrap}>
                <Text
                  numberOfLines={1}
                  style={[styles.mailCardSubject, { color: colors.foreground }]}
                >
                  {item.subject || "(无主题)"}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[styles.mailCardPrimary, { color: colors.muted }]}
                >
                  {primaryLine}
                </Text>
              </View>
              <Text style={[styles.mailCardDate, { color: colors.muted }]}>
                {formatMailDate(item.date || item.createdAt)}
              </Text>
            </View>

            {code ? (
                <Pressable
                  onPress={async () => {
                    const ok = await copyTextToClipboard(code);
                    if (ok) {
                      onMiniToast("已复制");
                    } else {
                      Alert.alert("复制失败", code);
                    }
                  }}
                style={({ pressed }) => [
                  styles.codeChip,
                  {
                    backgroundColor: `${colors.primary}12`,
                    borderColor: `${colors.primary}28`,
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
              >
                <Text style={[styles.codeChipText, { color: colors.primary }]}>
                  验证码 {code}
                </Text>
              </Pressable>
            ) : null}

            <Text style={[styles.mailCardPreview, { color: colors.muted }]} numberOfLines={2}>
              {preview}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

function AddressSendPanel({
  address,
  colors,
}: {
  address: string;
  colors: ReturnType<typeof useColors>;
}) {
  const defaultLabel = useMemo(() => address.trim(), [address]);
  const [fromMail, setFromMail] = useState(address);
  const [fromName, setFromName] = useState(defaultLabel);
  const [toMail, setToMail] = useState("");
  const [toName, setToName] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [isHtml, setIsHtml] = useState(true);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    setFromMail(address);
    setFromName(defaultLabel);
    setToMail("");
    setToName("");
  }, [address, defaultLabel]);

  const handleSend = useCallback(async () => {
    if (!fromMail.trim() || !toMail.trim() || !subject.trim() || !content.trim()) {
      Alert.alert("请补全内容", "发件地址、收件地址、主题和正文都不能为空。");
      return;
    }

    setIsSending(true);
    try {
      await adminSendMail({
        from_mail: fromMail.trim(),
        from_name: fromName.trim(),
        to_mail: toMail.trim(),
        to_name: toName.trim(),
        subject: subject.trim(),
        is_html: isHtml,
        content,
      });
      Alert.alert("发送成功");
      setSubject("");
      setContent("");
    } catch (err: any) {
      Alert.alert("发送失败", err.message || "");
    } finally {
      setIsSending(false);
    }
  }, [content, fromMail, fromName, isHtml, subject, toMail, toName]);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.sendPanelContent}
      keyboardShouldPersistTaps="handled"
    >
      <View
        style={[
          styles.formCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.formTitle, { color: colors.foreground }]}>地址发信</Text>
        <Text style={[styles.formHint, { color: colors.muted }]}>
          已按当前地址预设发件身份，收件人保持空白，方便直接填写目标。
        </Text>

        <Field label="发件地址" value={fromMail} onChangeText={setFromMail} colors={colors} />
        <Field label="发件名称" value={fromName} onChangeText={setFromName} colors={colors} />
        <Field label="收件地址" value={toMail} onChangeText={setToMail} colors={colors} />
        <Field label="收件名称" value={toName} onChangeText={setToName} colors={colors} />
        <Field label="主题" value={subject} onChangeText={setSubject} colors={colors} />

        <View style={styles.switchRow}>
          <Text style={[styles.switchLabel, { color: colors.foreground }]}>HTML 正文</Text>
          <Switch
            value={isHtml}
            onValueChange={setIsHtml}
            trackColor={{ false: colors.border, true: `${colors.primary}66` }}
            thumbColor={isHtml ? colors.primary : "#FFFFFF"}
          />
        </View>

        <Text style={[styles.fieldLabel, { color: colors.muted }]}>正文</Text>
        <TextInput
          style={[
            styles.textarea,
            {
              color: colors.foreground,
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
          ]}
          value={content}
          onChangeText={setContent}
          placeholder={isHtml ? "<p>输入 HTML 正文</p>" : "输入纯文本正文"}
          placeholderTextColor={colors.muted}
          multiline
          textAlignVertical="top"
        />

        <Pressable
          onPress={handleSend}
          disabled={isSending}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: colors.primary,
              opacity: pressed || isSending ? 0.8 : 1,
            },
          ]}
        >
          {isSending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>立即发送</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Field({
  colors,
  label,
  onChangeText,
  value,
}: {
  colors: ReturnType<typeof useColors>;
  label: string;
  onChangeText: (value: string) => void;
  value: string;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text>
      <TextInput
        style={[
          styles.fieldInput,
          {
            color: colors.foreground,
            backgroundColor: colors.background,
            borderColor: colors.border,
          },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  headerTextWrap: {
    flex: 1,
    marginHorizontal: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  iconButton: {
    padding: 8,
  },
  summaryWrap: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  summaryLabel: {
    fontSize: 12,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 6,
  },
  segmentWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  segmentTrack: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
  },
  segmentItem: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "700",
  },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  listHeaderText: {
    fontSize: 12,
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    fontSize: 12,
    fontWeight: "600",
  },
  mailCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  mailCardHeader: {
    flexDirection: "row",
    gap: 10,
  },
  mailCardTitleWrap: {
    flex: 1,
  },
  mailCardSubject: {
    fontSize: 15,
    fontWeight: "700",
  },
  mailCardPrimary: {
    fontSize: 12,
    marginTop: 4,
  },
  mailCardDate: {
    fontSize: 11,
  },
  codeChip: {
    alignSelf: "flex-start",
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  codeChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  mailCardPreview: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  listEmptyContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 15,
    marginBottom: 14,
    textAlign: "center",
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  sendPanelContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  formCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  formHint: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 14,
  },
  fieldWrap: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  fieldInput: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  textarea: {
    minHeight: 180,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    marginBottom: 16,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
});
