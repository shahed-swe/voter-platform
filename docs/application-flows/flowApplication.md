# Voter Management Platform — Application Overview

**Version:** 0.4
**Purpose of this document:** To describe, in plain language, what the
application does and how it is meant to work end to end, so the intended flow
can be checked against what is already built.

This is not a technical document. It describes purpose, roles and behaviour only.

---

## 1. What the platform is for

The platform helps a political party organise and run voter canvassing at
constituency level, and helps the party decide which of its candidates is
strongest in each seat.

It does four things:

1. Organises the party's people, from party leadership down to field
   volunteers, with a clear chain of authority.
2. Captures what voters actually say during door-to-door visits.
3. Compares candidates within the same seat so the party can back the one most
   likely to win.
4. Records donations from donors through to the volunteers who receive them.

---

## 2. Separation between parties

Every political party using the platform is completely separate from every
other party.

All parties get the same features and follow the same process, but their
information is entirely their own. One party can never see another party's
surveys, canvassing data, volunteers, candidates, donors or results. There is
no partial sharing and no accidental overlap.

Role-based access control is the mechanism that enforces this, and it is the
core feature of the application rather than an add-on to it.

The only exception is the Main Admin, described below.

---

## 3. Roles

| Role | Created by | Responsible for |
|---|---|---|
| **Main Admin** | Platform owner | Operates the platform. Creates parties and their leads. Can see across all parties. More than one Main Admin can exist. |
| **Tenant Admin** (Political Lead) | Main Admin | The head of a party on the platform. Owns everything within that party. Appoints campaign staff and donors, and makes the final selection of who the party backs in each seat. |
| **Campaign Admin** | Tenant Admin | Runs the campaign for one or more constituencies. Appoints the local staff beneath them and reviews results across their seats. |
| **Sub Admin** | Campaign Admin | Responsible for a specific area or ward. Registers the candidates operating on their ground, and brings volunteers onto the platform for that area. |
| **Candidate** | Sub Admin | A person contesting a seat. Has volunteers canvassing on their behalf and sees the work done for them. Several candidates can exist in the same constituency. |
| **Volunteer** | Sub Admin | Goes house to house collecting information from voters. Works within a specific assigned area. |
| **Donor** | Tenant Admin | Supports a campaign financially by giving donations to volunteers in a particular area. Sits outside the main chain. |

### Chain of authority

```
Main Admin                    (platform level, sees all parties)
     │ creates
     ▼
Tenant Admin / Political Lead (party level)
     │ creates                        │ assigns
     ▼                                ▼
Campaign Admin                     Donor
     │ creates                      (constituency level)
     ▼
Sub Admin                          (area / ward level)
     │ creates            │ creates
     ▼                    ▼
Candidate  ◀──canvassed for──  Volunteer
```

Each role is created only by the role directly above it. Nobody can create a
role at their own level or higher.

The Sub Admin creates both the candidates on their ground and the volunteers
working that ground, and assigns each volunteer to the candidate they canvass
for.

This structure is understood to be broadly right but not final. It is expected
to change as the flow is refined.

---

## 4. The volunteer's position

The volunteer is the only person in the whole structure who actually speaks to
voters. Everyone above them organises, reviews and decides, but no one else
conducts a survey.

Two rules follow from this:

- **A volunteer works within a specific assigned area.** They canvass the voters
  of that area and nowhere else.
- **Survey information flows upward.** The survey a volunteer records is visible
  to the candidate they canvass for, and to the Sub Admin above that candidate,
  and to the Campaign Admin above them, and finally to the Tenant Admin at the
  top of the party. Each level sees the real survey data, not a summary of it.

Nothing flows downward or sideways. A volunteer sees only their own work, and a
candidate sees only their own volunteers' work.

---

## 5. Volunteers who work for more than one party

A volunteer may be working for two or more parties at the same time.

This is visible only to the Main Admin. A Tenant Admin does not see it, and
neither does anyone else within a party. From each party's point of view, the
volunteer is simply one of their own people.

---

## 6. Setting up a party

1. The Main Admin creates the party on the platform and hands it over to the
   Tenant Admin.
2. The Tenant Admin appoints Campaign Admins. One Campaign Admin can be
   responsible for more than one constituency.
   *For example, Admin One is responsible for both Dhaka-14 and Dhaka-10.*
3. Each Campaign Admin appoints Sub Admins for the areas within their
   constituencies.
4. Each Sub Admin registers the candidates on their ground and brings on the
   volunteers who will canvass for them.

A single constituency can have several candidates from the same party.

*For example, Dhaka-14 has three candidates.*

Each of those candidates has their own support base, so each has their own set
of volunteers and gathers their own canvassing data, entirely separately from
the others.

The voter list itself is supplied by the platform owner. Volunteers work against
that list rather than creating voter records themselves.

---

## 7. How the survey works

Volunteers go house to house within their assigned area and collect information
about voters, including which candidate they are inclined to support.

While canvassing is running:

- A volunteer sees only the surveys they personally carried out.
- A candidate sees the surveys carried out by their own volunteers, and nothing
  from the other candidates in the same seat.
