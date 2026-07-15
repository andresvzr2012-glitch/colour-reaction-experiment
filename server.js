const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const MIDDLE_GRAY = "#808080";

const palette = [
  { name: "Red", hex: "#ff0000" },
  { name: "Orange", hex: "#ff7a00" },
  { name: "Yellow", hex: "#ffff00" },
  { name: "Green", hex: "#00ff00" },
  { name: "Cyan", hex: "#00ffff" },
  { name: "Blue", hex: "#0000ff" },
  { name: "Purple", hex: "#8a00ff" },
  { name: "Magenta", hex: "#ff00ff" },
  { name: "White", hex: "#ffffff" },
  { name: "Black", hex: "#000000" },
];

const state = {
  sessionCode: makeCode(),
  className: "",
  participants: new Map(),
  kickedIds: new Set(),
  hostClients: new Set(),
  participantClients: new Set(),
  phase: "lobby",
  order: shuffle(palette),
  roundIndex: -1,
  currentRound: null,
  responses: [],
  surveys: [],
  waitTimer: null,
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/events") return handleEvents(req, res, url);
  if (url.pathname.startsWith("/api/")) return handleApi(req, res, url);
  return serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`Science reaction app running at http://localhost:${PORT}`);
});

function handleEvents(req, res, url) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  res.write("\n");

  const role = url.searchParams.get("role");
  const bucket = role === "host" ? state.hostClients : state.participantClients;
  const client = { res };
  bucket.add(client);
  sendEvent(res, "state", publicState());

  req.on("close", () => {
    bucket.delete(client);
  });
}

async function handleApi(req, res, url) {
  try {
    if (req.method === "GET" && url.pathname === "/api/state") {
      return sendJson(res, publicState());
    }

    if (req.method === "GET" && url.pathname === "/api/export.csv") {
      return sendCsv(res);
    }

    if (req.method !== "POST") {
      return sendJson(res, { error: "Method not allowed" }, 405);
    }

    const body = await readJson(req);

    if (url.pathname === "/api/join") {
      const name = String(body.name || "").trim().slice(0, 40);
      const sessionCode = String(body.sessionCode || "").trim().toUpperCase();
      if (!name) return sendJson(res, { error: "Name is required." }, 400);
      if (sessionCode !== state.sessionCode) {
        return sendJson(res, { error: "Session code does not match." }, 403);
      }
      const id = body.id || makeId();
      state.participants.set(id, {
        id,
        name,
        joinedAt: Date.now(),
      });
      broadcast();
      return sendJson(res, { id, state: publicState() });
    }

    if (url.pathname === "/api/start") {
      clearPendingTimer();
      state.order = shuffle(palette);
      state.roundIndex = -1;
      state.currentRound = null;
      state.responses = [];
      state.surveys = [];
      state.phase = "ready";
      broadcast();
      return sendJson(res, { ok: true, state: publicState() });
    }

    if (url.pathname === "/api/next") {
      if (state.phase === "done") return sendJson(res, { error: "Experiment is finished." }, 400);
      return startNextRound(res);
    }

    if (url.pathname === "/api/reset") {
      clearPendingTimer();
      state.phase = "lobby";
      state.order = shuffle(palette);
      state.roundIndex = -1;
      state.currentRound = null;
      state.responses = [];
      state.surveys = [];
      state.participants.clear();
      state.kickedIds.clear();
      broadcast();
      return sendJson(res, { ok: true, state: publicState() });
    }

    if (url.pathname === "/api/refresh-code") {
      state.sessionCode = makeCode();
      broadcastTo(state.hostClients);
      return sendJson(res, { ok: true, state: publicState() });
    }

    if (url.pathname === "/api/class-name") {
      state.className = clean(body.className, 60);
      return sendJson(res, { ok: true });
    }

    if (url.pathname === "/api/end") {
      state.phase = "ended";
      broadcast();
      return sendJson(res, { ok: true, state: publicState() });
    }

    if (url.pathname === "/api/kick") {
      const id = String(body.id || "");
      if (state.participants.has(id)) {
        state.participants.delete(id);
        state.kickedIds.add(id);
        broadcast();
      }
      return sendJson(res, { ok: true });
    }

    if (url.pathname === "/api/respond") {
      return saveResponse(body, res);
    }

    if (url.pathname === "/api/survey") {
      return saveSurvey(body, res);
    }

    sendJson(res, { error: "Not found" }, 404);
  } catch (error) {
    sendJson(res, { error: error.message || "Server error" }, 500);
  }
}

function startNextRound(res) {
  clearPendingTimer();

  const nextIndex = state.roundIndex + 1;
  if (nextIndex >= state.order.length) {
    state.phase = "survey";
    state.currentRound = null;
    broadcast();
    return sendJson(res, { ok: true, state: publicState() });
  }

  const color = state.order[nextIndex];
  const delayMs = 3000 + Math.random() * 4000;
  const roundId = makeId();

  state.phase = "waiting";
  state.roundIndex = nextIndex;
  state.currentRound = {
    id: roundId,
    color,
    gray: MIDDLE_GRAY,
    delayMs,
    stimulusAt: null,
    startedAt: Date.now(),
  };
  broadcast();

  state.waitTimer = setTimeout(() => {
    if (!state.currentRound || state.currentRound.id !== roundId) return;
    state.currentRound.stimulusAt = Date.now();
    state.phase = "stimulus";
    broadcast();
  }, delayMs);

  return sendJson(res, { ok: true, state: publicState() });
}

