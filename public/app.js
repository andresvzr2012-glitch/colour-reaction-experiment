const app = document.querySelector("#app");
let state = null;
let participantId = localStorage.getItem("colourReactionParticipantId") || "";
let participantName = localStorage.getItem("colourReactionParticipantName") || "";
let localStimulusStart = 0;
let localRoundId = "";
let tickTimer = null;
let prematureTaps = { count: 0, lastAt: null };

const route = () => new URLSearchParams(location.search).get("role") || "home";

init();

function init() {
  const role = route();
  connectEvents(role === "host" ? "host" : "participant");
  if (role === "participant") document.body.classList.add("participant-mode");
  initFullscreenButton();
  render();
}

function initFullscreenButton() {
  const btn = document.createElement("button");
  btn.id = "fullscreenBtn";
  btn.title = "Toggle fullscreen";
  btn.innerHTML = expandIcon();
  btn.addEventListener("click", toggleFullscreen);
  document.body.appendChild(btn);

  const update = () => {
    btn.innerHTML = (document.fullscreenElement || document.webkitFullscreenElement) ? collapseIcon() : expandIcon();
  };
  document.addEventListener("fullscreenchange", update);
  document.addEventListener("webkitfullscreenchange", update);
}

function toggleFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else {
    (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  }
}

function expandIcon() {
  return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <polyline points="1,6 1,1 6,1"/><polyline points="12,1 17,1 17,6"/>
    <polyline points="17,12 17,17 12,17"/><polyline points="6,17 1,17 1,12"/>
  </svg>`;
}

function collapseIcon() {
  return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <polyline points="6,1 6,6 1,6"/><polyline points="12,6 17,6 17,1"/>
    <polyline points="17,12 12,12 12,17"/><polyline points="1,12 6,12 6,17"/>
  </svg>`;
}

function connectEvents(role) {
  const source = new EventSource(`/events?role=${role}`);
  source.addEventListener("state", (event) => {
    const nextState = JSON.parse(event.data);
    const previousRoundId = state?.currentRound?.id;
    const previousPhase = state?.phase;
    state = nextState;

    if (
      route() === "participant" &&
      state.phase === "stimulus" &&
      state.currentRound &&
      (previousRoundId !== state.currentRound.id || previousPhase !== "stimulus")
    ) {
      localStimulusStart = performance.now();
      localRoundId = state.currentRound.id;
    }

    if (route() === "participant" && state.phase === "waiting" && previousPhase !== "waiting") {
      prematureTaps = { count: 0, lastAt: null };
    }

    render();
  });
}
 
function render() {
  const role = route();
  if (!state) {
    app.innerHTML = layout(`<section class="home"><div class="choice-panel"><p>Loading experiment...</p></div></section>`);
    return;
  }

  if (role === "host") renderHost();
  else if (role === "participant") renderParticipant();
  else renderHome();
}

function renderHome() {
  app.innerHTML = layout(`
    <section class="home">
      <div class="choice-panel">
        <div class="choice-title">
          <h2></h2>
          <p class="subtle">Run a host-led reaction-time test where participants tap as soon as the screen changes colour.</p>
        </div>
        <div class="choice-grid">
          <button class="choice" data-route="host">
            <strong>Host experiment</strong>
            <span class="subtle">Start rounds, control the pace, watch results arrive, and export the data.</span>
          </button>
          <button class="choice" data-route="participant">
            <strong>Join as participant</strong>
            <span class="subtle">Enter your name, wait for the host, then tap when each colour appears.</span>
          </button>
        </div>
      </div>
    </section>
  `);

  app.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => {
      location.href = `/?role=${button.dataset.route}`;
    });
  });
}

