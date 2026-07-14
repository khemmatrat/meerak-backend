import { useEffect, useState } from "react";
import {
  FLOATING_FAB_PREFS_EVENT,
  loadFloatingFabPrefs,
  type FloatingFabPrefs,
} from "../utils/floatingFabPrefs";

export function useFloatingFabPrefs(): FloatingFabPrefs {
  const [prefs, setPrefs] = useState<FloatingFabPrefs>(loadFloatingFabPrefs);

  useEffect(() => {
    const sync = () => setPrefs(loadFloatingFabPrefs());
    window.addEventListener(FLOATING_FAB_PREFS_EVENT, sync);
    return () => window.removeEventListener(FLOATING_FAB_PREFS_EVENT, sync);
  }, []);

  return prefs;
}
