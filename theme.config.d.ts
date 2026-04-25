export const themeColors: {
  primary: { light: string; dark: string; oled: string };
  background: { light: string; dark: string; oled: string };
  surface: { light: string; dark: string; oled: string };
  foreground: { light: string; dark: string; oled: string };
  muted: { light: string; dark: string; oled: string };
  border: { light: string; dark: string; oled: string };
  success: { light: string; dark: string; oled: string };
  warning: { light: string; dark: string; oled: string };
  error: { light: string; dark: string; oled: string };
};

declare const themeConfig: {
  themeColors: typeof themeColors;
};

export default themeConfig;
