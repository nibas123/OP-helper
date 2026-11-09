import { useState, useCallback, useRef } from 'react';

export interface WindowDimensions {
  width: number;
  height: number;
}

export interface UseResizableWindowOptions {
  storageKey: string;
  defaultWidth: number;
  defaultHeight: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export function useResizableWindow({
  storageKey,
  defaultWidth,
  defaultHeight,
  minWidth = 380,
  minHeight = 280,
  maxWidth,
  maxHeight,
}: UseResizableWindowOptions) {
  // Read initial size from localStorage
  const [size, setSize] = useState<WindowDimensions>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.width && parsed.height) {
            return {
              width: Math.max(minWidth, Math.min(parsed.width, window.innerWidth - 32)),
              height: Math.max(minHeight, Math.min(parsed.height, window.innerHeight - 32)),
            };
          }
        }
      } catch (e) {
        // Fallback to defaults
      }
    }
    return {
      width: Math.min(defaultWidth, typeof window !== 'undefined' ? Math.max(minWidth, window.innerWidth - 32) : defaultWidth),
      height: Math.min(defaultHeight, typeof window !== 'undefined' ? Math.max(minHeight, window.innerHeight - 32) : defaultHeight),
    };
  });

  const [isMaximized, setIsMaximized] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number }>({
    startX: 0,
    startY: 0,
    startWidth: defaultWidth,
    startHeight: defaultHeight,
  });

  // Save to localStorage
  const saveSize = useCallback((newSize: WindowDimensions) => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(newSize));
      } catch (e) {
        // ignore
      }
    }
  }, [storageKey]);

  const toggleMaximize = useCallback(() => {
    setIsMaximized(prev => !prev);
  }, []);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isMaximized) return;

    isDraggingRef.current = true;
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: size.width,
      startHeight: size.height,
    };

    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaX = moveEvent.clientX - dragStartRef.current.startX;
      const deltaY = moveEvent.clientY - dragStartRef.current.startY;

      const effectiveMaxWidth = maxWidth || (window.innerWidth - 32);
      const effectiveMaxHeight = maxHeight || (window.innerHeight - 32);

      const nextWidth = Math.max(minWidth, Math.min(effectiveMaxWidth, dragStartRef.current.startWidth + deltaX));
      const nextHeight = Math.max(minHeight, Math.min(effectiveMaxHeight, dragStartRef.current.startHeight + deltaY));

      setSize({ width: nextWidth, height: nextHeight });
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        document.body.style.userSelect = prevUserSelect;
        setSize(current => {
          saveSize(current);
          return current;
        });
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [isMaximized, size, minWidth, minHeight, maxWidth, maxHeight, saveSize]);

  // Reset to default
  const resetSize = useCallback(() => {
    const def = {
      width: Math.min(defaultWidth, window.innerWidth - 32),
      height: Math.min(defaultHeight, window.innerHeight - 32)
    };
    setSize(def);
    saveSize(def);
    setIsMaximized(false);
  }, [defaultWidth, defaultHeight, saveSize]);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  return {
    size,
    isMaximized,
    isMobile,
    toggleMaximize,
    handleResizeStart,
    resetSize,
    modalStyle: isMobile
      ? { width: 'calc(100vw - 20px)', height: 'auto', maxWidth: 'calc(100vw - 20px)', maxHeight: '90dvh' }
      : isMaximized
      ? { width: '96vw', height: '94vh', maxWidth: '96vw', maxHeight: '94vh' }
      : { width: `${size.width}px`, height: `${size.height}px`, maxWidth: '96vw', maxHeight: '94vh' },
  };
}
