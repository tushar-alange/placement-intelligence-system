import json
import boto3
import re
from datetime import datetime

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('placements')


def extract(pattern, text):
    match = re.search(pattern, text, re.IGNORECASE)
    return match.group(1).strip() if match else None


def normalize_deadline(deadline_text):
    if not deadline_text:
        return None

    try:
        date_match = re.search(
            r'(\d{2}-\d{2}-\d{4})',
            deadline_text
        )

        if date_match:
            dt = datetime.strptime(
                date_match.group(1),
                "%d-%m-%Y"
            )

            return dt.strftime("%Y-%m-%d")

    except Exception:
        pass

    return deadline_text


def lambda_handler(event, context):

    email_body = event.get("email_body", "")

    company = extract(
        r'Company Name:\s*(.*)',
        email_body
    )

    role = extract(
        r'Job Position:\s*(.*)',
        email_body
    )

    branch = extract(
        r'Branch:\s*(.*)',
        email_body
    )

    batch = extract(
        r'Batch:\s*(.*)',
        email_body
    )

    stipend = extract(
        r'Stipend\s*:\s*(.*)',
        email_body
    )

    registration_link = extract(
        r'Registration Link\s*:\s*(https?://\S+)',
        email_body
    )

    raw_deadline = extract(
        r'Last date to register:\s*(.*)',
        email_body
    )

    deadline = normalize_deadline(raw_deadline)

    company_slug = (
        company.lower().replace(" ", "-")
        if company
        else "unknown-company"
    )

    placement_id = f"{company_slug}-{deadline}"

    item = {
        "placement_id": placement_id,
        "company": company,
        "role": role,
        "branch": branch,
        "batch": batch,
        "stipend": stipend,
        "deadline": deadline,
        "registration_link": registration_link,
        "created_at": datetime.utcnow().isoformat()
    }

    table.put_item(Item=item)

    return {
        "statusCode": 200,
        "body": json.dumps(
            {
                "message": "Placement saved successfully",
                "data": item
            }
        )
    }
#hey