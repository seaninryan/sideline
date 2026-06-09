"use client";
import React, { useEffect, useState } from "react";
import { store } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { genShortCode } from "@/lib/short-code";
import type { MatchRecord, NameDisplay } from "@/lib/types";

const NAME_OPTS: { v: NameDisplay; label: string }[] = [
  { v: "full", label: "Full" },
  { v: "initials", label: "Initials" },
  { v: "none", label: "None" },
];

export default function ShareSheet({ record, curId, onClose, onShareImage, onApplied }: {
  record: MatchRecord;
  curId: string;
  onClose: () => void;
  onShareImage: () => void;
  onApplied: (patch: { nameDisplay: NameDisplay; isPublic: boolean }) => void;
}) {
  const sb = createClient();
  const origin = typeof location !== "undefined" ? location.origin : "";
  const [loaded, setLoaded] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [slug, setSlug] = useState(curId);
  const [nameDisplay, setNameDisplay] = useState<NameDisplay>(record.nameDisplay || "full");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const shareUrl = `${origin}/m/${slug}`;

  useEffect(() => {
    Promise.resolve(sb.from("matches").select("is_public,short_code,name_display").eq("id", curId).maybeSingle())
      .then(({ data }) => {
        const d = data as { is_public?: boolean; short_code?: string | null; name_display?: NameDisplay } | null;
        if (d) { setIsPublic(!!d.is_public); if (d.short_code) setSlug(d.short_code); if (d.name_display) setNameDisplay(d.name_display); }
        setLoaded(true);
      }).catch(() => setLoaded(true));
  }, [curId]);

  // idempotent short_code mint (copied from ShareWizard.ensureShortCode)
  const ensureShortCode = async (): Promise<string> => {
    try {
      const { data: cur } = await sb.from("matches").select("short_code").eq("id", curId).maybeSingle();
      let code: string | null = (cur as any)?.short_code ?? null;
      for (let i = 0; i < 5 && !code; i++) {
        const cand = genShortCode();
        const { error } = await sb.from("matches").update({ short_code: cand }).eq("id", curId).is("short_code", null);
        if (error) { if (error.code === "23505") continue; break; }
        const { data: chk } = await sb.from("matches").select("short_code").eq("id", curId).maybeSingle();
        code = (chk as any)?.short_code ?? null;
      }
      return code || curId;
    } catch { return curId; }
  };

  const applyNameDisplay = async (v: NameDisplay) => {
    setBusy(true);
    setNameDisplay(v);
    await store.set(curId, { ...record, nameDisplay: v });
    await sb.from("matches").update({ name_display: v }).eq("id", curId);
    onApplied({ nameDisplay: v, isPublic });
    setBusy(false);
  };

  const publish = async () => {
    setBusy(true);
    await store.set(curId, { ...record, nameDisplay });
    const code = await ensureShortCode();
    setSlug(code);
    await sb.from("matches").update({ is_public: true, name_display: nameDisplay }).eq("id", curId);
    setIsPublic(true);
    onApplied({ nameDisplay, isPublic: true });
    setBusy(false);
  };

  const unshare = async () => {
    setBusy(true);
    await sb.from("matches").update({ is_public: false }).eq("id", curId);
    setIsPublic(false);
    onApplied({ nameDisplay, isPublic: false });
    setBusy(false);
  };

  const copy = () => { navigator.clipboard?.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <div className="mt-live" style={{ marginTop: 0 }}>
      <div className="mt-row">
        <span className="mt-h" style={{ margin: 0, flex: 1 }}>Share</span>
        <button className="mt-add alt" onClick={onClose}>✕ Close</button>
      </div>

      <button className="mt-add alt" style={{ marginTop: 8 }} onClick={onShareImage}>🖼 Share as image</button>

      {!loaded ? (
        <p className="mt-note" style={{ marginTop: 10 }}>Checking publish status…</p>
      ) : !isPublic ? (
        <>
          <p className="mt-note" style={{ margin: "12px 0 4px" }}>Player names on the public page:</p>
          <div className="mt-grid">
            {NAME_OPTS.map((o) => (
              <button key={o.v} className={"mt-big sm" + (nameDisplay === o.v ? " on" : "")} onClick={() => setNameDisplay(o.v)}>{o.label}</button>
            ))}
          </div>
          <button className="mt-add" style={{ marginTop: 10 }} disabled={busy} onClick={publish}>{busy ? "Publishing…" : "🌐 Make public & get link"}</button>
        </>
      ) : (
        <>
          <p className="mt-note" style={{ margin: "12px 0 4px" }}>Public link</p>
          <input className="mt-inp" readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} style={{ width: "100%" }} />
          <button className="mt-add" style={{ marginTop: 6 }} onClick={copy}>{copied ? "Copied ✓" : "🔗 Copy public link"}</button>
          <p className="mt-note" style={{ margin: "12px 0 4px" }}>Name privacy</p>
          <div className="mt-grid">
            {NAME_OPTS.map((o) => (
              <button key={o.v} className={"mt-big sm" + (nameDisplay === o.v ? " on" : "")} disabled={busy} onClick={() => applyNameDisplay(o.v)}>{o.label}</button>
            ))}
          </div>
          <button className="mt-add danger" style={{ marginTop: 10 }} disabled={busy} onClick={unshare}>🚫 Unshare (make private)</button>
        </>
      )}
    </div>
  );
}
