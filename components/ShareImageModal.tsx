"use client";
import React, { useEffect, useState } from "react";
import { buildInfographicSVG } from "@/lib/infographic";
import { svgToPng } from "@/lib/svg-to-png.client";
import type { Model } from "@/lib/types";

// Shared share-as-image panel. Builds the infographic SVG, rasterises it to PNG in the
// browser, shows the preview (long-press to save on iOS) and a Save / Share button
// (Web Share where available, else download), with an SVG download fallback. Used by both
// the editor (MatchTracker) and the public page (PublicMatch) so the experience is identical.
export default function ShareImageModal({ model, filename = "match.png", title, onClose }: {
  model: Model;
  filename?: string;
  title?: string;
  onClose: () => void;
}) {
  const [img, setImg] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [png, setPng] = useState(false);
  const [pngFailed, setPngFailed] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    try {
      const { svg: s, width, height } = buildInfographicSVG(model);
      setSvg(s);
      setImg("data:image/svg+xml;charset=utf-8," + encodeURIComponent(s));
      svgToPng(s, width, height)
        .then(({ blob: b, dataUrl }) => { if (!alive) return; setBlob(b); if (dataUrl) setImg(dataUrl); setPng(true); })
        .catch(() => { if (alive) setPngFailed(true); });
    } catch { setError(true); }
    return () => { alive = false; };
  }, [model]);

  const download = (b: Blob, name: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  };
  const nativeShare = () => {
    if (!blob) return;
    const file = new File([blob], filename, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], title }).catch(() => {});
    else download(blob, filename);
  };
  const downloadSvg = () => { if (svg) download(new Blob([svg], { type: "image/svg+xml" }), filename.replace(/\.png$/, ".svg")); };

  return (
    <div className="mt-panel">
      <div className="mt-panel-head"><h3>Match image</h3><button className="mt-add alt" onClick={onClose}>Close</button></div>
      {error && <p className="hint">Couldn&apos;t build the image — try again.</p>}
      {img && <img className="shot" src={img} alt="match infographic" />}
      {img && <p className="hint"><b>Press and hold the image</b> to save it to Photos or share it{png ? "." : " (preparing a saveable version…)"}</p>}
      <div className="row">
        {png && <button className="mt-add" onClick={nativeShare}>Save / Share</button>}
        {img && !png && <button className="mt-add alt" onClick={downloadSvg}>Download</button>}
      </div>
      {pngFailed && <p className="hint">A PNG couldn&apos;t be made in this browser — long-press the image above to save it, or use Download.</p>}
    </div>
  );
}
