const { createClient } = require("@supabase/supabase-js");

const MAIN_PROFILE_ID = "rymbaev";

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

function normalizeDifficulty(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 10) return undefined;
  return n;
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
      const rpDate = String(params.rpDate || "").trim();
      const ownerId = String(params.ownerId || "").trim();
      if (!rpDate || !/^\d{4}-\d{2}-\d{2}$/.test(rpDate)) {
        return json(400, { error: "rpDate is required and must be YYYY-MM-DD" });
      }
      if (!ownerId) {
        return json(400, { error: "ownerId is required" });
      }
      // Промт дня — один на дату (мастер-строка); все профили читают её из БД.
      const { data, error } = await supabase
        .from("role_play_prompts")
        .select("*")
        .eq("rp_date", rpDate)
        .eq("owner_profile_id", MAIN_PROFILE_ID)
        .maybeSingle();
      if (error) throw error;
      const master = data || null;
      return json(200, { own: null, master, prompt: master, fn: "roleplay-prompts@v2" });
    }

    if (event.httpMethod === "POST") {
      let body = {};
      try {
        body = JSON.parse(event.body || "{}");
      } catch {
        return json(400, { error: "Invalid JSON body" });
      }
      const rpDate = String(body.rp_date || "").trim();
      const ownerId = String(body.owner_profile_id || "").trim();
      const prompt = String(body.prompt || "");
      const difficulty = normalizeDifficulty(body.difficulty);
      if (!rpDate || !/^\d{4}-\d{2}-\d{2}$/.test(rpDate)) {
        return json(400, { error: "rp_date is required and must be YYYY-MM-DD" });
      }
      if (!ownerId) {
        return json(400, { error: "owner_profile_id is required" });
      }
      if (difficulty === undefined) {
        return json(400, { error: "difficulty must be integer 0..10" });
      }

      if (ownerId !== MAIN_PROFILE_ID) {
        return json(403, {
          error: "Only the main profile can save the day prompt. Other profiles read it from the database.",
        });
      }

      const row = {
        rp_date: rpDate,
        owner_profile_id: MAIN_PROFILE_ID,
        prompt,
        difficulty,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("role_play_prompts")
        .upsert(row, { onConflict: "rp_date,owner_profile_id" })
        .select("*");
      if (error) throw error;
      const saved = (data && data[0]) || row;

      // Удаляем устаревшие персональные копии — единственный источник правды: мастер на дату.
      const { error: delErr } = await supabase
        .from("role_play_prompts")
        .delete()
        .eq("rp_date", rpDate)
        .neq("owner_profile_id", MAIN_PROFILE_ID);
      if (delErr) throw delErr;

      return json(200, { ok: true, saved, propagated: true, fn: "roleplay-prompts@v2" });
    }

    return json(405, { error: "Method not allowed" });
  } catch (e) {
    return json(500, { error: e?.message || String(e) });
  }
};
