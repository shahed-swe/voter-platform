# Features REMAINING ⏳

Checklist of what is NOT done yet (updated 2026-09-01). Section numbers (§)
refer to the spec, [flowApplication.md](flowApplication.md); implementation
details live in [plan.md](plan.md). What's already finished:
[featureDone.md](featureDone.md).

All planned feature work from plan.md Steps 1–7 has landed. What remains is
input-dependent or polish:

- [ ] Per-role permission fine-tuning still to be specified by the product
      owner (announced: "permissions related things which I should provide
      later")
- [ ] Cross-party voter matching depends on rolls carrying voter numbers
      (sos_vid) — rolls imported without them can't be matched across parties
      (documented caveat, §10)
- [ ] Base map geometry (wards/areas/buildings) intentionally stays
      constituency-wide — only canvass-derived data is campaign-isolated
      (documented decision; revisit only if geometry itself becomes sensitive)
