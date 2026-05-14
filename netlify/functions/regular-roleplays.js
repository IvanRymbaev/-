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
      let query = supabase.from("regular_role_plays").select("*");
      if (ownerId) query = query.eq("owner_profile_id", ownerId);
      const { data, error } = await query;
      if (error) throw error;
      return json(200, { regularRolePlays: data || [] });
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
          .from("regular_role_plays")
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

        const meeting_goals_score = normalizeScore(rp.meeting_goals_score);
        const company_intro_score = normalizeScore(rp.company_intro_score);
        const qualification_score = normalizeScore(rp.qualification_score);
        const demonstration_score = normalizeScore(rp.demonstration_score);
        const selling_score = normalizeScore(rp.selling_score);
        const structure_skill_score = normalizeScore(rp.structure_skill_score);
        const follow_up_score = normalizeScore(rp.follow_up_score);
        const objections_score = normalizeScore(rp.objections_score);
        const agreements_score = normalizeScore(rp.agreements_score);
        if (
          [
            meeting_goals_score,
            company_intro_score,
            qualification_score,
            demonstration_score,
            selling_score,
            structure_skill_score,
            follow_up_score,
            objections_score,
            agreements_score,
          ].some((s) => s === undefined)
        ) {
          return json(400, { error: "scores must be integers 0..10" });
        }

        const row = {
          id: rp.id,
          owner_profile_id: String(rp.owner_profile_id || "").trim(),
          rp_date: String(rp.rp_date || "").trim(),
          meeting_goals: String(rp.meeting_goals || ""),
          company_intro: String(rp.company_intro || ""),
          qualification: String(rp.qualification || ""),
          demonstration: String(rp.demonstration || ""),
          selling: String(rp.selling || ""),
          structure_skill: String(rp.structure_skill || ""),
          follow_up: String(rp.follow_up || ""),
          objections: String(rp.objections || ""),
          agreements: String(rp.agreements || ""),
          meeting_goals_score,
          company_intro_score,
          qualification_score,
          demonstration_score,
          selling_score,
          structure_skill_score,
          follow_up_score,
          objections_score,
          agreements_score,
          created_at: rp.created_at,
        };
        if (!row.owner_profile_id || !row.rp_date) {
          return json(400, { error: "owner_profile_id and rp_date are required" });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(row.rp_date)) {
          return json(400, { error: "rp_date must be YYYY-MM-DD" });
        }
        const { error } = await supabase.from("regular_role_plays").upsert(row, { onConflict: "id" });
        if (error) throw error;
        return json(200, { ok: true, fn: "regular-roleplays@v1" });
      }

      return json(400, { error: "Unknown POST body" });
    }

    return json(405, { error: "Method not allowed" });
  } catch (e) {
    return json(500, { error: e?.message || String(e) });
  }
};
