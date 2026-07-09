# How to Run the Colour Reaction Experiment

## Requirements

- Windows PC or laptop
- Node.js installed (the app uses the bundled runtime at the path below — no separate install needed if you're running from Codex)

---

## Starting the server

Open **PowerShell** and run:

```powershell
$Node = "C:\Users\andre\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$env:PORT = 5500
& $Node "C:\Users\andre\Documents\Codex\2026-07-05\h\outputs\science-reaction-app\server.js"
```

You should see:

```
Science reaction app running at http://localhost:5500
```

Leave that PowerShell window open — closing it stops the server.

---

## Opening the app

| Role | URL |
|------|-----|
| Host (you, the teacher) | http://localhost:5500/?role=host |
| Participant (students) | http://localhost:5500/?role=participant |

Open the **host** URL on your laptop. Students open the **participant** URL on their iPads.

---

## Letting students connect from their iPads

### Same Wi-Fi (recommended for classrooms)

1. Find your laptop's local IP address:
   ```powershell
   ipconfig
   ```
   Look for **IPv4 Address** under your Wi-Fi adapter — e.g. `192.168.1.45`

2. Share this URL with students:
   ```
   http://192.168.1.45:5500/?role=participant
   ```

Students type that into Safari on their iPads. They do **not** need to install anything.

### Over the internet (Cloudflare Tunnel — free, no account needed)

If students are on a different network, use a tunnel:

1. Download `cloudflared.exe` from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
2. Open a **second** PowerShell window and run:
   ```powershell
   .\cloudflared.exe tunnel --url http://localhost:5500
   ```
3. It will print a public URL like `https://xxxx.trycloudflare.com` — share that with students.

---

## Running an experiment session

1. Start the server (see above)
2. Open the host page on your laptop
3. Share the participant URL with students — they join by entering their name and the **session code** shown on your host screen
4. Once everyone has joined, click **Start experiment**
5. For each colour, click **Continue** — the app shows a random gray screen, then flashes the colour; students tap as fast as they can
6. After all 10 colours, students fill in a short survey
7. When done, click **Export CSV** to download the results spreadsheet

---

## Stopping the server

Press `Ctrl + C` in the PowerShell window running the server.

---

## Resetting between classes

On the host page, click **Reset** — this clears all participants and results so a new class can start fresh. You do **not** need to restart the server.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Page shows "Loading experiment…" and never changes | The server isn't running, or you opened the wrong port. Check the PowerShell window. |
| Students can't reach the URL | Make sure all devices are on the same Wi-Fi network, or use Cloudflare Tunnel (see above). |
| Session code doesn't match | The host may have clicked "↻ New code" — check the current code on the host screen. |
| Student accidentally submitted wrong answer | Use **Kick** on the host screen to remove them, then ask them to rejoin and repeat. |
| Results look wrong after export | Each row is either a `reaction` row (one tap per colour) or a `survey` row (one per student). Filter by the `type` column in Excel. |
