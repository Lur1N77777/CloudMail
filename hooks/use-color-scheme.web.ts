import { useEffect, useState } from "react";
import { useThemeContext } from "@/lib/theme-provider";

export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  try {
    const { colorScheme } = useThemeContext();
    return hasHydrated ? colorScheme : "light";
  } catch {
    return "light";
  }
}
