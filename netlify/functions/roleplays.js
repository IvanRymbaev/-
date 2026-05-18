const { createClient } = require("@supabase/supabase-js");

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async function handler(event) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return json(503, {
      error:
        "Server is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify → Site settings → Environment variables.",
    });
  }

  const supabase = createClient(url, key);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: {} };
  }

  try {
    if (event.httpMethod === "GET") {
      const params = event.queryStringParameters || {};
      const ownerId = String(params.ownerId || "").trim();
      let query = supabase.from("role_plays").select("*");
      // Каждый профиль видит только свои записи (включая главного).
      if (ownerId) query = query.eq("owner_profile_id", ownerId);
      const { data, error } = await query;
      if (error) throw error;
      return json(200, { rolePlays: data || [] });
    }

    if (event.httpMethod === "POST") {
      let body = {};
      try {
        body = JSON.parse(event.body || "{}");
      } catch {
        return json(400, { error: "Invalid JSON body" });
      }

      if (body.deleteById) {
        const id = String(body.id || "").trim();
        const ownerId = String(body.owner_profile_id || "").trim();
        if (!id || !ownerId) {
          return json(400, { error: "id and owner_profile_id are required" });
        }
        const { error } = await supabase
          .from("role_plays")
          .delete()
          .eq("id", id)
          .eq("owner_profile_id", ownerId);
        if (error) throw error;
        return json(200, { ok: true });
      }

      if (body.upsert && body.rolePlay) {
        const rp = body.rolePlay;

        function normalizeScore(v) {
          if (v === null || v === undefined || v === "") return null;
          const n = Number(v);
          if (!Number.isInteger(n) || n < 0 || n > 10) return undefined;
          return n;
        }

        const overall_score = normalizeScore(rp.overall_score);
        const greeting_score = normalizeScore(rp.greeting_score);
        const qualification_score = normalizeScore(rp.qualification_score);
        const presentation_score = normalizeScore(rp.presentation_score);
        const closing_score = normalizeScore(rp.closing_score);
        const next_step_score = normalizeScore(rp.next_step_score);
        if ([overall_score, greeting_score, qualification_score, presentation_score, closing_score, next_step_score].some((s) => s === undefined)) {
          return json(400, { error: "scores must be integers 0..10" });
        }

        const row = {
          id: rp.id,
          owner_profile_id: String(rp.owner_profile_id || "").trim(),
          rp_date: String(rp.rp_date || "").trim(),
          greeting: String(rp.greeting || ""),
          qualification: String(rp.qualification || ""),
          presentation: String(rp.presentation || ""),
          closing: String(rp.closing || ""),
          next_step: String(rp.next_step || ""),
          overall_score,
          greeting_score,
          qualification_score,
          presentation_score,
          closing_score,
          next_step_score,
          created_at: rp.created_at,
        };
        if (!row.owner_profile_id || !row.rp_date) {
          return json(400, { error: "owner_profile_id and rp_date are required" });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(row.rp_date)) {
          return json(400, { error: "rp_date must be YYYY-MM-DD" });
        }
        const { error } = await supabase.from("role_plays").upsert(row, { onConflict: "id" });
        if (error) throw error;
        return json(200, { ok: true, fn: "roleplays@scores-overall-v1" });
      }

      return json(400, { error: "Unknown POST body" });
    }

    return json(405, { error: "Method not allowed" });
  } catch (e) {
    return json(500, { error: e?.message || String(e) });
  }
};
