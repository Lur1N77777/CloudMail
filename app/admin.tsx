import React, {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Text,
  View,
  FlatList,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Alert,
  ScrollView,
  Modal,
  Switch,
  Pressable,
  RefreshControl,
  InteractionManager,
  Keyboard,
} from "react-native";
import type { StyleProp, TextStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Stack, useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import {
  SwipeableScreenContext,
  SwipeSuspendView,
  type SwipeableScreenControls,
} from "@/components/swipeable-screen";
import {
  AddressGroupAssignmentSheet,
  AddressGroupChip,
  AddressGroupInlineFilterMenu,
  AddressGroupManagerSheet,
  AddressGroupSummaryChip,
} from "@/components/address-group-ui";
import { MiniToast } from "@/components/mini-toast";
import { Toast } from "@/components/toast";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useMail } from "@/lib/mail-context";
import { useThemeContext } from "@/lib/theme-provider";
import {
  addAddressToGroup,
  createAddressGroup,
  deleteAddressGroup,
  getAddressGroupsForAddress,
  getAddressGroupsLookup,
  normalizeGroupAddress,
  removeAddressFromGroup,
  type AddressGroup,
  type AddressGroupColor,
} from "@/lib/address-groups";
import {
  fetchAdminAddresses,
  fetchAdminMails,
  fetchAdminSendbox,
  fetchAdminUnknownMails,
  adminDeleteMail,
  adminDeleteSentMail,
  adminDeleteAddress,
  adminClearInbox,
  adminSendMail,
  createAddress,
  fetchAdminStatistics,
  adminShowAddressCredential,
  type AdminAddress,
  type AdminStatistics,
  type ParsedMail,
  type RawMail,
} from "@/lib/api";
import { copyTextToClipboard } from "@/lib/clipboard";
import { setAdminMailEntry } from "@/lib/admin-mail-store";
import {
  buildAdminMailReadKey,
  loadAdminMailUnreadKeySet,
  markAdminMailRead,
  reconcileAdminMailReadState,
  subscribeAdminMailReadState,
} from "@/lib/admin-mail-read-state";
import { buildMailboxName, normalizeMailboxPrefix } from "@/lib/mailbox-name";
import {
  parseMail,
  getSenderDisplay,
  formatMailDate,
  getMailPreview,
  getVerificationCode,
  getMailBodyText,
  formatMailboxDisplay,
  getMailRecipientsDisplay,
} from "@/lib/mail-parser";
import { mergeMailLists, sortMailsDesc } from "@/lib/mail-list-utils";

type AdminTab = "stats" | "addresses" | "mails" | "sendbox" | "unknown" | "send";

const PAGE_SIZE = 30;
const LIVE_SEARCH_DEBOUNCE = 120;
const FULL_SEARCH_PAGE_SIZE = 100;
const SEARCH_DATASET_TTL = 30_000;
const ADMIN_PANEL_STALE_TTL = 15_000;
const ADMIN_TABS: { key: AdminTab; label: string }[] = [
  { key: "stats", label: "统计" },
  { key: "addresses", label: "地址" },
  { key: "mails", label: "收件" },
  { key: "sendbox", label: "发件" },
  { key: "unknown", label: "未知" },
  { key: "send", label: "发送" },
];
const ADMIN_INITIAL_TAB: AdminTab = "mails";
const ADMIN_INITIAL_TAB_INDEX = Math.max(
  0,
  ADMIN_TABS.findIndex(({ key }) => key === ADMIN_INITIAL_TAB)
);
const ADMIN_SEGMENT_GAP = 4;
const ADMIN_SEGMENT_PADDING = 3;
const ADMIN_PAGER_ACTIVATION_DISTANCE = 10;
const ADMIN_PAGER_VERTICAL_FAIL_DISTANCE = 14;
const ADMIN_PAGER_HORIZONTAL_DOMINANCE = 1.25;
const ADMIN_PAGER_TRIGGER_DISTANCE_RATIO = 0.22;
const ADMIN_PAGER_TRIGGER_VELOCITY = 760;
const ADMIN_PAGER_SETTLE_ANIMATION_MS = 150;
const ADMIN_PAGER_TAP_ANIMATION_MS = 110;
const ADMIN_PAGER_VELOCITY_PROJECTION_MS = 0.045;

const ADMIN_PAGER_SPRING_CONFIG = {
  damping: 28,
  stiffness: 240,
  mass: 0.85,
  overshootClamping: true,
} as const;
const COMPACT_HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 };

function clampPagerIndexAround(value: number, center: number, radius = 1) {
  "worklet";
  const min = Math.max(0, center - radius);
  const max = Math.min(ADMIN_TABS.length - 1, center + radius);
  return Math.min(Math.max(value, min), max);
}

function getFirstGestureTouch(event: any) {
  "worklet";
  return event.changedTouches?.[0] ?? event.allTouches?.[0];
}

function createMountedTabsAround(index: number, radius = 1): Record<AdminTab, boolean> {
  const mounted = ADMIN_TABS.reduce(
    (acc, { key }) => {
      acc[key] = false;
      return acc;
    },
    {} as Record<AdminTab, boolean>
  );

  for (let offset = -radius; offset <= radius; offset += 1) {
    const key = ADMIN_TABS[index + offset]?.key;
    if (key) mounted[key] = true;
  }

  return mounted;
}

function includeMountedTabsAround(
  previous: Record<AdminTab, boolean>,
  index: number,
  radius = 1
) {
  let next = previous;
  for (let offset = -radius; offset <= radius; offset += 1) {
    const key = ADMIN_TABS[index + offset]?.key;
    if (key && !next[key]) {
      next = { ...next, [key]: true };
    }
  }
  return next;
}

function normalizeSearchKeyword(value?: string) {
  return (value || "").trim().toLowerCase();
}

function buildAddressSearchFields(item: AdminAddress) {
  return [
    item.name,
    String(item.id),
    item.created_at,
    item.updated_at,
    String(item.mail_count ?? 0),
    String(item.send_count ?? 0),
    item.groups?.map((group) => group.name).join(" "),
  ].filter(Boolean);
}

function buildMailSearchFields(item: ParsedMail) {
  const verificationCode = getVerificationCode(item) || "";
  const recipients = item.to
    ?.map((mailbox) => formatMailboxDisplay(mailbox, { addressFirst: true }))
    .filter(Boolean)
    .join(" ");

  return [
    item.ownerAddress,
    item.subject,
    item.from?.name,
    item.from?.address,
    recipients,
    getMailRecipientsDisplay(item, { addressFirst: true }),
    formatMailboxDisplay(item.from, { addressFirst: true }),
    verificationCode,
    getMailPreview(item, 240),
    getMailBodyText(item).slice(0, 600),
    item.metadata,
  ].filter(Boolean);
}

function buildMailSearchBlob(item: ParsedMail) {
  return normalizeSearchKeyword(buildMailSearchFields(item).join(" "));
}

function matchesSearchKeyword(fields: (string | number | null | undefined)[], keyword: string) {
  const needle = normalizeSearchKeyword(keyword);
  if (!needle) return true;

  return fields.some((field) =>
    normalizeSearchKeyword(typeof field === "number" ? String(field) : field || "").includes(
      needle
    )
  );
}

type MailFilterMenuFrame = {
  top: number;
  left: number;
  width: number;
};


function filterAdminAddresses(items: AdminAddress[], keyword: string) {
  const needle = normalizeSearchKeyword(keyword);
  if (!needle) return items;

  return items.filter((item) => matchesSearchKeyword(buildAddressSearchFields(item), needle));
}

function filterAdminMailsIndexed(
  items: ParsedMail[],
  keyword: string,
  indexMap: Map<string, string>
) {
  const needle = normalizeSearchKeyword(keyword);
  if (!needle) return items;

  return items.filter((item) =>
    (indexMap.get(`${item.mailboxKind || "mail"}:${item.id}`) || "").includes(needle)
  );
}

function getManagedAddressForMail(
  mail: ParsedMail,
  kind: "inbox" | "sendbox" | "unknown"
) {
  if (kind === "sendbox") {
    return (
      mail.ownerAddress ||
      mail.from?.address ||
      mail.to?.[0]?.address ||
      ""
    ).trim();
  }

  return (
    mail.ownerAddress ||
    mail.to?.[0]?.address ||
    mail.from?.address ||
    ""
  ).trim();
}

function splitMailboxAddress(address: string) {
  const normalized = address.trim();
  const atIndex = normalized.lastIndexOf("@");
  if (!normalized || atIndex <= 0 || atIndex >= normalized.length - 1) {
    return null;
  }

  return {
    name: normalized.slice(0, atIndex),
    domain: normalized.slice(atIndex + 1),
  };
}

function getGroupFilterLabel(
  filter: "all" | "ungrouped" | string,
  groups: AddressGroup[]
) {
  if (filter === "all") return "全部";
  if (filter === "ungrouped") return "未分组";
  return groups.find((group) => group.id === filter)?.name || "全部";
}

function isAddressAlreadyExistsError(error: unknown) {
  const message = String((error as any)?.message || error || "").toLowerCase();
  return /already|exists|duplicate|已存在|重复/.test(message);
}

type AdminMailPanelCacheEntry = {
  count: number;
  data: ParsedMail[];
  offset: number;
  fetchedAt: number;
};

type AdminStatsCacheEntry = {
  data: AdminStatistics;
  fetchedAt: number;
  updatedLabel: string | null;
};

type AdminAddressesPanelCacheEntry = {
  count: number;
  data: AdminAddress[];
  offset: number;
  fetchedAt: number;
};

const adminMailPanelCache = new Map<string, AdminMailPanelCacheEntry>();
const adminMailSearchDatasetCache = new Map<
  string,
  { count: number; data: ParsedMail[]; fetchedAt: number }
>();
const adminParsedMailRowCache = new Map<string, ParsedMail>();
let adminStatsPanelCache: AdminStatsCacheEntry | null = null;
const adminAddressesPanelCache = new Map<string, AdminAddressesPanelCacheEntry>();

function normalizeAdminMailQuery(value?: string) {
  return (value || "").trim().toLowerCase();
}

function buildAdminMailCacheKey(
  kind: "inbox" | "sendbox" | "unknown",
  address?: string
) {
  return `${kind}:${normalizeAdminMailQuery(address) || "*"}`;
}

function buildAdminParsedMailCacheKey(
  kind: "inbox" | "sendbox" | "unknown",
  row: RawMail
) {
  return [
    kind,
    row.id,
    row.message_id || "",
    row.created_at || "",
    row.address || "",
    row.subject || "",
    (row.raw || row.source || "").length,
  ].join(":");
}

function buildAdminAddressesCacheKey(query?: string) {
  return normalizeSearchKeyword(query) || "*";
}

