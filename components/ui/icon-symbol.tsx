import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "chevron.down": "keyboard-arrow-down",
  "envelope.fill": "mail",
  "envelope.open.fill": "drafts",
  "tray.fill": "inbox",
  "person.crop.circle": "account-circle",
  "person.crop.circle.fill": "account-circle",
  "gearshape.fill": "settings",
  "plus.circle.fill": "add-circle",
  "trash.fill": "delete",
  "arrow.clockwise": "refresh",
  "doc.on.doc": "content-copy",
  "xmark.circle.fill": "cancel",
  "checkmark.circle.fill": "check-circle",
  "exclamationmark.triangle.fill": "warning",
  "info.circle.fill": "info",
  "at": "alternate-email",
  "globe": "language",
  "lock.fill": "lock",
  "key.fill": "vpn-key",
  "timer": "timer",
  "moon.fill": "dark-mode",
  "sun.max.fill": "light-mode",
  "square.and.arrow.up": "share",
  "arrow.up.right.square": "open-in-new",
  "arrow.left": "arrow-back",
  "arrow.down.circle": "download",
  "ellipsis": "more-horiz",
  "magnifyingglass": "search",
  "link": "link",
  "clock.fill": "schedule",
  "paperclip": "attach-file",
} as IconMapping;

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
