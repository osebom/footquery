import { executeReadonlySql } from "@/lib/db/execute-sql";

export const maxDuration = 15;

type Entity = { id: number; name: string };

// Returns the full set of players and teams for the @-mention picker. The data
// is static for a season, so we let the browser cache it; the picker fetches
// it once per session and filters in-memory.
export async function GET() {
  const [players, teams] = await Promise.all([
    executeReadonlySql(
      `SELECT player_id AS id, player_name AS name
       FROM player_mapping
       WHERE player_name IS NOT NULL
       ORDER BY player_name`,
    ),
    executeReadonlySql(
      `SELECT team_id AS id, name
       FROM team_mapping
       WHERE name IS NOT NULL
       ORDER BY name`,
    ),
  ]);

  if ("error" in players) {
    return Response.json({ error: players.error }, { status: 500 });
  }
  if ("error" in teams) {
    return Response.json({ error: teams.error }, { status: 500 });
  }

  return Response.json(
    {
      players: players.rows as unknown as Entity[],
      teams: teams.rows as unknown as Entity[],
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    },
  );
}