function formatAdminPanelRefreshTime(date = new Date()) {
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function parseAdminMailRowsCached(
  kind: "inbox" | "sendbox" | "unknown",
  rows: RawMail[]
) {
  return Promise.all(
    rows.map(async (m: RawMail) => {
      const cacheKey = buildAdminParsedMailCacheKey(kind, m);
      const cached = adminParsedMailRowCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      try {
        const mail = await parseMail(m);
        const parsedMail = {
          ...mail,
          ownerAddress: m.address,
          mailboxKind: kind,
          metadata: m.metadata,
        } as ParsedMail;
        adminParsedMailRowCache.set(cacheKey, parsedMail);
        return parsedMail;
      } catch {
        const parsedMail = {
          id: m.id,
          subject: m.subject || "(解析失败)",
          raw: m.raw || m.source || "",
          createdAt: m.created_at,
          ownerAddress: m.address,
          mailboxKind: kind,
          metadata: m.metadata,
        } as ParsedMail;
        adminParsedMailRowCache.set(cacheKey, parsedMail);
        return parsedMail;
      }
    })
  );
}

function splitHighlightChunks(text: string, keyword: string) {
  const source = String(text || "");
  const needle = normalizeSearchKeyword(keyword);
  if (!source || !needle) {
    return [{ text: source, match: false }];
  }

  const lowerSource = source.toLowerCase();
  const chunks: { text: string; match: boolean }[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const matchIndex = lowerSource.indexOf(needle, cursor);
    if (matchIndex === -1) {
      chunks.push({ text: source.slice(cursor), match: false });
      break;
    }

    if (matchIndex > cursor) {
      chunks.push({ text: source.slice(cursor, matchIndex), match: false });
    }

    chunks.push({
      text: source.slice(matchIndex, matchIndex + needle.length),
      match: true,
    });
    cursor = matchIndex + needle.length;
  }

  return chunks;
}

function HighlightText({
  text,
  query,
  style,
  highlightStyle,
  numberOfLines,
}: {
  text?: string | null;
  query?: string;
  style?: StyleProp<TextStyle>;
  highlightStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const content = String(text ?? "");
  const chunks = useMemo(
    () => splitHighlightChunks(content, query || ""),
    [content, query]
  );

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {chunks.map((chunk, index) => (
        <Text
          key={`${chunk.text}-${index}`}
          style={chunk.match ? highlightStyle : undefined}
        >
          {chunk.text}
        </Text>
      ))}
    </Text>
  );
}

export default function AdminScreen() {
  const colors = useColors();
  const router = useRouter();
  const { state, clearError, clearSuccess } = useMail();
  const { colorScheme, themePreference, setThemePreference, lastDarkPreference } =
    useThemeContext();
  const [tab, setTab] = useState<AdminTab>(ADMIN_INITIAL_TAB);
  const [mountedTabs, setMountedTabs] = useState<Record<AdminTab, boolean>>(() =>
    createMountedTabsAround(ADMIN_INITIAL_TAB_INDEX, ADMIN_TABS.length)
  );
  const [warmTabs, setWarmTabs] = useState<Record<AdminTab, boolean>>(() =>
    createMountedTabsAround(ADMIN_INITIAL_TAB_INDEX)
  );
  const [miniToastMessage, setMiniToastMessage] = useState<string | null>(null);
  const [segmentTrackWidth, setSegmentTrackWidth] = useState(0);
  const [pagerWidth, setPagerWidth] = useState(0);
  const activeTabIndex = useMemo(
    () => Math.max(0, ADMIN_TABS.findIndex(({ key }) => key === tab)),
    [tab]
  );

  const visualIndex = useSharedValue(activeTabIndex);
  const settledIndex = useSharedValue(activeTabIndex);
  const dragStartIndex = useSharedValue(activeTabIndex);
  const preparedPagerIndex = useSharedValue(activeTabIndex);
  const pagerWidthValue = useSharedValue(0);
  const segmentTrackWidthValue = useSharedValue(0);
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);
  const pagerChildInteractionSuspended = useSharedValue(false);
  const pagerKeyboardSuspended = useSharedValue(false);
  const activeTabIndexRef = useRef(activeTabIndex);
  const requestedTabIndexRef = useRef(activeTabIndex);

  const segmentMetrics = useMemo(() => {
    if (!segmentTrackWidth) return { width: 0 };
    const innerWidth =
      segmentTrackWidth -
      ADMIN_SEGMENT_PADDING * 2 -
      ADMIN_SEGMENT_GAP * (ADMIN_TABS.length - 1);
    return { width: Math.max(innerWidth / ADMIN_TABS.length, 0) };
  }, [segmentTrackWidth]);

  const segmentItemWidth = useDerivedValue(() => {
    const innerWidth =
      segmentTrackWidthValue.value -
      ADMIN_SEGMENT_PADDING * 2 -
      ADMIN_SEGMENT_GAP * (ADMIN_TABS.length - 1);
    return Math.max(innerWidth / ADMIN_TABS.length, 0);
  });

  const segmentIndicatorX = useDerivedValue(
    () =>
      ADMIN_SEGMENT_PADDING +
      visualIndex.value * (segmentItemWidth.value + ADMIN_SEGMENT_GAP)
  );

  const segmentIndicatorStyle = useAnimatedStyle(() => ({
    width: segmentItemWidth.value,
    transform: [{ translateX: segmentIndicatorX.value }],
  }));

  const segmentOverlayTrackStyle = useAnimatedStyle(() => ({
    width: segmentTrackWidthValue.value,
    transform: [{ translateX: -segmentIndicatorX.value }],
  }));

  const pagerTrackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -visualIndex.value * pagerWidthValue.value }],
  }));

  const pagerSwipeControls = useMemo<SwipeableScreenControls>(
    () => ({
      setSwipeSuspended: (suspended) => {
        pagerChildInteractionSuspended.value = suspended;
      },
    }),
    [pagerChildInteractionSuspended]
  );

  // Block access if admin mode is off
  useEffect(() => {
    if (!state.isInitialized || state.isAdminMode) return;

    const task = InteractionManager.runAfterInteractions(() => {
      router.replace("/settings");
    });

    return () => {
      task.cancel?.();
    };
  }, [state.isAdminMode, state.isInitialized, router]);

  const markTabsMountedAround = useCallback((index: number, radius = 1) => {
    setMountedTabs((prev) => includeMountedTabsAround(prev, index, radius));
    setWarmTabs((prev) => includeMountedTabsAround(prev, index, radius));
  }, []);

  const commitTabByIndex = useCallback(
    (nextIndex: number) => {
      const nextTab = ADMIN_TABS[nextIndex]?.key;
      if (!nextTab) return;
      requestedTabIndexRef.current = nextIndex;
      markTabsMountedAround(nextIndex);
      setTab((prev) => (prev === nextTab ? prev : nextTab));
    },
    [markTabsMountedAround]
  );

  const selectTab = useCallback(
    (nextTab: AdminTab) => {
      const nextIndex = ADMIN_TABS.findIndex(({ key }) => key === nextTab);
      if (nextIndex < 0) return;
      if (
        requestedTabIndexRef.current === nextIndex &&
        activeTabIndexRef.current === nextIndex
      ) {
        return;
      }

      requestedTabIndexRef.current = nextIndex;
      markTabsMountedAround(nextIndex);
      preparedPagerIndex.value = nextIndex;
      visualIndex.value = withTiming(
        nextIndex,
        { duration: ADMIN_PAGER_TAP_ANIMATION_MS },
        (finished) => {
          if (!finished) return;
          settledIndex.value = nextIndex;
          runOnJS(commitTabByIndex)(nextIndex);
        }
      );
    },
    [commitTabByIndex, markTabsMountedAround, preparedPagerIndex, settledIndex, visualIndex]
  );

  const handleSegmentLayout = useCallback(
    (width: number) => {
      setSegmentTrackWidth(width);
      segmentTrackWidthValue.value = width;
    },
    [segmentTrackWidthValue]
  );

  const handlePagerLayout = useCallback(
    (width: number) => {
      setPagerWidth(width);
      pagerWidthValue.value = width;
    },
    [pagerWidthValue]
  );

  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let task: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;
    const warmOrder = ADMIN_TABS.map((_, index) => index)
      .filter((index) => Math.abs(index - ADMIN_INITIAL_TAB_INDEX) > 1)
      .sort(
        (a, b) =>
          Math.abs(a - ADMIN_INITIAL_TAB_INDEX) - Math.abs(b - ADMIN_INITIAL_TAB_INDEX)
      );
    let cursor = 0;

    const warmNext = () => {
      if (cancelled || cursor >= warmOrder.length) return;
      task = InteractionManager.runAfterInteractions(() => {
        if (cancelled) return;
        setWarmTabs((prev) => includeMountedTabsAround(prev, warmOrder[cursor], 0));
        cursor += 1;
        timeout = setTimeout(warmNext, 90);
      });
    };

    timeout = setTimeout(warmNext, 160);

    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
      task?.cancel?.();
    };
  }, []);

  useEffect(() => {
    activeTabIndexRef.current = activeTabIndex;
    requestedTabIndexRef.current = activeTabIndex;
    markTabsMountedAround(activeTabIndex);
    preparedPagerIndex.value = activeTabIndex;
    settledIndex.value = activeTabIndex;
    if (Math.abs(visualIndex.value - activeTabIndex) > 0.01) {
      visualIndex.value = withTiming(activeTabIndex, {
        duration: ADMIN_PAGER_SETTLE_ANIMATION_MS,
      });
    }
  }, [activeTabIndex, markTabsMountedAround, preparedPagerIndex, settledIndex, visualIndex]);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => {
      pagerKeyboardSuspended.value = true;
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      pagerKeyboardSuspended.value = false;
    });

    return () => {
      showSub.remove();
      hideSub.remove();
      pagerKeyboardSuspended.value = false;
    };
  }, [pagerKeyboardSuspended]);

  const pagerGesture = useMemo(
    () =>
      Gesture.Pan()
        .manualActivation(true)
        .maxPointers(1)
        .cancelsTouchesInView(false)
        .onTouchesDown((event) => {
          const touch = getFirstGestureTouch(event);
          if (!touch) return;
          touchStartX.value = touch.x;
          touchStartY.value = touch.y;
        })
        .onTouchesMove((event, manager) => {
          if (
            pagerWidthValue.value <= 0 ||
            pagerChildInteractionSuspended.value ||
            pagerKeyboardSuspended.value ||
            (event.allTouches?.length ?? 0) > 1
          ) {
            manager.fail();
            return;
          }

          const touch = getFirstGestureTouch(event);
          if (!touch) return;

          const deltaX = touch.x - touchStartX.value;
          const deltaY = touch.y - touchStartY.value;
          const absX = Math.abs(deltaX);
          const absY = Math.abs(deltaY);

          if (
            absY >= ADMIN_PAGER_VERTICAL_FAIL_DISTANCE &&
            absY > absX / ADMIN_PAGER_HORIZONTAL_DOMINANCE
          ) {
            manager.fail();
            return;
          }

          const visualCenterIndex = Math.round(visualIndex.value);

          if (visualCenterIndex <= 0 && deltaX >= ADMIN_PAGER_ACTIVATION_DISTANCE) {
            manager.fail();
            return;
          }

          if (
            visualCenterIndex >= ADMIN_TABS.length - 1 &&
            deltaX <= -ADMIN_PAGER_ACTIVATION_DISTANCE
          ) {
            manager.fail();
            return;
          }

          if (
            absX >= ADMIN_PAGER_ACTIVATION_DISTANCE &&
            absX > absY * ADMIN_PAGER_HORIZONTAL_DOMINANCE
          ) {
            manager.activate();
          }
        })
        .onBegin(() => {
          dragStartIndex.value = visualIndex.value;
        })
        .onUpdate((event) => {
          if (pagerWidthValue.value <= 0) return;
          const nextVisualIndex =
            dragStartIndex.value - event.translationX / pagerWidthValue.value;
          const clampedVisualIndex = clampPagerIndexAround(
            nextVisualIndex,
            Math.round(dragStartIndex.value),
            1
          );
          const nearestIndex = Math.round(clampedVisualIndex);
          visualIndex.value = clampedVisualIndex;
          if (nearestIndex !== preparedPagerIndex.value) {
            preparedPagerIndex.value = nearestIndex;
            runOnJS(markTabsMountedAround)(nearestIndex);
          }
        })
        .onEnd((event) => {
          if (pagerWidthValue.value <= 0) return;
          const startIndex = Math.round(dragStartIndex.value);
          const distanceThreshold =
            pagerWidthValue.value * ADMIN_PAGER_TRIGGER_DISTANCE_RATIO;
          const travelledPages = Math.abs(visualIndex.value - startIndex);
          const projectedDeltaPages =
            (event.translationX + event.velocityX * ADMIN_PAGER_VELOCITY_PROJECTION_MS) /
            pagerWidthValue.value;
          const projectedTravelledPages = Math.abs(projectedDeltaPages);
          const distanceDirection =
            event.translationX < 0 ? 1 : event.translationX > 0 ? -1 : 0;
          const velocityDirection =
            event.velocityX < 0 ? 1 : event.velocityX > 0 ? -1 : 0;
          const hasDecisiveSwipe =
            Math.abs(event.translationX) >= distanceThreshold ||
            (Math.abs(event.velocityX) >= ADMIN_PAGER_TRIGGER_VELOCITY &&
              travelledPages >= 0.08) ||
            projectedTravelledPages >= ADMIN_PAGER_TRIGGER_DISTANCE_RATIO;
          const direction = Math.abs(event.translationX) >= distanceThreshold
            ? distanceDirection
            : Math.abs(event.velocityX) >= ADMIN_PAGER_TRIGGER_VELOCITY
              ? velocityDirection
              : projectedDeltaPages < 0
                ? 1
                : projectedDeltaPages > 0
                  ? -1
                  : 0;
          let nextIndex = hasDecisiveSwipe ? startIndex + direction : startIndex;

          nextIndex = clampPagerIndexAround(nextIndex, startIndex, 1);
          preparedPagerIndex.value = nextIndex;
          runOnJS(markTabsMountedAround)(nextIndex);
          visualIndex.value = withSpring(
            nextIndex,
            ADMIN_PAGER_SPRING_CONFIG,
            (finished) => {
              if (!finished) return;
              settledIndex.value = nextIndex;
              runOnJS(commitTabByIndex)(nextIndex);
            }
          );
        }),
    [
      dragStartIndex,
      commitTabByIndex,
      markTabsMountedAround,
      pagerChildInteractionSuspended,
      pagerKeyboardSuspended,
      pagerWidthValue,
      preparedPagerIndex,
      settledIndex,
      touchStartX,
      touchStartY,
      visualIndex,
    ]
  );

  const handleQuickThemeToggle = useCallback(() => {
    const nextScheme = colorScheme === "light" ? lastDarkPreference : "light";
    setThemePreference(nextScheme);
    setMiniToastMessage(
      nextScheme === "oled"
        ? "已切到 OLED 黑"
        : nextScheme === "dark"
          ? "已切到深色"
          : "已切到浅色"
    );
  }, [colorScheme, lastDarkPreference, setThemePreference]);

  const handleThemeSystemMode = useCallback(() => {
    setThemePreference("system");
    setMiniToastMessage("已跟随系统");
  }, [setThemePreference]);

  const themeButtonLabel =
    themePreference === "system"
      ? "系统"
      : colorScheme === "oled"
        ? "OLED"
        : colorScheme === "dark"
          ? "深色"
          : "浅色";

  const handleOpenSettings = useCallback(() => {
    router.push("/settings");
  }, [router]);

  const showMiniToast = useCallback((message: string) => {
    setMiniToastMessage(message);
  }, []);

  const renderPagerPage = useCallback(
    (pageTab: AdminTab) => {
      const isPageActive = tab === pageTab;
      let content: React.ReactNode = <View style={styles.adminPagerPlaceholder} />;

      if (mountedTabs[pageTab]) {
        if (pageTab === "stats") {
          content = (
            <MemoStatsPanel
              colors={colors}
              onNavigate={selectTab}
              isActive={isPageActive}
              shouldWarm={warmTabs.stats}
            />
          );
        } else if (pageTab === "addresses") {
          content = (
            <MemoAddressesPanel
              colors={colors}
              onMiniToast={showMiniToast}
              isActive={isPageActive}
              shouldWarm={warmTabs.addresses}
            />
          );
        } else if (pageTab === "mails") {
          content = (
            <MemoMailsPanel
              colors={colors}
              kind="inbox"
              onMiniToast={showMiniToast}
              isActive={isPageActive}
              shouldWarm={warmTabs.mails}
            />
          );
        } else if (pageTab === "sendbox") {
          content = (
            <MemoMailsPanel
              colors={colors}
              kind="sendbox"
              onMiniToast={showMiniToast}
              isActive={isPageActive}
              shouldWarm={warmTabs.sendbox}
            />
          );
        } else if (pageTab === "unknown") {
          content = (
            <MemoMailsPanel
              colors={colors}
              kind="unknown"
              onMiniToast={showMiniToast}
              isActive={isPageActive}
              shouldWarm={warmTabs.unknown}
            />
          );
        } else if (pageTab === "send") {
          content = <MemoSendAsPanel colors={colors} />;
        }
      }

      return (
        <View
          key={pageTab}
          style={[styles.adminPagerPage, pagerWidth > 0 ? { width: pagerWidth } : null]}
          pointerEvents={isPageActive ? "auto" : "none"}
        >
          {content}
        </View>
      );
    },
    [colors, mountedTabs, pagerWidth, selectTab, showMiniToast, tab, warmTabs]
  );

  if (!state.isInitialized || !state.isAdminMode) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]}>
        <View style={styles.centerAll}>
          <Text style={{ color: colors.muted }}>跳转中...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <Stack.Screen
        options={{
          fullScreenGestureEnabled: activeTabIndex === 0,
          gestureEnabled: activeTabIndex === 0,
        }}
      />
      <View collapsable={false} style={styles.adminScreenRoot}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            管理员系统
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={handleOpenSettings}
            style={({ pressed }) => [
              styles.headerIconButton,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.78 : 1,
              },
            ]}
          >
            <IconSymbol name="gearshape.fill" size={16} color={colors.primary} />
            <Text style={[styles.headerIconText, { color: colors.foreground }]}>
              设置
            </Text>
          </Pressable>
          <View collapsable={false}>
            <Pressable
              onPress={handleQuickThemeToggle}
              onLongPress={handleThemeSystemMode}
              delayLongPress={320}
              style={({ pressed }) => [
                styles.headerThemeButton,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? 0.78 : 1,
                },
              ]}
            >
              <IconSymbol
                name={colorScheme === "light" ? "sun.max.fill" : "moon.fill"}
                size={16}
                color={colors.primary}
              />
              <Text style={[styles.headerThemeText, { color: colors.foreground }]}>
                {themeButtonLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.segmentWrap}>
        <View
          onLayout={(event) => handleSegmentLayout(event.nativeEvent.layout.width)}
          style={[
            styles.segmentTrack,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          {ADMIN_TABS.map(({ key, label }) => (
            <Pressable
              key={key}
              unstable_pressDelay={0}
              onPressIn={() => selectTab(key)}
              onPress={() => {
                const nextIndex = ADMIN_TABS.findIndex((item) => item.key === key);
                if (requestedTabIndexRef.current !== nextIndex) selectTab(key);
              }}
              style={({ pressed }) => [
                styles.segmentItem,
                styles.segmentItemEqual,
                {
                  opacity: pressed ? 0.78 : 1,
                },
              ]}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.92}
                style={[styles.segmentText, { color: colors.foreground }]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
          {segmentMetrics.width > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.segmentIndicator,
                { backgroundColor: colors.primary },
                segmentIndicatorStyle,
              ]}
            >
              <Animated.View
                style={[
                  styles.segmentOverlayTrack,
                  segmentOverlayTrackStyle,
                ]}
              >
                {ADMIN_TABS.map(({ key, label }) => (
                  <View
                    key={`active-${key}`}
                    style={[
                      styles.segmentOverlayItem,
                      { width: segmentMetrics.width },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.92}
                      style={[styles.segmentText, styles.segmentTextActive]}
                    >
                      {label}
                    </Text>
                  </View>
                ))}
              </Animated.View>
            </Animated.View>
          ) : null}
        </View>
      </View>

      <SwipeableScreenContext.Provider value={pagerSwipeControls}>
        <GestureDetector gesture={pagerGesture}>
          <Animated.View
            style={styles.adminPagerWrap}
            onLayout={(event) => handlePagerLayout(event.nativeEvent.layout.width)}
          >
            <Animated.View
              style={[
                styles.adminPagerTrack,
                pagerWidth > 0
                  ? { width: pagerWidth * ADMIN_TABS.length }
                  : null,
                pagerTrackStyle,
              ]}
            >
              {ADMIN_TABS.map(({ key }) => renderPagerPage(key))}
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </SwipeableScreenContext.Provider>

      <MiniToast
        message={miniToastMessage}
        onDismiss={() => setMiniToastMessage(null)}
      />
      <Toast message={state.error} type="error" onDismiss={clearError} />
      <Toast
        message={state.successMessage}
        type="success"
        onDismiss={clearSuccess}
      />
      </View>
    </ScreenContainer>
  );
}

// ─── Stats Panel ──────────────────────────────────────────────
function StatsPanel({
  colors,
  onNavigate,
  isActive,
  shouldWarm,
}: {
  colors: ReturnType<typeof useColors>;
  onNavigate: (tab: AdminTab) => void;
  isActive: boolean;
  shouldWarm: boolean;
}) {
  const [stats, setStats] = useState<AdminStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const statsRef = useRef<AdminStatistics | null>(null);
  const didInitialLoadRef = useRef(false);

  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  const commitStats = useCallback((nextStats: AdminStatistics, options?: { defer?: boolean }) => {
    const updatedLabel = formatAdminPanelRefreshTime();
    adminStatsPanelCache = {
      data: nextStats,
      fetchedAt: Date.now(),
      updatedLabel,
    };
    const applyState = () => {
      setStats(nextStats);
      setLastUpdated(updatedLabel);
      setHasLoadedOnce(true);
    };
    if (options?.defer) {
      startTransition(applyState);
    } else {
      applyState();
    }
  }, []);

  const hydrateStatsCache = useCallback(() => {
    if (!adminStatsPanelCache) return false;
    setStats(adminStatsPanelCache.data);
    setLastUpdated(adminStatsPanelCache.updatedLabel);
    setHasLoadedOnce(true);
    return true;
  }, []);

  const load = useCallback(async (options?: { refresh?: boolean; silent?: boolean; background?: boolean }) => {
    const refresh = !!options?.refresh;
    const silent = !!options?.silent;
    const background = !!options?.background;

    if (refresh) {
      setIsRefreshing(true);
    } else if (background && !!statsRef.current) {
      setIsSyncing(true);
    } else if (!silent && !statsRef.current) {
      setIsLoading(true);
    }
    if (!silent || !statsRef.current) {
      setError(null);
    }
    try {
      const [s, unknownPage] = await Promise.all([
        fetchAdminStatistics(),
        fetchAdminUnknownMails({ limit: 1, offset: 0 }).catch(() => ({ count: 0 })),
      ]);
      commitStats(
        {
          ...s,
          unknow_mail_count:
            typeof s.unknow_mail_count === "number" && s.unknow_mail_count > 0
              ? s.unknow_mail_count
              : unknownPage.count,
        },
        { defer: background || silent }
      );
      setError(null);
    } catch (err: any) {
      if (!statsRef.current) {
        setError(err.message || "加载失败");
        setHasLoadedOnce(true);
      }
    } finally {
      if (refresh) {
        setIsRefreshing(false);
      } else if (background) {
        setIsSyncing(false);
      } else if (!silent) {
        setIsLoading(false);
      }
    }
  }, [commitStats]);

  useEffect(() => {
    if (!shouldWarm) return;

    const hydrated = hydrateStatsCache();
    const shouldRefresh =
      !adminStatsPanelCache ||
      Date.now() - adminStatsPanelCache.fetchedAt > ADMIN_PANEL_STALE_TTL;

    if (!didInitialLoadRef.current) {
      didInitialLoadRef.current = true;
      if (shouldRefresh) {
        void load(
          isActive
            ? hydrated
              ? { background: true }
              : undefined
            : { silent: true }
        );
      }
      return;
    }

    if (!isActive) return;

    if (shouldRefresh) {
      void load(statsRef.current || hydrated ? { background: true } : undefined);
    }
  }, [hydrateStatsCache, isActive, load, shouldWarm]);

  const addressCount = stats?.address_count ?? 0;
  const inboxCount = stats?.mail_count ?? 0;
  const sendCount = stats?.send_count ?? 0;
  const unknownCount = stats?.unknow_mail_count ?? 0;
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.adminPanelContent}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => {
            void load({ refresh: true });
          }}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <View style={styles.statsTopRow}>
        <View style={styles.inlineStatusRow}>
          {lastUpdated ? (
            <Text style={[styles.statsUpdatedText, { color: colors.muted }]}>
              更新于 {lastUpdated}
            </Text>
          ) : null}
          {isSyncing ? <InlineSyncBadge colors={colors} /> : null}
        </View>
        <Pressable
          onPress={() => {
            void load({ refresh: true });
          }}
          style={({ pressed }) => [
            styles.inlineRefreshButton,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <IconSymbol name="arrow.clockwise" size={14} color={colors.primary} />
          <Text style={[styles.inlineRefreshText, { color: colors.primary }]}>
            刷新
          </Text>
        </Pressable>
      </View>

      {isLoading && !stats ? (
        <PanelStateCard
          colors={colors}
          loading
          icon="arrow.clockwise"
          title="正在加载统计"
          subtitle="请稍候"
        />
      ) : error && !stats ? (
        <PanelStateCard
          colors={colors}
          icon="exclamationmark.circle.fill"
          title="统计加载失败"
          subtitle={error}
          actionLabel="重新加载"
          onAction={() => load()}
          accentColor={colors.error}
        />
      ) : stats ? (
        <>
          <View style={styles.metricGrid}>
            <AdminMetricTile
              colors={colors}
              icon="at"
              label="地址"
              value={addressCount}
              helper="可管理地址数"
              onPress={() => onNavigate("addresses")}
            />
            <AdminMetricTile
              colors={colors}
              icon="tray.fill"
              label="收件"
              value={inboxCount}
              helper="已匹配地址收件"
              onPress={() => onNavigate("mails")}
            />
            <AdminMetricTile
              colors={colors}
              icon="paperplane.fill"
              label="发件"
              value={sendCount}
              helper="系统发件总数"
              onPress={() => onNavigate("sendbox")}
            />
            <AdminMetricTile
              colors={colors}
              icon="questionmark.circle"
              label="未知"
              value={unknownCount}
              helper="未知地址收件"
              onPress={() => onNavigate("unknown")}
            />
          </View>
        </>
      ) : hasLoadedOnce ? (
        <PanelStateCard
          colors={colors}
          icon="tray.fill"
          title="暂无统计数据"
          subtitle="稍后再刷新看看"
          actionLabel="刷新"
          onAction={() => load()}
        />
      ) : (
        <PanelStateCard
          colors={colors}
          loading
          icon="arrow.clockwise"
          title="正在准备统计"
          subtitle="统计数据正在后台预热。"
        />
      )}
    </ScrollView>
  );
}