- The Sub Admin sees all the work in their area, across every candidate there.
- The Campaign Admin sees everything across their constituencies.
- The Tenant Admin sees everything within the party.

This separation matters because candidates in the same seat are, at this stage,
competing with one another. Neither their volunteers nor the candidates
themselves should be able to see how a rival is performing.

---

## 8. Choosing who the party backs

Once enough canvassing has been done:

1. The Campaign Admin reviews results across all candidates in the seat and
   identifies who has the strongest chance of winning.
2. The Tenant Admin makes the final selection.
3. The candidates who were not selected now support the selected one, and their
   canvassing data moves across to that person.

The same rule applies if a candidate withdraws at any point: their data moves to
the final person appointed by the party head.

The result is that all the field intelligence gathered across the seat, by every
candidate's team, ends up behind a single campaign.

---

## 9. Donations

1. The Tenant Admin assigns donors to the party.
2. A donor finds volunteers working in the area they wish to support.
3. The donor gives a donation to a volunteer.
4. The volunteer separately confirms that the money was received.
5. The platform keeps a record of the donation.

The confirmation is done by the volunteer, not by the donor, so both sides of
the transaction are recorded independently.

A donor's profile shows the donations they have made and how many. Donors do not
see the canvassing work their money supported.

---

## 10. Voter support history

The same voter may be visited more than once, by different volunteers, working
for different candidates, over a period of weeks.

Each visit is recorded against the voter and the date. The value is in seeing
how a voter's answer changes between visits, not in any single answer. A voter
whose stated preference shifts across three visits is persuadable; one whose
answer never changes is not.

Within a party, this history is visible only to the Tenant Admin, who uses it to
understand which candidate genuinely has the strongest standing in the seat.

The Main Admin can see voter support history across all parties.

---

## 11. Summary of what each role can see

| | Own survey work | Their candidate's work | Whole area | Whole constituency | Whole party | All parties |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Volunteer | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Candidate | — | ✅ | ❌ | ❌ | ❌ | ❌ |
| Sub Admin | — | ✅ | ✅ | ❌ | ❌ | ❌ |
| Campaign Admin | — | ✅ | ✅ | ✅ | ❌ | ❌ |
| Tenant Admin | — | ✅ | ✅ | ✅ | ✅ | ❌ |
| Main Admin | — | ✅ | ✅ | ✅ | ✅ | ✅ |

Additionally:

- **Voter support history** is seen by the Tenant Admin within their party, and
  by the Main Admin across all parties.
- **Volunteers working for more than one party** is seen only by the Main Admin.
- **Donors** see only their own donation record.

---

## 12. What each role sees in the application

This section describes the application from each user's side. It is the part
most useful for checking against what is already built.

### Main Admin

- Lands on a platform-wide view listing all parties on the system
- Can create a party and its Tenant Admin
- Can open any party and see everything inside it
- Has a view showing volunteers who are active in more than one party
- Can see voter support history across all parties

### Tenant Admin (Political Lead)

- Lands on a party-wide dashboard covering every constituency the party is
  contesting
- Creates and manages Campaign Admins
- Assigns donors
- Sees every candidate, volunteer, survey and donation within the party
- Sees voter support history for the party
- Makes the final selection of who the party backs in each seat

### Campaign Admin

- Lands on a view of the constituencies they are responsible for
- Creates and manages Sub Admins
- Sees all candidates in their constituencies and the comparison between them
- Sees all canvassing data across their constituencies
- Cannot see other constituencies, and cannot see voter support history

### Sub Admin

- Lands on a view of their assigned area
- Registers and manages the candidates on their ground
- Creates volunteers, assigns them to an area and attaches them to a candidate
- Sees all canvassing activity within their area
- Cannot see the wider constituency or other areas

### Candidate

- Lands on their own campaign view for their seat
- Sees the volunteers canvassing for them and the surveys those volunteers
  completed
- Sees nothing belonging to other candidates in the same seat
- Records donations passed on to their volunteers

### Volunteer

- Lands on the voter list for their assigned area
- Records survey responses house to house
- Sees only the surveys they personally completed
- Confirms receipt of donations

### Donor

- Lands on their own profile
- Sees the donations they have made and the total number
- Can find volunteers by area in order to make a donation
- Sees no canvassing or survey information

---

## 13. Confirmed decisions

| Question | Decision |
|---|---|
| Can the Main Admin see voter support history across all parties? | Yes |
| Where does the voter list come from? | Supplied by the platform owner |
| Can a donor see the survey work their money supported? | No |
| What happens if a candidate withdraws? | Their data moves to the final person appointed by the party head |
| Can one Campaign Admin hold more than one constituency? | Yes |
| Do donation records need official reporting? | No. The record shows that a donation was made, and the donor profile shows how many they have made |
| Who creates volunteers? | The Sub Admin, for their area |
| Is a volunteer tied to an area? | Yes. They canvass only within their assigned area |
| What happens when a volunteer leaves a party? | Not being handled at this stage |
| Can the final selection be reversed after data has moved? | Not being handled at this stage |