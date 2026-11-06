import { useState, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { OpenProjectService } from '../services/OpenProjectService';

/**
 * Component to securely load authenticated OpenProject attachment images,
 * converting them to blob URLs and enabling click-to-zoom.
 */
export function AuthenticatedImage({
  src,
  alt,
  onZoom
}: {
  src?: string;
  alt?: string;
  onZoom: (url: string) => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!src) {
      setIsLoading(false);
      setHasError(true);
      return;
    }

    if (src.startsWith('blob:') || src.startsWith('data:')) {
      setBlobUrl(src);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setHasError(false);

    OpenProjectService.getAttachmentBlobUrl(src)
      .then((url) => {
        if (isMounted) {
          setBlobUrl(url);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load attachment image:', src, err);
        if (isMounted) {
          setHasError(true);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [src]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4 my-2 bg-[#090d16] border border-[#1e293b] rounded-xl text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin mr-2 text-blue-400" />
        <span className="text-[11px] font-mono text-slate-400">Loading attachment image...</span>
      </div>
    );
  }

  if (hasError || !blobUrl) {
    return (
      <div className="flex items-center justify-center p-3 my-2 bg-red-950/20 border border-red-900/40 rounded-xl text-red-400 text-xs font-mono">
        <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
        <span>Failed to load image ({alt || 'Attachment'})</span>
      </div>
    );
  }

  return (
    <span className="block my-2 text-center group">
      <img
        src={blobUrl}
        alt={alt || 'Attachment'}
        onClick={() => onZoom(blobUrl)}
        className="max-w-full h-auto rounded-xl border border-[#1e293b] cursor-zoom-in hover:border-blue-500/60 hover:opacity-95 transition active:scale-[0.99] mx-auto block shadow-md"
        loading="lazy"
      />
      <span className="text-[10px] text-[#64748b] font-mono mt-1 block">Tap image to zoom</span>
    </span>
  );
}
