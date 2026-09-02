#!/usr/bin/env node
/**
 * Demo dataset for client demos — realistic Bangladeshi political scenario.
 *
 * Real public-figure names ONLY at the Political Admin → Candidate level
 * (Tarek Rahman / Mirza Fakhrul / Mirza Abbas …, Nahid Islam / Tasnim Zara /
 * Hasnat Abdullah). Every role below uses realistic FICTIONAL names.
 *
 * Re-runnable: users/grants are upserted; demo canvasses (source='Secondary'
 * by the demo canvassers) and demo donations (note starting 'ডেমো') are wiped
 * and re-inserted each run.
 *
 * Run from the repo root:  node server/scripts/seed-demo.js
 * Every seeded account's password: pass1234
 */
const { query, one, many, pool } = require('../src/db/pool');
const userModel = require('../src/models/userModel');
const candidateModel = require('../src/models/candidateModel');
const partyModel = require('../src/models/partyModel');
const { hashPassword } = require('../src/utils/password');

const PASSWORD = 'pass1234';
const BNP = 'bangladesh-national-party';
const NCP = 'national-citizen-party';
const JAMAAT = 'bangladesh-jamaat-e-islami';
const JATIYA = 'jatiya-party';

// ── helpers ──────────────────────────────────────────────────────────────────
async function ensureUser({ username, name, role, phone = null, email = null }) {
    const existing = await one(`SELECT user_id, name FROM users WHERE username = $1`, [username]);
    if (existing) {
        if (existing.name !== name) {
            await query(`UPDATE users SET name = $2, updated_at = NOW() WHERE user_id = $1`, [existing.user_id, name]);
        }
        return Number(existing.user_id);
    }
    const u = await userModel.create({
        username, email, name, role, phone,
        passwordHash: await hashPassword(PASSWORD),
    });
    console.log(`  + user ${username} (${name}, ${role})`);
    return Number(u.user_id);
}

function daysAgo(n, hour = 10) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(hour, 15 + (n * 7) % 40, 0, 0);
    return d;
}

// Pull stable voter ids for a (constituency, ward, area) slice.
async function pickVoters(candidateId, ward, area, limit, offset = 0) {
    return many(
        `SELECT voter_id FROM voters
          WHERE candidate_id = $1 AND ward = $2 AND voter_area_name = $3
          ORDER BY voter_id LIMIT $4 OFFSET $5`,
        [candidateId, ward, area, limit, offset]
    );
}

const ISSUES = [
    'রাস্তার অবস্থা খুব খারাপ, বর্ষায় পানি জমে',
    'গ্যাসের সংকট নিয়ে চিন্তিত',
    'এলাকায় মাদকের সমস্যা বাড়ছে',
    'দ্রব্যমূল্যের ঊর্ধ্বগতি নিয়ে ক্ষুব্ধ',
    'ছেলের চাকরির ব্যবস্থা চান',
    'বিদ্যুতের লোডশেডিং নিয়ে অভিযোগ',
    'এলাকার স্কুলের মান উন্নয়ন চান',
    'ড্রেনেজ ব্যবস্থার উন্নতি দরকার',
    null, null,
];
const BRACKETS = ['Low', 'Lower-Middle', 'Middle', 'Middle', 'Upper-Middle', ''];

let canvassCount = 0;
async function canvass({ voterId, byUser, constituency, pc, level, rating, date, undecided = false, followUp = false, issueIdx = null }) {
    canvassCount++;
    await query(
        `INSERT INTO canvassing
            (voter_id, user_id, candidate_id, political_candidate_id,
             support_level, support_rating, is_undecided, follow_up_needed,
             issues_concerns, household_size, income_bracket, source, canvass_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Secondary',$12)`,
        [voterId, byUser, constituency, pc, level, rating, undecided, followUp,
         ISSUES[(issueIdx ?? canvassCount) % ISSUES.length],
         2 + (canvassCount % 5), BRACKETS[canvassCount % BRACKETS.length] || null, date]
    );
}
// The schema only allows source IN ('Primary','Secondary'); the canvass form
// defaults to 'Primary', so 'Secondary' doubles as this script's demo marker.
const DEMO_SOURCE = 'Secondary';

