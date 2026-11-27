# iPhone Shortcut: "Send to Recovery"

This sends the last 2 days of Apple Health data to the app each morning. Build it once in the Shortcuts app on the iPhone; it takes about 10 minutes.

You need the live app's address (after the first deploy) and your passphrase (`APP_KEY`). Keep the passphrase private: anyone with it can read your data.

## 1. The building block (make it once, then duplicate it)
For **Heart Rate Variability**:
1. **Find Health Samples**
   - Type: Heart Rate Variability
   - Filter: Start Date is in the last **2** days
   - Sort by Start Date, oldest first
   - No limit
2. **Get Details of Health Samples** → **Value** (input: the Health Samples from step 1)
3. **Combine Text** → input: the Values, combine with **New Lines**. Rename the result `hrv values`.
4. **Get Details of Health Samples** → **Start Date** (input: the Health Samples from step 1, not the Values)
5. **Combine Text** → input: the Start Dates, combine with **New Lines**. Rename it `hrv dates`.

## 2. Duplicate the block for each of these
Long-press the first action → Duplicate (the five actions), then change the Type and the names:

| Type in Find Health Samples | Names |
|---|---|
| Resting Heart Rate | `rhr values` / `rhr dates` |
| Heart Rate | `hr values` / `hr dates` |
| Steps | `steps values` / `steps dates` |
| Active Energy | `kcal values` / `kcal dates` |
| Weight | `weight values` / `weight dates` |
| Body Fat Percentage | `fat values` / `fat dates` |

## 3. Sleep (slightly different)
1. **Find Health Samples**: Type Sleep, start date in the last 2 days, sorted oldest first.
2. **Get Details → Value**, then **Combine Text (New Lines)** → `sleep stages`
3. **Get Details → Start Date**, then **Combine Text (New Lines)** → `sleep starts`
4. **Get Details → End Date**, then **Combine Text (New Lines)** → `sleep ends`

## 4. Send it
**Get Contents of URL**
- URL: `https://<your-app>.vercel.app/api/health`
- Method: **POST**
- Headers: `x-app-key` = your passphrase
- Request Body: **JSON**, with one field `samples` (type **Dictionary**) containing:
  - `hrv` (Dictionary): `values` = hrv values, `dates` = hrv dates
  - the same for `rhr`, `hr`, `steps`, `kcal`, `weight`, `fat`
  - `sleep` (Dictionary): `stages` = sleep stages, `starts` = sleep starts, `ends` = sleep ends

Add **Show Result** at the end while testing. It should say `{"ok":true,"days":[…]}`.

**First test:** change the URL to `…/api/health?dry=1`. The app then replies with what it understood without saving anything. Check the reply looks right before you remove `?dry=1`.

## 5. Make it run by itself
Shortcuts → Automation → **+** → **Alarm** → **Is Stopped** → **Run Immediately** → choose "Send to Recovery".
- The phone has to be unlocked to read Health, which is why it's triggered by stopping the alarm.
- Zepp needs to have synced the watch first. If mornings arrive empty, add **Open App: Zepp** and **Wait 20 seconds** at the very top.

## What I learned building it
- **Name every result with Set Variable**, dragged in directly under each Get action (it links to the action above by itself). The dictionary fields are then filled by tapping the name in the bar above the keyboard. Picking "Select Variable" inside a nested dictionary freezes the editor.
- **No HRV block, and Zepp sends no sleep:** Zepp writes neither to Apple Health, and an empty Find Health Samples stops the whole Shortcut. HRV and sleep come from intervals.icu instead.
- Weight and Body Fat look back **7 days**, so a missed weigh-in doesn't stop the run.
- Three phone settings it needs: Health → Apps → Shortcuts → read access on for every type; Settings → Apps → Shortcuts → Advanced → **Allow Sharing Large Amounts of Data**; and **Always Allow** on the first "send health samples to <your-app>.vercel.app" prompt.
- Automation: When any alarm is stopped → Run Immediately → Send To Recovery.
