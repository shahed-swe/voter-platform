# Demo accounts & walkthrough

Seeded by `node server/scripts/seed-demo.js` (re-runnable — upserts users/grants,
re-creates the demo canvasses & donations). Real public figures ONLY at the
Political Admin → Candidate level; everyone below is fictional.

**Password for every account below: `pass1234`** — except `admin/admin123`,
`tarek123/tarek123`, and `nuru123` (created by hand — its password is whatever
was set at creation; reset it from Team Management if forgotten).

## Main Super Admin

| Login | Role |
|---|---|
| `admin` / `admin123` | Platform owner — full access, all parties |

## Bangladesh Nationalist Party (BNP)

| Login | Name | Role | Scope |
|---|---|---|---|
| `tarek123` / `tarek123` | Tarek Rahman | Political Admin | whole party |
| `bnp_cand1` | Mirza Fakhrul Islam Alamgir | Candidate | Dhaka-10 |
| `bnp_cand2` | Amir Khasru Mahmud Chowdhury | Candidate | Dhaka-10 (same seat!) |
| `bnp_cand3` | Salahuddin Ahmed | Candidate | Dhaka-10 (same seat!) |
| `abbash123` | Mirza Abbas | Candidate | Dhaka-8 |
| `bnp_c1adm` | Kamrul Hasan | Campaign Admin | Fakhrul's campaign |
| `bnp_c1sub` | Rafiqul Islam | Sub-admin | Fakhrul, ward ১৬ |
| `bnp_b1sub` | Jashim Uddin | Campaign Admin | Salahuddin's campaign |
| `bnp_c3sub` | Mahbub Alam | Sub-admin | Salahuddin, ward ১৬ |
| `selim123` | Selim Bhuiyan | Campaign Admin | Abbas's campaign |
| `rubel123` | Rubel Miah | Sub-admin | Abbas, ward ১১ |
| `nuru123` | Nurul Haque Nuru | Volunteer | Fakhrul w১৬ **+ NCP Hasnat w১৬** |
| `bnp_c1vol` | Sohel Rana | Volunteer | Fakhrul **+** Khasru (shared, w১৬) |
| `hannan123` | Hannan Masud | Volunteer | Salahuddin, w১৬ |
| `shakil123` | Shakil Ahmed | Volunteer | Abbas, w১১ |
| `bnp_donor1` | Hafizur Rahman | Donor | added by the PA |
| `delwar123` | Delwar Hossain | Donor | **added by candidate Fakhrul** |

## National Citizen Party (NCP)

| Login | Name | Role | Scope |
|---|---|---|---|
| `nahid123` | Nahid Islam | Political Admin | whole party |
| `tasnim123` | Tasnim Zara | Candidate | Dhaka-8 |
| `hasnat123` | Hasnat Abdullah | Candidate | Dhaka-10 (vs BNP head-to-head) |
| `limon123` | Tanvir Ahmed | Campaign Admin | Tasnim's campaign |
| `ncp_sub_admin1` | Shafiul Bashar | Sub-admin | Tasnim, wards ০৮/০৯/১০ |
| `faisal123` | Faisal Karim | Campaign Admin | Hasnat's campaign |
| `tuhin123` | Tuhin Khan | Sub-admin | Hasnat, ward ১৪ |
| `abid123` | Abid Hassan | Volunteer | Tasnim, w০৮ |
| `mehedi123` | Mehedi Hasan | Volunteer | Tasnim, w০৯ |
| `jannat123` | Jannatul Ferdous | Volunteer | Hasnat, w১৪ |
| `asif123` | Asif Mahtab | Donor | added by the PA |

## Bangladesh Jamaat-e-Islami

