import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { ThemeColorPalette } from "@/constants/theme";
import {
  ADDRESS_GROUP_COLOR_OPTIONS,
  type AddressGroup,
  type AddressGroupColor,
} from "@/lib/address-groups";

type GroupTone = {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
};

export function resolveAddressGroupTone(
  color: AddressGroupColor,
  colors: ThemeColorPalette
): GroupTone {
  switch (color) {
    case "teal":
      return {
        backgroundColor: `${colors.success}14`,
        borderColor: `${colors.success}30`,
        textColor: colors.success,
      };
    case "violet":
      return {
        backgroundColor: "rgba(139, 92, 246, 0.12)",
        borderColor: "rgba(139, 92, 246, 0.28)",
        textColor: "#8B5CF6",
      };
    case "orange":
      return {
        backgroundColor: `${colors.warning}14`,
        borderColor: `${colors.warning}30`,
        textColor: colors.warning,
      };
    case "green":
      return {
        backgroundColor: "rgba(34, 197, 94, 0.12)",
        borderColor: "rgba(34, 197, 94, 0.28)",
        textColor: "#16A34A",
      };
    case "gray":
      return {
        backgroundColor: `${colors.muted}14`,
        borderColor: `${colors.muted}2E`,
        textColor: colors.muted,
      };
    case "blue":
    default:
      return {
        backgroundColor: `${colors.primary}14`,
        borderColor: `${colors.primary}30`,
        textColor: colors.primary,
      };
  }
}

export function AddressGroupChip({
  group,
  colors,
  compact,
  suffix,
}: {
  group: AddressGroup;
  colors: ThemeColorPalette;
  compact?: boolean;
  suffix?: string;
}) {
  const tone = resolveAddressGroupTone(group.color, colors);
  return (
    <View
      style={[
        styles.groupChip,
        compact && styles.groupChipCompact,
        {
          backgroundColor: tone.backgroundColor,
          borderColor: tone.borderColor,
        },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.groupChipText,
          compact && styles.groupChipTextCompact,
          { color: tone.textColor },
        ]}
      >
        {group.name}
        {suffix || ""}
      </Text>
    </View>
  );
}

