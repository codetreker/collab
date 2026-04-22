import { useState } from 'react';

export function ImageViewer({ url, name }: { url: string; name: string }) {
  const [scale, setScale] = useState(1);

  return (
    <div className="image-viewer">
      <img
        src={url}
        alt={name}
        style={{ transform: `scale(${scale})`, transformOrigin: 'top left', maxWidth: '100%' }}
        onClick={() => setScale(s => s === 1 ? 2 : 1)}
      />
      {scale !== 1 && (
        <button className="image-viewer-reset" onClick={() => setScale(1)}>
          Reset Zoom
        </button>
      )}
    </div>
  );
}