function renderHost() {
  const round = state.currentRound;
  const answeredThisRound = round
    ? state.responses.filter((item) => item.roundId === round.id).length
    : 0;
  const latest = [...state.responses].slice(-8).reverse();

  app.innerHTML = layout(`
    <section class="workspace">
      <aside class="side">
        <div class="panel">
          <h2>Host controls</h2>
          <p class="subtle">Share this page's base address with participants, then ask them to choose "Join as participant".</p>
          <label class="stack">
            <span class="subtle">Class name</span>
            <input id="classNameInput" type="text" placeholder="e.g. 10B Science" maxlength="60" value="${escapeHtml(state.className || '')}" />
          </label>
          <div class="row">
            <span class="subtle">Session code</span>
            <span class="code">${state.sessionCode}</span>
            <button class="secondary small" data-action="refresh-code">&#8635; New code</button>
          </div>
          <div class="row">
            <button data-action="start">${state.phase === "lobby" ? "Start experiment" : "Restart experiment"}</button>
            <button class="secondary" data-action="next" ${["lobby", "waiting", "survey", "done"].includes(state.phase) ? "disabled" : ""}>Continue</button>
          </div>
          <div class="row">
            <a href="/api/export.csv"><button class="secondary">Export CSV</button></a>
            <button class="secondary" data-action="end" ${state.phase === "lobby" ? "disabled" : ""}>End session</button>
            <button class="danger" data-action="reset">Reset</button>
          </div>
        </div>

        <div class="panel">
          <h3>Participants</h3>
          <div class="participants">
            ${state.participants.length ? state.participants.map(personTemplate).join("") : `<div class="empty">Waiting for participants.</div>`}
          </div>
        </div>
      </aside>

      <section class="main">
        <div class="stat-grid">
          <div class="stat"><span class="subtle">Round</span><strong>${Math.max(state.roundIndex + 1, 0)} / ${state.totalRounds}</strong></div>
          <div class="stat"><span class="subtle">Responses</span><strong>${state.responses.length}</strong></div>
          <div class="stat"><span class="subtle">This round</span><strong>${answeredThisRound}</strong></div>
        </div>

        <div class="round-display">
          ${hostRoundTemplate(round)}
        </div>

        <div class="panel">
          <h3>Colour summary</h3>
          <div class="table">
            ${state.summary.map(summaryTemplate).join("")}
          </div>
        </div>

        <div class="panel">
          <h3>Latest results</h3>
          <div class="table">
            ${latest.length ? latest.map(resultTemplate).join("") : `<div class="empty">Results will appear after participants tap.</div>`}
          </div>
        </div>

        <div class="panel">
          <h3>Survey answers</h3>
          <div class="table">
            ${state.surveys.length ? state.surveys.map(surveyTemplate).join("") : `<div class="empty">Survey answers appear after all colours are complete.</div>`}
          </div>
        </div>
      </section>
    </section>
  `);

  app.querySelector("#classNameInput").addEventListener("change", (e) => post("/api/class-name", { className: e.target.value.trim() }));
  app.querySelector("[data-action='refresh-code']").addEventListener("click", () => post("/api/refresh-code"));
  app.querySelector("[data-action='start']").addEventListener("click", () => post("/api/start"));
  app.querySelector("[data-action='next']").addEventListener("click", () => post("/api/next"));
  app.querySelector("[data-action='end']").addEventListener("click", () => post("/api/end"));
  app.querySelector("[data-action='reset']").addEventListener("click", () => post("/api/reset"));
  app.querySelector(".participants").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action='kick']");
    if (btn) post("/api/kick", { id: btn.dataset.id });
  });
}