// ─── Addresses Panel ──────────────────────────────────────────
function AddressesPanel({
  colors,
  onMiniToast,
  isActive,
  shouldWarm,
}: {
  colors: ReturnType<typeof useColors>;
  onMiniToast: (message: string) => void;
  isActive: boolean;
  shouldWarm: boolean;
}) {
  const {
    state: mailState,
    loadSettings,
    importByCredential,
    importByPassword,
  } = useMail();
  const router = useRouter();
  const [data, setData] = useState<AdminAddress[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedDomain, setSelectedDomain] = useState("");
  const [customPrefix, setCustomPrefix] = useState("");
  const [useSubdomain, setUseSubdomain] = useState(false);
  const [subdomainPrefix, setSubdomainPrefix] = useState("");
  const [useRandomSubdomain, setUseRandomSubdomain] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showDomainPicker, setShowDomainPicker] = useState(false);
  const [showBindModal, setShowBindModal] = useState(false);
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [groupingAddress, setGroupingAddress] = useState<AdminAddress | null>(null);
  const [bindMode, setBindMode] = useState<"credential" | "password">("credential");
  const [credentialInput, setCredentialInput] = useState("");
  const [bindEmail, setBindEmail] = useState("");
  const [bindPassword, setBindPassword] = useState("");
  const [isBinding, setIsBinding] = useState(false);
  const [groupFilter, setGroupFilter] = useState<"all" | "ungrouped" | string>("all");
  const [addressGroups, setAddressGroups] = useState<AddressGroup[]>([]);
  const [groupLookup, setGroupLookup] = useState<Map<string, AddressGroup[]>>(new Map());
  const [groupMemberships, setGroupMemberships] = useState<Record<string, string[]>>({});
  const [showCred, setShowCred] = useState<{
    address: string;
    jwt?: string;
    password?: string;
  } | null>(null);
  const deferredQuery = useDeferredValue(query);
  const liveSearchReadyRef = useRef(false);
  const hasActivatedRef = useRef(false);
  const activationRefreshAtRef = useRef(0);
  const queryRef = useRef("");
  const dataRef = useRef<AdminAddress[]>([]);
  const countRef = useRef(0);
  const offsetRef = useRef(0);
  const highlightStyle = useMemo(
    () => ({
      backgroundColor: `${colors.primary}26`,
      color: colors.foreground,
      fontWeight: "700" as const,
    }),
    [colors.foreground, colors.primary]
  );
  const groupScope = mailState.workerUrl;
  const decoratedData = useMemo(
    () =>
      data.map((item) => ({
        ...item,
        groups: getAddressGroupsForAddress(groupLookup, item.name),
      })),
    [data, groupLookup]
  );
  const filteredData = useMemo(() => {
    const groupFiltered = decoratedData.filter((item) => {
      if (groupFilter === "all") return true;
      if (groupFilter === "ungrouped") return (item.groups?.length || 0) === 0;
      return item.groups?.some((group) => group.id === groupFilter);
    });
    return filterAdminAddresses(groupFiltered, deferredQuery);
  }, [decoratedData, deferredQuery, groupFilter]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    countRef.current = count;
  }, [count]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const loadGroupsState = useCallback(async () => {
    const next = await getAddressGroupsLookup(groupScope);
    setAddressGroups(next.groups);
    setGroupLookup(next.lookup);
    setGroupMemberships(next.memberships);
  }, [groupScope]);

  const domains = useMemo(() => mailState.settings?.domains || [], [mailState.settings?.domains]);
  const domainLabels = useMemo(
    () => mailState.settings?.domainLabels || [],
    [mailState.settings?.domainLabels]
  );
  const randomSubdomainDomains = useMemo(
    () => mailState.settings?.randomSubdomainDomains || [],
    [mailState.settings?.randomSubdomainDomains]
  );
  const domainItems = useMemo(
    () =>
      domains.map((d, i) => ({
        value: d,
        label: domainLabels[i] && domainLabels[i] !== d ? `${domainLabels[i]}（${d}）` : d,
        supportsRandom: randomSubdomainDomains.includes(d),
      })),
    [domains, domainLabels, randomSubdomainDomains]
  );
  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ids of Object.values(groupMemberships)) {
      ids.forEach((id) => {
        counts[id] = (counts[id] || 0) + 1;
      });
    }
    return counts;
  }, [groupMemberships]);

  useEffect(() => {
    if (isActive && mailState.isConfigured) loadSettings();
  }, [isActive, mailState.isConfigured, loadSettings]);

  useEffect(() => {
    if (!isActive) return;
    void loadGroupsState();
  }, [isActive, loadGroupsState]);

  useEffect(() => {
    if (groupFilter === "all" || groupFilter === "ungrouped") return;
    if (!addressGroups.some((group) => group.id === groupFilter)) {
      setGroupFilter("all");
    }
  }, [addressGroups, groupFilter]);

  useEffect(() => {
    if (domains.length === 0) {
      setSelectedDomain("");
      return;
    }
    if (!selectedDomain || !domains.includes(selectedDomain)) {
      setSelectedDomain(domains[0]);
    }
  }, [domains, selectedDomain]);

  const commitPanelState = useCallback(
    (
      nextData: AdminAddress[],
      nextCount: number,
      nextOffset: number,
      q: string,
      options?: { defer?: boolean }
    ) => {
      dataRef.current = nextData;
      countRef.current = nextCount;
      offsetRef.current = nextOffset;
      adminAddressesPanelCache.set(buildAdminAddressesCacheKey(q), {
        count: nextCount,
        data: nextData,
        offset: nextOffset,
        fetchedAt: Date.now(),
      });
      const applyState = () => {
        setData(nextData);
        setCount(nextCount);
        setOffset(nextOffset);
        setHasLoadedOnce(true);
      };
      if (options?.defer) {
        startTransition(applyState);
      } else {
        applyState();
      }
    },
    []
  );

  const hydrateCachedPanel = useCallback(
    (q: string = query) => {
      const cached = adminAddressesPanelCache.get(buildAdminAddressesCacheKey(q));
      if (!cached) return false;
      dataRef.current = cached.data;
      countRef.current = cached.count;
      offsetRef.current = cached.offset;
      setData(cached.data);
      setCount(cached.count);
      setOffset(cached.offset);
      setHasLoadedOnce(true);
      return true;
    },
    [query]
  );

  const load = useCallback(
    async (
      freshOffset: number = 0,
      q: string = query,
      options?: { refresh?: boolean; silent?: boolean; background?: boolean }
    ) => {
      const refresh = !!options?.refresh;
      const silent = !!options?.silent;
      const background = !!options?.background;

      if (refresh) {
        setIsRefreshing(true);
      } else if (background && dataRef.current.length > 0) {
        setIsSyncing(true);
      } else if (!silent && freshOffset === 0 && dataRef.current.length === 0) {
        setIsLoading(true);
      }
      if (freshOffset === 0 && (!silent || dataRef.current.length === 0)) {
        setError(null);
      }
      try {
        const page = await fetchAdminAddresses({
          limit: PAGE_SIZE,
          offset: freshOffset,
          query: q,
          sortBy: "updated_at",
          sortOrder: "desc",
        });
        const nextData =
          freshOffset === 0 ? page.results : [...dataRef.current, ...page.results];
        const nextOffset =
          freshOffset === 0 ? page.results.length : freshOffset + page.results.length;
        commitPanelState(nextData, page.count, nextOffset, q, {
          defer: background || silent,
        });
      } catch (err: any) {
        const message = err.message || "加载失败";
        if (freshOffset === 0 && dataRef.current.length === 0) {
          setError(message);
          setData([]);
          setCount(0);
          setOffset(0);
          setHasLoadedOnce(true);
        } else if (!silent) {
          Alert.alert("加载失败", message);
        }
      } finally {
        if (refresh) {
          setIsRefreshing(false);
        } else if (background) {
          setIsSyncing(false);
        } else if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [commitPanelState, query]
  );

  useEffect(() => {
    if (!shouldWarm) return;

    const hydrated = hydrateCachedPanel(query);
    const cached = adminAddressesPanelCache.get(buildAdminAddressesCacheKey(query));
    const shouldRefresh =
      !cached || Date.now() - cached.fetchedAt > ADMIN_PANEL_STALE_TTL;

    if (!hasActivatedRef.current) {
      hasActivatedRef.current = true;
      activationRefreshAtRef.current = Date.now();
      if (shouldRefresh) {
        void load(
          0,
          query,
          isActive
            ? hydrated
              ? { background: true }
              : undefined
            : { silent: true }
        );
      }
      return;
    }

    if (!isActive) return;

    if (shouldRefresh) {
      void load(0, query, { background: hydrated });
    }
  }, [hydrateCachedPanel, isActive, load, query, shouldWarm]);

  useEffect(() => {
    if (!isActive || !hasActivatedRef.current) return;
    const now = Date.now();
    if (now - activationRefreshAtRef.current < 1200) return;
    activationRefreshAtRef.current = now;
    void load(0, queryRef.current, dataRef.current.length > 0 ? { background: true } : undefined);
  }, [isActive, load]);

  useEffect(() => {
    if (!isActive) return;
    if (!liveSearchReadyRef.current) {
      liveSearchReadyRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      const hydrated = hydrateCachedPanel(query);
      void load(0, query, { silent: hydrated });
    }, LIVE_SEARCH_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [hydrateCachedPanel, isActive, load, query]);

  const handleSearch = () => {
    void load(0, query, { refresh: false, silent: false });
  };

  const handleResetSearch = () => {
    setQuery("");
    const hydrated = hydrateCachedPanel("");
    void load(0, "", { silent: hydrated });
  };

  const handleDelete = useCallback((item: AdminAddress) => {
    Alert.alert(
      "删除地址",
      `确定要从服务器删除 ${item.name}? 该操作不可恢复。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: async () => {
            try {
              await adminDeleteAddress(item.id);
              setData((prev) => prev.filter((x) => x.id !== item.id));
            } catch (err: any) {
              Alert.alert("删除失败", err.message || "");
            }
          },
        },
      ]
    );
  }, []);

  const handleClearInbox = useCallback((item: AdminAddress) => {
    Alert.alert("清空收件箱", `清空 ${item.name} 的收件箱？`, [
      { text: "取消", style: "cancel" },
      {
        text: "确定",
        style: "destructive",
        onPress: async () => {
          try {
            await adminClearInbox(item.name);
            Alert.alert("已清空");
          } catch (err: any) {
            Alert.alert("失败", err.message || "");
          }
        },
      },
    ]);
  }, []);

  const handleShowCredential = useCallback(async (item: AdminAddress) => {
    try {
      const cred = await adminShowAddressCredential(item.id);
      setShowCred({
        address: item.name,
        jwt: cred.jwt,
        password: cred.password,
      });
    } catch (err: any) {
      Alert.alert("获取凭证失败", err.message || "");
    }
  }, []);

  const handleGroupAddress = useCallback((item: AdminAddress) => {
    setGroupingAddress(item);
  }, []);

  const previewAddress = useMemo(() => {
    const name = buildMailboxName(newName.trim() || "name", customPrefix);
    const base = useSubdomain && subdomainPrefix.trim()
      ? `${subdomainPrefix.trim()}.${selectedDomain || "domain.com"}`
      : selectedDomain || "domain.com";
    return `${name}@${base}`;
  }, [customPrefix, newName, selectedDomain, subdomainPrefix, useSubdomain]);

  const currentDomainSupportsRandom =
    !!selectedDomain && randomSubdomainDomains.includes(selectedDomain);

  const handleCreate = useCallback(async () => {
    if (!newName.trim() || !selectedDomain) return;

    setIsCreating(true);
    try {
      const mailboxName = buildMailboxName(newName.trim(), customPrefix);
      const domain =
        useSubdomain && subdomainPrefix.trim()
          ? `${subdomainPrefix.trim()}.${selectedDomain}`
          : selectedDomain;

      const result = await createAddress({
        name: mailboxName,
        domain,
        enablePrefix: false,
        enableRandomSubdomain: useRandomSubdomain && currentDomainSupportsRandom,
      });
      setShowCreateModal(false);
      setNewName("");
      setCustomPrefix("");
      setSubdomainPrefix("");
      setUseSubdomain(false);
      setUseRandomSubdomain(false);
      setShowCred({
        address: result.address,
        jwt: result.jwt,
        password: result.password,
      });
      onMiniToast("已创建邮箱");
      await load(0, query, { refresh: true });
    } catch (err: any) {
      Alert.alert("创建失败", err.message || "");
    } finally {
      setIsCreating(false);
    }
  }, [
    customPrefix,
    currentDomainSupportsRandom,
    load,
    newName,
    onMiniToast,
    query,
    selectedDomain,
    subdomainPrefix,
    useRandomSubdomain,
    useSubdomain,
  ]);

  const handleOpenAddress = useCallback(
    (item: AdminAddress) => {
      router.push({
        pathname: "/admin-address-detail" as any,
        params: {
          addressId: item.id.toString(),
          addressName: item.name,
        } as any,
      });
    },
    [router]
  );

  const handleCopySecret = useCallback(async (label: string, value: string) => {
    const ok = await copyTextToClipboard(value);
    if (ok) {
      onMiniToast(`${label}已复制`);
    } else {
      Alert.alert("复制失败", value);
    }
  }, [onMiniToast]);

  const handleCreateGroup = useCallback(
    async (
      params: { name: string; color: AddressGroupColor },
      options?: { assignAddress?: string }
    ) => {
      const group = await createAddressGroup(groupScope, params);
      if (options?.assignAddress) {
        await addAddressToGroup(groupScope, options.assignAddress, group.id);
      }
      await loadGroupsState();
      onMiniToast(options?.assignAddress ? "已创建分组并加入" : "已创建分组");
    },
    [groupScope, loadGroupsState, onMiniToast]
  );

  const handleDeleteGroup = useCallback(
    async (group: AddressGroup) => {
      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          "删除分组",
          `删除后不会删除邮箱，只会移除“${group.name}”分组关系。`,
          [
            { text: "取消", style: "cancel", onPress: () => resolve(false) },
            {
              text: "删除",
              style: "destructive",
              onPress: () => resolve(true),
            },
          ]
        );
      });
      if (!confirmed) return;

      await deleteAddressGroup(groupScope, group.id);
      await loadGroupsState();
      onMiniToast("已删除分组");
    },
    [groupScope, loadGroupsState, onMiniToast]
  );

  const handleToggleAddressGroup = useCallback(
    async (address: string, group: AddressGroup, nextSelected: boolean) => {
      if (nextSelected) {
        await addAddressToGroup(groupScope, address, group.id);
      } else {
        await removeAddressFromGroup(groupScope, address, group.id);
      }
      await loadGroupsState();
      onMiniToast(nextSelected ? "已加入分组" : "已移出分组");
    },
    [groupScope, loadGroupsState, onMiniToast]
  );

  const selectedGroupingAddressIds = groupingAddress
    ? groupMemberships[normalizeGroupAddress(groupingAddress.name)] || []
    : [];

  const handleBindAddress = useCallback(async () => {
    setIsBinding(true);
    try {
      if (bindMode === "credential") {
        if (!credentialInput.trim()) {
          Alert.alert("提示", "请输入邮箱凭证");
          return;
        }
        await importByCredential(credentialInput.trim());
      } else {
        if (!bindEmail.trim() || !bindPassword.trim()) {
          Alert.alert("提示", "请输入邮箱和密码");
          return;
        }
        await importByPassword(bindEmail.trim(), bindPassword);
      }
      setShowBindModal(false);
      setCredentialInput("");
      setBindEmail("");
      setBindPassword("");
      onMiniToast("已绑定地址");
      await load(0, query, { refresh: true });
    } catch (err: any) {
      Alert.alert("绑定失败", err.message || "");
    } finally {
      setIsBinding(false);
    }
  }, [
    bindEmail,
    bindMode,
    bindPassword,
    credentialInput,
    importByCredential,
    importByPassword,
    load,
    onMiniToast,
    query,
  ]);

  const renderAddressItem = useCallback(
    ({ item }: { item: AddressListItemData }) => (
      <AddressListItem
        item={item}
        colors={colors}
        query={query}
        highlightStyle={highlightStyle}
        onOpen={handleOpenAddress}
        onGroup={handleGroupAddress}
        onShowCredential={handleShowCredential}
        onClearInbox={handleClearInbox}
        onDelete={handleDelete}
      />
    ),
    [
      colors,
      handleClearInbox,
      handleDelete,
      handleGroupAddress,
      handleOpenAddress,
      handleShowCredential,
      highlightStyle,
      query,
    ]
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.addressToolbar, { borderBottomColor: colors.border }]}>
        <View
          style={[
            styles.searchFieldCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <IconSymbol name="magnifyingglass" size={16} color={colors.muted} />
            <TextInput
              style={[styles.searchFieldInput, { color: colors.foreground }]}
              value={query}
              onChangeText={setQuery}
              placeholder="搜地址/域名/ID"
              placeholderTextColor={colors.muted}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            autoCapitalize="none"
          />
        </View>
        <SwipeSuspendView>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.groupFilterRow}
          >
            <Pressable
              hitSlop={COMPACT_HIT_SLOP}
              onPress={() => setGroupFilter("all")}
              style={({ pressed }) => [
                styles.groupFilterChip,
                {
                  backgroundColor:
                    groupFilter === "all" ? `${colors.primary}14` : colors.surface,
                  borderColor:
                    groupFilter === "all" ? `${colors.primary}30` : colors.border,
                  opacity: pressed ? 0.78 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.groupFilterChipText,
                  { color: groupFilter === "all" ? colors.primary : colors.muted },
                ]}
              >
                全部
              </Text>
            </Pressable>
            <Pressable
              hitSlop={COMPACT_HIT_SLOP}
              onPress={() => setGroupFilter("ungrouped")}
              style={({ pressed }) => [
                styles.groupFilterChip,
                {
                  backgroundColor:
                    groupFilter === "ungrouped" ? `${colors.primary}14` : colors.surface,
                  borderColor:
                    groupFilter === "ungrouped" ? `${colors.primary}30` : colors.border,
                  opacity: pressed ? 0.78 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.groupFilterChipText,
                  {
                    color:
                      groupFilter === "ungrouped" ? colors.primary : colors.muted,
                  },
                ]}
              >
                未分组
              </Text>
            </Pressable>
            {addressGroups.map((group) => (
              <Pressable
                key={group.id}
                hitSlop={COMPACT_HIT_SLOP}
                onPress={() => setGroupFilter(group.id)}
                style={({ pressed }) => [
                  styles.groupFilterChip,
                  {
                    backgroundColor:
                      groupFilter === group.id ? `${colors.primary}14` : colors.surface,
                    borderColor:
                      groupFilter === group.id ? `${colors.primary}30` : colors.border,
                    opacity: pressed ? 0.78 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.groupFilterChipText,
                    {
                      color:
                        groupFilter === group.id ? colors.primary : colors.muted,
                    },
                  ]}
                >
                  {group.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </SwipeSuspendView>
        <View style={styles.addressToolbarFooter}>
          <View style={styles.addressToolbarCopy}>
            <View style={styles.addressToolbarInlineRow}>
              <Text numberOfLines={1} style={styles.addressToolbarStatusLine}>
                <Text style={{ color: colors.primary }}>地址列表</Text>
                <Text style={{ color: colors.border }}> · </Text>
                <Text style={{ color: colors.muted }}>
                  {query.trim()
                    ? `当前显示 ${filteredData.length} / 总计 ${count}`
                    : groupFilter === "ungrouped"
                      ? `未分组 ${filteredData.length} 个`
                      : groupFilter !== "all"
                        ? `当前分组 ${filteredData.length} 个`
                        : `共 ${count} 个地址`}
                </Text>
              </Text>
              {isSyncing ? <InlineSyncBadge colors={colors} compact /> : null}
            </View>
          </View>
          <View style={styles.addressToolbarActions}>
            <Pressable
              hitSlop={COMPACT_HIT_SLOP}
              onPress={() => setShowGroupManager(true)}
              style={({ pressed }) => [
                styles.ghostActionButton,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={[styles.ghostActionText, { color: colors.foreground }]}>
                分组
              </Text>
            </Pressable>
            <Pressable
              hitSlop={COMPACT_HIT_SLOP}
              onPress={() => setShowBindModal(true)}
              style={({ pressed }) => [
                styles.ghostActionButton,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={[styles.ghostActionText, { color: colors.foreground }]}>
                绑定地址
              </Text>
            </Pressable>
            <Pressable
              hitSlop={COMPACT_HIT_SLOP}
              onPress={() => {
                loadSettings();
                setShowCreateModal(true);
              }}
              style={({ pressed }) => [
                styles.primaryActionButton,
                { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={styles.primaryActionText}>创建邮箱</Text>
            </Pressable>
            {query.trim() ? (
              <Pressable
                hitSlop={COMPACT_HIT_SLOP}
                onPress={handleResetSearch}
                style={({ pressed }) => [
                  styles.ghostActionButton,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={[styles.ghostActionText, { color: colors.muted }]}>
                  清空
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              hitSlop={COMPACT_HIT_SLOP}
              onPress={handleSearch}
              style={({ pressed }) => [
                styles.primaryActionButton,
                { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={styles.primaryActionText}>搜索</Text>
            </Pressable>
          </View>
        </View>
      </View>
      {isLoading && data.length === 0 ? (
        <View style={styles.addressLoadingWrap}>
          <PanelStateCard
            colors={colors}
            loading
            icon="arrow.clockwise"
            title="正在获取地址"
            subtitle="把最近活跃的地址和凭证信息整理成更易读的列表。"
          />
        </View>
      ) : error && data.length === 0 ? (
        <View style={styles.addressLoadingWrap}>
          <PanelStateCard
            colors={colors}
            icon="exclamationmark.circle.fill"
            title="地址列表加载失败"
            subtitle={error}
            actionLabel="重新加载"
            onAction={() => load(0)}
            accentColor={colors.error}
          />
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => String(item.id)}
          removeClippedSubviews
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          updateCellsBatchingPeriod={24}
          windowSize={5}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.addressListContent,
            filteredData.length === 0 && styles.addressListEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                void load(0, query, { refresh: true });
              }}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          onEndReached={() => {
            if (offset < count && !isLoading) {
              void load(offset);
            }
          }}
          onEndReachedThreshold={0.5}
          ItemSeparatorComponent={AddressItemSeparator}
          ListEmptyComponent={
            !isLoading && hasLoadedOnce ? (
              <PanelStateCard
                colors={colors}
                icon={query.trim() ? "magnifyingglass" : "at"}
                title={query.trim() ? "没有找到匹配地址" : "还没有地址"}
                subtitle={
                  query.trim()
                    ? "换个关键词试试，或者清空搜索查看全部地址。"
                    : "创建或导入地址后，这里会显示完整列表。"
                }
                actionLabel={query.trim() ? "清空搜索" : undefined}
                onAction={query.trim() ? handleResetSearch : undefined}
              />
            ) : (
              <PanelStateCard
                colors={colors}
                loading
                icon="arrow.clockwise"
                title="正在准备地址"
                subtitle="地址列表正在后台预热。"
              />
            )
          }
          ListFooterComponent={
            isLoading ? (
              <ActivityIndicator style={{ marginVertical: 20 }} color={colors.primary} />
            ) : null
          }
          renderItem={renderAddressItem}
        />
      )}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.sheetContent, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderText}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  创建邮箱
                </Text>
                <Text style={[styles.sheetSubtitle, { color: colors.muted }]}>
                  管理员可直接创建邮箱、子域名邮箱和随机子域名邮箱
                </Text>
              </View>
              <Pressable onPress={() => setShowCreateModal(false)}>
                <IconSymbol name="xmark.circle.fill" size={26} color={colors.muted} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.sheetBody}
              contentContainerStyle={styles.sheetBodyContent}
              keyboardShouldPersistTaps="handled"
            >
              {domains.length === 0 ? (
                <View
                  style={[
                    styles.inlineNoticeCard,
                    {
                      backgroundColor: `${colors.warning}10`,
                      borderColor: `${colors.warning}22`,
                    },
                  ]}
                >
                  <IconSymbol name="exclamationmark.circle.fill" size={16} color={colors.warning} />
                  <Text style={[styles.inlineNoticeText, { color: colors.foreground }]}>
                    未获取到可用域名，请先检查服务器配置。
                  </Text>
                </View>
              ) : (
                <>
                  <FieldLabel text="邮箱名称" colors={colors} />
                  <TextInput
                    style={[
                      styles.formInput,
                      {
                        color: colors.foreground,
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="输入邮箱名称"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  <FieldLabel text="选择域名" colors={colors} />
                  <Pressable
                    onPress={() => setShowDomainPicker(!showDomainPicker)}
                    style={[
                      styles.domainSelector,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.domainText, { color: colors.foreground }]}>
                      @{selectedDomain || "选择域名"}
                    </Text>
                    <IconSymbol name="chevron.right" size={18} color={colors.muted} />
                  </Pressable>

                  {showDomainPicker ? (
                    <View
                      style={[
                        styles.domainList,
                        { backgroundColor: colors.surface, borderColor: colors.border },
                      ]}
                    >
                      <ScrollView style={styles.domainScroll} nestedScrollEnabled>
                        {domainItems.map((item) => (
                          <Pressable
                            key={item.value}
                            onPress={() => {
                              setSelectedDomain(item.value);
                              setShowDomainPicker(false);
                            }}
                            style={({ pressed }) => [
                              styles.domainOption,
                              {
                                backgroundColor:
                                  item.value === selectedDomain
                                    ? `${colors.primary}15`
                                    : "transparent",
                                opacity: pressed ? 0.7 : 1,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.domainOptionText,
                                {
                                  color:
                                    item.value === selectedDomain
                                      ? colors.primary
                                      : colors.foreground,
                                },
                              ]}
                            >
                              @{item.label}
                            </Text>
                            {item.supportsRandom ? (
                              <View style={[styles.badge, { backgroundColor: `${colors.success}20` }]}>
                                <Text style={[styles.badgeText, { color: colors.success }]}>
                                  随机子域名
                                </Text>
                              </View>
                            ) : null}
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}

                  <View style={[styles.optionRow, { borderColor: colors.border }]}>
                    <View style={styles.optionInfo}>
                      <Text style={[styles.optionLabel, { color: colors.foreground }]}>
                        自定义子域名
                      </Text>
                      <Text style={[styles.optionDesc, { color: colors.muted }]}>
                        在域名前添加自定义前缀
                      </Text>
                    </View>
                    <Switch
                      value={useSubdomain}
                      onValueChange={(v) => {
                        setUseSubdomain(v);
                        if (v) setUseRandomSubdomain(false);
                      }}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  {useSubdomain ? (
                    <TextInput
                      style={[
                        styles.formInput,
                        {
                          color: colors.foreground,
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                      value={subdomainPrefix}
                      onChangeText={setSubdomainPrefix}
                      placeholder="子域名前缀，如 team"
                      placeholderTextColor={colors.muted}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  ) : null}

                  {currentDomainSupportsRandom ? (
                    <View style={[styles.optionRow, { borderColor: colors.border }]}>
                      <View style={styles.optionInfo}>
                        <Text style={[styles.optionLabel, { color: colors.foreground }]}>
                          随机子域名
                        </Text>
                        <Text style={[styles.optionDesc, { color: colors.muted }]}>
                          自动挂在随机子域名下
                        </Text>
                      </View>
                      <Switch
                        value={useRandomSubdomain}
                        onValueChange={(v) => {
                          setUseRandomSubdomain(v);
                          if (v) setUseSubdomain(false);
                        }}
                        trackColor={{ false: colors.border, true: colors.primary }}
                        thumbColor="#FFFFFF"
                      />
                    </View>
                  ) : null}

                  <View style={styles.optionInfo}>
                    <Text style={[styles.optionLabel, { color: colors.foreground }]}>
                      自定义前缀
                    </Text>
                    <Text style={[styles.optionDesc, { color: colors.muted }]}>
                      可选，创建为 {normalizeMailboxPrefix(customPrefix) || "prefix"}.name@domain
                    </Text>
                  </View>
                  <TextInput
                    style={[
                      styles.formInput,
                      {
                        color: colors.foreground,
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    value={customPrefix}
                    onChangeText={setCustomPrefix}
                    placeholder="邮箱名前缀，如 vip"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  <View
                    style={[
                      styles.previewBox,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.previewLabel, { color: colors.muted }]}>
                      预览地址
                    </Text>
                    <Text style={[styles.previewAddress, { color: colors.primary }]}>
                      {previewAddress}
                    </Text>
                  </View>

                  <Pressable
                    onPress={handleCreate}
                    disabled={isCreating || !newName.trim() || !selectedDomain}
                    style={({ pressed }) => [
                      styles.createButton,
                      {
                        backgroundColor:
                          isCreating || !newName.trim() ? colors.muted : colors.primary,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    {isCreating ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.createButtonText}>创建邮箱</Text>
                    )}
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal
        visible={showBindModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBindModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.sheetContent, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderText}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  绑定地址
                </Text>
                <Text style={[styles.sheetSubtitle, { color: colors.muted }]}>
                  把已有邮箱地址导入到当前管理员软件中
                </Text>
              </View>
              <Pressable onPress={() => setShowBindModal(false)}>
                <IconSymbol name="xmark.circle.fill" size={26} color={colors.muted} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.sheetBody}
              contentContainerStyle={styles.sheetBodyContent}
              keyboardShouldPersistTaps="handled"
            >
              <View
                style={[
                  styles.segmentTrack,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                {(["credential", "password"] as const).map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => setBindMode(item)}
                    style={[
                      styles.segmentItem,
                      styles.segmentItemEqual,
                      {
                        backgroundColor:
                          bindMode === item ? colors.primary : "transparent",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        {
                          color:
                            bindMode === item ? "#FFFFFF" : colors.foreground,
                        },
                      ]}
                    >
                      {item === "credential" ? "凭证绑定" : "密码绑定"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {bindMode === "credential" ? (
                <>
                  <FieldLabel text="邮箱凭证 (JWT)" colors={colors} />
                  <TextInput
                    style={[
                      styles.formInput,
                      styles.formTextArea,
                      {
                        color: colors.foreground,
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                        minHeight: 120,
                      },
                    ]}
                    value={credentialInput}
                    onChangeText={setCredentialInput}
                    placeholder="粘贴邮箱凭证"
                    placeholderTextColor={colors.muted}
                    multiline
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </>
              ) : (
                <>
                  <FieldLabel text="邮箱地址" colors={colors} />
                  <TextInput
                    style={[
                      styles.formInput,
                      {
                        color: colors.foreground,
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    value={bindEmail}
                    onChangeText={setBindEmail}
                    placeholder="name@example.com"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  <FieldLabel text="邮箱密码" colors={colors} />
                  <TextInput
                    style={[
                      styles.formInput,
                      {
                        color: colors.foreground,
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    value={bindPassword}
                    onChangeText={setBindPassword}
                    placeholder="输入邮箱密码"
                    placeholderTextColor={colors.muted}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </>
              )}

              <Pressable
                onPress={handleBindAddress}
                disabled={isBinding}
                style={({ pressed }) => [
                  styles.createButton,
                  {
                    backgroundColor: colors.primary,
                    opacity: pressed || isBinding ? 0.8 : 1,
                  },
                ]}
              >
                {isBinding ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.createButtonText}>立即绑定</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal
        visible={!!showCred}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCred(null)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[styles.sheetContent, { backgroundColor: colors.background }]}
          >
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderText}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  地址凭证
                </Text>
                <Text style={[styles.sheetSubtitle, { color: colors.muted }]}>
                  {showCred?.address}
                </Text>
              </View>
              <Pressable onPress={() => setShowCred(null)}>
                <IconSymbol name="xmark.circle.fill" size={26} color={colors.muted} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.sheetBody}
              contentContainerStyle={styles.sheetBodyContent}
              keyboardShouldPersistTaps="handled"
            >
              <View
                style={[
                  styles.inlineNoticeCard,
                  {
                    backgroundColor: `${colors.warning}10`,
                    borderColor: `${colors.warning}22`,
                  },
                ]}
              >
                <IconSymbol
                  name="exclamationmark.circle.fill"
                  size={16}
                  color={colors.warning}
                />
                <Text style={[styles.inlineNoticeText, { color: colors.foreground }]}>
                  仅在备份、迁移设备或人工排查时查看这些信息，避免在公共环境展示。
                </Text>
              </View>

              {showCred?.jwt ? (
                <AddressCredentialField
                  label="地址凭证 (JWT)"
                  value={showCred.jwt}
                  colors={colors}
                  onCopy={() => handleCopySecret("JWT", showCred.jwt!)}
                  multiline
                />
              ) : null}
              {showCred?.password ? (
                <AddressCredentialField
                  label="地址密码"
                  value={showCred.password}
                  colors={colors}
                  onCopy={() => handleCopySecret("密码", showCred.password!)}
                />
              ) : null}

              <Pressable
                onPress={() => setShowCred(null)}
                style={({ pressed }) => [
                  styles.modalCloseBtn,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Text style={{ color: "#FFF", fontWeight: "600" }}>完成</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
      <AddressGroupManagerSheet
        visible={showGroupManager}
        colors={colors}
        groups={addressGroups}
        groupCounts={groupCounts}
        onClose={() => setShowGroupManager(false)}
        onCreate={handleCreateGroup}
        onDelete={handleDeleteGroup}
      />
      <AddressGroupAssignmentSheet
        visible={!!groupingAddress}
        colors={colors}
        address={groupingAddress?.name || ""}
        groups={addressGroups}
        selectedGroupIds={selectedGroupingAddressIds}
        onClose={() => setGroupingAddress(null)}
        onToggle={(group, nextSelected) =>
          groupingAddress
            ? handleToggleAddressGroup(groupingAddress.name, group, nextSelected)
            : Promise.resolve()
        }
        onCreateGroup={(params) =>
          groupingAddress
            ? handleCreateGroup(params, { assignAddress: groupingAddress.name })
            : Promise.resolve()
        }
      />
    </View>
  );
}

// ─── Mails Panel (inbox / sendbox / unknown) ──────────────────
function MailsPanel({
  colors,
  kind,
  onMiniToast,
  isActive,
  shouldWarm,
}: {
  colors: ReturnType<typeof useColors>;
  kind: "inbox" | "sendbox" | "unknown";
  onMiniToast: (message: string) => void;
  isActive: boolean;
  shouldWarm: boolean;
}) {
  const router = useRouter();
  const { state: mailState } = useMail();
  const [data, setData] = useState<ParsedMail[]>([]);
  const [count, setCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [mailGroupFilter, setMailGroupFilter] = useState<"all" | "ungrouped" | string>("all");
  const [showMailGroupFilterMenu, setShowMailGroupFilterMenu] = useState(false);
  const [mailFilterMenuFrame, setMailFilterMenuFrame] = useState<MailFilterMenuFrame | null>(null);
  const [mailGroups, setMailGroups] = useState<AddressGroup[]>([]);
  const [mailGroupLookup, setMailGroupLookup] = useState<Map<string, AddressGroup[]>>(new Map());
  const [creatingAddress, setCreatingAddress] = useState<string | null>(null);
  const [createdUnknownAddresses, setCreatedUnknownAddresses] = useState<Record<string, true>>({});
  const [unreadMailKeys, setUnreadMailKeys] = useState<Set<string>>(new Set());
  const [address, setAddress] = useState("");
  const deferredAddress = useDeferredValue(address);
  const dataRef = useRef<ParsedMail[]>([]);
  const countRef = useRef(0);
  const offsetRef = useRef(0);
  const queryRef = useRef(normalizeAdminMailQuery(""));
  const addressRef = useRef("");
  const liveSearchReadyRef = useRef(false);
  const requestIdRef = useRef(0);
  const hasActivatedRef = useRef(false);
  const activationRefreshAtRef = useRef(0);
  const mailPanelRootRef = useRef<React.ElementRef<typeof View>>(null);
  const mailFilterTriggerRef = useRef<React.ElementRef<typeof View>>(null);
  const groupScope = mailState.workerUrl;
  const readStateScope = mailState.workerUrl;
  const supportsMailGroupFilter = kind === "inbox";
  const shouldLoadMailGroups = supportsMailGroupFilter;
  const readStateViewKey = useMemo(() => `admin:${kind}`, [kind]);
  const highlightStyle = useMemo(
    () => ({
      backgroundColor: `${colors.primary}26`,
      color: colors.foreground,
      fontWeight: "700" as const,
    }),
    [colors.foreground, colors.primary]
  );
  const mailSearchIndex = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of data) {
      map.set(`${item.mailboxKind || "mail"}:${item.id}`, buildMailSearchBlob(item));
    }
    return map;
  }, [data]);
  const mailGroupFilterLabel = useMemo(
    () => getGroupFilterLabel(mailGroupFilter, mailGroups),
    [mailGroupFilter, mailGroups]
  );
  const groupFilteredData = useMemo(() => {
    if (!supportsMailGroupFilter || mailGroupFilter === "all") return data;

    return data.filter((item) => {
      const targetAddress = getManagedAddressForMail(item, kind);
      const groups = getAddressGroupsForAddress(mailGroupLookup, targetAddress);
      if (mailGroupFilter === "ungrouped") {
        return groups.length === 0;
      }
      return groups.some((group) => group.id === mailGroupFilter);
    });
  }, [data, kind, mailGroupFilter, mailGroupLookup, supportsMailGroupFilter]);
  const visibleData = useMemo(
    () => filterAdminMailsIndexed(groupFilteredData, deferredAddress, mailSearchIndex),
    [groupFilteredData, deferredAddress, mailSearchIndex]
  );

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    addressRef.current = address;
  }, [address]);

  useEffect(() => {
    countRef.current = count;
  }, [count]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    if (kind === "sendbox" || !readStateScope.trim()) {
      setUnreadMailKeys(new Set());
      return;
    }

    let isMounted = true;
    const refresh = async () => {
      const nextUnreadKeys = await loadAdminMailUnreadKeySet(readStateScope);
      if (isMounted) {
        setUnreadMailKeys(nextUnreadKeys);
      }
    };

    void refresh();
    const unsubscribe = subscribeAdminMailReadState((event) => {
      if (event.workerUrl !== readStateScope) return;
      setUnreadMailKeys(new Set(event.unreadKeys));
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [kind, readStateScope]);

  const loadMailGroupsState = useCallback(async () => {
    const next = await getAddressGroupsLookup(groupScope);
    setMailGroups(next.groups);
    setMailGroupLookup(next.lookup);
  }, [groupScope]);

  useEffect(() => {
    if (!isActive || !shouldLoadMailGroups) return;
    void loadMailGroupsState();
  }, [isActive, loadMailGroupsState, shouldLoadMailGroups]);

  useEffect(() => {
    if (!supportsMailGroupFilter) return;
    if (mailGroupFilter === "all" || mailGroupFilter === "ungrouped") return;
    if (!mailGroups.some((group) => group.id === mailGroupFilter)) {
      setMailGroupFilter("all");
    }
  }, [mailGroupFilter, mailGroups, supportsMailGroupFilter]);

  useEffect(() => {
    setCreatedUnknownAddresses({});
  }, [groupScope, kind]);

  useEffect(() => {
    if (!supportsMailGroupFilter || !isActive) {
      setShowMailGroupFilterMenu(false);
      setMailFilterMenuFrame(null);
    }
  }, [isActive, supportsMailGroupFilter]);

  const commitPanelState = useCallback(
    (
      nextData: ParsedMail[],
      nextCount: number,
      nextOffset: number,
      queryToken: string,
      options?: { defer?: boolean }
    ) => {
      dataRef.current = nextData;
      countRef.current = nextCount;
      offsetRef.current = nextOffset;
      queryRef.current = queryToken;
      adminMailPanelCache.set(buildAdminMailCacheKey(kind, queryToken), {
        count: nextCount,
        data: nextData,
        offset: nextOffset,
        fetchedAt: Date.now(),
      });
      const applyState = () => {
        setData(nextData);
        setCount(nextCount);
        setOffset(nextOffset);
        setHasLoadedOnce(true);
      };
      if (options?.defer) {
        startTransition(applyState);
      } else {
        applyState();
      }
    },
    [kind]
  );

  const clearKindCaches = useCallback(() => {
    for (const key of adminMailPanelCache.keys()) {
      if (key.startsWith(`${kind}:`)) {
        adminMailPanelCache.delete(key);
      }
    }
    adminMailSearchDatasetCache.delete(kind);
  }, [kind]);

  const hydrateCachedPanel = useCallback(
    (addr: string = address) => {
      const queryToken = normalizeAdminMailQuery(addr);
      const cached = adminMailPanelCache.get(
        buildAdminMailCacheKey(kind, queryToken)
      );
      if (!cached) return false;
      commitPanelState(cached.data, cached.count, cached.offset, queryToken);
      return true;
    },
    [address, commitPanelState, kind]
  );

  const load = useCallback(
    async (
      freshOffset: number = 0,
      addr: string = address,
      options?: { silent?: boolean; background?: boolean }
    ) => {
      const silent = !!options?.silent;
      const background = !!options?.background;
      const requestId = ++requestIdRef.current;
      const queryToken = normalizeAdminMailQuery(addr);
      if (background && dataRef.current.length > 0) {
        setIsSyncing(true);
      } else if (!silent) {
        setIsLoading(true);
      }
      try {
        const params = {
          limit: PAGE_SIZE,
          offset: freshOffset,
          address: kind === "unknown" ? undefined : addr || undefined,
        };
        const page =
          kind === "inbox"
            ? await fetchAdminMails(params)
            : kind === "sendbox"
            ? await fetchAdminSendbox(params)
            : await fetchAdminUnknownMails({
                limit: PAGE_SIZE,
                offset: freshOffset,
              });
        const parsed = await parseAdminMailRowsCached(kind, page.results);
        if (requestId !== requestIdRef.current) return;
        const isSameQuery = queryToken === queryRef.current;
        const nextData =
          freshOffset === 0
            ? isSameQuery && dataRef.current.length > 0
              ? mergeMailLists(dataRef.current, parsed)
              : parsed
            : mergeMailLists(dataRef.current, parsed);
        const nextOffset =
          freshOffset === 0
            ? isSameQuery
              ? Math.max(offsetRef.current, page.results.length)
              : page.results.length
            : freshOffset + page.results.length;

        if (kind !== "sendbox" && readStateScope.trim()) {
          const nextUnreadKeys = await reconcileAdminMailReadState({
            workerUrl: readStateScope,
            viewKey: readStateViewKey,
            mails: nextData,
            allowMarkUnread: freshOffset === 0,
          });
          if (requestId !== requestIdRef.current) return;
          setUnreadMailKeys(nextUnreadKeys);
        }

        commitPanelState(nextData, page.count, nextOffset, queryToken, {
          defer: background || silent,
        });
      } catch (err: any) {
        if (requestId === requestIdRef.current && !silent) {
          Alert.alert("加载失败", err.message || "");
        }
      } finally {
        if (requestId === requestIdRef.current && background) {
          setIsSyncing(false);
        }
        if (requestId === requestIdRef.current && !silent) {
          setIsLoading(false);
        }
      }
    },
    [address, commitPanelState, kind, readStateScope, readStateViewKey]
  );

  const loadSearchDataset = useCallback(
    async (refresh: boolean = false, options?: { silent?: boolean; background?: boolean }) => {
      const silent = !!options?.silent;
      const background = !!options?.background;
      const requestId = ++requestIdRef.current;
      if (background && dataRef.current.length > 0) {
        setIsSyncing(true);
      } else if (!silent) {
        setIsLoading(true);
      }
      try {
        const cached = adminMailSearchDatasetCache.get(kind);
        if (
          !refresh &&
          cached &&
          Date.now() - cached.fetchedAt < SEARCH_DATASET_TTL
        ) {
          commitPanelState(cached.data, cached.count, cached.data.length, "__search__", {
            defer: background || silent,
          });
          return;
        }

        const mergedMap = new Map<number, ParsedMail>();
        let nextOffset = 0;
        let totalCount = 0;

        while (true) {
          const page =
            kind === "inbox"
              ? await fetchAdminMails({ limit: FULL_SEARCH_PAGE_SIZE, offset: nextOffset })
              : kind === "sendbox"
                ? await fetchAdminSendbox({
                    limit: FULL_SEARCH_PAGE_SIZE,
                    offset: nextOffset,
                  })
                : await fetchAdminUnknownMails({
                    limit: FULL_SEARCH_PAGE_SIZE,
                    offset: nextOffset,
                  });

          const parsed = await parseAdminMailRowsCached(kind, page.results);
          if (requestId !== requestIdRef.current) return;

          for (const mail of parsed) {
            mergedMap.set(mail.id, mail);
          }
          totalCount = page.count;
          nextOffset += page.results.length;

          if (page.results.length === 0 || nextOffset >= page.count) {
            break;
          }
        }

        const mergedData = sortMailsDesc(Array.from(mergedMap.values()));
        if (kind !== "sendbox" && readStateScope.trim()) {
          const nextUnreadKeys = await reconcileAdminMailReadState({
            workerUrl: readStateScope,
            viewKey: readStateViewKey,
            mails: mergedData,
            allowMarkUnread: true,
          });
          if (requestId !== requestIdRef.current) return;
          setUnreadMailKeys(nextUnreadKeys);
        }

        adminMailSearchDatasetCache.set(kind, {
          count: totalCount,
          data: mergedData,
          fetchedAt: Date.now(),
        });
        commitPanelState(mergedData, totalCount, mergedData.length, "__search__", {
          defer: background || silent,
        });
      } catch (err: any) {
        if (requestId === requestIdRef.current && !silent) {
          Alert.alert("搜索失败", err.message || "");
        }
      } finally {
        if (requestId === requestIdRef.current && background) {
          setIsSyncing(false);
        }
        if (requestId === requestIdRef.current && !silent) {
          setIsLoading(false);
        }
      }
    },
    [commitPanelState, kind, readStateScope, readStateViewKey]
  );

  useEffect(() => {
    if (!shouldWarm) return;

    const trimmed = address.trim();
    const hydrated = !trimmed ? hydrateCachedPanel() : false;
    const panelCache = !trimmed
      ? adminMailPanelCache.get(buildAdminMailCacheKey(kind, ""))
      : undefined;
    const shouldRefresh =
      trimmed ||
      !panelCache ||
      Date.now() - panelCache.fetchedAt > ADMIN_PANEL_STALE_TTL;

    if (!hasActivatedRef.current) {
      hasActivatedRef.current = true;
      activationRefreshAtRef.current = Date.now();
      if (trimmed) {
        void loadSearchDataset(
          false,
          isActive
            ? dataRef.current.length > 0
              ? { background: true }
              : undefined
            : { silent: true }
        );
      } else if (shouldRefresh) {
        void load(
          0,
          "",
          isActive
            ? hydrated
              ? { background: true }
              : undefined
            : { silent: true }
        );
      }
      return;
    }

    if (!isActive) return;

    if (trimmed) {
      void loadSearchDataset(false, { background: true });
    } else if (shouldRefresh) {
      void load(0, "", { background: true });
    }
  }, [address, hydrateCachedPanel, isActive, kind, load, loadSearchDataset, shouldWarm]);

  useEffect(() => {
    if (!isActive || !hasActivatedRef.current) return;
    const now = Date.now();
    if (now - activationRefreshAtRef.current < 1200) return;
    activationRefreshAtRef.current = now;

    if (addressRef.current.trim()) {
      void loadSearchDataset(false, dataRef.current.length > 0 ? { background: true } : undefined);
    } else {
      void load(0, "", dataRef.current.length > 0 ? { background: true } : undefined);
    }
  }, [isActive, load, loadSearchDataset]);

  useEffect(() => {
    if (!isActive) return;
    if (!liveSearchReadyRef.current) {
      liveSearchReadyRef.current = true;
      return;
    }
    const trimmed = address.trim();
    const timer = setTimeout(() => {
      if (trimmed) {
        const cached = adminMailSearchDatasetCache.get(kind);
        if (!cached || Date.now() - cached.fetchedAt > SEARCH_DATASET_TTL) {
          void loadSearchDataset(false, dataRef.current.length > 0 ? { background: true } : undefined);
        }
      }
    }, LIVE_SEARCH_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [address, isActive, kind, loadSearchDataset]);

  const closeMailFilterMenu = useCallback(() => {
    setShowMailGroupFilterMenu(false);
    setMailFilterMenuFrame(null);
  }, []);

  const toggleMailFilterMenu = useCallback(() => {
    if (!supportsMailGroupFilter) return;

    if (showMailGroupFilterMenu) {
      closeMailFilterMenu();
      return;
    }

    const rootNode = mailPanelRootRef.current;
    const triggerNode = mailFilterTriggerRef.current;

    if (!rootNode || !triggerNode) {
      setShowMailGroupFilterMenu(true);
      return;
    }

    rootNode.measureInWindow((rootX, rootY, rootWidth) => {
      triggerNode.measureInWindow((triggerX, triggerY, triggerWidth, triggerHeight) => {
        const maxWidth = Math.max(184, Math.min(rootWidth - 32, 240));
        const anchorLeft = triggerX - rootX;
        const anchorRight = anchorLeft + triggerWidth;
        const left = Math.max(
          16,
          Math.min(anchorRight - maxWidth, rootWidth - maxWidth - 16)
        );

        setMailFilterMenuFrame({
          top: triggerY - rootY + triggerHeight + 8,
          left,
          width: maxWidth,
        });
        setShowMailGroupFilterMenu(true);
      });
    });
  }, [closeMailFilterMenu, showMailGroupFilterMenu, supportsMailGroupFilter]);

  const handleRunSearch = useCallback(() => {
    closeMailFilterMenu();
    if (address.trim()) {
      void loadSearchDataset(
        true,
        dataRef.current.length > 0 ? { background: true } : undefined
      );
    } else {
      void load(0, "");
    }
  }, [address, closeMailFilterMenu, load, loadSearchDataset]);

  const handleClearSearch = useCallback(() => {
    closeMailFilterMenu();
    setAddress("");
    void load(0, "");
  }, [closeMailFilterMenu, load]);

  const markMailReadLocally = useCallback(
    (mail: ParsedMail) => {
      if (kind === "sendbox" || !readStateScope.trim()) return;
      const readKey = buildAdminMailReadKey(mail);
      setUnreadMailKeys((prev) => {
        if (!prev.has(readKey)) return prev;
        const next = new Set(prev);
        next.delete(readKey);
        return next;
      });
      void markAdminMailRead(readStateScope, mail);
    },
    [kind, readStateScope]
  );

  const handleOpenMail = useCallback(
    (mail: ParsedMail) => {
      markMailReadLocally(mail);
      const cacheKey = `${kind}-${mail.id}-${mail.ownerAddress || "global"}`;
      setAdminMailEntry(cacheKey, { mail, kind });
      router.push({
        pathname: "/admin-mail-detail",
        params: { cacheKey },
      });
    },
    [kind, markMailReadLocally, router]
  );

  const handleCopyCode = useCallback(async (mail: ParsedMail, code: string) => {
    const ok = await copyTextToClipboard(code);
    if (ok) {
      markMailReadLocally(mail);
      onMiniToast("验证码已复制");
    } else {
      Alert.alert("复制失败", code);
    }
  }, [markMailReadLocally, onMiniToast]);

  const handleDelete = useCallback((mail: ParsedMail) => {
    Alert.alert("删除邮件", mail.subject || "(无主题)", [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          try {
            if (kind === "sendbox") {
              await adminDeleteSentMail(mail.id);
            } else {
              await adminDeleteMail(mail.id);
            }
            markMailReadLocally(mail);
            clearKindCaches();
            const nextData = dataRef.current.filter((m) => m.id !== mail.id);
            commitPanelState(
              nextData,
              Math.max(0, countRef.current - 1),
              Math.min(offsetRef.current, Math.max(0, nextData.length)),
              queryRef.current
            );
          } catch (err: any) {
            Alert.alert("失败", err.message || "");
          }
        },
      },
    ]);
  }, [clearKindCaches, commitPanelState, kind, markMailReadLocally]);

  const markUnknownAddressCreated = useCallback((targetAddress: string) => {
    const normalized = normalizeGroupAddress(targetAddress);
    if (!normalized) return;
    setCreatedUnknownAddresses((prev) =>
      prev[normalized] ? prev : { ...prev, [normalized]: true }
    );
  }, []);

  const refreshAfterUnknownCreate = useCallback(async () => {
    adminAddressesPanelCache.clear();
    adminStatsPanelCache = null;
    clearKindCaches();
    if (address.trim()) {
      await loadSearchDataset(true, dataRef.current.length > 0 ? { background: true } : undefined);
    } else {
      await load(0, "", dataRef.current.length > 0 ? { background: true } : undefined);
    }
  }, [address, clearKindCaches, load, loadSearchDataset]);

  const handleCreateAddressFromUnknown = useCallback(
    async (mail: ParsedMail) => {
      const targetAddress = getManagedAddressForMail(mail, kind);
      const parsed = splitMailboxAddress(targetAddress);
      if (!parsed) {
        Alert.alert("无法创建", "没有从这封邮件里识别到可创建的收件地址。");
        return;
      }

      setCreatingAddress(targetAddress);
      try {
        await createAddress({
          name: parsed.name,
          domain: parsed.domain,
          enablePrefix: false,
          enableRandomSubdomain: false,
        });
        markUnknownAddressCreated(targetAddress);
        onMiniToast(`已创建 ${targetAddress}`);
        await refreshAfterUnknownCreate();
      } catch (err: any) {
        if (isAddressAlreadyExistsError(err)) {
          markUnknownAddressCreated(targetAddress);
          onMiniToast(`已创建 ${targetAddress}`);
          await refreshAfterUnknownCreate();
          return;
        }
        Alert.alert("创建失败", err.message || "");
      } finally {
        setCreatingAddress(null);
      }
    },
    [kind, markUnknownAddressCreated, onMiniToast, refreshAfterUnknownCreate]
  );

  const renderMailItem = useCallback(
    ({ item }: { item: ParsedMail }) => {
      const isUnread =
        kind !== "sendbox" && unreadMailKeys.has(buildAdminMailReadKey(item));

      return (
        <MailListItem
          item={item}
          kind={kind}
          colors={colors}
          searchQuery={deferredAddress}
          metaQuery={address}
          highlightStyle={highlightStyle}
          createdUnknownAddresses={createdUnknownAddresses}
          creatingAddress={creatingAddress}
          isUnread={isUnread}
          onOpen={handleOpenMail}
          onDelete={handleDelete}
          onCopyCode={handleCopyCode}
          onCreateAddressFromUnknown={handleCreateAddressFromUnknown}
        />
      );
    },
    [
      address,
      colors,
      createdUnknownAddresses,
      creatingAddress,
      deferredAddress,
      handleCopyCode,
      handleCreateAddressFromUnknown,
      handleDelete,
      handleOpenMail,
      highlightStyle,
      kind,
      unreadMailKeys,
    ]
  );

  const emptyConfig =
    kind === "sendbox"
      ? {
          icon: "paperplane.fill" as const,
          title: "暂无管理员发件",
          subtitle: "可以按地址过滤，或查看系统中所有发件记录。",
        }
      : kind === "unknown"
        ? {
            icon: "exclamationmark.bubble.fill" as const,
            title: "暂无未知收件",
            subtitle: "没有发现系统未创建地址的收件。",
          }
        : {
            icon: "tray.fill" as const,
            title: "暂无管理员收件",
            subtitle: "可以按地址过滤，查看系统中的所有收件邮件。",
          };
  const summaryText = address.trim()
    ? `匹配 ${visibleData.length} 封`
    : supportsMailGroupFilter && mailGroupFilter === "ungrouped"
      ? `未分组 ${visibleData.length} 封`
      : supportsMailGroupFilter && mailGroupFilter !== "all"
        ? `${mailGroupFilterLabel} ${visibleData.length} 封`
        : `共 ${count} 封`;

  return (
    <View ref={mailPanelRootRef} collapsable={false} style={{ flex: 1 }}>
      <View style={[styles.addressToolbar, { borderBottomColor: colors.border }]}>
        <View style={styles.mailToolbarTopRow}>
          <View
            style={[
              styles.searchFieldCard,
              styles.mailSearchCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <IconSymbol name="magnifyingglass" size={16} color={colors.muted} />
            <TextInput
              style={[
                styles.searchFieldInput,
                styles.mailSearchFieldInput,
                { color: colors.foreground },
              ]}
              value={address}
              onChangeText={setAddress}
              placeholder="搜主题/地址/验证码"
              placeholderTextColor={colors.muted}
              returnKeyType="search"
              autoCapitalize="none"
              onSubmitEditing={handleRunSearch}
              multiline={false}
              numberOfLines={1}
            />
            {address.trim() ? (
              <Pressable
                onPress={handleClearSearch}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.searchFieldClearButton,
                  { opacity: pressed ? 0.72 : 1 },
                ]}
              >
                <IconSymbol name="xmark.circle.fill" size={14} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>

          {supportsMailGroupFilter ? (
            <View ref={mailFilterTriggerRef} collapsable={false}>
              <Pressable
                hitSlop={COMPACT_HIT_SLOP}
                onPress={toggleMailFilterMenu}
                style={({ pressed }) => [
                  styles.mailQuickFilterButton,
                  {
                    backgroundColor:
                      mailGroupFilter === "all" ? colors.surface : `${colors.primary}12`,
                    borderColor:
                      mailGroupFilter === "all" ? colors.border : `${colors.primary}2A`,
                    opacity: pressed ? 0.78 : 1,
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.mailQuickFilterButtonText,
                    {
                      color: mailGroupFilter === "all" ? colors.muted : colors.primary,
                    },
                  ]}
                >
                  {mailGroupFilterLabel}
                </Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable
            hitSlop={COMPACT_HIT_SLOP}
            onPress={handleRunSearch}
            style={({ pressed }) => [
              styles.mailSearchIconButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <IconSymbol name="magnifyingglass" size={15} color="#FFFFFF" />
          </Pressable>
        </View>

        <MailPanelStatusBar
          colors={colors}
          title={kind === "sendbox" ? "发件箱" : kind === "unknown" ? "未知" : "收件箱"}
          summary={summaryText}
          isSyncing={isSyncing || isLoading}
        />
      </View>
      {supportsMailGroupFilter && showMailGroupFilterMenu ? (
        <View pointerEvents="box-none" style={styles.mailFilterLayer}>
          <Pressable style={styles.mailFilterBackdrop} onPress={closeMailFilterMenu} />
          <View
            style={[
              styles.mailFilterPopover,
              {
                top: mailFilterMenuFrame?.top ?? 0,
                left: mailFilterMenuFrame?.left ?? 16,
                width: mailFilterMenuFrame?.width ?? 220,
              },
            ]}
          >
            <AddressGroupInlineFilterMenu
              colors={colors}
              groups={mailGroups}
              selectedFilter={mailGroupFilter}
              onSelect={(nextFilter) => {
                setMailGroupFilter(nextFilter);
                closeMailFilterMenu();
              }}
            />
          </View>
        </View>
      ) : null}
      <FlatList
        data={visibleData}
        keyExtractor={(item) => `${kind}-${item.id}`}
        removeClippedSubviews
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        updateCellsBatchingPeriod={24}
        windowSize={5}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isLoading && data.length > 0}
              onRefresh={() => {
                if (address.trim()) {
                  void loadSearchDataset(
                    true,
                    dataRef.current.length > 0 ? { background: true } : undefined
                  );
                } else {
                  void load(0, "", { silent: false });
                }
              }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
          onEndReached={() => {
            if (!address.trim() && offset < count && !isLoading) {
              void load(offset, "");
            }
          }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isLoading && !address.trim() ? (
            <ActivityIndicator style={{ margin: 20 }} color={colors.primary} />
          ) : null
        }
        renderItem={renderMailItem}
        ListEmptyComponent={
          !isLoading && hasLoadedOnce ? (
            <View style={styles.centerAll}>
              <IconSymbol
                name={emptyConfig.icon}
                size={48}
                color={colors.muted}
              />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {emptyConfig.title}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                {emptyConfig.subtitle}
              </Text>
            </View>
          ) : (
            <View style={styles.centerAll}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                正在准备邮件
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                邮件列表正在后台预热。
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

// ─── Send As (admin) ──────────────────────────────────────────
type AdminPalette = ReturnType<typeof useColors>;
type AddressListItemData = AdminAddress & { groups?: AddressGroup[] };

const AddressItemSeparator = React.memo(function AddressItemSeparator() {
  return <View style={styles.addressItemSeparator} />;
});

const AddressListItem = React.memo(function AddressListItem({
  item,
  colors,
  query,
  highlightStyle,
  onOpen,
  onGroup,
  onShowCredential,
  onClearInbox,
  onDelete,
}: {
  item: AddressListItemData;
  colors: AdminPalette;
  query: string;
  highlightStyle: StyleProp<TextStyle>;
  onOpen: (item: AdminAddress) => void;
  onGroup: (item: AdminAddress) => void;
  onShowCredential: (item: AdminAddress) => void;
  onClearInbox: (item: AdminAddress) => void;
  onDelete: (item: AdminAddress) => void;
}) {
  const updatedText = useMemo(
    () =>
      item.updated_at
        ? new Date(item.updated_at).toLocaleString("zh-CN", {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : null,
    [item.updated_at]
  );

  return (
    <Pressable
      onPress={() => onOpen(item)}
      style={[
        styles.addressCompactCard,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.addressCompactTop}>
        <View style={styles.addressCompactBody}>
          <View style={styles.addressCompactTitleRow}>
            <HighlightText
              text={item.name}
              query={query}
              style={[styles.addressTitle, { color: colors.foreground }]}
              highlightStyle={highlightStyle}
              numberOfLines={1}
            />
          </View>
          <HighlightText
            text={`#${item.id}${updatedText ? ` · 更新于 ${updatedText}` : ""}`}
            query={query}
            style={[styles.addressSubtitle, { color: colors.muted }]}
            highlightStyle={highlightStyle}
            numberOfLines={1}
          />
          <View style={styles.addressGroupSummaryRow}>
            {item.groups && item.groups.length > 0 ? (
              <>
                {item.groups.slice(0, 2).map((group) => (
                  <AddressGroupChip key={group.id} group={group} colors={colors} compact />
                ))}
                {item.groups.length > 2 ? (
                  <AddressGroupSummaryChip
                    label={`+${item.groups.length - 2}`}
                    colors={colors}
                  />
                ) : null}
              </>
            ) : (
              <AddressGroupSummaryChip label="未分组" colors={colors} />
            )}
          </View>
        </View>
        <View style={styles.addressStatsRow}>
          <AddressStatChip colors={colors} label={`${item.mail_count ?? 0} 收件`} />
          <AddressStatChip colors={colors} label={`${item.send_count ?? 0} 发件`} />
        </View>
      </View>

      <View style={styles.addressCompactActions}>
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            onGroup(item);
          }}
          style={({ pressed }) => [
            styles.addressCompactAction,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              opacity: pressed ? 0.72 : 1,
            },
          ]}
        >
          <Text style={[styles.addressCompactActionText, { color: colors.foreground }]}>
            分组
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onShowCredential(item)}
          style={({ pressed }) => [
            styles.addressCompactAction,
            {
              backgroundColor: `${colors.primary}12`,
              borderColor: `${colors.primary}22`,
              opacity: pressed ? 0.72 : 1,
            },
          ]}
        >
          <Text style={[styles.addressCompactActionText, { color: colors.primary }]}>
            凭证
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onClearInbox(item)}
          style={({ pressed }) => [
            styles.addressCompactAction,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              opacity: pressed ? 0.72 : 1,
            },
          ]}
        >
          <Text style={[styles.addressCompactActionText, { color: colors.foreground }]}>
            清空收件
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onDelete(item)}
          style={({ pressed }) => [
            styles.addressCompactDangerAction,
            {
              backgroundColor: `${colors.error}10`,
              opacity: pressed ? 0.72 : 1,
            },
          ]}
        >
          <Text style={[styles.addressCompactActionText, { color: colors.error }]}>
            删除
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
});

