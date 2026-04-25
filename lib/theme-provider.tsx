import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, View, useColorScheme as useSystemColorScheme } from "react-native";
import { colorScheme as nativewindColorScheme, vars } from "nativewind";

import { SchemeColors, type ColorScheme } from "@/constants/theme";

export type ThemePreference = ColorScheme | "system";
export type DarkThemePreference = Extract<ColorScheme, "dark" | "oled">;

type ThemeContextValue = {
  colorScheme: ColorScheme;
  themePreference: ThemePreference;
  setColorScheme: (scheme: ColorScheme) => void;
  setThemePreference: (scheme: ThemePreference) => void;
  lastDarkPreference: DarkThemePreference;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const THEME_PREFERENCE_KEY = "cloudmail_theme_preference";
const LAST_DARK_THEME_PREFERENCE_KEY = "cloudmail_last_dark_theme_preference";

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "oled" || value === "system";
}

function isDarkThemePreference(value: string | null): value is DarkThemePreference {
  return value === "dark" || value === "oled";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme() ?? "light";
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>("system");
  const [lastDarkPreference, setLastDarkPreferenceState] =
    useState<DarkThemePreference>("oled");
  const colorScheme = themePreference === "system" ? systemScheme : themePreference;

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      AsyncStorage.getItem(THEME_PREFERENCE_KEY),
      AsyncStorage.getItem(LAST_DARK_THEME_PREFERENCE_KEY),
    ])
      .then(([savedPreference, savedDarkPreference]) => {
        if (cancelled) return;

        if (isDarkThemePreference(savedDarkPreference)) {
          setLastDarkPreferenceState(savedDarkPreference);
        }

        if (isThemePreference(savedPreference)) {
          setThemePreferenceState(savedPreference);
          if (isDarkThemePreference(savedPreference)) {
            setLastDarkPreferenceState(savedPreference);
          }
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const applyScheme = useCallback((scheme: ColorScheme, preference: ThemePreference) => {
    const nativeScheme = scheme === "oled" ? "dark" : scheme;
    nativewindColorScheme.set(nativeScheme);
    (Appearance as any).setColorScheme?.(preference === "system" ? null : nativeScheme);
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.dataset.theme = scheme;
      root.classList.toggle("dark", scheme !== "light");
      const palette = SchemeColors[scheme];
      Object.entries(palette).forEach(([token, value]) => {
        root.style.setProperty(`--color-${token}`, value);
      });
    }
  }, []);

  const setThemePreference = useCallback((scheme: ThemePreference) => {
    setThemePreferenceState(scheme);
    void AsyncStorage.setItem(THEME_PREFERENCE_KEY, scheme).catch(() => {});

    if (isDarkThemePreference(scheme)) {
      setLastDarkPreferenceState(scheme);
      void AsyncStorage.setItem(LAST_DARK_THEME_PREFERENCE_KEY, scheme).catch(() => {});
    }
  }, []);

  const setColorScheme = useCallback((scheme: ColorScheme) => {
    setThemePreference(scheme);
  }, [setThemePreference]);

  useEffect(() => {
    applyScheme(colorScheme, themePreference);
  }, [applyScheme, colorScheme, themePreference]);

  const themeVariables = useMemo(
    () =>
      vars({
        "color-primary": SchemeColors[colorScheme].primary,
        "color-background": SchemeColors[colorScheme].background,
        "color-surface": SchemeColors[colorScheme].surface,
        "color-foreground": SchemeColors[colorScheme].foreground,
        "color-muted": SchemeColors[colorScheme].muted,
        "color-border": SchemeColors[colorScheme].border,
        "color-success": SchemeColors[colorScheme].success,
        "color-warning": SchemeColors[colorScheme].warning,
        "color-error": SchemeColors[colorScheme].error,
      }),
    [colorScheme],
  );

  const value = useMemo(
    () => ({
      colorScheme,
      themePreference,
      setColorScheme,
      setThemePreference,
      lastDarkPreference,
    }),
    [colorScheme, lastDarkPreference, setColorScheme, setThemePreference, themePreference],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, themeVariables]}>{children}</View>
    </ThemeContext.Provider>
  );
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemeContext must be used within ThemeProvider");
  }
  return ctx;
}