function renderParticipant() {
  if (state.kickedIds && state.kickedIds.includes(participantId)) {
    localStorage.removeItem("colourReactionParticipantId");
    localStorage.removeItem("colourReactionParticipantName");
    participantId = "";
    participantName = "";
    return renderJoin();
  }

  if (!participantId) return renderJoin();

  if (state.phase === "ended") {
    document.body.classList.remove("screen-locked");
    app.innerHTML = participantLayout(`
      <section class="home">
        <div class="choice-panel">
          <div class="choice-title">
            <h2>All done!</h2>
            <p class="subtle">Thanks for taking part. Here are your personal results.</p>
          </div>
          ${myResultsTemplate()}
          <div class="row" style="justify-content:center;gap:12px;flex-wrap:wrap">
            <button id="downloadBtn" class="secondary">Download results</button>
            <button id="rejoinBtn">Join a new session</button>
          </div>
        </div>
      </section>
    `);
    app.querySelector("#downloadBtn").addEventListener("click", downloadPersonalResults);
    app.querySelector("#rejoinBtn").addEventListener("click", () => {
      localStorage.removeItem("colourReactionParticipantId");
      localStorage.removeItem("colourReactionParticipantName");
      participantId = "";
      participantName = "";
      location.href = "/?role=participant";
    });
    return;
  }

  const me = state.participants.find((item) => item.id === participantId);
  if (!me) return renderJoin();

  if (state.phase === "survey") {
    document.body.classList.remove("screen-locked");
    return renderSurvey();
  }

  document.body.classList.add("screen-locked");

  const round = state.currentRound;
  const hasAnswered = round && state.responses.some((item) => item.participantId === participantId && item.roundId === round.id);
  const myLast = [...state.responses].reverse().find((item) => item.participantId === participantId);

  const openStimulus = state.phase === "stimulus" && round && !hasAnswered;
  const plainExperimentScreen = state.phase === "waiting" || openStimulus;
  const background = openStimulus ? round.color.hex : "#808080";
  const contrast = readableText(background);

  if (plainExperimentScreen) {
    app.innerHTML = `
      <section class="screen stimulus-screen tap-target" style="background:${background}; color:${contrast};" aria-label="Tap as soon as possible"></section>
    `;
  } else {
    app.innerHTML = participantLayout(`
      <section class="screen tap-target" style="background:${background}; color:${contrast};">
        <div class="participant-box">
          ${participantStatusTemplate(round, hasAnswered, myLast)}
        </div>
      </section>
    `);
  }

  const screen = app.querySelector(".tap-target");
  screen.addEventListener("pointerdown", (e) => {
    // Record taps during the waiting phase for anti-cheat
    if (state.phase === "waiting" && round) {
      prematureTaps.count++;
      prematureTaps.lastAt = performance.now();
      return;
    }
    if (state.phase !== "stimulus" || !round || hasAnswered || localRoundId !== round.id) return;
    e.preventDefault();
    const localReactionMs = performance.now() - localStimulusStart;
    const serverReactionMs = round.stimulusAt ? Date.now() - round.stimulusAt : localReactionMs;
    const reactionMs = localReactionMs >= 0 && localReactionMs < 30000 ? localReactionMs : serverReactionMs;

    // Anti-cheat: 3+ taps = definitely spamming; or 2 taps within 500ms of the stimulus = timing it
    const { count, lastAt } = prematureTaps;
    const msBefore = lastAt !== null ? localStimulusStart - lastAt : Infinity;
    const isCheat = count >= 3 || (count >= 2 && msBefore >= 0 && msBefore < 500);
    if (isCheat) {
      prematureTaps = { count: 0, lastAt: null };
      app.innerHTML = participantLayout(`
        <section class="screen" style="background:#808080; color:#fff;">
          <div class="participant-box">
            <h2>Invalid tap</h2>
            <p>You tapped before the colour appeared. Please wait for the screen to change colour, then tap.</p>
          </div>
        </section>
      `);
      return;
    }

    prematureTaps = { count: 0, lastAt: null };
    // Update UI immediately — don't wait for SSE round-trip
    app.innerHTML = participantLayout(`
      <section class="screen" style="background:#808080; color:#fff;">
        <div class="participant-box">
          <h2>${Math.round(reactionMs)} ms</h2>
          <p class="subtle">Recorded for ${escapeHtml(round.color.name)}. Wait for the host to continue.</p>
        </div>
      </section>
    `);
    post("/api/respond", { participantId, roundId: round.id, reactionMs });
  });

  manageTimer(false);
}

function renderJoin() {
  document.body.classList.remove("screen-locked");
  app.innerHTML = participantLayout(`
    <section class="home">
      <form class="choice-panel" id="joinForm">
        <div class="choice-title">
          <h2>Join Experiment</h2>
          <p class="subtle">Enter the session code from the host screen, then wait for the host to begin.</p>
        </div>
        <label class="stack">
          <span>Name <span class="subtle">(leave blank to join as Anonymous)</span></span>
          <input name="name" maxlength="40" autocomplete="name" value="${escapeHtml(participantName)}" />
        </label>
        <label class="stack">
          <span>Session code</span>
          <input name="sessionCode" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" required />
        </label>
        <p class="subtle" id="joinError" role="alert"></p>
        <button>Join</button>
      </form>
    </section>
  `);

  app.querySelector("#joinForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = form.querySelector("#joinError");
    const formData = new FormData(form);
    const name = formData.get("name").toString().trim();
    const sessionCode = formData.get("sessionCode").toString().trim().toUpperCase();
    error.textContent = "";
    try {
      const result = await post("/api/join", { id: participantId || undefined, name, sessionCode });
      participantId = result.id;
      participantName = name;
      localStorage.setItem("colourReactionParticipantId", participantId);
      localStorage.setItem("colourReactionParticipantName", participantName);
      render();
    } catch (requestError) {
      error.textContent = requestError.message;
    }
  });
}

