import json
import os
import re
import urllib.request
import uuid
import hashlib
from datetime import datetime

import boto3

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("placements")

# Set this as a Lambda environment variable (Configuration -> Environment variables).
# Never hardcode the key in source. Get a free key (no credit card) at
# https://aistudio.google.com/apikey
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = "gemini-2.5-flash"


# ---------------- RESPONSE ----------------
def response(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            # "Access-Control-Allow-Origin": "*",
            # "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
            # "Access-Control-Allow-Headers": "Content-Type",
        },
        "body": json.dumps(body, default=str),
    }


# ---------------- EXTRACTION ----------------
# Each field has a list of possible label patterns since placement emails
# from different companies/TPOs phrase things differently.
FIELD_PATTERNS = {
    "company": [
        r"company\s*[:\-]\s*(.+)",
        r"organi[sz]ation\s*[:\-]\s*(.+)",
        r"hiring\s*company\s*[:\-]\s*(.+)",
    ],
    "role": [
        r"(?:role|position|designation)\s*[:\-]\s*(.+)",
        r"job\s*title\s*[:\-]\s*(.+)",
    ],
    "branch": [
        r"(?:branch|eligible\s*branches?|department)\s*[:\-]\s*(.+)",
    ],
    "deadline": [
        r"(?:deadline|last\s*date|apply\s*by|closing\s*date)\s*[:\-]\s*(.+)",
    ],
    "stipend": [
        r"(?:stipend|salary|ctc|package)\s*[:\-]\s*(.+)",
    ],
    "registration_link": [
        r"(?:registration\s*link|apply\s*link|apply\s*here|link)\s*[:\-]\s*(https?://\S+)",
    ],
}

# Fallback: grab any bare URL if no explicit "link:" label was found
URL_PATTERN = r"(https?://\S+)"


def extract_field(text, patterns):
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            value = match.group(1).strip()
            # cut off at line break / trailing junk
            value = value.split("\n")[0].strip()
            value = value.rstrip(".,;")
            if value:
                return value
    return None


def extract_fields(subject, body):
    text = f"{subject}\n{body}"

    extracted = {}
    for field, patterns in FIELD_PATTERNS.items():
        extracted[field] = extract_field(text, patterns)

    # fallback for registration_link: first bare URL in the email
    if not extracted.get("registration_link"):
        url_match = re.search(URL_PATTERN, text)
        if url_match:
            extracted["registration_link"] = url_match.group(1).strip().rstrip(".,;")

    return extracted


# ---------------- LLM FALLBACK EXTRACTION ----------------
# Only called when regex fails to find the fields that matter most
# (company + role). Keeps cost near zero for well-templated emails
# and only pays for the LLM on messy/forwarded ones.
REQUIRED_FOR_CONFIDENCE = ["company", "role"]


def needs_llm_fallback(extracted):
    return not all(extracted.get(f) for f in REQUIRED_FOR_CONFIDENCE)


def extract_fields_with_llm(subject, body):
    if not GEMINI_API_KEY:
        print("LLM FALLBACK SKIPPED: GEMINI_API_KEY not set")
        return {}

    prompt = f"""You will be given the subject and body of a placement/job posting email
that may be poorly formatted, forwarded multiple times, or written in prose.

Extract these fields if present: company, role, branch (eligible branches/departments),
deadline (last date to apply), stipend (salary/CTC/package), registration_link (the apply URL).

Respond with ONLY a raw JSON object, no markdown fences, no preamble. Use null for any field
you cannot confidently find. Do not guess or invent values that aren't in the text.

Subject: {subject}

Body:
{body[:4000]}
"""

    payload = json.dumps({
        "contents": [
            {"parts": [{"text": prompt}]}
        ],
        "generationConfig": {
            "temperature": 0,
            "maxOutputTokens": 500,
        },
    }).encode("utf-8")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        raw_text = (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
        ).strip()

        # strip accidental markdown fences just in case
        raw_text = re.sub(r"^```(?:json)?|```$", "", raw_text.strip(), flags=re.MULTILINE).strip()

        parsed = json.loads(raw_text)
        print("LLM EXTRACTED:", parsed)
        return parsed

    except Exception as e:
        print("LLM FALLBACK ERROR:", str(e))
        return {}


def merge_extractions(regex_result, llm_result):
    """LLM only fills in gaps that regex missed; regex hits are trusted as-is."""
    merged = dict(regex_result)
    for key, value in (llm_result or {}).items():
        if not merged.get(key) and value:
            merged[key] = value
    return merged


def make_dedupe_key(company, role, deadline):
    """
    Deterministic key so the same placement posting (e.g. a reminder email)
    doesn't create a duplicate row. Falls back gracefully if fields are missing.
    """
    raw = f"{(company or '').strip().lower()}|{(role or '').strip().lower()}|{(deadline or '').strip().lower()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


# ---------------- GET ----------------
def get_items():
    try:
        items = table.scan().get("Items", [])
        return response(200, items)
    except Exception as e:
        print("GET ERROR:", str(e))
        return response(500, {"error": str(e)})


