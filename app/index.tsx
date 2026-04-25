import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";

import { useMail } from "@/lib/mail-context";
import { useColors } from "@/hooks/use-colors";

export default function RootIndexScreen() {
  const router = useRouter();
  const colors = useColors();
  const { state } = useMail();

  useEffect(() => {
    if (!state.isInitialized) return;
    router.replace(state.isAdminMode ? "/admin" : "/(tabs)");
  }, [router, state.isAdminMode, state.isInitialized]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
