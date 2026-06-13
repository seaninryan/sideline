-- Re-snapshot each linked match's usSquad/oppSquad from its linked teams' CURRENT squad.
-- usSquad = the "us" team's squad; us is home iff data->>'homeAway' = 'home' (missing -> us = away).
-- Only touches matches that have BOTH home_team_id and away_team_id. Idempotent.
BEGIN;

UPDATE matches m
SET data = jsonb_set(
             jsonb_set(
               m.data,
               '{usSquad}',
               to_jsonb(COALESCE(CASE WHEN m.data->>'homeAway' = 'home' THEN th.squad ELSE ta.squad END, '')),
               true
             ),
             '{oppSquad}',
             to_jsonb(COALESCE(CASE WHEN m.data->>'homeAway' = 'home' THEN ta.squad ELSE th.squad END, '')),
             true
           )
FROM teams th, teams ta
WHERE th.id = m.home_team_id
  AND ta.id = m.away_team_id;

-- Verify: every linked match should now show non-empty us/opp squads matching the teams.
SELECT m.id,
       m.data->>'homeAway' AS home_away,
       m.data->>'usSquad'  AS us_squad,
       m.data->>'oppSquad' AS opp_squad,
       th.name || ' [' || COALESCE(th.squad, '') || ']' AS home_team,
       ta.name || ' [' || COALESCE(ta.squad, '') || ']' AS away_team
FROM matches m
LEFT JOIN teams th ON th.id = m.home_team_id
LEFT JOIN teams ta ON ta.id = m.away_team_id
ORDER BY m.updated_at DESC NULLS LAST;

-- Happy with the verify rows?  COMMIT;
-- Something off?               ROLLBACK;