# ---------------- MAIN ----------------
def lambda_handler(event, context):
    try:
        print("EVENT:", json.dumps(event))

        method = event.get("requestContext", {}).get("http", {}).get("method", "GET")

        # -------- CORS PREFLIGHT --------
        if method == "OPTIONS":
            return response(200, {"message": "ok"})

        # -------- GET --------
        if method == "GET":
            return get_items()

        # -------- BODY PARSE --------
        body = json.loads(event.get("body") or "{}")
        print("PARSED BODY:", body)

        # -------- POST (email ingestion OR manual dashboard add) --------
        if method == "POST":
            subject = body.get("subject", "") or ""
            email_body = body.get("body", "") or ""
            message_id = body.get("messageId")

            # Two ways a POST can arrive:
            #   1. From Apps Script: has subject/body raw email text -> needs extraction
            #   2. From the dashboard "Add Placement" form: already has clean
            #      company/role/etc fields -> use them as-is, skip extraction
            is_manual_entry = bool(subject.strip() or email_body.strip()) is False

            if is_manual_entry:
                extracted = {
                    "company": body.get("company"),
                    "role": body.get("role"),
                    "branch": body.get("branch"),
                    "deadline": body.get("deadline"),
                    "stipend": body.get("stipend"),
                    "registration_link": body.get("registration_link"),
                }
                print("MANUAL ENTRY, SKIPPING EXTRACTION:", extracted)
            else:
                extracted = extract_fields(subject, email_body)
                print("REGEX EXTRACTED:", extracted)

                if needs_llm_fallback(extracted):
                    print("Regex extraction incomplete, calling LLM fallback...")
                    llm_result = extract_fields_with_llm(subject, email_body)
                    extracted = merge_extractions(extracted, llm_result)
                    print("MERGED EXTRACTED:", extracted)

            if not extracted.get("company") and not extracted.get("role"):
                return response(400, {"error": "Could not determine company/role — nothing saved"})

            dedupe_key = make_dedupe_key(
                extracted.get("company"),
                extracted.get("role"),
                extracted.get("deadline"),
            )

            # Check for an existing placement with the same dedupe key
            # (simple scan + filter is fine at small scale; switch to a
            # GSI on dedupe_key if the table grows large)
            existing = table.scan(
                FilterExpression="dedupe_key = :dk",
                ExpressionAttributeValues={":dk": dedupe_key},
            ).get("Items", [])

            if existing:
                placement_id = existing[0]["placement_id"]
                table.update_item(
                    Key={"placement_id": placement_id},
                    UpdateExpression="""
                        SET company=:c,
                            #role=:r,
                            branch=:b,
                            deadline=:d,
                            stipend=:s,
                            registration_link=:l,
                            last_email_id=:m,
                            updated_at=:u
                    """,
                    ExpressionAttributeNames={
                        "#role": "role",
                    },
                    ExpressionAttributeValues={
                        ":c": extracted.get("company"),
                        ":r": extracted.get("role"),
                        ":b": extracted.get("branch"),
                        ":d": extracted.get("deadline"),
                        ":s": extracted.get("stipend"),
                        ":l": extracted.get("registration_link"),
                        ":m": message_id,
                        ":u": datetime.utcnow().isoformat(),
                    },
                )
                return response(200, {"message": "Updated existing placement", "placement_id": placement_id})

            item = {
                "placement_id": str(uuid.uuid4()),
                "dedupe_key": dedupe_key,
                "company": extracted.get("company"),
                "role": extracted.get("role"),
                "branch": extracted.get("branch"),
                "deadline": extracted.get("deadline"),
                "stipend": extracted.get("stipend"),
                "registration_link": extracted.get("registration_link"),
                "source_message_id": message_id,
                "source_subject": subject,
                "created_at": datetime.utcnow().isoformat(),
            }

            table.put_item(Item=item)

            return response(200, {"message": "Created", "data": item})

        # -------- DELETE --------
        if method == "DELETE":
            placement_id = body.get("placement_id")
            print("DELETE ID:", placement_id)

            if not placement_id:
                return response(400, {"error": "placement_id required"})

            table.delete_item(Key={"placement_id": placement_id})
            return response(200, {"message": "Deleted", "placement_id": placement_id})

        # -------- PUT --------
        if method == "PUT":
            if not body.get("placement_id"):
                return response(400, {"error": "placement_id required"})

            table.update_item(
                Key={"placement_id": body["placement_id"]},
                UpdateExpression="""
                    SET company=:c,
                        #role=:r,
                        branch=:b,
                        deadline=:d,
                        stipend=:s
                """,
                ExpressionAttributeNames={
                    "#role": "role",
                },
                ExpressionAttributeValues={
                    ":c": body.get("company"),
                    ":r": body.get("role"),
                    ":b": body.get("branch"),
                    ":d": body.get("deadline"),
                    ":s": body.get("stipend"),
                },
            )
            return response(200, {"message": "Updated"})

        return response(400, {"error": "Invalid method"})

    except Exception as e:
        print("LAMBDA CRASH:", str(e))
        return response(500, {"error": str(e)})