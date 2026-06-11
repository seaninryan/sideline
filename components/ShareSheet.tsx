"use client";
import React, { useEffect, useState } from "react";
import { store } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { genShortCode } from "@/lib/short-code";
import { teamsToPublish } from "@/lib/team-link";
import PrivacyControl from "@/components/PrivacyControl";
import { privacyLevel, levelToColumns, type PrivacyLevel } from "@/lib/privacy";
import type { MatchRecord, NameDisplay } from "@/lib/types";

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
  const [level, setLevel] = useState<PrivacyLevel>("private");
  const [slug, setSlug] = useState(curId);
  const [nameDisplay, setNameDisplay] = useState<NameDisplay>(record.nameDisplay || "full");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const shareUrl = `${origin}/m/${slug}`;

  useEffect(() => {
    Promise.resolve(sb.from("matches").select("is_public,short_code,name_display,listed").eq("id", curId).maybeSingle())
      .then(({ data }) => {
        const d = data as { is_public?: boolean; short_code?: string | null; name_display?: NameDisplay; listed?: boolean } | null;
        if (d) { setLevel(privacyLevel(!!d.is_public, d.listed)); if (d.short_code) setSlug(d.short_code); if (d.name_display) setNameDisplay(d.name_display); }
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

  // Linked teams (both sides — incl. the opponent, which is one of our records).
  const teamIds = teamsToPublish(record);

  const applyNameDisplay = async (v: NameDisplay) => {
    setBusy(true);
    setNameDisplay(v);
    await store.set(curId, { ...record, nameDisplay: v });
    await sb.from("matches").update({ name_display: v }).eq("id", curId);
    // keep the (already public) linked teams' name privacy in sync
    if (level !== "private" && teamIds.length) await sb.from("teams").update({ name_display: v }).in("id", teamIds);
    onApplied({ nameDisplay: v, isPublic: level !== "private" });
    setBusy(false);
  };

  const applyLevel = async (next: PrivacyLevel) => {
    setBusy(true);
    setLevel(next);
    const cols = levelToColumns(next);
    await store.set(curId, { ...record, nameDisplay });
    if (cols.is_public && level === "private") { const code = await ensureShortCode(); setSlug(code); }
    await sb.from("matches").update({ ...cols, name_display: nameDisplay }).eq("id", curId);
    if (cols.is_public && teamIds.length) await sb.from("teams").update({ is_public: true, name_display: nameDisplay }).in("id", teamIds);
    onApplied({ nameDisplay, isPublic: cols.is_public });
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
      ) : (
        <PrivacyControl
          level={level}
          onLevel={applyLevel}
          link={level !== "private" ? shareUrl : undefined}
          copied={copied}
          onCopy={copy}
          nameDisplay={nameDisplay}
          onNameDisplay={applyNameDisplay}
          busy={busy}
        />
      )}
    </div>
  );
}