function saveResponse(body, res) {
  const participantId = String(body.participantId || "");
  const roundId = String(body.roundId || "");
  const reactionMs = Number(body.reactionMs);
  const participant = state.participants.get(participantId);

  if (!participant) return sendJson(res, { error: "Participant not found." }, 404);
  if (!state.currentRound || roundId !== state.currentRound.id) {
    return sendJson(res, { error: "That round is no longer active." }, 400);
  }
  if (state.phase !== "stimulus") {
    return sendJson(res, { error: "Too early. Wait for the colour to appear." }, 400);
  }
  if (!Number.isFinite(reactionMs) || reactionMs < 0 || reactionMs > 30000) {
    return sendJson(res, { error: "Invalid reaction time." }, 400);
  }

  const alreadyAnswered = state.responses.some(
    (item) => item.participantId === participantId && item.roundId === roundId
  );
  if (!alreadyAnswered) {
    state.responses.push({
      participantId,
      participantName: participant.name,
      roundId,
      roundNumber: state.roundIndex + 1,
      colorName: state.currentRound.color.name,
      colorHex: state.currentRound.color.hex,
      reactionMs: Math.round(reactionMs),
      recordedAt: new Date().toISOString(),
    });
    broadcast();
  }

  sendJson(res, { ok: true, state: publicState() });
}

function saveSurvey(body, res) {
  const participantId = String(body.participantId || "");
  const participant = state.participants.get(participantId);
  if (!participant) return sendJson(res, { error: "Participant not found." }, 404);

  const survey = {
    participantId,
    participantName: participant.name,
    easiestColor: clean(body.easiestColor, 40),
    hardestColor: clean(body.hardestColor, 40),
    favouriteColor: clean(body.favouriteColor, 40),
    colorVision: clean(body.colorVision, 40),
    colorVisionDetail: clean(body.colorVisionDetail, 100),
    recordedAt: new Date().toISOString(),
  };

  const existingIndex = state.surveys.findIndex((item) => item.participantId === participantId);
  if (existingIndex >= 0) state.surveys[existingIndex] = survey;
  else state.surveys.push(survey);

  if (state.phase === "survey" && state.participants.size > 0) {
    const allSurveyed = [...state.participants.keys()].every((id) =>
      state.surveys.some((s) => s.participantId === id)
    );
    if (allSurveyed) state.phase = "ended";
  }

  broadcast();
  sendJson(res, { ok: true, state: publicState() });
}

function publicState() {
  const participantList = [...state.participants.values()].map((participant) => ({
    ...participant,
    responses: state.responses.filter((item) => item.participantId === participant.id).length,
    surveyed: state.surveys.some((item) => item.participantId === participant.id),
  }));

  return {
    sessionCode: state.sessionCode,
    className: state.className,
    phase: state.phase,
    kickedIds: [...state.kickedIds],
    participants: participantList,
    order: state.order,
    roundIndex: state.roundIndex,
    totalRounds: state.order.length,
    currentRound: state.currentRound,
    responses: state.responses,
    surveys: state.surveys,
    summary: summarizeResponses(),
  };
}

function summarizeResponses() {
  return state.order.map((color) => {
    const rows = state.responses.filter((item) => item.colorName === color.name);
    const average = rows.length
      ? Math.round(rows.reduce((sum, item) => sum + item.reactionMs, 0) / rows.length)
      : null;
    return {
      colorName: color.name,
      colorHex: color.hex,
      count: rows.length,
      average,
      fastest: rows.length ? Math.min(...rows.map((item) => item.reactionMs)) : null,
    };
  });
}

function sendCsv(res) {
  const columns = [
    "type",
    "className",
    "participantName",
    "roundNumber",
    "colorName",
    "colorHex",
    "reactionMs",
    "easiestColor",
    "hardestColor",
    "favouriteColor",
    "colorVision",
    "colorVisionDetail",
    "recordedAt",
  ];

  const responseRows = state.responses.map((row) => ({
    type: "reaction",
    className: state.className,
    participantName: row.participantName,
    roundNumber: row.roundNumber,
    colorName: row.colorName,
    colorHex: row.colorHex,
    reactionMs: row.reactionMs,
    recordedAt: row.recordedAt,
  }));

  const surveyRows = state.surveys.map((row) => ({
    type: "survey",
    className: state.className,
    participantName: row.participantName,
    easiestColor: row.easiestColor,
    hardestColor: row.hardestColor,
    favouriteColor: row.favouriteColor,
    colorVision: row.colorVision,
    colorVisionDetail: row.colorVisionDetail,
    recordedAt: row.recordedAt,
  }));

  const csv = [
    columns.join(","),
    ...[...responseRows, ...surveyRows].map((row) =>
      columns.map((column) => csvValue(row[column] ?? "")).join(",")
    ),
  ].join("\n");

  res.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": "attachment; filename=\"colour-reaction-results.csv\"",
  });
  res.end(csv);
}

function serveStatic(req, res, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    const type = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
    }[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
}

function broadcast() {
  broadcastTo(new Set([...state.hostClients, ...state.participantClients]));
}

function broadcastTo(clients) {
  const data = publicState();
  for (const client of clients) {
    sendEvent(client.res, "state", data);
  }
}

function sendEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
  });
}

function clearPendingTimer() {
  if (state.waitTimer) clearTimeout(state.waitTimer);
  state.waitTimer = null;
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function makeCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function csvValue(value) {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
