import { useCallback, useEffect, useRef, useState } from "react";
import { loadClampedPercentFromStorage, saveToStorage } from "../../utils/storage";
import { PREVIEW_SPLIT_DEFAULT, PREVIEW_SPLIT_MAX, PREVIEW_SPLIT_MIN, TERMINAL_SPLIT_STORAGE_KEY } from "../constants";

interface UsePreviewSplitInput {
  isServerRunning: boolean;
  mainColumnRef: React.RefObject<HTMLElement | null>;
}

export function usePreviewSplit({ isServerRunning, mainColumnRef }: UsePreviewSplitInput): {
  previewSplitPercent: number;
  onSplitterMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
} {
  const isDraggingSplitRef = useRef(false);
  const [previewSplitPercent, setPreviewSplitPercent] = useState<number>(() =>
    loadClampedPercentFromStorage(TERMINAL_SPLIT_STORAGE_KEY, PREVIEW_SPLIT_DEFAULT, PREVIEW_SPLIT_MIN, PREVIEW_SPLIT_MAX)
  );

  const onSplitterMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>): void => {
    event.preventDefault();
    isDraggingSplitRef.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent): void => {
      if (!isDraggingSplitRef.current || !isServerRunning || !mainColumnRef.current) {
        return;
      }
      const bounds = mainColumnRef.current.getBoundingClientRect();
      if (bounds.height <= 0) {
        return;
      }
      const nextPercent = ((event.clientY - bounds.top) / bounds.height) * 100;
      setPreviewSplitPercent(Math.max(PREVIEW_SPLIT_MIN, Math.min(PREVIEW_SPLIT_MAX, nextPercent)));
    };

    const onMouseUp = (): void => {
      isDraggingSplitRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isServerRunning, mainColumnRef]);

  useEffect(() => {
    saveToStorage(TERMINAL_SPLIT_STORAGE_KEY, String(previewSplitPercent));
  }, [previewSplitPercent]);

  return { previewSplitPercent, onSplitterMouseDown };
}
