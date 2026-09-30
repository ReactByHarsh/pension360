# Pension360 Demo: Simple Presenter Steps

This is a short spoken tour you can follow while recording. It uses the local fictional demo members and rules. Plan for about 12–15 minutes, or skip the optional Copilot and OCR steps for a shorter recording.

## Start the app

The app in this workspace uses PostgreSQL, an API and a web app. Docker is not needed on this machine. The fictional PostgreSQL demo database has been created separately in `.local/pension360-demo-pg`.

In PowerShell, from the project folder:

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe' -D '.local\pension360-demo-pg' -l '.local\pension360-demo-pg\server.log' -o '-p 55432 -h 127.0.0.1' start
npm run dev
```

If PostgreSQL says the server is already running, leave it running. Open <http://127.0.0.1:5173> and sign in as **Super administrator**. The demo login uses fictional development data.

To play the automated walkthrough in a visible Microsoft Edge window, open a second PowerShell terminal and run:

```powershell
npm run demo:playwright
```

It pauses at each screen so you can speak and record. Press Enter to continue. For an automatic pass with a 4.5-second pause per screen:

```powershell
npm run demo:playwright -- --auto
```

The browser video and screenshots are written to `demo-recordings`. To include one real Copilot request using the configured provider, add `--live-ai`. This sends a question about fictional member M002 to the configured AI provider and may use API credits. The default run does not call AI. The Playwright script never saves rule edits, publishes, commits an import, or uploads a document.

## What to say during the demo

### 1. Executive dashboard

**Open:** Executive dashboard (`#executive`)

**Say:** “This is the overview. It brings member preparation, review work, cases, and payment or contribution findings together. The sample people and records are fictional.”

Point to the member and case totals, then the readiness summary. Explain that a result is a signal for a staff member to review; it is not an official pension decision.

### 2. Retirement readiness

**Open:** Retirement readiness → Readiness assessments (`#assessments`)

**Say:** “The system checks the available member evidence against a configured rule. It can show ready for review, needs verification, or unable to evaluate when a source is unavailable.”

Use member M002 as an example of a record needing verification. Use M004 to explain that an unavailable source is reported clearly rather than filled with invented information.

### 3. Contributions and payments

**Open:** Contribution & service → Contribution reconciliation (`#contributions`), then Payment assurance → Payment exceptions (`#payment-exceptions`)

**Say:** “These screens compare recorded amounts and show differences for investigation. They do not transfer money, change a payroll system, or make a payment decision.”

For the prepared example, M007 has a contribution finding and M005 has a payment finding. M008 and M006 are clear comparison examples.

### 4. Cases and documents

**Open:** Cases & documents → Case register (`#cases`), then Document library (`#documents`)

**Say:** “A difference can be followed as a case, assigned for review, and kept with its evidence. Documents can be processed with OCR, but extracted fields need a human reviewer to compare them with the original before they count as verified evidence.”

The demo database has no uploaded member files initially. To show OCR live, use an approved fictional sample PDF in the Document library, submit it for extraction, wait for the background worker, then show the extraction review and verify the fields against the PDF. Do not upload real member documents into this local demo. If no worker or AI provider is configured, explain the screen without claiming extraction completed.

### 5. Policies and integrations

**Open:** Policy intelligence → Policy library (`#policies`), then Integrations → Data synchronization (`#data-integrations`)

**Say:** “Published procedures provide shared guidance. Source synchronization shows changes before they are accepted, and we can trace what happened afterward. I’m only reviewing the preview here; I’m not committing an import.”

### 6. Show the main feature: REST field mapping into a decision rule

**Open:** Rules & Data Studio → Studio overview (`#studio-home`). In **Decision version**, select **Retirement file readiness · demonstration · v1 · PUBLISHED**. Then open **Input field mapping** (`#studio-mapping`).

**Say:** “First, we choose the rule and a fictional member. The source panel shows fields from the API. The mapping tells the system which source field goes into each rule input and what conversion it needs.”

Click **Fetch REST sample**. Point at **Original API response**. Then click **Fetch, convert & run rule**.

**Say:** “The backend fetches the API response, converts the selected fields into the standard JSON the rule expects, and evaluates the rule. We can inspect the original response, converted input and rule result side by side. This preview does not save an assessment or create a case.”

### 7. Tests and the visual designer

**Open:** Test & explain (`#rule-test`). Click **Run saved scenario suite**. Then open Design (`#rule-designer`).

**Say:** “The saved scenarios cover normal, missing-evidence, and unavailable-source situations. Before a rule change can be published, the designer tests it and sends it for review. A separate reviewer approves and publishes it. I’m inspecting the current rule only; I’m not changing or publishing it in this tour.”

Point to the visual JDM decision flow and explain that its inputs match the mapping names.

### 8. Copilot (optional)

**Open:** Copilot using **Ask Copilot**.

Ask: **“Using only the fictional demo records, explain why member M002 needs verification and what evidence a reviewer should check.”**

**Say:** “Copilot summarizes the evidence and gives the staff member a starting point. The reviewer still checks the cited information. Copilot does not approve benefits or edit source records.”

## Closing line

“Pension360 connects incoming source data, configurable rules, evidence and staff review in one workspace. It helps people find what needs attention, while official pension decisions and source records stay with the responsible system and authorized staff.”

## Run the recording script later

The saved script is `scripts/full-demo.playwright.mjs`. Install the project dependencies with `npm ci` if needed, start PostgreSQL and the app as shown above, then run:

```powershell
npm run demo:playwright
```

Add `-- --auto` for a timed run. Add `-- --auto --live-ai` for an automatic run that makes one live Copilot request. Use `DEMO_PAUSE_MS=7000` before the command if you want longer automatic pauses. Playwright uses the installed Microsoft Edge browser; it does not download a browser separately.
