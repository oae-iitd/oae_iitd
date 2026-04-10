import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { getBlobAuthenticated, isImageFile } from '../../utils/authFileAccess';

export interface AuthenticatedProfileImageProps {
  raw?: string;
  alt: string;
  /** Shown when no image, non-image path, load error, or while loading */
  fallbackInitial: string;
  /** Table avatar (default) */
  shape?: 'circle' | 'rounded';
  /** Pixel size when shape is circle (default 40) */
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Renders a profile image using an authenticated blob fetch.
 * Plain `<img src="/api/files/...">` fails because `/api/files` requires Bearer/cookie auth.
 */
const AuthenticatedProfileImage = ({
  raw,
  alt,
  fallbackInitial,
  shape = 'circle',
  size = 40,
  className,
  style,
}: AuthenticatedProfileImageProps) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(() => Boolean(raw?.trim() && isImageFile(raw)));
  const blobRef = useRef<string | null>(null);

  useEffect(() => {
    setFailed(false);
    setBlobUrl(null);
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }

    if (!raw?.trim() || !isImageFile(raw)) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const blob = await getBlobAuthenticated(raw, 'profile');
        if (cancelled) return;
        const u = URL.createObjectURL(blob);
        blobRef.current = u;
        setBlobUrl(u);
      } catch (e) {
        console.error('[AuthenticatedProfileImage] load failed:', e);
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, [raw]);

  const basePlaceholder: CSSProperties =
    shape === 'circle'
      ? {
          width: size,
          height: size,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-tertiary)',
          color: 'var(--text-secondary)',
          fontSize: '0.875rem',
          flexShrink: 0,
        }
      : {
          width: '100%',
          maxWidth: 150,
          maxHeight: 150,
          minHeight: 80,
          borderRadius: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-tertiary)',
          color: 'var(--text-secondary)',
          fontSize: '1.25rem',
        };

  if (!raw?.trim() || !isImageFile(raw) || failed) {
    return (
      <div className={className} style={{ ...basePlaceholder, ...style }}>
        {fallbackInitial}
      </div>
    );
  }

  if (loading || !blobUrl) {
    return (
      <div className={className} style={{ ...basePlaceholder, ...style, opacity: 0.75 }}>
        {loading ? '…' : fallbackInitial}
      </div>
    );
  }

  const imgStyle: CSSProperties =
    shape === 'circle'
      ? {
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          display: 'block',
          flexShrink: 0,
          ...style,
        }
      : {
          maxWidth: '150px',
          maxHeight: '150px',
          width: 'auto',
          height: 'auto',
          borderRadius: '0.5rem',
          objectFit: 'cover',
          border: '1px solid var(--card-border)',
          display: 'block',
          ...style,
        };

  return <img src={blobUrl} alt={alt} className={className} style={imgStyle} />;
};

export default AuthenticatedProfileImage;
