"use client";
import React from "react";
import Link from "next/link";
import { matchRowView } from "@/lib/match-list";
import SportIcon from "@/components/SportIcon";
import type { MatchRecord } from "@/lib/types";

// One row in a match list. Winner emphasis: the losing side is dimmed (`lose`),
// the winner stays full strength (`win`), a draw is neutral (`neu`). Each side
// is an equal-width cell hugging the centre dash, so a long name ellipsises on
// its own side instead of pushing the score across the divider.
export default function MatchRow({ record, href, date, privacy = null, upcoming = false, live = false }: {
  record: MatchRecord;
  href: string;
  date: string;
  privacy?: "public" | "private" | null;
  upcoming?: boolean;
  live?: boolean;
}) {
  const v = matchRowView(record);
  const cls = (side: "home" | "away") => (v.winner === "draw" ? "neu" : v.winner === side ? "win" : "lose");
  const flag = (c: [string, string]) => `linear-gradient(135deg, ${c[0]} 50%, ${c[1]} 50%)`;
  return (
    <Link className={"ml-row" + (upcoming ? " upcoming" : "") + (live ? " live" : "")} href={href}>
      <span className="ml-sport"><SportIcon sport={v.sport} size={18} /></span>
      <span className="ml-teams">
        <span className="ml-side home">
          <span className={"ml-flag " + cls("home")} style={{ background: flag(v.homeColors) }} />
          <span className={"ml-name " + cls("home")}>{v.homeName}{v.homeSquad && <span className="ml-squad">{v.homeSquad}</span>}</span>
          <span className={"ml-score " + cls("home")}>{v.homeStr}</span>
        </span>
        <span className="ml-dash">–</span>
        <span className="ml-side away">
          <span className={"ml-score " + cls("away")}>{v.awayStr}</span>
          <span className={"ml-name " + cls("away")}>{v.awayName}{v.awaySquad && <span className="ml-squad">{v.awaySquad}</span>}</span>
          <span className={"ml-flag " + cls("away")} style={{ background: flag(v.awayColors) }} />
        </span>
      </span>
      <span className="ml-meta">
        {live ? (
          <span className="ml-liveline" role="status" aria-label="Live match">
            <span className="ml-live"><span aria-hidden="true">🔴 </span>LIVE</span>
            <span className="ml-date">{date}</span>
          </span>
        ) : (
          <span className={"ml-date" + (upcoming ? " upcoming" : "")}>{upcoming ? `📅 ${date}` : date}</span>
        )}
        {privacy && <span className={"ml-priv " + privacy}>{privacy === "public" ? "◉ public" : "🔒 private"}</span>}
      </span>
    </Link>
  );
}
