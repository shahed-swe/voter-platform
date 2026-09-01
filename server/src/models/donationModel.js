'use strict';
const { one, many } = require('../db/pool');

/**
 * donations — flowApplication.md §9.
 * Donor → volunteer money records with independent volunteer confirmation.
 * Every read is anchored on donor_user_id, volunteer_user_id, or party_id —
 * the three isolation axes.
 */

const FIELDS = `
    d.donation_id, d.party_id, d.amount, d.note, d.status,
    d.recorded_at, d.confirmed_at,
    d.donor_user_id,     du.name AS donor_name,
    d.volunteer_user_id, vu.name AS volunteer_name,
    d.political_candidate_id, pc.name AS candidate_name,
    d.candidate_id, c.name AS constituency_name`;

const JOINS = `
    FROM donations d
    JOIN users du ON du.user_id = d.donor_user_id
    JOIN users vu ON vu.user_id = d.volunteer_user_id
    LEFT JOIN users pc ON pc.user_id = d.political_candidate_id
    LEFT JOIN candidates c ON c.candidate_id = d.candidate_id`;

async function create({ partyId, donorUserId, volunteerUserId, politicalCandidateId, candidateId, amount, note }) {
    return one(
        `INSERT INTO donations
             (party_id, donor_user_id, volunteer_user_id, political_candidate_id, candidate_id, amount, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [partyId, donorUserId, volunteerUserId, politicalCandidateId || null, candidateId || null, amount, note || null]
    );
}

/** The donor's own donations, newest first. */
async function listForDonor(donorUserId) {
    return many(
        `SELECT ${FIELDS} ${JOINS}
          WHERE d.donor_user_id = $1
          ORDER BY d.recorded_at DESC`,
        [donorUserId]
    );
}

/** Donations addressed to a volunteer, pending first. */
async function listForVolunteer(volunteerUserId) {
    return many(
        `SELECT ${FIELDS} ${JOINS}
          WHERE d.volunteer_user_id = $1
          ORDER BY (d.status = 'recorded') DESC, d.recorded_at DESC`,
        [volunteerUserId]
    );
}

/**
 * Volunteer confirms receipt of ONE donation addressed to them.
 * Returns null when the donation isn't theirs or is already confirmed —
 * the WHERE clause is the authorization.
 */
async function confirm(donationId, volunteerUserId) {
    return one(
        `UPDATE donations
            SET status = 'confirmed', confirmed_at = now()
          WHERE donation_id = $1 AND volunteer_user_id = $2 AND status = 'recorded'
          RETURNING *`,
        [donationId, volunteerUserId]
    );
}

/** The party ledger: every donation inside the given parties. */
async function partyLedger(partyIds, { limit = 100, offset = 0 } = {}) {
    const totalRow = await one(
        `SELECT COUNT(*)::int AS count,
                COALESCE(SUM(amount), 0)                                    AS total_amount,
                COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed'), 0) AS confirmed_amount
           FROM donations WHERE party_id = ANY($1)`,
        [partyIds]
    );
    const records = await many(
        `SELECT ${FIELDS} ${JOINS}
          WHERE d.party_id = ANY($1)
          ORDER BY d.recorded_at DESC
          LIMIT $2 OFFSET $3`,
        [partyIds, limit, offset]
    );
    return { records, ...totalRow };
}

/** A donor's aggregate numbers for their profile header. */
async function donorTotals(donorUserId) {
    return one(
        `SELECT COUNT(*)::int AS count,
                COALESCE(SUM(amount), 0)                                     AS total_amount,
                COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed'), 0)  AS confirmed_amount,
                COUNT(*) FILTER (WHERE status = 'recorded')::int              AS pending_count
           FROM donations WHERE donor_user_id = $1`,
        [donorUserId]
    );
}

module.exports = { create, listForDonor, listForVolunteer, confirm, partyLedger, donorTotals };
