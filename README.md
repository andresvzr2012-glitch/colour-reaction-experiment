# Colour Reaction Experiment

A browser-based host and participant app for testing how screen colours affect reaction times.

## Run

```powershell
cd "C:\Users\andre\Documents\Codex\2026-07-05\h\outputs\science-reaction-app"
.\start-app.ps1
```

Then open:

- Host: <http://localhost:5500/?role=host>
- Participant: <http://localhost:5500/?role=participant>

If port 5500 is already busy:

```powershell
.\start-app.ps1 -Port 3000
```

## Experiment Flow

1. Participants join with their name.
2. The host starts the experiment.
3. The host presses Continue for each round.
4. The participant screen starts as middle gray `#808080`.
5. After a random 1.5-5 second delay, the screen changes to the round colour.
6. Participants tap as quickly as possible.
7. Reaction times are collected live on the host dashboard.
8. After all colours are completed, participants fill in a short survey.
9. The host exports all reaction and survey data as CSV.
