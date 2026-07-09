const app = document.querySelector("#app");
let state = null;
let participantId = localStorage.getItem("colourReactionParticipantId") || "";
let participantName = localStorage.getItem("colourReactionParticipantName") || "";
let localStimulusStart = 0;
let localRoundId = "";
let tickTimer = null;

const route = () => new URLSearchParams(location.search).get("role") || "home";

init();

function init() {
  const role = route();
  connectEvents(role === "host" ? "host" : "participant");
  render();
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
    app.innerHTML = participantLayout(`
      <section class="screen" style="background:#808080; color:#fff;">
        <div class="participant-box">
          <h2>All done!</h2>
          <p>Thanks for taking part. The session has ended.</p>
          <button id="rejoinBtn" style="margin-top:8px">Join a new session</button>
        </div>
      </section>
    `);
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

  const round = state.currentRound;
  const hasAnswered = round && state.responses.some((item) => item.participantId === participantId && item.roundId === round.id);
  const myLast = [...state.responses].reverse().find((item) => item.participantId === participantId);

  if (state.phase === "survey") return renderSurvey();

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
  screen.addEventListener("click", () => {
    if (state.phase !== "stimulus" || !round || hasAnswered || localRoundId !== round.id) return;
    const localReactionMs = performance.now() - localStimulusStart;
    const serverReactionMs = round.stimulusAt ? Date.now() - round.stimulusAt : localReactionMs;
    const reactionMs = localReactionMs >= 0 && localReactionMs < 30000 ? localReactionMs : serverReactionMs;
    post("/api/respond", { participantId, roundId: round.id, reactionMs });
  });

  manageTimer(false);
}

function renderJoin() {
  app.innerHTML = participantLayout(`
    <section class="home">
      <form class="choice-panel" id="joinForm">
        <div class="choice-title">
          <h2>Join Experiment</h2>
          <p class="subtle">Enter the session code from the host screen, then wait for the host to begin.</p>
        </div>
        <label class="stack">
          <span>Name</span>
          <input name="name" maxlength="40" autocomplete="name" value="${escapeHtml(participantName)}" required />
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
  app.innerHTML = participantLayout(`
    <section class="home">
      <form class="choice-panel" id="surveyForm">
        <div class="choice-title">
          <h2>${alreadyDone ? "Survey submitted" : "Final survey"}</h2>
          <p class="subtle">${alreadyDone ? "Thanks. The host has your reaction times and survey answers." : "Answer these quick questions so the host can compare reaction times with preferences."}</p>
        </div>
        ${alreadyDone ? "" : surveyFieldsTemplate()}
        <button ${alreadyDone ? "type=\"button\" disabled" : ""}>${alreadyDone ? "Complete" : "Submit survey"}</button>
      </form>
    </section>
  `);

  if (!alreadyDone) {
    app.querySelector("#surveyForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      await post("/api/survey", { participantId, ...data });
    });
  }
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
        <div class="row">
          <span class="subtle">Session</span>
          <span class="code">${state?.sessionCode || "----"}</span>
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
    return `<h2>Hi, ${escapeHtml(participantName)}</h2><p>Wait for the host to start the next round.</p>`;
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
  const colourPick = `<option value="">— choose —</option>${colourOptions}`;

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
        <select name="colorVision">
          <option>Normal</option>
          <option>Red-green difficulty</option>
          <option>Colour blind</option>
          <option>Unsure</option>
        </select>
      </label>
    </div>
  `;
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
      <span class="subtle">Easiest: ${escapeHtml(row.easiestColor || "-")} · Hardest: ${escapeHtml(row.hardestColor || "-")} · Favourite: ${escapeHtml(row.favouriteColor || "-")} · Vision: ${escapeHtml(row.colorVision || "-")}</span>
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
