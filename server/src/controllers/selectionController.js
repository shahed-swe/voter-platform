'use strict';
/**
 * Candidate selection & data handover — flowApplication.md §8.
 *
 * The Tenant Admin picks the party's FINAL candidate for a seat. The other
 * candidates of the SAME party in the SAME seat now support the selected one:
 * their canvassing records, donation contexts, and campaign teams
 * (campaign admins / sub-admins / volunteers) are transactionally re-pointed
 * to the selected candidate's campaign. The same rule covers a withdrawal —
 * re-selecting moves everything toward the new pick.
 *
 * Only the caller's OWN party is reachable; the whole handover is one
 * transaction and every run lands in audit_logs.
 */
const { many, one, withTransaction } = require('../db/pool');
const { ValidationError, ForbiddenError, NotFoundError } = require('../utils/errors');

function tenantPartyIds(req) {
    return (req.user?.parties || [])
        .filter((p) => p.role === 'tenant_admin')
        .map((p) => p.id);
}

function callerParties(req) {
    if (req.user?.is_super_admin) {
        if (!req.query.party_id && !req.body?.party_id) throw new ValidationError('party_id required');
        return [req.query.party_id || req.body.party_id];
    }
    const ids = tenantPartyIds(req);
    if (!ids.length) throw new ForbiddenError('Political Admin only');
    return ids;
}

/** GET /api/selection — the party's final picks, one row per decided seat. */
async function list(req, res) {
    const partyIds = callerParties(req);
    const selections = await many(
        `SELECT s.candidate_id, s.party_id, s.selected_user_id, s.selected_at,
                u.name AS selected_name, u.username AS selected_username,
                b.name AS selected_by_name,
                c.name AS constituency_name
           FROM candidate_selections s
           JOIN users u ON u.user_id = s.selected_user_id
           LEFT JOIN users b ON b.user_id = s.selected_by
           JOIN candidates c ON c.candidate_id = s.candidate_id
          WHERE s.party_id = ANY($1)
          ORDER BY c.name`,
        [partyIds]
    );
    res.json({ success: true, selections });
}

/**
 * POST /api/selection  Body: { constituency_id, candidate_user_id }
 * Makes (or changes) the final selection and runs the handover.
 */
async function select(req, res) {
    const partyIds = callerParties(req);
    const { constituency_id: constituencyId, candidate_user_id } = req.body || {};
    const selectedId = parseInt(candidate_user_id, 10);
    if (!constituencyId || !selectedId) {
        throw new ValidationError('constituency_id and candidate_user_id are required');
    }

    // The selected person must be one of OUR party's candidates on this seat.
    const grant = await one(
        `SELECT uc.party_id FROM user_candidates uc
          WHERE uc.user_id = $1 AND uc.candidate_id = $2
            AND uc.role = 'candidate' AND uc.party_id = ANY($3)`,
        [selectedId, constituencyId, partyIds]
    );
    if (!grant) throw new NotFoundError('That candidate is not your party\'s candidate on this seat');
    const partyId = grant.party_id;

    const result = await withTransaction(async (client) => {
        // Every OTHER candidate of this party on this seat hands over.
        const others = (await client.query(
            `SELECT uc.user_id FROM user_candidates uc
              WHERE uc.candidate_id = $1 AND uc.role = 'candidate'
                AND uc.party_id = $2 AND uc.user_id <> $3`,
            [constituencyId, partyId, selectedId]
        )).rows.map((r) => r.user_id);

        let movedCanvasses = 0, movedTeam = 0, movedDonations = 0;
        if (others.length) {
            // 1. Canvassing data moves behind the selected campaign (§8).
            movedCanvasses = (await client.query(
                `UPDATE canvassing SET political_candidate_id = $1
                  WHERE candidate_id = $2 AND political_candidate_id = ANY($3)`,
                [selectedId, constituencyId, others]
            )).rowCount;

            // 2. Donation context follows the campaign it supported.
            movedDonations = (await client.query(
                `UPDATE donations SET political_candidate_id = $1
                  WHERE candidate_id = $2 AND political_candidate_id = ANY($3)`,
                [selectedId, constituencyId, others]
            )).rowCount;

            // 3. Team grants re-point. A person already holding a grant under
            //    the selected campaign (e.g. a shared volunteer) would collide
            //    with the natural key — drop the now-redundant row first.
            await client.query(
                `DELETE FROM user_candidates uc
                  WHERE uc.candidate_id = $2 AND uc.political_candidate_id = ANY($3)
                    AND uc.role <> 'candidate'
                    AND EXISTS (SELECT 1 FROM user_candidates k
                                 WHERE k.user_id = uc.user_id AND k.candidate_id = uc.candidate_id
                                   AND k.political_candidate_id = $1)`,
                [selectedId, constituencyId, others]
            );
            movedTeam = (await client.query(
                `UPDATE user_candidates SET political_candidate_id = $1
                  WHERE candidate_id = $2 AND political_candidate_id = ANY($3)
                    AND role <> 'candidate'`,
                [selectedId, constituencyId, others]
            )).rowCount;
        }

        await client.query(
            `INSERT INTO candidate_selections (candidate_id, party_id, selected_user_id, selected_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (candidate_id, party_id) DO UPDATE
               SET selected_user_id = EXCLUDED.selected_user_id,
                   selected_by = EXCLUDED.selected_by,
                   selected_at = now()`,
            [constituencyId, partyId, selectedId, req.user.user_id]
        );

        await client.query(
            `INSERT INTO audit_logs (user_id, candidate_id, action, entity_type, entity_id, changes)
             VALUES ($1, $4, 'candidate_selection', 'candidate_selection', $2, $3)`,
            [req.user.user_id, selectedId, JSON.stringify({
                constituency_id: constituencyId,
                party_id: partyId,
                selected_user_id: selectedId,
                handed_over_from: others,
                moved_canvasses: movedCanvasses,
                moved_team_grants: movedTeam,
                moved_donations: movedDonations,
            }), constituencyId]
        );

        return { others, movedCanvasses, movedTeam, movedDonations };
    });

    res.json({
        success: true,
        selected_user_id: selectedId,
        handed_over_from: result.others,
        moved: {
            canvasses: result.movedCanvasses,
            team_members: result.movedTeam,
            donations: result.movedDonations,
        },
    });
}

module.exports = { list, select };
