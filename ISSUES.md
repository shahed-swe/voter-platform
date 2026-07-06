# Dhaka South Application — Issues

Reported issues from the field review.

**Source & plan:**
- 📄 Original doc: [docs/issues/dhakasouthapplication.pdf](docs/issues/dhakasouthapplication.pdf)
- 🖼️ Screenshots: [docs/issues/](docs/issues/) (01 voter table · 02 canvass form / secure-origin · 03 dashboard zeros · 04 mobile create-user error)
- 🗺️ Fix plan (phased, with root causes): [docs/issues/PLAN.md](docs/issues/PLAN.md)

| # | Issue | Area | Status |
|---|-------|------|--------|
| 1 | Voter table → open canvassing form directly | Canvassing | ✅ |
| 2 | Mobile responsiveness | UI | ☐ |
| 3 | Voter row status not updating instantly after submit | Canvassing | ✅ |
| 4 | Per-voter building geolocation on canvass | Geo / Map | ☐ |
| 5 | Analytics daily trend + top villages empty | Analytics | ✅ |
| 6 | Highlight canvassed buildings + per-building stats | Dashboard / Map | ☐ |
| 7 | Logo links (BSAR / CN) missing | UI | ✅ |
| 8 | Canvasser geolocation marker missing | Geo / Map | ✅ |
| 9 | "poridorshito" count zero + status head filter broken | Voter table | ✅ |
| 10 | Multiple voter (family) search & add in canvass form | Canvassing | ✅ |
| 11 | Bangla transliteration (Avro phonetic) search | Voter table | ✅ |
| 12 | Role-based region assignment (hierarchy) | Roles / Access | ☐ |
| 13 | Email sending (SMTP / Google app password) | Infra | ☐ |
| 14 | User-creation role hierarchy enforcement | Roles / Access | ✅ |
| 15 | Dashboard stats zero on initial (all-ward) view | Dashboard | ✅ |
| 16 | Hard delete users / better duplicate-username error | Users | ✅ |

---

## 1. Open canvassing form from voter table
In the Voter table, the canvassing form should open. Currently a location marker is showing; clicking on it makes the canvassing form work. It should open directly.

## 2. Mobile responsiveness
Application is not mobile responsive.

## 3. Voter row status not updating instantly after submit
After submitting a canvass, the instant change in the voter table row status is not happening right after submission — a refresh is needed to see the updated one. Example: a "Follow-up needed" status was submitted, but the voter table status remained "Not Visited". After refresh it showed "Follow-up needed".

## 4. Per-voter building geolocation on canvass
After submitting a canvass, that voter's geolocation next time should show the building where the submission was done. That's not working — currently a fixed geolocation is used for all voters.

We are collecting voter information where we will get the geolocation of the individual voters in terms of building attachment (where there is a building shape). That building geolocation should become that voter's geolocation, on which the canvasser canvassed.

## 5. Analytics daily trend + top villages empty
On the "Analytics" page, the daily canvassing trend and top villages sections should be checked. They are not showing data, although some voters are already canvassed.

## 6. Highlight canvassed buildings with colors + per-building stats
In the dashboard, canvassed buildings should be highlighted with colors. After storing the geolocation of the voters, we need to colorize the buildings where canvassing was done. Each building should also show its voter stats.

## 7. Logo link attachments
The logo has no link attachment to the page URL. Both BSAR and CN logos have no link.

## 8. Canvasser geolocation marker
Canvasser geolocation is not working. There should be a geolocation mark of the canvasser, but currently no canvasser marker is showing.

## 9. "poridorshito" count zero + status filter broken
One canvass was done, but in the voter table the "poridorshito" (visited) count is showing zero. The voter table head filter is not filtering the voters by status.

## 10. Multiple voter (family) search & add in canvass form
In the canvassing form there is no multiple-voter search and add option. In the previous application, the canvassing form had a section where multiple voters could be selected for a location (as they are family members of the same household). Currently this is not present.

## 11. Bangla transliteration search (Avro phonetic)
Voter table search: English-to-Bangla transliteration is not working. In previous applications, Avro phonetic was used for Bangla transliteration search by the canvasser.

## 12. Role-based region assignment (hierarchy)
No assignment option found — every role sees full data. Role-based assignment is absent.

- Admin can assign a certain region to a sub-admin.
- Sub-admin can then assign certain volunteers to their desired location.
- The selected region from the upper hierarchy should be visible to the lower-hierarchy user.

Example: Ward 1 is given to a sub-admin → that sub-admin sees only Ward 1 information and map. If that sub-admin then assigns a voter area like "Bashbari" to a volunteer, that volunteer will see only that voter area's information — **if** we have voter-area separation in the data layer; otherwise that volunteer will see all of Ward 1.

## 13. Email sending (SMTP)
Email sending is not working. An SMTP setup was there using a Google app password. Currently the application has no email-sending setup.

## 14. User-creation role hierarchy
Volunteers can create admin roles now. Roles in user creation should only go down the hierarchy:
- Admin can create all user types.
- Sub-admin can create only volunteers.

## 15. Dashboard stats zero on initial view
Dashboard stats are all zero. The initial dashboard view (e.g. all of Dhaka-10) shows total voters, visited, and other information as zero. After selecting an area, the stats work.

## 16. Hard delete users / better duplicate-username error
When deleting users, the user information remains in the database (probably a soft delete). As a result, the same username cannot be reused for creating new users. The error should show better text.

---

## Notes from the screenshots (pages 3–6)

These aren't separate issues, but give important context/root-cause for the ones above:

- **Geolocation root cause (relates to #4, #8):** The canvass form (page 4) shows
  **"Only secure origins are allowed (see: https://goo.gl/Y0ZkNV)"**. The site is
  served over **HTTP** (`153.75.230.154:3000`, "Not Secure"). Browsers block the
  **Geolocation API on non-HTTPS origins**, so the canvasser/voter location can't be
  captured at all. Geolocation (#4, #6, #8) can't work until the app is served over
  **HTTPS** (TLS cert + domain, or a reverse proxy). This is a prerequisite for the
  whole geo cluster.
- **Dashboard zeros (relates to #15):** Page 5 shows Dashboard scope "Dhaka-10",
  "All Wards" → Total Voters / Visited / Not Visited / Follow-up all **0**. Stats only
  populate after drilling into a specific ward/area.
- **Mobile create-user error (relates to #14, #16):** Page 6 (mobile, `/admin`) shows
  the **Create user** modal returning **"Internal server error"** when creating a
  `volunteer` with an email — the `/admin` user-creation path still fails (separate
  from the candidate/volunteer creation we already fixed via the people API).
- **Canvass form fields visible (context for #10):** Page 4 shows the current form —
  support level, rating (1–5 stars), occupation, household size, issues/concerns,
  address (floor/flat/building), lat/long. No multi-voter/family section (#10).