function renderSurvey() {
  const alreadyDone = state.surveys.some((item) => item.participantId === participantId);

  if (alreadyDone) {
    app.innerHTML = participantLayout(`
      <section class="home">
        <div class="choice-panel">
          <div class="choice-title">
            <h2>Survey submitted</h2>
            <p class="subtle">Thanks. Here are your personal results while you wait.</p>
          </div>
          ${myResultsTemplate()}
          <button id="downloadBtn" class="secondary">Download results</button>
        </div>
      </section>
    `);
    app.querySelector("#downloadBtn").addEventListener("click", downloadPersonalResults);
    return;
  }

  // Don't re-render if the form is already in the DOM — SSE events must not erase what the user typed
  if (app.querySelector("#surveyForm")) return;

  app.innerHTML = participantLayout(`
    <section class="home">
      <form class="choice-panel" id="surveyForm">
        <div class="choice-title">
          <h2>Final survey</h2>
          <p class="subtle">Answer these quick questions so the host can compare reaction times with preferences.</p>
        </div>
        ${surveyFieldsTemplate()}
        <button>Submit survey</button>
      </form>
    </section>
  `);

  const visionSelect = app.querySelector("#colorVisionSelect");
  const visionDetail = app.querySelector("#colorVisionDetailInput");
  if (visionSelect) {
    visionSelect.addEventListener("change", () => {
      visionDetail.style.display = visionSelect.value === "Colour blind" ? "block" : "none";
    });
  }

  app.querySelector("#surveyForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    await post("/api/survey", { participantId, ...data });
  });
}

function layout(content) {
  return `
    <main class="shell">
      <header class="topbar">
        <div class="brand">
          <span class="mark" aria-hidden="true"></span>
          <div>
            <h1>Colour Reaction Experiment</h1>
            <p class="subtle">Middle gray baseline: #808080</p>
          </div>
        </div>
      </header>
      ${content}
    </main>
  `;
}

function participantLayout(content) {
  return `<main class="shell">${content}</main>`;
}

function hostRoundTemplate(round) {
  if (state.phase === "lobby") {
    return `<div class="stack"><h2>Lobby</h2><p class="subtle">Start the experiment when everyone has joined.</p></div>`;
  }
  if (state.phase === "ready") {
    return `<div class="stack"><h2>Ready</h2><p class="subtle">Press Continue to run the first random timer.</p></div>`;
  }
  if (state.phase === "waiting" && round) {
    return `<div class="stack"><h2>Gray screen</h2><p class="subtle">Random delay running. Next colour: ${round.color.name}.</p></div>`;
  }
  if (state.phase === "stimulus" && round) {
    return `<div class="stack"><h2 style="color:${round.color.hex}">${round.color.name}</h2><p class="subtle">Participants are tapping now. Press Continue when you are ready for the next colour.</p></div>`;
  }
  if (state.phase === "survey") {
    return `<div class="stack"><h2>Survey time</h2><p class="subtle">All colours are complete. Participants are answering the final survey.</p></div>`;
  }
  if (state.phase === "ended") {
    return `<div class="stack"><h2>Session ended</h2><p class="subtle">All participants have been sent home. Export the CSV to analyse your results.</p></div>`;
  }
  return `<div class="stack"><h2>Done</h2><p class="subtle">Export the CSV to analyse your data.</p></div>`;
}

function participantStatusTemplate(round, hasAnswered, myLast) {
  if (state.phase === "lobby" || state.phase === "ready") {
    const greeting = participantName ? `Hi, ${escapeHtml(participantName)}` : "Hi there!";
    return `<h2>${greeting}</h2><p>Wait for the host to start the next round.</p>`;
  }
  if (state.phase === "waiting") {
    return `<h2>Get ready</h2><p>Watch the screen — tap the moment the colour changes.</p>`;
  }
  if (state.phase === "stimulus" && hasAnswered) {
    return `<h2>${myLast.reactionMs} ms</h2><p class="subtle">Recorded for ${myLast.colorName}. Wait for the host to continue.</p>`;
  }
  if (state.phase === "stimulus" && round) {
    return "";
  }
  return `<h2>Almost done</h2><p class="subtle">Wait for the host.</p>`;
}