// A batch of single-visit canvasses with a believable support mix.
async function canvassBatch(voters, { byUser, constituency, pc, startDay }) {
    const MIX = [
        ['Strong support', 5], ['Leaning support', 4], ['Leaning support', 4],
        ['Undecided', 3], ['Undecided', 3], ['Strong support', 5],
        ['Leaning opposed', 2], ['Undecided', 3], ['Strong support', 4],
        ['Strong oppose', 1], ['Leaning support', 4], ['Undecided', 3],
    ];
    for (let i = 0; i < voters.length; i++) {
        const [level, rating] = MIX[i % MIX.length];
        await canvass({
            voterId: voters[i].voter_id, byUser, constituency, pc,
            level, rating, date: daysAgo(startDay - Math.floor(i / 2), 9 + (i % 8)),
            undecided: level === 'Undecided',
            followUp: i % 5 === 3,
        });
    }
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('── Demo seed ──');

    // 1. Party display name (real-world naming) + the two extra parties.
    const superAdmin = Number((await one(
        `SELECT user_id FROM users WHERE is_super_admin = true ORDER BY user_id LIMIT 1`
    )).user_id);
    await query(`UPDATE parties SET name = 'Bangladesh Nationalist Party (BNP)' WHERE party_id = $1`, [BNP]);
    for (const [pid, pname] of [
        [JAMAAT, 'Bangladesh Jamaat-e-Islami'],
        [JATIYA, 'Jatiya Party'],
    ]) {
        if (!(await partyModel.findById(pid))) {
            await partyModel.create({ partyId: pid, name: pname, createdBy: superAdmin });
            console.log(`  + party ${pname}`);
        }
    }

    // 2. Rename the placeholder accounts to demo-grade names.
    //    (Real names only for PA → Candidate; fictional below that.)
    const RENAMES = {
        bnp_cand1:      'Mirza Fakhrul Islam Alamgir', // candidate — real
        bnp_cand2:      'Amir Khasru Mahmud Chowdhury',// candidate — real
        bnp_cand3:      'Salahuddin Ahmed',            // candidate — real
        bnp_c1adm:      'Kamrul Hasan',                // fictional
        bnp_c1sub:      'Rafiqul Islam',               // fictional
        bnp_c1vol:      'Sohel Rana',                  // fictional
        bnp_b1sub:      'Jashim Uddin',                // fictional
        bnp_c3sub:      'Mahbub Alam',                 // fictional
        bnp_donor1:     'Hafizur Rahman',              // fictional
        limon123:       'Tanvir Ahmed',                // fictional
        ncp_sub_admin1: 'Shafiul Bashar',              // fictional
        asif123:        'Asif Mahtab',                 // fictional
    };
    for (const [username, name] of Object.entries(RENAMES)) {
        await query(`UPDATE users SET name = $2 WHERE username = $1 AND name <> $2`, [username, name]);
    }
    console.log('  renamed placeholder accounts');

    // 3. New people. NCP gets a second candidate (Hasnat Abdullah on Dhaka-10 —
    //    head-to-head with BNP on the same seat) with a small chain; BNP's
    //    Mirza Abbas (Dhaka-8) gets his campaign chain; extra volunteers + donors.
    const ids = {};
    ids.hasnat = await ensureUser({ username: 'hasnat123', name: 'Hasnat Abdullah', role: 'candidate', phone: '01711-000201' });
    ids.faisal = await ensureUser({ username: 'faisal123', name: 'Faisal Karim',    role: 'admin',     phone: '01822-000202' });
    ids.tuhin  = await ensureUser({ username: 'tuhin123',  name: 'Tuhin Khan',      role: 'sub_admin', phone: '01933-000203' });
    ids.jannat = await ensureUser({ username: 'jannat123', name: 'Jannatul Ferdous',role: 'volunteer', phone: '01644-000204' });
    ids.selim  = await ensureUser({ username: 'selim123',  name: 'Selim Bhuiyan',   role: 'admin',     phone: '01755-000205' });
    ids.rubel  = await ensureUser({ username: 'rubel123',  name: 'Rubel Miah',      role: 'sub_admin', phone: '01866-000206' });
    ids.shakil = await ensureUser({ username: 'shakil123', name: 'Shakil Ahmed',    role: 'volunteer', phone: '01977-000207' });
    ids.mehedi = await ensureUser({ username: 'mehedi123', name: 'Mehedi Hasan',    role: 'volunteer', phone: '01588-000208' });
    ids.delwar = await ensureUser({ username: 'delwar123', name: 'Delwar Hossain',  role: 'donor',     phone: '01699-000209' });

    // Jamaat-e-Islami tree — real names for PA + candidates only.
    ids.shafiq  = await ensureUser({ username: 'shafiq123',  name: 'Shafiqur Rahman',      role: 'tenant_admin', phone: '01711-000301' });
    ids.parwar  = await ensureUser({ username: 'parwar123',  name: 'Mia Golam Parwar',     role: 'candidate',    phone: '01822-000302' });
    ids.azad    = await ensureUser({ username: 'azad123',    name: 'Hamidur Rahman Azad',  role: 'candidate',    phone: '01933-000303' });
    ids.nayeem  = await ensureUser({ username: 'nayeem123',  name: 'Nayeem Sardar',        role: 'admin',        phone: '01644-000304' });
    ids.rabbani = await ensureUser({ username: 'rabbani123', name: 'Golam Rabbani',        role: 'sub_admin',    phone: '01755-000305' });
    ids.imran   = await ensureUser({ username: 'imran123',   name: 'Imran Sheikh',         role: 'volunteer',    phone: '01866-000306' });
    ids.belal   = await ensureUser({ username: 'belal123',   name: 'Belal Hossain',        role: 'admin',        phone: '01977-000307' });
    ids.anwar   = await ensureUser({ username: 'anwar123',   name: 'Anwar Parvez',         role: 'sub_admin',    phone: '01588-000308' });
    ids.rasel   = await ensureUser({ username: 'rasel123',   name: 'Rasel Mahmud',         role: 'volunteer',    phone: '01699-000309' });
    ids.mizan   = await ensureUser({ username: 'mizan123',   name: 'Mizanur Rahman',       role: 'donor',        phone: '01511-000310' });

    // Jatiya Party tree.
    ids.quader  = await ensureUser({ username: 'quader123',  name: 'GM Quader',            role: 'tenant_admin', phone: '01711-000401' });
    ids.anisul  = await ensureUser({ username: 'anisul123',  name: 'Anisul Islam Mahmud',  role: 'candidate',    phone: '01822-000402' });
    ids.chunnu  = await ensureUser({ username: 'chunnu123',  name: 'Mujibul Haque Chunnu', role: 'candidate',    phone: '01933-000403' });
    ids.firoz   = await ensureUser({ username: 'firoz123',   name: 'Firoz Alam',           role: 'admin',        phone: '01644-000404' });
    ids.sumon   = await ensureUser({ username: 'sumon123',   name: 'Sumon Barua',          role: 'sub_admin',    phone: '01755-000405' });
    ids.ripon   = await ensureUser({ username: 'ripon123',   name: 'Ripon Das',            role: 'volunteer',    phone: '01866-000406' });
    ids.arifc   = await ensureUser({ username: 'arifc123',   name: 'Arif Chowdhury',       role: 'admin',        phone: '01977-000407' });
    ids.sazzad  = await ensureUser({ username: 'sazzad123',  name: 'Sazzad Hossain',       role: 'sub_admin',    phone: '01588-000408' });
    ids.polash  = await ensureUser({ username: 'polash123',  name: 'Polash Roy',           role: 'volunteer',    phone: '01699-000409' });
    ids.rashed  = await ensureUser({ username: 'rashed123',  name: 'Rashed Kabir',         role: 'donor',        phone: '01511-000410' });

    const uid = async (username) => Number((await one(`SELECT user_id FROM users WHERE username = $1`, [username])).user_id);
    const nahid = await uid('nahid123');
    const nuru  = await uid('nuru123');
    const abid  = await uid('abid123');
    const sohel = await uid('bnp_c1vol');
    const abbas = await uid('abbash123');
    const tasnim = await uid('tasnim123');
    const fakhrul = await uid('bnp_cand1');
    const khasru  = await uid('bnp_cand2');
    const salahuddin = await uid('bnp_cand3');
    const hannan = await uid('hannan123');
    const hafizur = await uid('bnp_donor1');
    const asif = await uid('asif123');
    const shafiul = await uid('ncp_sub_admin1');

    // 4. Grants (upserts — safe to re-run).
    const W16_AREAS = ['আল আমিন রোড', '| গ্রীনস্কয়ার গ্রীন রোড'];
    const grants = [
        // NCP campaign #2: Hasnat Abdullah on Dhaka-10 (vs BNP's three)
        { userId: ids.hasnat, candidateId: 'dhaka10', role: 'candidate', grantedBy: nahid, politicalCandidateId: ids.hasnat, partyId: NCP },
        { userId: ids.faisal, candidateId: 'dhaka10', role: 'admin',     grantedBy: ids.hasnat, politicalCandidateId: ids.hasnat },
        { userId: ids.tuhin,  candidateId: 'dhaka10', role: 'sub_admin', grantedBy: ids.faisal, politicalCandidateId: ids.hasnat, allowedWards: ['১৪'] },
        { userId: ids.jannat, candidateId: 'dhaka10', role: 'volunteer', grantedBy: ids.tuhin,  politicalCandidateId: ids.hasnat, allowedWards: ['১৪'], allowedVoterAreas: ['সনাতনগর (মনেশ্বর)'] },
        // Nurul Haque Nuru also volunteers for Hasnat's NCP campaign on the SAME
        // ward he covers for BNP — the multi-party-volunteer + cross-party story.
        { userId: nuru, candidateId: 'dhaka10', role: 'volunteer', grantedBy: ids.faisal, politicalCandidateId: ids.hasnat, allowedWards: ['১৬'], allowedVoterAreas: W16_AREAS },
        // BNP: Mirza Abbas's campaign chain on Dhaka-8
        { userId: ids.selim,  candidateId: 'dhaka8', role: 'admin',     grantedBy: abbas, politicalCandidateId: abbas },
        { userId: ids.rubel,  candidateId: 'dhaka8', role: 'sub_admin', grantedBy: ids.selim, politicalCandidateId: abbas, allowedWards: ['১১'] },
        { userId: ids.shakil, candidateId: 'dhaka8', role: 'volunteer', grantedBy: ids.rubel, politicalCandidateId: abbas, allowedWards: ['১১'], allowedVoterAreas: ['উত্তর শাহজাহানপুর'] },
        // NCP: extra volunteer under Tasnim Zara's existing chain (Dhaka-8)
        { userId: ids.mehedi, candidateId: 'dhaka8', role: 'volunteer', grantedBy: shafiul, politicalCandidateId: tasnim, allowedWards: ['০৯'], allowedVoterAreas: ['আরামবাগ'] },

        // Jamaat: Mia Golam Parwar on Dhaka-10 (4-party battleground seat) …
        { userId: ids.parwar,  candidateId: 'dhaka10', role: 'candidate', grantedBy: ids.shafiq,  politicalCandidateId: ids.parwar, partyId: JAMAAT },
        { userId: ids.nayeem,  candidateId: 'dhaka10', role: 'admin',     grantedBy: ids.parwar,  politicalCandidateId: ids.parwar },
        { userId: ids.rabbani, candidateId: 'dhaka10', role: 'sub_admin', grantedBy: ids.nayeem,  politicalCandidateId: ids.parwar, allowedWards: ['১৬'] },
        { userId: ids.imran,   candidateId: 'dhaka10', role: 'volunteer', grantedBy: ids.rabbani, politicalCandidateId: ids.parwar, allowedWards: ['১৬'], allowedVoterAreas: W16_AREAS },
        // … and Hamidur Rahman Azad on Dhaka-9.
        { userId: ids.azad,  candidateId: 'dhaka9', role: 'candidate', grantedBy: ids.shafiq, politicalCandidateId: ids.azad, partyId: JAMAAT },
        { userId: ids.belal, candidateId: 'dhaka9', role: 'admin',     grantedBy: ids.azad,   politicalCandidateId: ids.azad },
        { userId: ids.anwar, candidateId: 'dhaka9', role: 'sub_admin', grantedBy: ids.belal,  politicalCandidateId: ids.azad, allowedWards: ['০৭'] },
        { userId: ids.rasel, candidateId: 'dhaka9', role: 'volunteer', grantedBy: ids.anwar,  politicalCandidateId: ids.azad, allowedWards: ['০৭'], allowedVoterAreas: ['মানিকনগর উত্তর (সবুজবাগ অংশ)'] },

        // Jatiya Party: Anisul Islam Mahmud on Dhaka-10 …
        { userId: ids.anisul, candidateId: 'dhaka10', role: 'candidate', grantedBy: ids.quader, politicalCandidateId: ids.anisul, partyId: JATIYA },
        { userId: ids.firoz,  candidateId: 'dhaka10', role: 'admin',     grantedBy: ids.anisul, politicalCandidateId: ids.anisul },
        { userId: ids.sumon,  candidateId: 'dhaka10', role: 'sub_admin', grantedBy: ids.firoz,  politicalCandidateId: ids.anisul, allowedWards: ['১৬'] },
        { userId: ids.ripon,  candidateId: 'dhaka10', role: 'volunteer', grantedBy: ids.sumon,  politicalCandidateId: ids.anisul, allowedWards: ['১৬'], allowedVoterAreas: W16_AREAS },
        // … and Mujibul Haque Chunnu on Dhaka-7.
        { userId: ids.chunnu, candidateId: 'dhaka7', role: 'candidate', grantedBy: ids.quader, politicalCandidateId: ids.chunnu, partyId: JATIYA },
        { userId: ids.arifc,  candidateId: 'dhaka7', role: 'admin',     grantedBy: ids.chunnu, politicalCandidateId: ids.chunnu },
        { userId: ids.sazzad, candidateId: 'dhaka7', role: 'sub_admin', grantedBy: ids.arifc,  politicalCandidateId: ids.chunnu, allowedWards: ['২৪'] },
        { userId: ids.polash, candidateId: 'dhaka7', role: 'volunteer', grantedBy: ids.sazzad, politicalCandidateId: ids.chunnu, allowedWards: ['২৪'], allowedVoterAreas: ['শহীদ নগর'] },
    ];
    for (const g of grants) await candidateModel.grantUserAccess(g);
    // Party-level grants: the two new Political Admins + their donors.
    await partyModel.grantPartyRole({ userId: ids.shafiq, partyId: JAMAAT, role: 'tenant_admin', grantedBy: superAdmin });
    await partyModel.grantPartyRole({ userId: ids.quader, partyId: JATIYA, role: 'tenant_admin', grantedBy: superAdmin });
    await partyModel.grantPartyRole({ userId: ids.mizan,  partyId: JAMAAT, role: 'donor', grantedBy: ids.shafiq });
    await partyModel.grantPartyRole({ userId: ids.rashed, partyId: JATIYA, role: 'donor', grantedBy: ids.quader });
    // Donor added BY A CANDIDATE (Mirza Fakhrul) — demos the candidate-donor flow.
    await partyModel.grantPartyRole({ userId: ids.delwar, partyId: BNP, role: 'donor', grantedBy: fakhrul });
    console.log('  grants in place');

    // 5. Canvassing data (survey demos). Wipe previous demo rows, re-insert.
    // Wipe only THIS script's rows: 'Secondary' source + the demo canvassers.
    const demoCanvassers = [nuru, sohel, hannan, abid, ids.jannat, ids.shakil, ids.mehedi,
                            ids.imran, ids.rasel, ids.ripon, ids.polash];
    await query(`DELETE FROM canvassing WHERE source = $1 AND user_id = ANY($2)`, [DEMO_SOURCE, demoCanvassers]);

    const w16a = await pickVoters('dhaka10', '১৬', 'আল আমিন রোড', 30);
    const w16c = await pickVoters('dhaka10', '১৬', 'আল আমিন রোড', 20, 30); // Jamaat/Jatiya slices
    const w07  = await pickVoters('dhaka9',  '০৭', 'মানিকনগর উত্তর (সবুজবাগ অংশ)', 10);
    const w24  = await pickVoters('dhaka7',  '২৪', 'শহীদ নগর', 10);
    const w16b = await pickVoters('dhaka10', '১৬', '| গ্রীনস্কয়ার গ্রীন রোড', 20);
    const w14  = await pickVoters('dhaka10', '১৪', 'সনাতনগর (মনেশ্বর)', 12);
    const w11  = await pickVoters('dhaka8',  '১১', 'উত্তর শাহজাহানপুর', 12);
    const w09  = await pickVoters('dhaka8',  '০৯', 'আরামবাগ', 12);
    const w08  = await pickVoters('dhaka8',  '০৮', 'উত্তর কমলাপুর', 12);

    // Single-visit spreads per campaign.
    await canvassBatch(w16a.slice(0, 10), { byUser: nuru,      constituency: 'dhaka10', pc: fakhrul,    startDay: 18 });
    await canvassBatch(w16b.slice(0, 6),  { byUser: sohel,     constituency: 'dhaka10', pc: fakhrul,    startDay: 15 });
    await canvassBatch(w16b.slice(6, 13), { byUser: sohel,     constituency: 'dhaka10', pc: khasru,     startDay: 14 });
    await canvassBatch(w16a.slice(10, 17),{ byUser: hannan,    constituency: 'dhaka10', pc: salahuddin, startDay: 12 });
    await canvassBatch(w14.slice(0, 8),   { byUser: ids.jannat,constituency: 'dhaka10', pc: ids.hasnat, startDay: 10 });
    await canvassBatch(w11.slice(0, 9),   { byUser: ids.shakil,constituency: 'dhaka8',  pc: abbas,      startDay: 11 });
    await canvassBatch(w09.slice(0, 8),   { byUser: ids.mehedi,constituency: 'dhaka8',  pc: tasnim,     startDay: 9  });
    await canvassBatch(w08.slice(0, 6),   { byUser: abid,      constituency: 'dhaka8',  pc: tasnim,     startDay: 16 });
    // Jamaat campaigns
    await canvassBatch(w16c.slice(0, 8),  { byUser: ids.imran, constituency: 'dhaka10', pc: ids.parwar, startDay: 13 });
    await canvassBatch(w07.slice(0, 7),   { byUser: ids.rasel, constituency: 'dhaka9',  pc: ids.azad,   startDay: 12 });
    // Jatiya Party campaigns
    await canvassBatch(w16c.slice(8, 15), { byUser: ids.ripon, constituency: 'dhaka10', pc: ids.anisul, startDay: 11 });
    await canvassBatch(w24.slice(0, 7),   { byUser: ids.polash,constituency: 'dhaka7',  pc: ids.chunnu, startDay: 10 });

    // Persuadable voters (§10): revisits where the answer CHANGED.
    const pv1 = w16a[20], pv2 = w08[8];
    await canvass({ voterId: pv1.voter_id, byUser: nuru, constituency: 'dhaka10', pc: fakhrul, level: 'Leaning opposed', rating: 2, date: daysAgo(17), issueIdx: 3 });
    await canvass({ voterId: pv1.voter_id, byUser: nuru, constituency: 'dhaka10', pc: fakhrul, level: 'Undecided', rating: 3, date: daysAgo(8), undecided: true, followUp: true, issueIdx: 3 });
    await canvass({ voterId: pv1.voter_id, byUser: nuru, constituency: 'dhaka10', pc: fakhrul, level: 'Leaning support', rating: 4, date: daysAgo(2), issueIdx: 3 });
    await canvass({ voterId: pv2.voter_id, byUser: abid, constituency: 'dhaka8', pc: tasnim, level: 'Undecided', rating: 3, date: daysAgo(13), undecided: true, issueIdx: 1 });
    await canvass({ voterId: pv2.voter_id, byUser: abid, constituency: 'dhaka8', pc: tasnim, level: 'Strong support', rating: 5, date: daysAgo(4), issueIdx: 1 });
    const pv3 = w07[8], pv4 = w24[8]; // one persuadable per new party
    await canvass({ voterId: pv3.voter_id, byUser: ids.rasel, constituency: 'dhaka9', pc: ids.azad, level: 'Leaning opposed', rating: 2, date: daysAgo(12), issueIdx: 4 });
    await canvass({ voterId: pv3.voter_id, byUser: ids.rasel, constituency: 'dhaka9', pc: ids.azad, level: 'Leaning support', rating: 4, date: daysAgo(3), followUp: true, issueIdx: 4 });
    await canvass({ voterId: pv4.voter_id, byUser: ids.polash, constituency: 'dhaka7', pc: ids.chunnu, level: 'Strong support', rating: 5, date: daysAgo(14), issueIdx: 6 });
    await canvass({ voterId: pv4.voter_id, byUser: ids.polash, constituency: 'dhaka7', pc: ids.chunnu, level: 'Undecided', rating: 3, date: daysAgo(5), undecided: true, issueIdx: 6 });

    // Cross-party visits (Main Admin's global history): the SAME Dhaka-10 voters
    // canvassed by BNP (Fakhrul's campaign) AND NCP (Hasnat's campaign) — both
    // via Nuru, who works for both parties on ward ১৬.
    const xp1 = w16a[21], xp2 = w16a[22];
    await canvass({ voterId: xp1.voter_id, byUser: nuru, constituency: 'dhaka10', pc: fakhrul,    level: 'Leaning support', rating: 4, date: daysAgo(11), issueIdx: 5 });
    await canvass({ voterId: xp1.voter_id, byUser: nuru, constituency: 'dhaka10', pc: ids.hasnat, level: 'Undecided', rating: 3, date: daysAgo(5), undecided: true, issueIdx: 5 });
    await canvass({ voterId: xp2.voter_id, byUser: nuru, constituency: 'dhaka10', pc: fakhrul,    level: 'Leaning opposed', rating: 2, date: daysAgo(9), issueIdx: 2 });
    await canvass({ voterId: xp2.voter_id, byUser: nuru, constituency: 'dhaka10', pc: ids.hasnat, level: 'Strong support', rating: 5, date: daysAgo(3), followUp: true, issueIdx: 2 });
    // Jamaat and Jatiya visit the same two voters — a THREE-party timeline each
    // for the Main Admin's cross-party history.
    await canvass({ voterId: xp1.voter_id, byUser: ids.imran, constituency: 'dhaka10', pc: ids.parwar, level: 'Leaning opposed', rating: 2, date: daysAgo(1), issueIdx: 5 });
    await canvass({ voterId: xp2.voter_id, byUser: ids.ripon, constituency: 'dhaka10', pc: ids.anisul, level: 'Undecided', rating: 3, date: daysAgo(1, 16), undecided: true, issueIdx: 2 });
    console.log(`  ${canvassCount} demo canvasses inserted`);

    // 6. Donations — wipe previous demo rows (note starts with 'ডেমো'), re-insert.
    await query(`DELETE FROM donations WHERE note LIKE 'ডেমো%'`);
    const donations = [
        // BNP: pending confirmation (demos the volunteer "টাকা পেয়েছি" flow)
        { party: BNP, donor: hafizur, vol: sohel, pc: fakhrul, cand: 'dhaka10', amount: 3000, note: 'ডেমো — লিফলেট ও যাতায়াত খরচ', status: 'recorded', day: 2 },
        // BNP: from the CANDIDATE-added donor, already confirmed
        { party: BNP, donor: ids.delwar, vol: nuru, pc: fakhrul, cand: 'dhaka10', amount: 10000, note: 'ডেমো — ক্যাম্পেইন সহায়তা', status: 'confirmed', day: 6 },
        // NCP: pending confirmation
        { party: NCP, donor: asif, vol: ids.mehedi, pc: tasnim, cand: 'dhaka8', amount: 4000, note: 'ডেমো — এলাকা প্রচারণা', status: 'recorded', day: 1 },
        // Jamaat: one confirmed, one pending
        { party: JAMAAT, donor: ids.mizan, vol: ids.imran, pc: ids.parwar, cand: 'dhaka10', amount: 7000, note: 'ডেমো — পোস্টার ও মাইকিং', status: 'confirmed', day: 5 },
        { party: JAMAAT, donor: ids.mizan, vol: ids.rasel, pc: ids.azad, cand: 'dhaka9', amount: 2500, note: 'ডেমো — কর্মী আপ্যায়ন', status: 'recorded', day: 1 },
        // Jatiya Party: one confirmed, one pending
        { party: JATIYA, donor: ids.rashed, vol: ids.ripon, pc: ids.anisul, cand: 'dhaka10', amount: 5000, note: 'ডেমো — প্রচারপত্র ছাপা', status: 'confirmed', day: 4 },
        { party: JATIYA, donor: ids.rashed, vol: ids.polash, pc: ids.chunnu, cand: 'dhaka7', amount: 3500, note: 'ডেমো — যাতায়াত ভাতা', status: 'recorded', day: 2 },
    ];
    for (const d of donations) {
        await query(
            `INSERT INTO donations (party_id, donor_user_id, volunteer_user_id, political_candidate_id,
                                    candidate_id, amount, note, status, recorded_at, confirmed_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [d.party, d.donor, d.vol, d.pc, d.cand, d.amount, d.note, d.status,
             daysAgo(d.day), d.status === 'confirmed' ? daysAgo(d.day - 1, 18) : null]
        );
    }
    console.log(`  ${donations.length} demo donations inserted`);

    console.log('── done ──');
    await pool.end();
}

main().catch(async (err) => {
    console.error('[seed-demo] error:', err);
    await pool.end();
    process.exit(1);
});
