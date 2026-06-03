import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { executeReadonlySql } from "@/lib/db/execute-sql";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const CONFIDENCE_THRESHOLD = 0.6;
const TRGM_THRESHOLD = 0.2;

type PlayerCandidate = {
  player_id: number;
  player_name: string;
  confidence: number;
};

type TeamCandidate = {
  team_id: number;
  name: string;
  confidence: number;
};

const PLAYER_ALIASES: Record<string, string> = {
  "mo salah": "Mohamed Salah",
  salah: "Mohamed Salah",
  kdb: "Kevin De Bruyne",
  "de bruyne": "Kevin De Bruyne",
  vvd: "Virgil van Dijk",
  "van dijk": "Virgil van Dijk",
  trent: "Trent Alexander-Arnold",
  taa: "Trent Alexander-Arnold",
  bruno: "Bruno Fernandes",
  rashford: "Marcus Rashford",
  saka: "Bukayo Saka",
  odegaard: "Martin Ødegaard",
  son: "Heung-min Son",
  sonny: "Heung-min Son",
  isak: "Alexander Isak",
  watkins: "Ollie Watkins",
  palmer: "Cole Palmer",
  foden: "Phil Foden",
  rodri: "Rodri",
  doku: "Jérémy Doku",
  mbeumo: "Bryan Mbeumo",
  wissa: "Yoane Wissa",
  mateta: "Jean-Philippe Mateta",
  eze: "Eberechi Eze",
  cunha: "Matheus Cunha",
};

const TEAM_ALIASES: Record<string, string> = {
  spurs: "Tottenham Hotspur",
  wolves: "Wolverhampton Wanderers",
  hammers: "West Ham United",
  "man u": "Manchester United",
  "man utd": "Manchester United",
  "man united": "Manchester United",
  "man city": "Manchester City",
  toon: "Newcastle United",
  magpies: "Newcastle United",
  gunners: "Arsenal FC",
  citizens: "Manchester City",
  "red devils": "Manchester United",
  reds: "Liverpool FC",
  blues: "Chelsea FC",
  villans: "Aston Villa",
  villa: "Aston Villa",
  saints: "Southampton FC",
  "tractor boys": "Ipswich Town",
  tigers: "Hull City",
  eagles: "Crystal Palace",
  palace: "Crystal Palace",
  forest: "Nottingham Forest",
  cottagers: "Fulham FC",
  bees: "Brentford FC",
  foxes: "Leicester City",
  seagulls: "Brighton & Hove Albion",
  cherries: "AFC Bournemouth",
  hatters: "Luton Town",
  potters: "Stoke City",
  rams: "Derby County",
};

function escape(text: string): string {
  return text.replace(/'/g, "''");
}

// Split a candidate name into lowercase word tokens so we can check whether
// every token of the user's input is a prefix of some token in the name.
// "Mohamed Salah" → ["mohamed", "salah"]; "Salah-Eddine Oulad M'Hand" →
// ["salah", "eddine", "oulad", "m", "hand"].
function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
}

// Returns a small bonus (0–0.3) reflecting how well every token of the user's
// input matches as a *prefix* of some token in the candidate name. This is the
// signal that distinguishes "Mo Salah" → "Mohamed Salah" (both "mo" and "salah"
// match prefixes) from "Salah-Eddine Oulad M'Hand" (only "salah" matches).
function prefixCoverageBonus(input: string, candidate: string): number {
  const inputTokens = tokenize(input);
  if (inputTokens.length === 0) return 0;
  const candidateTokens = tokenize(candidate);
  let matched = 0;
  for (const t of inputTokens) {
    if (candidateTokens.some((c) => c.startsWith(t))) matched += 1;
  }
  return (matched / inputTokens.length) * 0.3;
}

function rerankByPrefixCoverage<T extends { confidence: number }>(
  input: string,
  candidates: T[],
  nameOf: (c: T) => string,
): T[] {
  return [...candidates]
    .map((c) => ({
      ...c,
      confidence: Math.min(
        1,
        c.confidence + prefixCoverageBonus(input, nameOf(c)),
      ),
    }))
    .sort((a, b) => b.confidence - a.confidence);
}

async function fuzzySearchPlayers(text: string): Promise<PlayerCandidate[]> {
  const escaped = escape(text);
  const result = await executeReadonlySql(`
    SELECT
      player_id,
      player_name,
      GREATEST(
        CASE WHEN lower(player_name) = lower('${escaped}') THEN 1.0 ELSE 0 END,
        word_similarity(lower('${escaped}'), lower(player_name)),
        similarity(lower(player_name), lower('${escaped}'))
      ) AS confidence
    FROM player_mapping
    WHERE
      lower(player_name) = lower('${escaped}')
      OR word_similarity(lower('${escaped}'), lower(player_name)) > ${TRGM_THRESHOLD}
      OR similarity(lower(player_name), lower('${escaped}')) > ${TRGM_THRESHOLD}
    ORDER BY confidence DESC
    LIMIT 3
  `);

  if ("error" in result) {
    throw new Error(`Player search failed: ${result.error}`);
  }
  return result.rows as unknown as PlayerCandidate[];
}

