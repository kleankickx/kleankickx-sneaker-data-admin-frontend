import { useEffect, useRef, useState } from "react";

import { formatFileSize } from "../lib/image-types";

/*
 * Object URL created and revoked by the effect itself and handed to the
 * <img> through a ref, so StrictMode's double mount never leaves the
 * image pointing at a revoked URL.
 */
function Thumbnail({
  file,
  onError,
  className,
}: {
  file: File;
  onError: () => void;
  className: string;
}) {
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (imgRef.current) imgRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return <img ref={imgRef} alt="" onError={onError} className={className} />;
}

/* Browsers other than Safari can't render HEIC; show the file instead. */
export default function FilePreview({ file, compact = false }: { file: File; compact?: boolean }) {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <div
        className={`flex h-full w-full flex-col items-center justify-center gap-0.5 bg-gray-100 px-1 text-center ${
          compact ? "" : "p-1.5"
        }`}
        title={file.name}
      >
        <span
          className={`material-symbols-outlined ${compact ? "text-[18px]" : "text-[22px]"} text-gray-400`}
          aria-hidden="true"
        >
          image
        </span>
        {!compact && (
          <>
            <span className="w-full truncate text-[10px] text-gray-600">
              {file.name}
            </span>
            <span className="text-[10px] text-gray-400">
              {formatFileSize(file.size)}
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <Thumbnail
      file={file}
      onError={() => setBroken(true)}
      className="h-full w-full object-cover"
    />
  );
}
