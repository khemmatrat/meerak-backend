import { useCallback, useRef } from "react";

/** กดค้าง ~550ms แล้วเรียก onHide (ไม่เปิด onClick ปกติ) */
export function useLongPressHide(
  onHide: () => void,
  ms = 550,
): {
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
} {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(() => {
    firedRef.current = false;
    clear();
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      onHide();
    }, ms);
  }, [clear, ms, onHide]);

  const end = useCallback(() => {
    clear();
  }, [clear]);

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (!firedRef.current) onHide();
    },
    [onHide],
  );

  const consumeSuppressClick = useCallback(() => {
    if (firedRef.current) {
      firedRef.current = false;
      return true;
    }
    return false;
  }, []);

  return {
    onPointerDown,
    onPointerUp: end,
    onPointerLeave: end,
    onPointerCancel: end,
    onContextMenu,
    consumeSuppressClick,
  };
}
