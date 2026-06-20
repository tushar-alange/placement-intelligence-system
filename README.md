# Placement Intelligence System
[Dashboard](https://placement-intelligence-system-98f4zkv62.vercel.app/)

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


## System Flow

```text
Gmail
  ↓
placement-auto Label
  ↓
Google Apps Script (Scheduled Trigger)
  ↓
AWS Lambda
  ├─ Regex Extraction
  ├─ Gemini Fallback (if needed)
  └─ Deduplication
  ↓
DynamoDB
  ↓
React Dashboard
```
## Project structure

```text
placement-intelligence-system/
├── frontend/          React + Vite dashboard
├── lambda/            AWS Lambda function (Python)
└── app-scripts/       Google Apps Script (Gmail trigger)
```

## Tech stack

- **Frontend:** React, Vite
- **Backend:** AWS Lambda (Python), Lambda Function URLs (no API Gateway)
- **Database:** DynamoDB
- **Automation:** Google Apps Script, Gmail API
- **Extraction:** Regex + Gemini 2.5 Flash (fallback only)
