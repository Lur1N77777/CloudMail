import React, { useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/use-colors";

interface MiniToastProps {
  message: string | null;
  onDismiss?: () => void;
  position?: "top" | "bottom";
}

export function MiniToast({ message, onDismiss, position = "bottom" }: MiniToastProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const hiddenOffset = position === "top" ? -24 : 24;
  const translateY = useSharedValue(hiddenOffset);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!message) {
      translateY.value = hiddenOffset;
      opacity.value = 0;
      return;
    }

    translateY.value = withTiming(0, { duration: 180 });
    opacity.value = withTiming(1, { duration: 180 });

    translateY.value = withDelay(
      1400,
      withTiming(hiddenOffset, { duration: 180 }, () => {
        if (onDismiss) runOnJS(onDismiss)();
      })
    );
    opacity.value = withDelay(1400, withTiming(0, { duration: 180 }));
  }, [hiddenOffset, message, onDismiss, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!message) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        animatedStyle,
        {
          ...(position === "top"
            ? { top: insets.top + 14 }
            : { bottom: insets.bottom + 18 }),
          backgroundColor: colors.foreground,
        },
      ]}
    >
      <Text style={[styles.text, { color: colors.background }]}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    alignSelf: "center",
    maxWidth: "72%",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    zIndex: 9999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  text: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
});