async function fuzzySearchTeams(text: string): Promise<TeamCandidate[]> {
  const escaped = escape(text);
  const result = await executeReadonlySql(`
    SELECT
      team_id,
      name,
      GREATEST(
        CASE WHEN lower(name) = lower('${escaped}') THEN 1.0 ELSE 0 END,
        word_similarity(lower('${escaped}'), lower(name)),
        similarity(lower(name), lower('${escaped}'))
      ) AS confidence
    FROM team_mapping
    WHERE
      lower(name) = lower('${escaped}')
      OR word_similarity(lower('${escaped}'), lower(name)) > ${TRGM_THRESHOLD}
      OR similarity(lower(name), lower('${escaped}')) > ${TRGM_THRESHOLD}
    ORDER BY confidence DESC
    LIMIT 3
  `);

  if ("error" in result) {
    throw new Error(`Team search failed: ${result.error}`);
  }
  return result.rows as unknown as TeamCandidate[];
}

async function exactPlayerMatch(
  text: string,
): Promise<{ player_id: number; player_name: string } | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("player_mapping")
    .select("player_id, player_name")
    .ilike("player_name", text)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Player lookup failed: ${error.message}`);
  }

  return data;
}

async function exactTeamMatch(
  text: string,
): Promise<{ team_id: number; name: string } | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("team_mapping")
    .select("team_id, name")
    .ilike("name", text)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Team lookup failed: ${error.message}`);
  }

  return data;
}

const resolveEntitySchema = z.object({
  text: z.string().describe("The name or nickname mentioned by the user"),
  entity_type: z
    .enum(["player", "team"])
    .describe("Whether to resolve a player or team"),
});

export const resolveEntityTool = tool(
  async ({ text, entity_type }: z.infer<typeof resolveEntitySchema>) => {
    const query = text.trim();

    if (!query) {
      return { error: "Entity text cannot be empty." };
    }

    if (entity_type === "player") {
      const exact = await exactPlayerMatch(query);
      if (exact) {
        return {
          player_id: exact.player_id,
          player_name: exact.player_name,
          confidence: 1,
        };
      }

      const aliasTarget = PLAYER_ALIASES[query.toLowerCase()];
      if (aliasTarget) {
        const aliased = await exactPlayerMatch(aliasTarget);
        if (aliased) {
          return {
            player_id: aliased.player_id,
            player_name: aliased.player_name,
            confidence: 0.95,
          };
        }
      }

      const rawCandidates = await fuzzySearchPlayers(query);
      if (rawCandidates.length === 0) {
        return { error: `No player found matching "${query}".` };
      }
      const candidates = rerankByPrefixCoverage(
        query,
        rawCandidates,
        (c) => c.player_name,
      );

      const top = candidates[0];
      if (top.confidence >= CONFIDENCE_THRESHOLD) {
        return {
          player_id: top.player_id,
          player_name: top.player_name,
          confidence: top.confidence,
        };
      }

      return {
        candidates: candidates.map((c) => ({
          player_id: c.player_id,
          player_name: c.player_name,
          confidence: c.confidence,
        })),
        message: `Low confidence for "${query}". Ask the user to clarify.`,
      };
    }

    const exact = await exactTeamMatch(query);
    if (exact) {
      return {
        team_id: exact.team_id,
        name: exact.name,
        confidence: 1,
      };
    }

    const aliasTarget = TEAM_ALIASES[query.toLowerCase()];
    if (aliasTarget) {
      const aliased = await exactTeamMatch(aliasTarget);
      if (aliased) {
        return {
          team_id: aliased.team_id,
          name: aliased.name,
          confidence: 0.95,
        };
      }
    }

    const rawCandidates = await fuzzySearchTeams(query);
    if (rawCandidates.length === 0) {
      return { error: `No team found matching "${query}".` };
    }
    const candidates = rerankByPrefixCoverage(
      query,
      rawCandidates,
      (c) => c.name,
    );

    const top = candidates[0];
    if (top.confidence >= CONFIDENCE_THRESHOLD) {
      return {
        team_id: top.team_id,
        name: top.name,
        confidence: top.confidence,
      };
    }

    return {
      candidates: candidates.map((c) => ({
        team_id: c.team_id,
        name: c.name,
        confidence: c.confidence,
      })),
      message: `Low confidence for "${query}". Ask the user to clarify.`,
    };
  },
  {
    name: "resolve_entity",
    description:
      "Resolve a user-mentioned player or team name to a canonical database entity. Always call this before using a player or team name in SQL.",
    schema: resolveEntitySchema,
  },
);
