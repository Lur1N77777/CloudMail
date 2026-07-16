import { useEffect, useState } from "react";
import { useOptionalThemeContext } from "@/lib/theme-provider";

export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const theme = useOptionalThemeContext();
  return hasHydrated && theme ? theme.colorScheme : "light";
}
