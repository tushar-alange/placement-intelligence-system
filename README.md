# Placement Intelligence System

An event-driven pipeline that reads placement notice emails from Gmail, extracts structured
details (company, role, branch, deadline, stipend) using regex with an LLM fallback, stores
them in DynamoDB, and serves them through a React dashboard.

## How it works

1. **Gmail** — placement notice emails are filtered into a `placement-auto` label.
2. **Google Apps Script** — a time-based trigger scans the label for new messages and POSTs
   the raw subject/body to the Lambda endpoint. Already-processed message IDs are tracked so
   nothing is sent twice.
3. **AWS Lambda** — receives the email text and:
   - Tries regex extraction first, matching common label patterns (`Company:`, `Last Date:`, etc).
   - Falls back to the Gemini API only when regex can't confidently find a company or role,
     for emails that are forwarded chains or written in prose.
   - Deduplicates against existing entries using a hash of company + role + deadline, so a
     reminder email updates the existing record instead of creating a duplicate.
   - Writes the result to DynamoDB.
4. **DynamoDB** — stores all placement records (`placements` table).
5. **React dashboard** — fetches placements from the same Lambda endpoint, with search,
   branch filtering, newest-first sorting, and the ability to add, edit, or delete entries
   directly from the UI (bypassing email entirely when needed).

## Project structure

```text
placement-intelligence-system/
├── frontend/          React + Vite dashboard
├── lambda/            AWS Lambda function (Python)
└── app-scripts/       Google Apps Script (Gmail trigger)
```

## Setup

### 1. Lambda

1. Create a DynamoDB table named `placements` with `placement_id` as the partition key.
2. Create a Lambda function (Python 3.12+), paste in `lambda/lambda_function.py`.
3. Attach an execution role with DynamoDB read/write permissions (`GetItem`, `PutItem`,
   `UpdateItem`, `DeleteItem`, `Scan`).
4. Enable a **Function URL** with CORS allowed for your frontend's origin.
5. Set the environment variable `GEMINI_API_KEY` (free tier key from
   https://aistudio.google.com/apikey) — used only as a fallback when regex extraction
   can't confidently find a company or role.

### 2. Apps Script

1. In Gmail, create a label named `placement-auto` and a filter that routes placement
   notice emails into it.
2. Go to https://script.google.com, create a new project, paste in
   `app-scripts/placement.gs`.
3. Update the `LAMBDA_URL` constant to your deployed Function URL.
4. Add a time-based trigger (**Triggers → Add Trigger**) to run `processPlacements`
   on whatever interval you'd like (e.g. every 10 minutes).

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Update `API_URL` in `src/App.jsx` to your Lambda Function URL before running.

## Tech stack

- **Frontend:** React, Vite
- **Backend:** AWS Lambda (Python), Lambda Function URLs (no API Gateway)
- **Database:** DynamoDB
- **Automation:** Google Apps Script, Gmail API
- **Extraction:** Regex + Gemini 2.5 Flash (fallback only)

## Notes

- The Lambda's execution role currently uses broad DynamoDB permissions for simplicity;
  scope this down to the specific table before using in production.
- The dedupe key is a hash of `company + role + deadline`. Manually added placements via
  the dashboard form skip the extraction step entirely and use the submitted fields as-is.
