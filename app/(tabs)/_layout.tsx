import { Redirect, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Platform } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useMail } from "@/lib/mail-context";

export default function TabLayout() {
  const colors = useColors();
  const { state } = useMail();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  if (state.isInitialized && state.isAdminMode) {
    return <Redirect href="/admin" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          display: "none",
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          href: null,
          title: "收件箱",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="tray.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="compose"
        options={{
          href: null,
          title: "发送",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="paperplane.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="addresses"
        options={{
          href: null,
          title: "邮箱",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="at" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
          title: "设置",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="gearshape.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}