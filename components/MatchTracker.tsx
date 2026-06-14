// @ts-nocheck
"use client";
import React from "react";
import { useMatchEditor } from "@/components/match-tracker/useMatchEditor";
import DetailsView from "@/components/match-tracker/DetailsView";
import BrandFooter from "@/components/BrandFooter";
import GameModeView from "@/components/match-tracker/GameModeView";
import NewMatchWizard from "@/components/match-tracker/NewMatchWizard";
import LineupView from "@/components/match-tracker/LineupView";
import NotationView from "@/components/match-tracker/NotationView";
import EditorChrome from "@/components/match-tracker/EditorChrome";

export default function MatchTracker({ initialId = null, wizard = false }: { initialId?: string | null; wizard?: boolean }) {
  const {
    router, sb,
    raw, setRaw, recordPayload, curId,
    homeTeam, setHomeTeam, awayTeam, setAwayTeam,
    colorHome, setColorHome, colorHome2, setColorHome2, colorAway, setColorAway, colorAway2, setColorAway2,
    homeRoster, setHomeRoster, awayRoster, setAwayRoster,
    homeTeamId, setHomeTeamId, awayTeamId, setAwayTeamId,
    homeSquad, setHomeSquad, awaySquad, setAwaySquad,
    nameDisplay, setNameDisplay,
    label, setLabel,
    sport, setSport,
    matchDate, setMatchDate,
    userEmail, userUid, userIsAdmin,
    saved, savedMsg, refreshList,
    colorPick, setColorPick,
    modal, setModal,
    menuOpen, setMenuOpen,
    confirmDel, setConfirmDel,
    exportText, importText, setImportText,
    notaView, setNotaView,
    blkEdit, setBlkEdit, blkIns, setBlkIns, lineupEdit, setLineupEdit,
    remoteConflict, setRemoteConflict,
    showDetails, setShowDetails,
    tab, setTab, view, tabs,
    canUndo, undoRaw, doUndo, undoTarget,
    parsed, header, roster, totals, result, series, goalDots, twoPtDots, chartMarkers, scorers, scoring, notes, halfMarks, htLine,
    effMode, sportLabel, homeName, awayName, usedColors,
    timeline, timelineHA, homeScorers, awayScorers, homeSeries,
    homeColor, awayColor, homeColor2, awayColor2, homeSquadV, awaySquadV,
    maxLeadVenue, starters, subs, missing, formationRows, liveRows, liveEvents, chunk,
    phase, evEnabled,
    blocks,
    doSave, doLoad, doResyncLatest, doNew, doDuplicate, doDelete,
    setHeaderField, onHomeTeamChange,
    append, completeSub, evLabel, pickGmTeam, onPitchSet, benchSet, gmPicker,
    tapPitch, tapBench, resetLineupModes, tapPlayer, renumValid, applyRenum,
    whoCtx, buildEventLine, liveLine, whoGrid, addLive,
    enterNew, enterShare,
    nwPickHome, nwCreateHome, nwPickAway, nwCreateAway,
    reTeamPickHome, reTeamCreateHome, reTeamPickAway, reTeamCreateAway, reTeamApply,
    finishNew, doSwap,
    blkPill, openBlk, blkOk, blkDelete, openInsert, openLineup, lineupOk,
    insCommit, insPickTeam, subWho, noteLine, notePhantom,
    subArrows, playerMarks, scoreFor,
    doExport, openBackup, copyExport, doImport,
    subPick, setSubPick, editLineup, setEditLineup,
    gmStage, setGmStage,
    nw, setNw, nwTeams, setNwTeams, reTeam, setReTeam,
    share, setShare, shareModel, setShareModel,
    EMPTY_ROSTER,
  } = useMatchEditor({ initialId, wizard });

  return (
    <div className="mt-root">

      <EditorChrome
        nw={nw} userEmail={userEmail} userIsAdmin={userIsAdmin} userUid={userUid}
        onSignOut={async () => { await sb.auth.signOut(); router.push("/"); }}
        enterShare={enterShare} remoteConflict={remoteConflict} doResyncLatest={doResyncLatest}
        shareModel={shareModel} setShareModel={setShareModel}
        modal={modal} setModal={setModal} exportText={exportText} copyExport={copyExport}
        importText={importText} setImportText={setImportText} doImport={doImport}
        share={share} curId={curId} recordPayload={recordPayload} setShare={setShare}
        doExport={doExport} setNameDisplay={setNameDisplay}
        totals={totals} homeName={homeName} awayName={awayName}
        homeColor={homeColor} homeColor2={homeColor2} awayColor={awayColor} awayColor2={awayColor2}
        header={header} sportLabel={sportLabel} matchDate={matchDate} effMode={effMode}
        phase={phase} homeSquadV={homeSquadV} awaySquadV={awaySquadV}
        showDetails={showDetails} setShowDetails={setShowDetails} setColorPick={setColorPick} colorPick={colorPick}
        setMatchDate={setMatchDate} homeTeam={homeTeam} onHomeTeamChange={onHomeTeamChange}
        colorHome={colorHome} colorHome2={colorHome2} doSwap={doSwap} awayTeam={awayTeam} setHeaderField={setHeaderField} colorAway={colorAway} colorAway2={colorAway2}
        sport={sport} setReTeam={setReTeam} setNwTeams={setNwTeams} reTeam={reTeam} nwTeams={nwTeams}
        reTeamPickHome={reTeamPickHome} reTeamCreateHome={reTeamCreateHome}
        reTeamPickAway={reTeamPickAway} reTeamCreateAway={reTeamCreateAway} reTeamApply={reTeamApply}
        setColorHome={setColorHome} setColorHome2={setColorHome2} setColorAway={setColorAway} setColorAway2={setColorAway2}
        usedColors={usedColors} tabs={tabs} tab={tab} setTab={setTab} savedMsg={savedMsg}
      />

      <div className="mt-body">
        {view === "new" && (
          <NewMatchWizard
            nw={nw} setNw={setNw} nwTeams={nwTeams}
            nwPickHome={nwPickHome} nwCreateHome={nwCreateHome}
            nwPickAway={nwPickAway} nwCreateAway={nwCreateAway}
            finishNew={finishNew} onCancel={() => router.push("/")}
          />
        )}
        {view === "game" && (
          <GameModeView
            phase={phase} halfMarks={halfMarks} gmStage={gmStage} setGmStage={setGmStage}
            liveEvents={liveEvents} effMode={effMode} homeName={homeName} awayName={awayName}
            colorHome={colorHome} colorAway={colorAway} colorHome2={colorHome2} colorAway2={colorAway2}
            homeColor={homeColor} awayColor={awayColor} homeColor2={homeColor2} awayColor2={awayColor2}
            timelineHA={timelineHA} undoTarget={undoTarget} canUndo={canUndo} evLabel={evLabel}
            addLive={addLive} pickGmTeam={pickGmTeam} gmPicker={gmPicker}
            onPitchSet={onPitchSet} benchSet={benchSet} completeSub={completeSub} undoRaw={undoRaw}
          />
        )}

        {view === "details" && (
          <DetailsView
            parsed={parsed} effMode={effMode} homeName={homeName} awayName={awayName} maxLeadVenue={maxLeadVenue}
            homeSeries={homeSeries} goalDots={goalDots} twoPtDots={twoPtDots} chartMarkers={chartMarkers} htLine={htLine} halfMarks={halfMarks}
            homeScorers={homeScorers} awayScorers={awayScorers} timelineHA={timelineHA}
            homeColor={homeColor} awayColor={awayColor} homeColor2={homeColor2} awayColor2={awayColor2}
          />
        )}

        {view === "lineup" && (
          <LineupView
            editLineup={editLineup} setEditLineup={setEditLineup}
            homeRoster={homeRoster} awayRoster={awayRoster}
            setHomeRoster={setHomeRoster} setAwayRoster={setAwayRoster} EMPTY_ROSTER={EMPTY_ROSTER}
            colorHome={colorHome} colorAway={colorAway} colorHome2={colorHome2} colorAway2={colorAway2}
            homeName={homeName} awayName={awayName}
            formationRows={formationRows} chunk={chunk} starters={starters} subs={subs} missing={missing}
            subPick={subPick} setSubPick={setSubPick} tapPlayer={tapPlayer}
            subArrows={subArrows} playerMarks={playerMarks} scoreFor={scoreFor}
          />
        )}

        {view === "advanced" && (
          <NotationView
            notaView={notaView} setNotaView={setNotaView} canUndo={canUndo} undoRaw={undoRaw}
            setBlkEdit={setBlkEdit} setBlkIns={setBlkIns} setLineupEdit={setLineupEdit}
            raw={raw} setRaw={setRaw} blocks={blocks} blkEdit={blkEdit} blkIns={blkIns}
            blkOk={blkOk} blkDelete={blkDelete} blkPill={blkPill} openBlk={openBlk} openInsert={openInsert}
            liveEvents={liveEvents} effMode={effMode} evLabel={evLabel}
            colorHome={colorHome} colorAway={colorAway} homeName={homeName} awayName={awayName}
            gmPicker={gmPicker} insCommit={insCommit} insPickTeam={insPickTeam} buildEventLine={buildEventLine}
            subWho={subWho} whoCtx={whoCtx} onPitchSet={onPitchSet} benchSet={benchSet}
            notePhantom={notePhantom} noteLine={noteLine}
          />
        )}
        {view !== "game" && view !== "new" && curId && (
          <section className="mt-danger">
            <h3 className="mt-h">Danger</h3>
            <button
              className={"mt-add" + (confirmDel ? " danger" : "")}
              onClick={() => {
                if (!confirmDel) { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3500); return; }
                setConfirmDel(false); doDelete();
              }}
            >{confirmDel ? "Tap again to delete this match" : "🗑 Delete match"}</button>
          </section>
        )}
      </div>
      <BrandFooter />
    </div>
  );
}