export function AddressGroupSummaryChip({
  label,
  colors,
}: {
  label: string;
  colors: ThemeColorPalette;
}) {
  return (
    <View
      style={[
        styles.groupChip,
        styles.groupChipCompact,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <Text style={[styles.groupChipText, styles.groupChipTextCompact, { color: colors.muted }]}>
        {label}
      </Text>
    </View>
  );
}

export function AddressGroupFilterSheet({
  visible,
  colors,
  groups,
  selectedFilter,
  onClose,
  onSelect,
}: {
  visible: boolean;
  colors: ThemeColorPalette;
  groups: AddressGroup[];
  selectedFilter: "all" | "ungrouped" | string;
  onClose: () => void;
  onSelect: (filter: "all" | "ungrouped" | string) => void;
}) {
  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    [groups]
  );

  const renderOption = (
    filter: "all" | "ungrouped" | string,
    title: string,
    meta: string,
    tone?: GroupTone
  ) => {
    const selected = selectedFilter === filter;
    return (
      <Pressable
        key={filter}
        onPress={() => {
          onSelect(filter);
          onClose();
        }}
        style={({ pressed }) => [
          styles.filterOption,
          {
            borderColor: selected ? tone?.textColor || colors.primary : colors.border,
            backgroundColor: selected ? tone?.backgroundColor || `${colors.primary}12` : colors.surface,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <View style={styles.filterOptionMain}>
          {tone ? <View style={[styles.groupDot, { backgroundColor: tone.textColor }]} /> : null}
          <View style={styles.filterOptionCopy}>
            <Text style={[styles.filterOptionTitle, { color: colors.foreground }]}>{title}</Text>
            <Text style={[styles.filterOptionMeta, { color: colors.muted }]}>{meta}</Text>
          </View>
        </View>
        <Text
          style={[
            styles.filterOptionValue,
            { color: selected ? tone?.textColor || colors.primary : colors.muted },
          ]}
        >
          {selected ? "已选" : "选择"}
        </Text>
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderCopy}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>筛选分组</Text>
              <Text style={[styles.sheetSubtitle, { color: colors.muted }]}>
                只显示属于指定邮箱分组的邮件。
              </Text>
            </View>
            <Pressable onPress={onClose}>
              <Text style={[styles.sheetClose, { color: colors.muted }]}>关闭</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>选择显示范围</Text>
              {renderOption("all", "全部", "显示所有邮箱的邮件")}
              {renderOption(
                "ungrouped",
                "未分组",
                "只显示尚未加入任何分组的邮箱邮件",
                resolveAddressGroupTone("gray", colors)
              )}
              {sortedGroups.length > 0 ? (
                sortedGroups.map((group) =>
                  renderOption(
                    group.id,
                    group.name,
                    "只显示该分组下邮箱的邮件",
                    resolveAddressGroupTone(group.color, colors)
                  )
                )
              ) : (
                <Text style={[styles.emptyHint, { color: colors.muted }]}>
                  还没有分组，可先去地址页创建分组。
                </Text>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function AddressGroupInlineFilterMenu({
  colors,
  groups,
  selectedFilter,
  onSelect,
}: {
  colors: ThemeColorPalette;
  groups: AddressGroup[];
  selectedFilter: "all" | "ungrouped" | string;
  onSelect: (filter: "all" | "ungrouped" | string) => void;
}) {
  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    [groups]
  );

  const renderOption = (
    filter: "all" | "ungrouped" | string,
    title: string,
    tone?: GroupTone
  ) => {
    const selected = selectedFilter === filter;
    return (
      <Pressable
        key={filter}
        onPress={() => onSelect(filter)}
        style={({ pressed }) => [
          styles.inlineFilterOption,
          {
            borderColor: selected ? tone?.textColor || colors.primary : colors.border,
            backgroundColor: selected ? tone?.backgroundColor || `${colors.primary}12` : colors.background,
            opacity: pressed ? 0.82 : 1,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.inlineFilterOptionText,
            {
              color: selected ? tone?.textColor || colors.primary : colors.foreground,
            },
          ]}
        >
          {title}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.inlineFilterMenu,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <ScrollView
        nestedScrollEnabled
        style={styles.inlineFilterScroll}
        contentContainerStyle={styles.inlineFilterScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {renderOption("all", "全部")}
        {renderOption("ungrouped", "未分组", resolveAddressGroupTone("gray", colors))}
        {sortedGroups.map((group) =>
          renderOption(group.id, group.name, resolveAddressGroupTone(group.color, colors))
        )}
        {sortedGroups.length === 0 ? (
          <Text style={[styles.inlineFilterEmptyText, { color: colors.muted }]}>
            暂无分组
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

export function AddressGroupManagerSheet({
  visible,
  colors,
  groups,
  groupCounts,
  onClose,
  onCreate,
  onDelete,
}: {
  visible: boolean;
  colors: ThemeColorPalette;
  groups: AddressGroup[];
  groupCounts: Record<string, number>;
  onClose: () => void;
  onCreate: (params: { name: string; color: AddressGroupColor }) => Promise<void>;
  onDelete: (group: AddressGroup) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<AddressGroupColor>("blue");
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setIsCreating(true);
    try {
      await onCreate({ name: name.trim(), color });
      setName("");
      setColor("blue");
    } finally {
      setIsCreating(false);
    }
  };

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    [groups]
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderCopy}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>邮箱分组</Text>
              <Text style={[styles.sheetSubtitle, { color: colors.muted }]}>
                创建分组并维护邮箱分类，筛选时会更清晰。
              </Text>
            </View>
            <Pressable onPress={onClose}>
              <Text style={[styles.sheetClose, { color: colors.muted }]}>关闭</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>新建分组</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="例如：验证码、重点用户"
                placeholderTextColor={colors.muted}
                style={[
                  styles.input,
                  {
                    color: colors.foreground,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              />
              <View style={styles.colorRow}>
                {ADDRESS_GROUP_COLOR_OPTIONS.map((item) => {
                  const active = item === color;
                  const tone = resolveAddressGroupTone(item, colors);
                  return (
                    <Pressable
                      key={item}
                      onPress={() => setColor(item)}
                      style={[
                        styles.colorDot,
                        {
                          backgroundColor: tone.backgroundColor,
                          borderColor: active ? tone.textColor : tone.borderColor,
                        },
                      ]}
                    />
                  );
                })}
              </View>
              <Pressable
                onPress={handleCreate}
                disabled={isCreating || !name.trim()}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: isCreating || !name.trim() ? colors.muted : colors.primary,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                {isCreating ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>创建分组</Text>
                )}
              </Pressable>
            </View>

            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>现有分组</Text>
              {sortedGroups.length === 0 ? (
                <Text style={[styles.emptyHint, { color: colors.muted }]}>
                  还没有分组，先创建一个吧。
                </Text>
              ) : (
                sortedGroups.map((group) => {
                  const tone = resolveAddressGroupTone(group.color, colors);
                  const isDeleting = deletingId === group.id;
                  return (
                    <View
                      key={group.id}
                      style={[styles.groupRow, { borderBottomColor: colors.border }]}
                    >
                      <View style={styles.groupRowMain}>
                        <View
                          style={[
                            styles.groupDot,
                            { backgroundColor: tone.textColor },
                          ]}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.groupRowTitle, { color: colors.foreground }]}>
                            {group.name}
                          </Text>
                          <Text style={[styles.groupRowMeta, { color: colors.muted }]}>
                            {groupCounts[group.id] ?? 0} 个邮箱
                          </Text>
                        </View>
                      </View>
                      <Pressable
                        onPress={async () => {
                          setDeletingId(group.id);
                          try {
                            await onDelete(group);
                          } finally {
                            setDeletingId(null);
                          }
                        }}
                        style={({ pressed }) => [
                          styles.ghostButton,
                          {
                            borderColor: colors.border,
                            opacity: pressed ? 0.75 : 1,
                          },
                        ]}
                      >
                        <Text style={[styles.ghostButtonText, { color: isDeleting ? colors.muted : colors.error }]}>
                          {isDeleting ? "删除中" : "删除"}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function AddressGroupAssignmentSheet({
  visible,
  colors,
  address,
  groups,
  selectedGroupIds,
  onClose,
  onToggle,
  onCreateGroup,
}: {
  visible: boolean;
  colors: ThemeColorPalette;
  address: string;
  groups: AddressGroup[];
  selectedGroupIds: string[];
  onClose: () => void;
  onToggle: (group: AddressGroup, nextSelected: boolean) => Promise<void>;
  onCreateGroup: (params: { name: string; color: AddressGroupColor }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<AddressGroupColor>("blue");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderCopy}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>分组管理</Text>
              <Text numberOfLines={1} style={[styles.sheetSubtitle, { color: colors.muted }]}>
                {address}
              </Text>
            </View>
            <Pressable onPress={onClose}>
              <Text style={[styles.sheetClose, { color: colors.muted }]}>完成</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>选择分组</Text>
              {groups.length === 0 ? (
                <Text style={[styles.emptyHint, { color: colors.muted }]}>
                  还没有分组，先在下面创建一个。
                </Text>
              ) : (
                groups.map((group) => {
                  const selected = selectedGroupIds.includes(group.id);
                  const tone = resolveAddressGroupTone(group.color, colors);
                  const loading = busyKey === group.id;
                  return (
                    <Pressable
                      key={group.id}
                      onPress={async () => {
                        setBusyKey(group.id);
                        try {
                          await onToggle(group, !selected);
                        } finally {
                          setBusyKey(null);
                        }
                      }}
                      style={({ pressed }) => [
                        styles.assignmentRow,
                        {
                          borderColor: selected ? tone.textColor : colors.border,
                          backgroundColor: selected ? tone.backgroundColor : colors.background,
                          opacity: pressed ? 0.82 : 1,
                        },
                      ]}
                    >
                      <View style={styles.groupRowMain}>
                        <View style={[styles.groupDot, { backgroundColor: tone.textColor }]} />
                        <Text style={[styles.groupRowTitle, { color: colors.foreground }]}>
                          {group.name}
                        </Text>
                      </View>
                      <Text style={[styles.assignmentText, { color: loading ? colors.muted : tone.textColor }]}>
                        {loading ? "处理中" : selected ? "已加入" : "加入"}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </View>

            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>新建并加入</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="输入新分组名称"
                placeholderTextColor={colors.muted}
                style={[
                  styles.input,
                  {
                    color: colors.foreground,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              />
              <View style={styles.colorRow}>
                {ADDRESS_GROUP_COLOR_OPTIONS.map((item) => {
                  const active = item === color;
                  const tone = resolveAddressGroupTone(item, colors);
                  return (
                    <Pressable
                      key={item}
                      onPress={() => setColor(item)}
                      style={[
                        styles.colorDot,
                        {
                          backgroundColor: tone.backgroundColor,
                          borderColor: active ? tone.textColor : tone.borderColor,
                        },
                      ]}
                    />
                  );
                })}
              </View>
              <Pressable
                onPress={async () => {
                  if (!name.trim()) return;
                  setBusyKey("__create__");
                  try {
                    await onCreateGroup({ name: name.trim(), color });
                    setName("");
                    setColor("blue");
                  } finally {
                    setBusyKey(null);
                  }
                }}
                disabled={busyKey === "__create__" || !name.trim()}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor:
                      busyKey === "__create__" || !name.trim() ? colors.muted : colors.primary,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                {busyKey === "__create__" ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>创建并加入</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.42)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: "84%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    gap: 12,
  },
  sheetHeaderCopy: {
    flex: 1,
  },
  sheetTitle: {
    fontSize: 19,
    fontWeight: "700",
  },
  sheetSubtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  sheetClose: {
    fontSize: 14,
    fontWeight: "600",
  },
  sheetBody: {
    paddingHorizontal: 18,
    paddingBottom: 28,
    gap: 12,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  colorRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  colorDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
  },
  primaryButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  emptyHint: {
    fontSize: 13,
    lineHeight: 19,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  groupRowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  groupDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  groupRowTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  groupRowMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  ghostButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  ghostButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  assignmentRow: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  assignmentText: {
    fontSize: 12,
    fontWeight: "700",
  },
  filterOption: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  filterOptionMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  filterOptionCopy: {
    flex: 1,
    minWidth: 0,
  },
  filterOptionTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  filterOptionMeta: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },
  filterOptionValue: {
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 0,
  },
  inlineFilterMenu: {
    borderWidth: 1,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  inlineFilterScroll: {
    maxHeight: 220,
  },
  inlineFilterScrollContent: {
    padding: 10,
    gap: 8,
  },
  inlineFilterOption: {
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineFilterOptionMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inlineFilterOptionText: {
    fontSize: 12.5,
    fontWeight: "700",
    textAlign: "center",
  },
  inlineFilterOptionValue: {
    fontSize: 11,
    fontWeight: "700",
    flexShrink: 0,
  },
  inlineFilterEmptyText: {
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 2,
    paddingBottom: 4,
    textAlign: "center",
  },
  groupChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  groupChipCompact: {
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  groupChipText: {
    fontSize: 11.5,
    fontWeight: "700",
    textAlign: "center",
  },
  groupChipTextCompact: {
    fontSize: 11,
  },
});
