import type { ComponentProps } from "react";
import React, { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { IconSymbol } from "@/components/ui/icon-symbol";
import type { ThemeColorPalette } from "@/constants/theme";

type MenuIconName = ComponentProps<typeof IconSymbol>["name"];

export type FloatingActionMenuItem = {
  key: string;
  label: string;
  subtitle?: string;
  icon?: MenuIconName;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export type FloatingActionMenuAnchor = {
  x: number;
  y: number;
};

const MENU_WIDTH = 188;
const MENU_MARGIN = 12;
const MENU_ROW_HEIGHT = 42;
const MENU_VERTICAL_PADDING = 6;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

export function FloatingActionMenu({
  visible,
  anchor,
  colors,
  items,
  onClose,
}: {
  visible: boolean;
  anchor: FloatingActionMenuAnchor | null;
  colors: ThemeColorPalette;
  items: FloatingActionMenuItem[];
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const pressedScale = useSharedValue(1);

  const frame = useMemo(() => {
    if (!anchor) {
      return { top: MENU_MARGIN, left: MENU_MARGIN };
    }

    const menuHeight =
      MENU_VERTICAL_PADDING * 2 + Math.max(1, items.length) * MENU_ROW_HEIGHT;
    const left = clamp(
      anchor.x - MENU_WIDTH / 2,
      MENU_MARGIN,
      Math.max(MENU_MARGIN, width - MENU_WIDTH - MENU_MARGIN)
    );
    const preferTop = anchor.y + 10;
    const top =
      preferTop + menuHeight > height - MENU_MARGIN
        ? clamp(anchor.y - menuHeight - 10, MENU_MARGIN, height - menuHeight - MENU_MARGIN)
        : clamp(preferTop, MENU_MARGIN, height - menuHeight - MENU_MARGIN);

    return { top, left };
  }, [anchor, height, items.length, width]);

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressedScale.value }],
  }));

  if (!visible || !anchor || items.length === 0) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View
        entering={FadeIn.duration(74)}
        exiting={FadeOut.duration(56)}
        style={[
          styles.card,
          cardAnimatedStyle,
          {
            top: frame.top,
            left: frame.left,
            backgroundColor: colors.surface,
            borderColor: colors.border,
            shadowColor: "#000000",
          },
        ]}
      >
        {items.map((item) => {
          const tint = item.destructive ? colors.error : colors.primary;
          const textColor = item.disabled
            ? colors.muted
            : item.destructive
              ? colors.error
              : colors.foreground;

          return (
            <Pressable
              key={item.key}
              disabled={item.disabled}
              onPress={() => {
                onClose();
                item.onPress();
              }}
              onPressIn={() => {
                pressedScale.value = withTiming(0.985, { duration: 48 });
              }}
              onPressOut={() => {
                pressedScale.value = withTiming(1, { duration: 72 });
              }}
              style={({ pressed }) => [
                styles.item,
                {
                  backgroundColor: pressed
                    ? item.destructive
                      ? `${colors.error}10`
                      : `${colors.primary}10`
                    : "transparent",
                  opacity: item.disabled ? 0.5 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.iconBubble,
                  {
                    backgroundColor: item.destructive
                      ? `${colors.error}12`
                      : `${colors.primary}12`,
                  },
                ]}
              >
                <IconSymbol
                  name={item.icon || (item.destructive ? "trash.fill" : "ellipsis")}
                  size={16}
                  color={tint}
                />
              </View>
              <View style={styles.itemTextWrap}>
                <Text numberOfLines={1} style={[styles.itemLabel, { color: textColor }]}>
                  {item.label}
                </Text>
                {item.subtitle ? (
                  <Text numberOfLines={1} style={[styles.itemSubtitle, { color: colors.muted }]}>
                    {item.subtitle}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
    elevation: 40,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  card: {
    position: "absolute",
    width: MENU_WIDTH,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: MENU_VERTICAL_PADDING,
    paddingHorizontal: 6,
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 18,
  },
  item: {
    minHeight: MENU_ROW_HEIGHT,
    borderRadius: 13,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  iconBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  itemTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  itemLabel: {
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
  },
  itemSubtitle: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: "600",
    lineHeight: 13,
  },
});
