import React, { useCallback, useMemo } from "react";
import { useRouter } from "expo-router";

import { SwipeableScreen } from "./swipeable-screen";

type RootTabKey = "inbox" | "compose" | "addresses";

type TabRoute = {
  key: RootTabKey;
  href: string;
};

const ROOT_TAB_ROUTES: TabRoute[] = [
  { key: "inbox", href: "/(tabs)" },
  { key: "compose", href: "/(tabs)/compose" },
  { key: "addresses", href: "/(tabs)/addresses" },
];

export function TabSwipeScreen({
  tab,
  children,
}: {
  tab: RootTabKey;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const currentIndex = useMemo(
    () => ROOT_TAB_ROUTES.findIndex((item) => item.key === tab),
    [tab]
  );

  const navigateToIndex = useCallback(
    (nextIndex: number) => {
      const route = ROOT_TAB_ROUTES[nextIndex];
      if (!route) return;
      router.replace(route.href as any);
    },
    [router]
  );

  return (
    <SwipeableScreen
      onSwipeLeft={
        currentIndex >= 0 && currentIndex < ROOT_TAB_ROUTES.length - 1
          ? () => navigateToIndex(currentIndex + 1)
          : undefined
      }
      onSwipeRight={
        currentIndex > 0 ? () => navigateToIndex(currentIndex - 1) : undefined
      }
    >
      {children}
    </SwipeableScreen>
  );
}
