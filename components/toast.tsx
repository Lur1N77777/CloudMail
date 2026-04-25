import React, { useEffect } from "react";
import { Text, View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";

interface ToastProps {
  message: string | null;
  type?: "success" | "error" | "info";
  onDismiss?: () => void;
}

export function Toast({ message, type = "info", onDismiss }: ToastProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (message) {
      translateY.value = withTiming(0, { duration: 250 });
      opacity.value = withTiming(1, { duration: 250 });
      // Auto dismiss
      translateY.value = withDelay(
        2500,
        withTiming(-100, { duration: 250 }, () => {
          if (onDismiss) runOnJS(onDismiss)();
        })
      );
      opacity.value = withDelay(2500, withTiming(0, { duration: 250 }));
    } else {
      translateY.value = -100;
      opacity.value = 0;
    }
  }, [message]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!message) return null;

  const bgColor =
    type === "success"
      ? colors.success
      : type === "error"
        ? colors.error
        : colors.primary;

  return (
    <Animated.View
      style={[
        styles.container,
        animatedStyle,
        {
          top: insets.top + 8,
          backgroundColor: bgColor,
        },
      ]}
    >
      <Text style={styles.text} numberOfLines={2}>
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 9999,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 20,
  },
});
