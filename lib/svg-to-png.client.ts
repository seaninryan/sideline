"use client";

export function svgToPng(svg: string, W: number, H: number): Promise<{ blob: Blob | null; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = 2;
        const c = document.createElement("canvas");
        c.width = W * scale; c.height = H * scale;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#f4efe1"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
        const dataUrl = c.toDataURL("image/png");
        c.toBlob((blob) => { blob ? resolve({ blob, dataUrl }) : reject(new Error("no blob")); }, "image/png");
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error("img load fail"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}
