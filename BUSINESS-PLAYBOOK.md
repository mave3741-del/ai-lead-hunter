# Business playbook — first $100 customer

Target: about **20 quality US dental clinics per day**, not thousands of junk rows. These are operating targets, not guarantees.

## 1. Run Scout

- Demo mode on: labeled sample clinics load so you can walk the product.
- Demo mode off: Scout uses OSM (if enabled) or a configured API. If none: you will see “No live lead source configured.” Import CSV or add a business.

## 2. Review leads

Open **Leads**. Filter by score ≥ 75, high priority, city. Skip low-quality rows.

## 3. Audit

On a lead, **Run pipeline** (research → audit → opportunity → score → draft if qualified). Audits that cannot fetch a site stay **unknown**. We do not invent findings. Evidence URLs are shown on the lead page.

## 4. Select prospects

Only scores at or above the threshold (default 75) get an outreach draft. Weak prospects stay in the CRM but out of the copy queue.

## 5. Approve outreach

Read the evidence. **Approve**, **Edit** then approve, or **Reject**. There is no send API. **Copy** the message and send it yourself. **Mark contacted** is rejected unless the draft is approved.

Follow-up drafts also need approval. Max two follow-ups.

## 6. Demo

Send them `/demo` — the clinic AI assistant you sell. It never diagnoses.

## 7. Mark customers

When they pay, **Mark as won**. Default **$100 USD**.

## 8. Track revenue

Dashboard + **Revenue**: total, customers, average deal, conversion of contacted → won. Watch **Est. profit** (revenue minus today’s estimated AI cost).
