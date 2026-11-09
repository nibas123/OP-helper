import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, ExternalLink, Move } from 'lucide-react';

interface ImageZoomModalProps {
  imageUrl: string | null;
  onClose: () => void;
  altText?: string;
}

export default function ImageZoomModal({ imageUrl, onClose, altText = 'Enlarged attachment' }: ImageZoomModalProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const pinchStartRef = useRef<{ dist: number; scale: number } | null>(null);
  const lastTapRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset scale and position whenever a new image is opened
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [imageUrl]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleZoomIn = useCallback(() => {
    setScale(prev => Math.min(prev + 0.5, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale(prev => {
      const next = Math.max(prev - 0.5, 1);
      if (next === 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.deltaY < 0) {
      setScale(prev => Math.min(prev + 0.25, 5));
    } else {
      setScale(prev => {
        const next = Math.max(prev - 0.25, 1);
        if (next === 1) setPosition({ x: 0, y: 0 });
        return next;
      });
    }
  };

  // Mouse drag to pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || scale <= 1) return;
    setPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch handlers for mobile (pinch to zoom, drag to pan, double tap)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // 2 fingers = pinch gesture
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchStartRef.current = { dist, scale };
    } else if (e.touches.length === 1) {
      const now = Date.now();
      const timeSinceLast = now - lastTapRef.current;
      lastTapRef.current = now;

      // Double tap to toggle zoom
      if (timeSinceLast < 300) {
        if (scale > 1) {
          handleReset();
        } else {
          setScale(2.5);
        }
        return;
      }

      // 1 finger = pan
      if (scale > 1) {
        setIsDragging(true);
        dragStartRef.current = {
          x: e.touches[0].clientX - position.x,
          y: e.touches[0].clientY - position.y
        };
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartRef.current) {
      e.preventDefault();
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = currentDist / pinchStartRef.current.dist;
      const newScale = Math.min(Math.max(pinchStartRef.current.scale * ratio, 1), 5);
      setScale(newScale);
      if (newScale === 1) setPosition({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && isDragging && scale > 1) {
      e.preventDefault();
      setPosition({
        x: e.touches[0].clientX - dragStartRef.current.x,
        y: e.touches[0].clientY - dragStartRef.current.y
      });
    }
  };

  const handleTouchEnd = () => {
    pinchStartRef.current = null;
    setIsDragging(false);
    if (scale <= 1) {
      setPosition({ x: 0, y: 0 });
    }
  };

  if (!imageUrl) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-between p-3 select-none touch-none animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Top action bar */}
      <div 
        className="w-full flex items-center justify-between z-20 px-2 py-1 max-w-4xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-slate-300 truncate max-w-[200px]">
            {altText}
          </span>
          {scale > 1 && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-600/30 text-blue-300 border border-blue-500/30 flex items-center gap-1">
              <Move className="w-2.5 h-2.5" />
              Pan active
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <a
            href={imageUrl}
            target="_blank"
            rel="noreferrer"
            className="p-2 bg-[#1e293b]/80 hover:bg-[#283548] text-slate-200 rounded-full transition border border-slate-700/60 shadow"
            title="Open original image in new tab"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="p-2 bg-[#1e293b]/80 hover:bg-rose-900/60 hover:text-rose-200 text-slate-200 rounded-full transition border border-slate-700/60 shadow"
            title="Close image viewer (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Center Image Container with Touch & Mouse Pan/Zoom */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="flex-1 w-full max-w-5xl flex items-center justify-center overflow-hidden relative cursor-grab active:cursor-grabbing p-2"
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transition: isDragging ? 'none' : 'transform 0.15s cubic-bezier(0, 0, 0.2, 1)',
            transformOrigin: 'center center',
          }}
          className="flex items-center justify-center max-w-full max-h-full"
        >
          <img
            src={imageUrl}
            alt={altText}
            draggable={false}
            className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl border border-slate-800 pointer-events-none"
          />
        </div>
      </div>

      {/* Floating Bottom Control Pill for Mobile & Desktop */}
      <div
        className="z-20 mb-2 flex items-center gap-1 sm:gap-2 bg-[#0d1322]/90 border border-[#1e293b] px-3 py-1.5 rounded-full shadow-2xl backdrop-blur-md"
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleZoomOut}
          disabled={scale <= 1}
          className="p-1.5 text-slate-300 hover:text-white disabled:opacity-30 disabled:hover:text-slate-300 transition rounded-full hover:bg-[#1e293b]"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleReset}
          className="px-2 py-0.5 text-xs font-mono font-bold text-blue-400 hover:text-blue-300 rounded transition"
          title="Click to reset zoom"
        >
          {Math.round(scale * 100)}%
        </button>

        <button
          type="button"
          onClick={handleZoomIn}
          disabled={scale >= 5}
          className="p-1.5 text-slate-300 hover:text-white disabled:opacity-30 disabled:hover:text-slate-300 transition rounded-full hover:bg-[#1e293b]"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-slate-700 mx-0.5" />

        <button
          type="button"
          onClick={handleReset}
          className="p-1.5 text-slate-300 hover:text-white transition rounded-full hover:bg-[#1e293b]"
          title="Reset zoom & position"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