const MailListItem = React.memo(function MailListItem({
  item,
  kind,
  colors,
  searchQuery,
  metaQuery,
  highlightStyle,
  createdUnknownAddresses,
  creatingAddress,
  isUnread,
  onOpen,
  onDelete,
  onCopyCode,
  onCreateAddressFromUnknown,
}: {
  item: ParsedMail;
  kind: "inbox" | "sendbox" | "unknown";
  colors: AdminPalette;
  searchQuery: string;
  metaQuery: string;
  highlightStyle: StyleProp<TextStyle>;
  createdUnknownAddresses: Record<string, true>;
  creatingAddress: string | null;
  isUnread: boolean;
  onOpen: (mail: ParsedMail) => void;
  onDelete: (mail: ParsedMail) => void;
  onCopyCode: (mail: ParsedMail, code: string) => void;
  onCreateAddressFromUnknown: (mail: ParsedMail) => void;
}) {
  const preview = useMemo(() => getMailPreview(item, 68) || "(无内容)", [item]);
  const code = useMemo(() => getVerificationCode(item), [item]);
  const senderAddress = item.from?.address || item.ownerAddress || "—";
  const senderLabel = item.from?.name || getSenderDisplay(item);
  const recipientAddress =
    item.to?.[0]?.address || getMailRecipientsDisplay(item) || "—";
  const recipientLabel = item.to?.[0]?.name || "";
  const primaryAddress = kind === "sendbox" ? recipientAddress : senderAddress;
  const primaryLabel = kind === "sendbox" ? recipientLabel : senderLabel;
  const managedAddress = getManagedAddressForMail(item, kind);
  const unknownRecipientAddress =
    managedAddress || item.ownerAddress || recipientAddress || "—";
  const createdUnknownKey = normalizeGroupAddress(unknownRecipientAddress);
  const isUnknownCreated =
    kind === "unknown" && !!createdUnknownAddresses[createdUnknownKey];
  const canCreateUnknownAddress = !!splitMailboxAddress(unknownRecipientAddress);
  const showUnknownCreate = kind === "unknown";
  const formattedDate = formatMailDate(item.date || item.createdAt);
  const tertiaryMeta =
    kind === "sendbox"
      ? `发件 ${
          formatMailboxDisplay(item.from, { addressFirst: true }) ||
          item.ownerAddress ||
          "—"
        } · ${formattedDate}`
      : kind === "unknown"
        ? `收件 ${unknownRecipientAddress} · ${formattedDate}`
        : item.ownerAddress
          ? `收件 ${item.ownerAddress} · ${formattedDate}`
          : formattedDate;

  return (
    <Pressable
      onPress={() => onOpen(item)}
      onLongPress={() => onDelete(item)}
      delayLongPress={400}
      style={({ pressed }) => [
        styles.compactMailItem,
        {
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.compactMailTop}>
        <View style={styles.compactMailTitleWrap}>
          <View style={styles.compactMailSubjectRow}>
            {isUnread ? (
              <View
                style={[
                  styles.adminUnreadDot,
                  { backgroundColor: colors.primary },
                ]}
              />
            ) : null}
            <HighlightText
              text={item.subject || "(无主题)"}
              query={searchQuery}
              style={[
                styles.compactMailSubject,
                isUnread && styles.compactMailSubjectUnread,
                { color: colors.foreground },
              ]}
              highlightStyle={highlightStyle}
              numberOfLines={1}
            />
          </View>
          <HighlightText
            text={`${primaryAddress}${
              primaryLabel && primaryLabel !== primaryAddress ? ` · ${primaryLabel}` : ""
            }`}
            query={searchQuery}
            style={[styles.compactMailSender, { color: colors.muted }]}
            highlightStyle={highlightStyle}
            numberOfLines={1}
          />
          <HighlightText
            text={preview}
            query={searchQuery}
            style={[styles.compactMailPreview, { color: colors.muted }]}
            highlightStyle={highlightStyle}
            numberOfLines={1}
          />
          <View style={styles.mailCardFooterRow}>
            <View style={styles.mailCardFooterMeta}>
              <HighlightText
                text={tertiaryMeta}
                query={metaQuery}
                style={[styles.adminMetaText, { color: colors.muted }]}
                highlightStyle={highlightStyle}
                numberOfLines={1}
              />
            </View>
          </View>
        </View>
        <View style={styles.compactMailAside}>
          <Text
            style={[styles.mailDate, styles.compactMailDate, { color: colors.muted }]}
            numberOfLines={1}
          >
            {formattedDate}
          </Text>
          {code ? (
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                onCopyCode(item, code);
              }}
              style={({ pressed }) => [
                styles.compactCodePill,
                {
                  backgroundColor: `${colors.primary}12`,
                  borderColor: `${colors.primary}2A`,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <HighlightText
                text={code}
                query={searchQuery}
                style={[styles.compactCodePillText, { color: colors.primary }]}
                highlightStyle={highlightStyle}
                numberOfLines={1}
              />
            </Pressable>
          ) : null}
          {showUnknownCreate ? (
            <Pressable
              onPress={() => onCreateAddressFromUnknown(item)}
              disabled={
                isUnknownCreated ||
                creatingAddress === managedAddress ||
                !canCreateUnknownAddress
              }
              style={({ pressed }) => [
                styles.compactAsideAction,
                {
                  backgroundColor: isUnknownCreated
                    ? `${colors.success}10`
                    : `${colors.primary}10`,
                  borderColor: isUnknownCreated
                    ? `${colors.success}28`
                    : `${colors.primary}26`,
                  opacity:
                    isUnknownCreated ||
                    creatingAddress === managedAddress ||
                    !canCreateUnknownAddress ||
                    pressed
                      ? 0.74
                      : 1,
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.compactAsideActionText,
                  { color: isUnknownCreated ? colors.success : colors.primary },
                ]}
              >
                {isUnknownCreated
                  ? "已创建"
                  : creatingAddress === managedAddress
                    ? "创建中"
                    : "创建"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});

function SendAsPanel({ colors }: { colors: ReturnType<typeof useColors> }) {
  const [fromAddress, setFromAddress] = useState("");
  const [fromName, setFromName] = useState("");
  const [toMail, setToMail] = useState("");
  const [toName, setToName] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [isHtml, setIsHtml] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const canSend = !!fromAddress.trim() && !!toMail.trim();

  const handleSend = async () => {
    if (!fromAddress.trim() || !toMail.trim()) {
      Alert.alert("提示", "请填写发件地址和收件人");
      return;
    }
    setIsSending(true);
    try {
      await adminSendMail({
        from_mail: fromAddress.trim(),
        from_name: fromName.trim(),
        to_name: toName.trim(),
        to_mail: toMail.trim(),
        subject: subject.trim(),
        is_html: isHtml,
        content,
      });
      Alert.alert("发送成功");
      setToMail("");
      setToName("");
      setSubject("");
      setContent("");
    } catch (err: any) {
      Alert.alert("发送失败", err.message || "");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.adminPanelContent}
      keyboardShouldPersistTaps="handled"
    >
      <View
        style={[
          styles.formSectionCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.panelEyebrow, { color: colors.primary }]}>发件身份</Text>

        <FieldLabel text="发件邮箱" colors={colors} />
        <TextInput
          style={[
            styles.formInput,
            {
              color: colors.foreground,
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
          ]}
          value={fromAddress}
          onChangeText={setFromAddress}
          placeholder="name@example.com"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <FieldLabel text="显示名称（可选）" colors={colors} />
        <TextInput
          style={[
            styles.formInput,
            {
              color: colors.foreground,
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
          ]}
          value={fromName}
          onChangeText={setFromName}
          placeholder="例如：CloudMail Support"
          placeholderTextColor={colors.muted}
        />
      </View>

      <View
        style={[
          styles.formSectionCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.panelEyebrow, { color: colors.primary }]}>收件信息</Text>

        <FieldLabel text="收件邮箱" colors={colors} />
        <TextInput
          style={[
            styles.formInput,
            {
              color: colors.foreground,
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
          ]}
          value={toMail}
          onChangeText={setToMail}
          placeholder="to@example.com"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <FieldLabel text="收件名称（可选）" colors={colors} />
        <TextInput
          style={[
            styles.formInput,
            {
              color: colors.foreground,
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
          ]}
          value={toName}
          onChangeText={setToName}
          placeholder="例如：Alex Chen"
          placeholderTextColor={colors.muted}
        />

        <FieldLabel text="主题" colors={colors} />
        <TextInput
          style={[
            styles.formInput,
            {
              color: colors.foreground,
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
          ]}
          value={subject}
          onChangeText={setSubject}
          placeholder="邮件主题"
          placeholderTextColor={colors.muted}
        />
      </View>

      <View
        style={[
          styles.formSectionCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.panelEyebrow, { color: colors.primary }]}>内容</Text>

        <View
          style={[
            styles.toggleCard,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <View style={styles.toggleCardCopy}>
            <Text style={[styles.toggleCardTitle, { color: colors.foreground }]}>
              HTML 格式
            </Text>
          </View>
          <Switch
            value={isHtml}
            onValueChange={setIsHtml}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#FFFFFF"
          />
        </View>

        <FieldLabel text="正文" colors={colors} />
        <TextInput
          style={[
            styles.formInput,
            styles.formTextArea,
            {
              color: colors.foreground,
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
          ]}
          value={content}
          onChangeText={setContent}
          placeholder={isHtml ? "<p>邮件正文</p>" : "邮件正文"}
          placeholderTextColor={colors.muted}
          multiline
        />
      </View>

      <View
        style={[
          styles.compactInfoCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.compactInfoTitle, { color: colors.foreground }]}>
          本次发送摘要
        </Text>
        <View style={styles.compactInfoRows}>
          <View style={styles.compactInfoRow}>
            <Text style={[styles.compactInfoLabel, { color: colors.muted }]}>
              发件地址
            </Text>
            <Text style={[styles.compactInfoValue, { color: colors.foreground }]}>
              {fromAddress.trim() || "待填写"}
            </Text>
          </View>
          <View style={styles.compactInfoRow}>
            <Text style={[styles.compactInfoLabel, { color: colors.muted }]}>
              收件地址
            </Text>
            <Text style={[styles.compactInfoValue, { color: colors.foreground }]}>
              {toMail.trim() || "待填写"}
            </Text>
          </View>
          <View style={styles.compactInfoRow}>
            <Text style={[styles.compactInfoLabel, { color: colors.muted }]}>
              主题
            </Text>
            <Text style={[styles.compactInfoValue, { color: colors.foreground }]}>
              {subject.trim() || "（无主题）"}
            </Text>
          </View>
        </View>
      </View>

      <Pressable
        onPress={handleSend}
        disabled={isSending || !canSend}
        style={({ pressed }) => [
          styles.sendPrimaryButton,
          {
            backgroundColor: isSending || !canSend ? colors.muted : colors.primary,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        {isSending ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.sendPrimaryButtonText}>立即发送</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function AdminMetricTile({
  label,
  value,
  helper,
  icon,
  colors,
  onPress,
}: {
  label: string;
  value: string | number;
  helper: string;
  icon: string;
  colors: ReturnType<typeof useColors>;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.metricTile,
        { backgroundColor: colors.surface, borderColor: colors.border },
        onPress ? { opacity: pressed ? 0.85 : 1 } : null,
      ]}
    >
      <View style={styles.metricTileHeader}>
        <Text style={[styles.metricTileLabel, { color: colors.muted }]}>{label}</Text>
        <IconSymbol name={icon as any} size={16} color={colors.primary} />
      </View>
      <Text style={[styles.metricTileValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.metricTileHelper, { color: colors.muted }]}>{helper}</Text>
    </Pressable>
  );
}

const MemoStatsPanel = React.memo(StatsPanel);
const MemoAddressesPanel = React.memo(AddressesPanel);
const MemoMailsPanel = React.memo(MailsPanel);
const MemoSendAsPanel = React.memo(SendAsPanel);

function PanelStateCard({
  colors,
  title,
  subtitle,
  icon,
  actionLabel,
  onAction,
  loading = false,
  accentColor,
}: {
  colors: ReturnType<typeof useColors>;
  title: string;
  subtitle: string;
  icon: string;
  actionLabel?: string;
  onAction?: () => void;
  loading?: boolean;
  accentColor?: string;
}) {
  const tone = accentColor || colors.primary;

  return (
    <View
      style={[
        styles.stateCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={[styles.stateCardIcon, { backgroundColor: `${tone}12` }]}>
        {loading ? (
          <ActivityIndicator color={tone} />
        ) : (
          <IconSymbol name={icon as any} size={20} color={tone} />
        )}
      </View>
      <Text style={[styles.stateCardTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.stateCardSubtitle, { color: colors.muted }]}>{subtitle}</Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [
            styles.stateCardAction,
            {
              backgroundColor: `${tone}12`,
              borderColor: `${tone}22`,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={[styles.stateCardActionText, { color: tone }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function InlineSyncBadge({
  colors,
  compact = false,
  textFirst = false,
}: {
  colors: ReturnType<typeof useColors>;
  compact?: boolean;
  textFirst?: boolean;
}) {
  return (
    <View
      style={[
        styles.inlineSyncBadge,
        compact ? styles.inlineSyncBadgeCompact : null,
      ]}
    >
      {textFirst ? (
        <>
          <Text style={[styles.inlineSyncBadgeText, { color: colors.primary }]}>
            更新中
          </Text>
          <View
            style={[
              styles.inlineSyncDot,
              { backgroundColor: colors.primary },
            ]}
          />
        </>
      ) : (
        <>
          <View
            style={[
              styles.inlineSyncDot,
              { backgroundColor: colors.primary },
            ]}
          />
          <Text style={[styles.inlineSyncBadgeText, { color: colors.primary }]}>
            更新中
          </Text>
        </>
      )}
    </View>
  );
}

function MailPanelStatusBar({
  colors,
  title,
  summary,
  isSyncing,
}: {
  colors: ReturnType<typeof useColors>;
  title: string;
  summary: string;
  isSyncing: boolean;
}) {
  return (
    <View style={styles.mailToolbarSummary}>
      <View style={styles.mailToolbarInlineRow}>
        <Text numberOfLines={1} style={styles.mailToolbarStatusLine}>
          <Text style={{ color: colors.primary }}>{title}</Text>
          <Text style={{ color: colors.border }}> · </Text>
          <Text style={{ color: colors.muted }}>{summary}</Text>
          {isSyncing ? (
            <>
              <Text style={{ color: colors.border }}> · </Text>
              <Text style={{ color: colors.primary }}>更新中</Text>
            </>
          ) : null}
        </Text>
        {isSyncing ? (
          <View style={[styles.mailInlineSyncDot, { backgroundColor: colors.primary }]} />
        ) : null}
      </View>
    </View>
  );
}

function AddressStatChip({
  label,
  colors,
}: {
  label: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={[
        styles.addressStatChip,
        { backgroundColor: colors.background, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.addressStatChipText, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

function AddressCredentialField({
  label,
  value,
  onCopy,
  colors,
  multiline = false,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  colors: ReturnType<typeof useColors>;
  multiline?: boolean;
}) {
  return (
    <View style={styles.credentialFieldWrap}>
      <View style={styles.credentialFieldHeader}>
        <Text style={[styles.credentialFieldLabel, { color: colors.muted }]}>
          {label}
        </Text>
        <Pressable
          onPress={onCopy}
          style={({ pressed }) => [
            styles.credentialCopyButton,
            {
              backgroundColor: `${colors.primary}12`,
              borderColor: `${colors.primary}22`,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <IconSymbol name="doc.on.doc" size={13} color={colors.primary} />
          <Text style={[styles.credentialCopyText, { color: colors.primary }]}>复制</Text>
        </Pressable>
      </View>
      <View
        style={[
          styles.credentialValueCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text
          selectable
          style={[styles.credentialValueText, { color: colors.foreground }]}
          numberOfLines={multiline ? undefined : 1}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

function FieldLabel({
  text,
  colors,
}: {
  text: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Text style={[styles.fieldLabel, { color: colors.muted }]}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  adminScreenRoot: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
  },
  headerLeft: { flex: 1, marginHorizontal: 8 },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: { fontSize: 19, fontWeight: "700", letterSpacing: -0.2 },
  headerSubtitle: { fontSize: 12, marginTop: 2 },
  headerThemeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  headerIconButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  headerIconText: {
    fontSize: 12,
    fontWeight: "700",
  },
  headerThemeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  iconBtn: { padding: 6 },
  exitBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 14,
  },
  segmentWrap: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 4,
  },
  adminTabScrollContent: {
    paddingRight: 12,
  },
  adminTabTrack: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    padding: 4,
    borderWidth: 1,
    gap: 6,
  },
  adminTabItem: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 52,
  },
  adminTabText: {
    fontSize: 12,
    fontWeight: "600",
  },
  segmentTrack: {
    flexDirection: "row",
    borderRadius: 10,
    padding: ADMIN_SEGMENT_PADDING,
    borderWidth: 1,
    gap: ADMIN_SEGMENT_GAP,
    position: "relative",
    overflow: "hidden",
  },
  segmentIndicator: {
    position: "absolute",
    top: ADMIN_SEGMENT_PADDING,
    bottom: ADMIN_SEGMENT_PADDING,
    left: 0,
    borderRadius: 8,
    overflow: "hidden",
    zIndex: 2,
  },
  segmentOverlayTrack: {
    flexDirection: "row",
    gap: ADMIN_SEGMENT_GAP,
    paddingHorizontal: ADMIN_SEGMENT_PADDING,
  },
  segmentOverlayItem: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  segmentItem: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 8,
    zIndex: 1,
  },
  segmentItemEqual: {
    flex: 1,
    alignItems: "center",
  },
  segmentText: {
    fontSize: 12,
    fontWeight: "600",
  },
  segmentTextActive: {
    color: "#FFFFFF",
  },
  centerAll: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  adminPagerWrap: {
    flex: 1,
    overflow: "hidden",
  },
  adminPagerTrack: {
    flex: 1,
    flexDirection: "row",
  },
  adminPagerPage: {
    flex: 1,
    flexShrink: 0,
  },
  adminPagerHiddenPage: {
    opacity: 0,
  },
  adminPagerPlaceholder: {
    flex: 1,
  },
  adminPanelContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  statsTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  inlineStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  statsUpdatedText: {
    fontSize: 12,
  },
  inlineSyncBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  inlineSyncBadgeCompact: {
    gap: 4,
  },
  inlineSyncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  inlineSyncBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  panelIntroRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  panelIntroText: {
    flex: 1,
  },
  panelEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
    textTransform: "uppercase",
    lineHeight: 16,
  },
  panelTitle: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.3,
    marginTop: 4,
  },
  panelSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  inlineRefreshButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inlineRefreshText: {
    fontSize: 13,
    fontWeight: "600",
  },
  overviewHeroCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 14,
  },
  overviewHeroTop: {
    gap: 12,
  },
  overviewHeroText: {
    gap: 6,
  },
  overviewHeroTitle: {
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  overviewHeroSubtitle: {
    fontSize: 13,
    lineHeight: 19,
  },
  overviewHeroBadge: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  overviewHeroBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  inlineNoticeCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  inlineNoticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
  },
  metricTile: {
    width: "48%",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  metricTileHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metricTileLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  metricTileValue: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  metricTileHelper: {
    fontSize: 12,
    lineHeight: 17,
  },
  compactInfoCard: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  compactInfoTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  compactInfoRows: {
    gap: 12,
  },
  compactInfoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  compactInfoLabel: {
    fontSize: 12,
    minWidth: 72,
  },
  compactInfoValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    textAlign: "right",
  },
  stateCard: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: "center",
  },
  stateCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  stateCardTitle: {
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  stateCardSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 6,
  },
  stateCardAction: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  stateCardActionText: {
    fontSize: 13,
    fontWeight: "700",
  },
  addressToolbar: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    gap: 8,
  },
  mailToolbarTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    zIndex: 20,
  },
  searchFieldCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: 36,
  },
  mailSearchCard: {
    flex: 1,
    minWidth: 0,
  },
  searchFieldInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    paddingVertical: 0,
  },
  mailSearchFieldInput: {
    height: 18,
    lineHeight: 18,
  },
  searchFieldClearButton: {
    marginLeft: 2,
  },
  mailFilterLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    elevation: 24,
  },
  mailFilterBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  mailFilterPopover: {
    position: "absolute",
    zIndex: 41,
    elevation: 18,
  },
  groupFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 4,
  },
  groupFilterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  groupFilterChipText: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  addressToolbarFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  mailToolbarFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  addressToolbarCopy: {
    minWidth: 0,
    flexShrink: 1,
  },
  mailToolbarSummary: {
    width: "100%",
    minWidth: 0,
    minHeight: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  mailToolbarInlineRow: {
    minWidth: 0,
    width: "100%",
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    gap: 5,
    minHeight: 18,
    flexWrap: "nowrap",
  },
  addressToolbarInlineRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 18,
    flexWrap: "nowrap",
  },
  addressToolbarStatusLine: {
    minWidth: 0,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  mailToolbarStatusLine: {
    minWidth: 0,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    textAlign: "center",
  },
  mailInlineSyncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  mailQuickFilterButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: 96,
    minWidth: 64,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 1,
  },
  mailQuickFilterButtonText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  mailSearchIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  addressToolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    flexShrink: 0,
  },
  mailToolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  mailFilterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: "52%",
    flexShrink: 1,
  },
  mailFilterButtonText: {
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 1,
  },
  ghostActionButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostActionText: {
    fontSize: 13,
    fontWeight: "600",
  },
  primaryActionButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  toolbarActionCompact: {
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  primaryActionText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  addressLoadingWrap: {
    flex: 1,
    padding: 16,
  },
  addressListContent: {
    padding: 16,
    paddingBottom: 40,
  },
  addressListEmpty: {
    flexGrow: 1,
  },
  addressItemSeparator: {
    height: 10,
  },
  addressCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  addressCompactCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
  },
  addressCompactTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  addressCompactBody: {
    flex: 1,
    minWidth: 0,
  },
  addressCompactTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    minWidth: 0,
  },
  addressCompactActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  addressGroupSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  addressCompactAction: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addressCompactDangerAction: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addressCompactActionText: {
    fontSize: 11,
    fontWeight: "700",
  },
  addressCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  addressAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  addressAvatarText: {
    fontSize: 17,
    fontWeight: "700",
  },
  addressCardBody: {
    flex: 1,
  },
  addressTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  addressTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
  },
  addressPrimaryChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addressPrimaryChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  addressSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  addressStatsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  addressStatChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  addressStatChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  addressActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
  },
  addressSecondaryAction: {
    flex: 1,
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  addressSecondaryActionText: {
    fontSize: 13,
    fontWeight: "600",
  },
  addressDangerAction: {
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  addressDangerActionText: {
    fontSize: 13,
    fontWeight: "700",
  },
  domainSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  domainText: {
    fontSize: 14,
    fontWeight: "600",
  },
  domainList: {
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 12,
    overflow: "hidden",
  },
  domainScroll: {
    maxHeight: 220,
  },
  domainOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(148,163,184,0.18)",
  },
  domainOptionText: {
    fontSize: 14,
    fontWeight: "600",
  },
  badge: {
    alignSelf: "flex-start",
    marginTop: 6,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  optionInfo: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  optionDesc: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  previewBox: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  previewLabel: {
    fontSize: 12,
  },
  previewAddress: {
    fontSize: 15,
    fontWeight: "700",
    marginTop: 6,
  },
  createButton: {
    minHeight: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  createButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  compactMailItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    minHeight: 98,
    gap: 4,
  },
  compactMailTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  compactMailTitleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  compactMailAside: {
    alignItems: "flex-end",
    gap: 4,
    flexShrink: 0,
    width: 88,
  },
  compactMailDate: {
    textAlign: "right",
    fontSize: 11,
  },
  compactMailSubject: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
    flexShrink: 1,
  },
  compactMailSubjectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  compactMailSubjectUnread: {
    flexShrink: 1,
  },
  adminUnreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    flexShrink: 0,
  },
  compactMailSender: {
    fontSize: 12,
    marginTop: 3,
    lineHeight: 17,
  },
  compactCodePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minHeight: 22,
    minWidth: 56,
    maxWidth: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  compactCodePillText: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  compactMailPreview: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  searchBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
  searchBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: "center",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  mailContent: {
    flex: 1,
  },
  mailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 5,
  },
  senderName: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
  },
  mailDate: {
    fontSize: 12,
  },
  mailSubject: {
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  adminSenderLine: {
    fontSize: 12,
    marginBottom: 4,
  },
  mailPreview: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 5,
  },
  adminMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  adminMetaText: {
    fontSize: 11,
  },
  mailCardFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  mailCardFooterMeta: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  compactAsideAction: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minHeight: 22,
    minWidth: 56,
    maxWidth: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  compactAsideActionText: {
    fontSize: 10.5,
    fontWeight: "700",
    textAlign: "center",
  },
  mailCardGroupRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  mailCardFooterActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  mailInlineAction: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  mailInlineActionText: {
    fontSize: 11,
    fontWeight: "700",
  },
  codePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  codePillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
    lineHeight: 19,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheetContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "82%",
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  sheetHeaderText: {
    flex: 1,
    marginRight: 12,
  },
  sheetSubtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  sheetBody: {
    flexGrow: 0,
  },
  sheetBodyContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 14,
  },
  modalTitle: { fontSize: 20, fontWeight: "700" },
  modalCloseBtn: {
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 20,
  },
  credentialFieldWrap: {
    gap: 8,
  },
  credentialFieldHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  credentialFieldLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  credentialCopyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  credentialCopyText: {
    fontSize: 12,
    fontWeight: "700",
  },
  credentialValueCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  credentialValueText: {
    fontFamily: "Courier",
    fontSize: 13,
    lineHeight: 19,
  },
  sendHeroCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  sendHeroIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  sendHeroContent: {
    flex: 1,
  },
  sendHeroTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  sendHeroSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  formSectionCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  formSectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 4,
  },
  formSectionSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  formInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  formTextArea: {
    minHeight: 150,
    textAlignVertical: "top",
    paddingTop: 12,
  },
  toggleCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 16,
  },
  toggleCardCopy: {
    flex: 1,
  },
  toggleCardTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  toggleCardSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
  },
  fieldHint: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  sendPrimaryButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: 14,
  },
  sendPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  sendFootnote: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
});
