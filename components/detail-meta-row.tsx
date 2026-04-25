import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { copyTextToClipboard } from "@/lib/clipboard";

interface DetailMetaRowProps {
  label: string;
  value: string;
  copyValue?: string | null;
  multiline?: boolean;
  compact?: boolean;
}

export function DetailMetaRow({
  label,
  value,
  copyValue,
  multiline = false,
  compact = false,
}: DetailMetaRowProps) {
  const colors = useColors();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmedValue = value.trim();
  const trimmedCopyValue = copyValue?.trim() || "";
  const isCopyable = !!trimmedCopyValue;

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    if (!trimmedCopyValue) return;

    const ok = await copyTextToClipboard(trimmedCopyValue);
    if (!ok) return;

    setCopied(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setCopied(false);
    }, 1400);
  }, [trimmedCopyValue]);

  if (!trimmedValue) return null;

  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <View style={styles.valueWrap}>
        {isCopyable ? (
          <Pressable
            onPress={handleCopy}
            hitSlop={6}
            style={({ pressed }) => [
              styles.copyTarget,
              { opacity: pressed ? 0.72 : 1 },
            ]}
          >
            <Text
              style={[
                styles.value,
                multiline && styles.valueMultiline,
                {
                  color: colors.foreground,
                  textDecorationLine: "underline",
                  textDecorationColor: `${colors.primary}88`,
                },
              ]}
              numberOfLines={multiline ? undefined : 1}
            >
              {trimmedValue}
            </Text>
          </Pressable>
        ) : (
          <Text
            style={[
              styles.value,
              multiline && styles.valueMultiline,
              { color: colors.foreground },
            ]}
            numberOfLines={multiline ? undefined : 1}
          >
            {trimmedValue}
          </Text>
        )}

        {copied ? (
          <View
            style={[
              styles.inlineToast,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.inlineToastText, { color: colors.foreground }]}>
              已复制
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 8,
  },
  rowCompact: {
    marginTop: 6,
  },
  label: {
    width: 44,
    fontSize: 12,
    lineHeight: 18,
  },
  valueWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    minWidth: 0,
  },
  copyTarget: {
    maxWidth: "100%",
  },
  value: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  valueMultiline: {
    lineHeight: 20,
  },
  inlineToast: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  inlineToastText: {
    fontSize: 10,
    fontWeight: "600",
    lineHeight: 14,
  },
});
