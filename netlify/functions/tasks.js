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

function parseQueryString(queryString) {
  const qs = String(queryString || "").replace(/^\?/, "");
  const out = {};
  for (const part of qs.split("&")) {
    if (!part) continue;
    const [k, v] = part.split("=");
    out[decodeURIComponent(k || "")] = decodeURIComponent(v || "");
  }
  return out;
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
      const query = parseQueryString(event.queryStringParameters ? "" : event.rawQuery || event.queryString || "");
      const day = String((event.queryStringParameters && event.queryStringParameters.day) || query.day || "").trim();
      if (!day) {
        return json(400, { error: "day is required" });
      }
      const { data, error } = await supabase.from("tasks").select("*").eq("day", day);
      if (error) throw error;
      return json(200, { tasks: data || [] });
    }

    if (event.httpMethod === "POST") {
      let body = {};
      try {
        body = JSON.parse(event.body || "{}");
      } catch {
        return json(400, { error: "Invalid JSON body" });
      }

      if (body.rolloverOpen) {
        const targetDay = String(body.targetDay || "").trim();
        if (!targetDay) return json(400, { error: "targetDay is required" });

        // переносим незакрытые задачи на новый день, если они еще на старом дне
        const { data: openTasks, error: selErr } = await supabase.from("tasks").select("*").eq("day", targetDay).eq("done", false);
        if (selErr) throw selErr;
        // на backend это заглушка: фронт хранит перенос локально; в облаке перенос не обязателен
        return json(200, { ok: true, tasks: openTasks || [] });
      }

      if (body.deleteById) {
        const id = String(body.id || "").trim();
        const ownerId = String(body.owner_profile_id || "").trim();
        if (!id || !ownerId) {
          return json(400, { error: "id and owner_profile_id are required" });
        }
        const { error } = await supabase.from("tasks").delete().eq("id", id).eq("owner_profile_id", ownerId);
        if (error) throw error;
        return json(200, { ok: true });
      }

      if (body.deleteCompleted) {
        const scope = String(body.scope || "").trim();
        if (scope === "all") {
          const { error } = await supabase.from("tasks").delete().eq("done", true);
          if (error) throw error;
          return json(200, { ok: true });
        }
        if (scope === "profile") {
          const profileId = String(body.profileId || "").trim();
          if (!profileId) return json(400, { error: "profileId is required" });
          const { error } = await supabase.from("tasks").delete().eq("done", true).eq("owner_profile_id", profileId);
          if (error) throw error;
          return json(200, { ok: true });
        }
        return json(400, { error: "Invalid scope" });
      }

      if (body.upsert && body.task) {
        const t = body.task;
        const row = {
          id: t.id,
          owner_profile_id: String(t.owner_profile_id || "").trim(),
          text: String(t.text || "").trim(),
          day: String(t.day || "").trim(),
          done: Boolean(t.done),
          created_at: t.created_at,
          done_at: t.done_at || null,
          done_comment: String(t.done_comment || ""),
        };
        if (!row.owner_profile_id || !row.text || !row.day) {
          return json(400, { error: "owner_profile_id, text and day are required" });
        }
        const { error } = await supabase.from("tasks").upsert(row, { onConflict: "id" });
        if (error) throw error;
        return json(200, { ok: true });
      }

      return json(400, { error: "Unknown POST body" });
    }

    return json(405, { error: "Method not allowed" });
  } catch (e) {
    return json(500, { error: e?.message || String(e) });
  }
};