| Login | Name | Role | Scope |
|---|---|---|---|
| `shafiq123` | Shafiqur Rahman | Political Admin | whole party |
| `parwar123` | Mia Golam Parwar | Candidate | Dhaka-10 (4-party seat) |
| `azad123` | Hamidur Rahman Azad | Candidate | Dhaka-9 |
| `nayeem123` | Nayeem Sardar | Campaign Admin | Parwar's campaign |
| `rabbani123` | Golam Rabbani | Sub-admin | Parwar, ward ১৬ |
| `imran123` | Imran Sheikh | Volunteer | Parwar, w১৬ |
| `belal123` | Belal Hossain | Campaign Admin | Azad's campaign |
| `anwar123` | Anwar Parvez | Sub-admin | Azad, ward ০৭ |
| `rasel123` | Rasel Mahmud | Volunteer | Azad, w০৭ |
| `mizan123` | Mizanur Rahman | Donor | added by the PA |

## Jatiya Party

| Login | Name | Role | Scope |
|---|---|---|---|
| `quader123` | GM Quader | Political Admin | whole party |
| `anisul123` | Anisul Islam Mahmud | Candidate | Dhaka-10 (4-party seat) |
| `chunnu123` | Mujibul Haque Chunnu | Candidate | Dhaka-7 |
| `firoz123` | Firoz Alam | Campaign Admin | Anisul's campaign |
| `sumon123` | Sumon Barua | Sub-admin | Anisul, ward ১৬ |
| `ripon123` | Ripon Das | Volunteer | Anisul, w১৬ |
| `arifc123` | Arif Chowdhury | Campaign Admin | Chunnu's campaign |
| `sazzad123` | Sazzad Hossain | Sub-admin | Chunnu, ward ২৪ |
| `polash123` | Polash Roy | Volunteer | Chunnu, w২৪ |
| `rashed123` | Rashed Kabir | Donor | added by the PA |

## Feature walkthrough (what to show, with which login)

1. **Party isolation** — log in `tarek123`: /party shows only BNP's 4 candidates;
   nothing of the other three parties anywhere. Cross-check with `nahid123`
   (NCP), `shafiq123` (Jamaat), `quader123` (Jatiya) — each sees only its own.
2. **Multiple candidates per seat** — Dhaka-10 is a FOUR-party battleground:
   3 BNP + 1 NCP + 1 Jamaat + 1 Jatiya candidate; /party groups per
   constituency, "চূড়ান্ত candidate নির্বাচন" demos §8.
3. **Campaign encapsulation** — `bnp_cand1` vs `bnp_cand2`: same seat, totally
   different survey data (22 vs ~8 records); neither sees the other's.
4. **Shared volunteer** — Sohel Rana serves Fakhrul + Khasru; the header
   switcher picks the active campaign; each canvass lands only in that
   campaign's data.
5. **Volunteer restrictions** — `shakil123` (w১১) or `nuru123`: only their
   wards/areas are reachable; no survey/analytics/team pages.
6. **Persuadable voters** — `tarek123` → /party/surveys → "Persuadable ভোটার":
   2 voters whose answers changed across visits; click the name for the
   timeline drawer.
7. **Cross-party intelligence (Main Admin only)** — `admin` → Admin ▸ Voter
   History: 7 persuadable voters across all four parties — two of them
   (সুফিয়া বেগম, বাবলি বেগম) carry a **three-party** timeline (party chips on
   the row, every party's visits in the drawer). Admin ▸ Multi-party
   Volunteers flags Nurul Haque Nuru (BNP + NCP).
8. **Donations** — `delwar123`: donor added BY A CANDIDATE, ৳10,000 confirmed.
   `bnp_c1vol` (Sohel): pending ৳3,000 → confirm live ("টাকা পেয়েছি").
   `tarek123` → /party/donations: the party ledger (4 rows). Every party has
   its own pending flow to confirm on stage: `mehedi123` (NCP ৳4,000),
   `rasel123` (Jamaat ৳2,500), `polash123` (Jatiya ৳3,500).
9. **Candidate-added donors** — `bnp_cand1` → Team: sees the party's donors;
   can edit/remove only Delwar (his own), Hafizur is view-only.
