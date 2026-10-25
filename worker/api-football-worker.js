/**
 * Futebol Stats — API-Football proxy for Cloudflare Workers.
 *
 * Required secret: API_FOOTBALL_KEY
 * Public site: https://markyto34.github.io
 *
 * Routes:
 *   GET /?action=status
 *   GET /?action=fixtures&league=POR_1_primeira-liga&season=2627
 *
 * No odds are requested or returned.
 */

const API_BASE = "https://v3.football.api-sports.io";
const ALLOWED_ORIGINS = new Set([
  "https://markyto34.github.io",
]);

const LEAGUES = {
  "POR_1_primeira-liga": 94,
  "ENG_1_premier-league": 39,
  "ESP_1_la-liga": 140,
  "ITA_1_serie-a": 135,
  "GER_1_bundesliga": 78,
  "FRA_1_ligue-1": 61,
  "NED_1_eredivisie": 88,
  "BRA_1_serie-a": 71,
  "UEFA_1_champions-league": 2,
  "BEL_1_pro-league": 144,
  "TUR_1_super-lig": 203,
  "ENG_2_championship": 40,
  "USA_1_mls": 253,
};

function corsHeaders(origin) {
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://markyto34.github.io";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function apiSeason(value) {
  // Site season labels such as 2627 mean the season starting in 2026.
  if (/^\d{4}$/.test(value || "")) return Number(value.slice(0, 2)) + 2000;
  if (/^20\d{2}$/.test(value || "")) return Number(value);
  return null;
}

async function apiGet(path, key) {
  const response = await fetch(API_BASE + path, {
    headers: { "x-apisports-key": key },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error("A API-Football respondeu com HTTP " + response.status);
    err.status = response.status;
    throw err;
  }
  if (payload.errors && Object.keys(payload.errors).length) {
    const err = new Error("A API-Football devolveu um erro de validação.");
    err.details = payload.errors;
    throw err;
  }
  return payload;
}

function statValue(statistics, type) {
  const entry = (statistics || []).find((item) => item.type === type);
  return entry && entry.value != null ? entry.value : null;
}

function toFixture(item) {
  const teams = item.teams || {};
  const goals = item.goals || {};
  const score = item.score || {};
  const homeStats = item._homeStats || [];
  const awayStats = item._awayStats || [];
  const status = item.fixture?.status || {};
  const date = item.fixture?.date || null;

  return {
    fixtureId: item.fixture?.id ?? null,
    date,
    timestamp: item.fixture?.timestamp ?? null,
    status: status.short || null,
    statusLong: status.long || null,
    finished: ["FT", "AET", "PEN"].includes(status.short),
    home: teams.home?.name || null,
    away: teams.away?.name || null,
    homeId: teams.home?.id ?? null,
    awayId: teams.away?.id ?? null,
    homeGoals: goals.home ?? null,
    awayGoals: goals.away ?? null,
    htHomeGoals: score.halftime?.home ?? null,
    htAwayGoals: score.halftime?.away ?? null,
    homeCorners: statValue(homeStats, "Corner Kicks"),
    awayCorners: statValue(awayStats, "Corner Kicks"),
    homeShots: statValue(homeStats, "Total Shots"),
    awayShots: statValue(awayStats, "Total Shots"),
    homeShotsOnTarget: statValue(homeStats, "Shots on Goal"),
    awayShotsOnTarget: statValue(awayStats, "Shots on Goal"),
    homePossession: statValue(homeStats, "Ball Possession"),
    awayPossession: statValue(awayStats, "Ball Possession"),
    homeYellowCards: statValue(homeStats, "Yellow Cards"),
    awayYellowCards: statValue(awayStats, "Yellow Cards"),
    homeRedCards: statValue(homeStats, "Red Cards"),
    awayRedCards: statValue(awayStats, "Red Cards"),
    source: "API-Football",
  };
}

async function getFixtures(url, key) {
  const leagueKey = url.searchParams.get("league") || "";
  const leagueId = LEAGUES[leagueKey];
  const season = apiSeason(url.searchParams.get("season") || "");
  if (!leagueId) {
    return { error: "Liga não reconhecida.", allowedLeagues: Object.keys(LEAGUES) };
  }
  if (!season || season < 2010 || season > new Date().getUTCFullYear() + 1) {
    return { error: "Época inválida. Usa, por exemplo, 2627 para 2026/27." };
  }

  const apiUrl = new URL("/fixtures", API_BASE);
  apiUrl.searchParams.set("league", String(leagueId));
  apiUrl.searchParams.set("season", String(season));
  const requestedStatus = url.searchParams.get("status");
  if (requestedStatus && ["NS", "FT", "LIVE"].includes(requestedStatus)) {
    if (requestedStatus === "LIVE") {
      // API-Football uses several short codes for live matches.
      apiUrl.searchParams.set("live", "all");
    } else {
      apiUrl.searchParams.set("status", requestedStatus);
    }
  }

  const payload = await apiGet(apiUrl.pathname + apiUrl.search, key);
  const fixtures = (payload.response || []).map(toFixture);
  return {
    source: "API-Football",
    league: leagueKey,
    leagueId,
    season,
    results: fixtures,
    count: fixtures.length,
    paging: payload.paging || null,
    errors: payload.errors || null,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "GET") {
      return json({ error: "Método não permitido." }, 405, origin);
    }

    if (!env.API_FOOTBALL_KEY) {
      return json({
        error: "Falta configurar o segredo API_FOOTBALL_KEY no Cloudflare Worker.",
        code: "MISSING_API_KEY",
      }, 500, origin);
    }

    const action = url.searchParams.get("action") || "status";
    try {
      if (action === "status") {
        const result = await apiGet("/status", env.API_FOOTBALL_KEY);
        const account = result.response?.account || null;
        const subscription = result.response?.subscription || null;
        const requests = result.response?.requests || null;
        return json({
          ok: true,
          source: "API-Football",
          account: account ? { firstname: account.firstname, lastname: account.lastname } : null,
          subscription: subscription ? {
            plan: subscription.plan,
            end: subscription.end,
            active: subscription.active,
          } : null,
          requests,
        }, 200, origin);
      }

      if (action === "fixtures") {
        const result = await getFixtures(url, env.API_FOOTBALL_KEY);
        if (result.error) return json(result, 400, origin);
        return json(result, 200, origin);
      }

      return json({ error: "Ação não reconhecida. Usa action=status ou action=fixtures." }, 400, origin);
    } catch (error) {
      return json({
        error: error.message || "Erro ao consultar a API-Football.",
        status: error.status || 502,
        details: error.details || undefined,
      }, error.status || 502, origin);
    }
  },
};