function surveyFieldsTemplate() {
  const colourOptions = state.summary
    .map((c) => `<option value="${c.colorName}">${c.colorName}</option>`)
    .join("");
  const colourPick = `<option value=""></option><option value="No Preference">No Preference</option>${colourOptions}`;

  return `
    <div class="form-grid">
      <label class="stack">
        <span>Which colour felt <strong>easiest</strong> to react to?</span>
        <select name="easiestColor" required>${colourPick}</select>
      </label>
      <label class="stack">
        <span>Which colour was <strong>hardest</strong> to notice?</span>
        <select name="hardestColor" required>${colourPick}</select>
      </label>
      <label class="stack">
        <span>Which colour was your <strong>favourite</strong>?</span>
        <select name="favouriteColor" required>${colourPick}</select>
      </label>
      <label class="stack">
        <span>How would you describe your colour vision?</span>
        <select name="colorVision" id="colorVisionSelect">
          <option value="Normal">Normal</option>
          <option value="Colour blind">Colour blind</option>
        </select>
        <input id="colorVisionDetailInput" name="colorVisionDetail" placeholder="Please specify (if unsure, type Unknown)" style="display:none" maxlength="100" />
      </label>
    </div>
  `;
}

function myResultsTemplate() {
  const myResponses = state.responses.filter((r) => r.participantId === participantId);
  if (!myResponses.length) return `<p class="subtle">No reaction data recorded.</p>`;

  const avg = myResponses.reduce((s, r) => s + r.reactionMs, 0) / myResponses.length;
  const avgMs = Math.round(avg);
  const classAvg = state.responses.length ? state.responses.reduce((s, r) => s + r.reactionMs, 0) / state.responses.length : 0;
  // positive = faster than class average, negative = slower
  const overallScore = classAvg ? Math.round(((classAvg - avg) / classAvg) * 100) : null;
  const mySurvey = state.surveys.find((s) => s.participantId === participantId);

  const rows = myResponses
    .map((r) => {
      // positive = this colour made you faster than your baseline, negative = slower
      const score = Math.round(((avg - r.reactionMs) / avg) * 100);
      const scoreStr = score > 0 ? `+${score}%` : `${score}%`;
      return `
      <div class="result-row">
        <span class="swatch" style="background:${r.colorHex}"></span>
        <span><strong>${escapeHtml(r.colorName)}</strong><br><span class="subtle">Round ${r.roundNumber}</span></span>
        <span style="text-align:right"><strong>${r.reactionMs} ms</strong><br><span class="subtle">${scoreStr}</span></span>
      </div>`;
    })
    .join("");

  const surveyHtml = mySurvey
    ? `<p class="subtle" style="text-align:left">Easiest: ${escapeHtml(mySurvey.easiestColor || "—")} &middot; Hardest: ${escapeHtml(mySurvey.hardestColor || "—")} &middot; Favourite: ${escapeHtml(mySurvey.favouriteColor || "—")}</p>`
    : "";

  const overallHtml = overallScore !== null
    ? `<span class="subtle">vs class: <strong>${overallScore > 0 ? "+" : ""}${overallScore}%</strong></span>`
    : "";

  return `
    <div class="table">${rows}</div>
    <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:6px">
      <span class="subtle">Your average: <strong>${avgMs} ms</strong></span>
      ${overallHtml}
    </div>
    ${surveyHtml}`;
}

