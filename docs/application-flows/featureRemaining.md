# Features REMAINING ⏳

Checklist of what is NOT done yet (as of 2026-08-31). Section numbers (§) refer to
the spec, [flowApplication.md](flowApplication.md); implementation details for each
item live in [plan.md](plan.md) (Steps 5–7 + leftovers). What's already finished:
[featureDone.md](featureDone.md).

## Voter support history (§10)

- [ ] Full cross-campaign voter timeline endpoint + UI — restricted to
      Political Admin / Main Admin only
- [ ] Persuadable-voters list built from support-level changes over time

## Candidate selection & data handover (§8)

- [ ] Political Admin selects the FINAL candidate for a seat (e.g. 1 of the 3
      on Dhaka-10)
- [ ] Transactional handover: canvassing data + volunteer assignments re-pointed
      to the selected candidate, with an audit log entry

## Role-specific dashboards

- [ ] Dedicated dashboards for Candidate / Campaign Admin / Sub-admin
      (today they land on the generic constituency dashboard)

## Data-scoping sweep leftovers

- [ ] Analytics-geo / village endpoints and voter-roll subqueries inside analytics
      (overview / village performance still count the whole constituency roll)
- [ ] Remove the remaining `optionalAuth` routes (e.g. `/api/canvassing/stats`)
      in favor of mandatory auth

## Auth hardening

- [ ] JWT versioning + forced re-login on payload-structure changes
- [ ] Drop query-string token acceptance (Authorization header only)

## Other spec items

- [ ] Main Admin overview of volunteers working across multiple parties (§5)
- [ ] Per-role permission fine-tuning still to be specified by the product owner
      (announced: "permissions related things which I should provide later")
