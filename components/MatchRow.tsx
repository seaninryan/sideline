"use client";
import React from "react";
import Link from "next/link";
import { matchRowView } from "@/lib/match-list";
import type { MatchRecord } from "@/lib/types";

// One row in a match list. Winner emphasis: the losing side is dimmed (`lose`),
// the winner stays full strength (`win`), a draw is neutral (`neu`).
export default function MatchRow({ record, href, date, privacy = null }: {
  record: MatchRecord;
  href: string;
  date: string;
  privacy?: "public" | "private" | null;
}) {
  const v = matchRowView(record);
  const cls = (side: "home" | "away") => (v.winner === "draw" ? "neu" : v.winner === side ? "win" : "lose");
  const flag = (c: [string, string]) => `linear-gradient(135deg, ${c[0]} 50%, ${c[1]} 50%)`;
  return (
    <Link className="ml-row" href={href}>
      <span className="ml-sport">{v.sportEmoji || "•"}</span>
      <span className="ml-teams">
        <span className={"ml-flag " + cls("home")} style={{ background: flag(v.homeColors) }} />
        <span className={"ml-name " + cls("home")}>{v.homeName}</span>
        <span className={"ml-score " + cls("home")}>{v.homeStr}</span>
        <span className="ml-dash">–</span>
        <span className={"ml-score " + cls("away")}>{v.awayStr}</span>
        <span className={"ml-name " + cls("away")}>{v.awayName}</span>
        <span className={"ml-flag " + cls("away")} style={{ background: flag(v.awayColors) }} />
      </span>
      <span className="grow" />
      <span className="ml-meta">
        <span className="ml-date">{date}</span>
        {privacy && <span className={"ml-priv " + privacy}>{privacy === "public" ? "◉ public" : "🔒 private"}</span>}
      </span>
    </Link>
  );
}