function downloadPersonalResults() {
  const myResponses = state.responses.filter((r) => r.participantId === participantId);
  const mySurvey = state.surveys.find((s) => s.participantId === participantId);
  const name = participantName || "Anonymous";
  const className = state.className || "";

  const avg = myResponses.length ? myResponses.reduce((s, r) => s + r.reactionMs, 0) / myResponses.length : 0;
  const avgMs = Math.round(avg);
  const classAvg = state.responses.length ? state.responses.reduce((s, r) => s + r.reactionMs, 0) / state.responses.length : 0;
  const overallScore = classAvg && avg ? Math.round(((classAvg - avg) / classAvg) * 100) : null;

  const tableRows = myResponses
    .map((r) => {
      const score = avg ? Math.round(((avg - r.reactionMs) / avg) * 100) : null;
      const scoreStr = score !== null ? (score > 0 ? `+${score}%` : `${score}%`) : "—";
      return `<tr>
        <td>${r.roundNumber}</td>
        <td><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${r.colorHex};border:1px solid rgba(0,0,0,0.2);vertical-align:middle;margin-right:6px"></span>${escapeHtml(r.colorName)}</td>
        <td>${r.reactionMs} ms</td>
        <td>${scoreStr}</td>
      </tr>`;
    })
    .join("");

  const surveySection = mySurvey
    ? `<h2>Survey</h2>
      <table><tbody>
        <tr><th>Easiest colour</th><td>${escapeHtml(mySurvey.easiestColor || "—")}</td></tr>
        <tr><th>Hardest colour</th><td>${escapeHtml(mySurvey.hardestColor || "—")}</td></tr>
        <tr><th>Favourite colour</th><td>${escapeHtml(mySurvey.favouriteColor || "—")}</td></tr>
        <tr><th>Colour vision</th><td>${escapeHtml(mySurvey.colorVision || "—")}${mySurvey.colorVisionDetail ? ` (${escapeHtml(mySurvey.colorVisionDetail)})` : ""}</td></tr>
      </tbody></table>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Colour Reaction Results – ${escapeHtml(name)}</title>
  <style>
    body{font-family:system-ui,sans-serif;max-width:680px;margin:40px auto;padding:0 20px;color:#1b1f23}
    h1{font-size:22px;margin:0 0 4px}p.sub{color:#64707d;font-size:14px;margin:0 0 24px}
    h2{font-size:16px;margin:28px 0 8px}
    table{border-collapse:collapse;width:100%}
    th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #d6dde5;font-size:14px}
    th{background:#f7f9fb;font-weight:600}
    .summary{display:flex;gap:32px;margin-top:16px}
    .summary div span{font-size:13px;color:#64707d;display:block}
    .summary div strong{font-size:20px}
    footer{margin-top:40px;font-size:12px;color:#64707d}
  </style>
</head>
<body>
  <h1>Colour Reaction Results</h1>
  <p class="sub">${escapeHtml(name)}${className ? ` &mdash; ${escapeHtml(className)}` : ""}</p>
  <h2>Reaction times</h2>
  <table>
    <thead><tr><th>Round</th><th>Colour</th><th>Time</th><th>Speed score</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="summary">
    <div><span>Average</span><strong>${avgMs} ms</strong></div>
    ${overallScore !== null ? `<div><span>vs class average</span><strong>${overallScore > 0 ? "+" : ""}${overallScore}%</strong></div>` : ""}
  </div>
  ${surveySection}
  <footer>Speed score: +% = faster than your personal average for that colour. &minus;% = slower. &ldquo;vs class&rdquo; compares your average to the class average.</footer>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `colour-reaction-${(name).replace(/\s+/g, "-").toLowerCase()}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function personTemplate(person) {
  return `
    <div class="person">
      <div class="person-info">
        <strong>${escapeHtml(person.name)}</strong>
        <span class="subtle">${person.responses} responses${person.surveyed ? " · survey done" : ""}</span>
      </div>
      <button class="danger small" data-action="kick" data-id="${person.id}">Kick</button>
    </div>
  `;
}

function resultTemplate(row) {
  return `
    <div class="result-row">
      <span class="swatch" style="background:${row.colorHex}"></span>
      <span><strong>${escapeHtml(row.participantName)}</strong><br><span class="subtle">${row.colorName}, round ${row.roundNumber}</span></span>
      <strong>${row.reactionMs} ms</strong>
    </div>
  `;
}

function summaryTemplate(row) {
  return `
    <div class="colour-row">
      <span class="swatch" style="background:${row.colorHex}"></span>
      <span><strong>${row.colorName}</strong><br><span class="subtle">${row.count} responses</span></span>
      <strong>${row.average === null ? "-" : `${row.average} ms`}</strong>
    </div>
  `;
}

function surveyTemplate(row) {
  return `
    <div class="person">
      <strong>${escapeHtml(row.participantName)}</strong>
      <span class="subtle">Easiest: ${escapeHtml(row.easiestColor || "-")} · Hardest: ${escapeHtml(row.hardestColor || "-")} · Favourite: ${escapeHtml(row.favouriteColor || "-")} · Vision: ${escapeHtml(row.colorVision || "-")}${row.colorVisionDetail ? ` (${escapeHtml(row.colorVisionDetail)})` : ""}</span>
    </div>
  `;
}

function manageTimer(active) {
  clearInterval(tickTimer);
  tickTimer = null;
  if (!active) return;

  const timer = app.querySelector("#timer");
  tickTimer = setInterval(() => {
    if (timer) timer.textContent = `${Math.round(performance.now() - localStimulusStart)} ms`;
  }, 24);
}

async function post(url, body = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function readableText(hex) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 150 ? "#1b1f23" : "#ffffff";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
