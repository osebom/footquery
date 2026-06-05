export const SCHEMA_CONTEXT = `
## Data scope
Premier League 2024/25 only. The entire database is already scoped to 2024/25 —
you do NOT need to filter by season_label unless the table explicitly has it.
Tables with season_label: vw_match_details, player_seasonstats, match_results, final_standings.
Tables WITHOUT season_label (do not add it): vw_player_matchstats, vw_match_events,
player_matchstats, match_events, player_mapping, team_mapping.

## Views (prefer these for queries)

### vw_player_matchstats
Player names + per-match stats. Built from player_matchstats + player_mapping.
Columns: id, match_id, player_id, player_name, team_id, position, minutes, goals, assists, goals_assists, started, subbed_on, subbed_off
Use for: scoring streaks, goals per match, appearance stats, position filters.

### vw_match_details
Team names + match results. Built from match_results + team_mapping.
Columns: match_id, match_date, round, home_team, away_team, home_goals, away_goals, win_team, loss_team, season_label
Use for: wins/losses/draws, biggest wins, worst defeats, head-to-head, away records, form by date.
Important: vw_match_details has team names and win/loss team IDs, but does NOT have home_id, away_id, result_string, or isdraw. Use raw match_results when you need home_id/away_id/result_string/isdraw.

### vw_match_events
Player/team names + events. Built from match_events + player_mapping + team_mapping.
Columns: event_id, match_id, team_id, team_name, event_type, minute, add_minute, active_player_id, active_player_name, passive_player_id, passive_player_name, home_goals, away_goals
Use for: goal timing, opening goals, match-winning goals, late goals.
event_type values (LOWERCASE): 'goal', 'penalty goal', 'own goal', 'penalty miss', 'yellow card', 'second yellow card', 'red card', 'substitute in'.
For "goals scored" use event_type IN ('goal', 'penalty goal').

## Raw tables (use when views are insufficient)

### player_mapping
player_id, player_name — canonical player lookup.

### team_mapping
team_id, name — canonical team lookup.

### player_matchstats
id, player_id, match_id, in_squad, started, subbed_on, subbed_off, minutes, goals, assists, goals_assists, pens_made, pens_att, own_goals, position, team_id

### player_seasonstats
player_id, goals, assists, contributions, player_name, season_label.
Use this FIRST for season totals like "how many goals/assists did X get this season",
league-wide top-scorer leaderboards, and any "season-level" aggregate. Do not compute season
totals from vw_player_matchstats unless this table is missing the metric.
IMPORTANT: this table has NO team_id column. For a single team's top scorer or any
team-scoped leaderboard you MUST use player_matchstats (which has team_id) instead.

### match_results
match_id, match_date, match_time_utc, round, home_id, away_id, home_goals, away_goals, result_string, isdraw, win_team, loss_team, season_label
Use match_results for team-id based match result queries. For a team's worst defeat: filter loss_team = resolved team_id, compute ABS(home_goals - away_goals), order descending, and join team_mapping on home_id/away_id to show team names.

### match_events
event_id, match_id, team_id, event_type, minute, add_minute, active_player_id, passive_player_id, home_goals, away_goals, opp_team_id.
event_type values are LOWERCASE (see vw_match_events). opp_team_id is the
opposing team for each event — use it directly for "against team X" queries
instead of joining match_results.

### final_standings
position, name, team_id, points, wins, draws, loses, goals_for, goals_against, goal_difference, games_played, season_label
`.trim();
