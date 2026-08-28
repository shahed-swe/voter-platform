import client from './client';

// `params` may include filters: start_date, end_date, voter_areas (comma-joined),
// canvasser_id, income_bracket, source (+ limit/days where relevant).
export const overview              = (params)   => client.get('/analytics/overview', { params }).then((r) => r.data);
export const supportDistribution   = (params)   => client.get('/analytics/support-distribution', { params }).then((r) => r.data);
export const demographics          = (params)   => client.get('/analytics/demographics', { params }).then((r) => r.data);
export const incomeDistribution    = (params)   => client.get('/analytics/income-distribution', { params }).then((r) => r.data);
export const villagePerformance    = (params)   => client.get('/analytics/village-performance', { params }).then((r) => r.data);
export const canvasserPerformance  = (params)   => client.get('/analytics/canvasser-performance', { params }).then((r) => r.data);
export const dailyTrends           = (params)   => client.get('/analytics/daily-trends', { params }).then((r) => r.data);
export const issues                = (params)   => client.get('/analytics/issues', { params }).then((r) => r.data);
export const canvassingRecords     = (params)   => client.get('/analytics/canvassing-records', { params }).then((r) => r.data);
export const canvassers            = ()         => client.get('/analytics/canvassers').then((r) => r.data);
export const issuesRecords         = (params)   => client.get('/analytics/issues-records', { params }).then((r) => r.data);
export const occupations           = (params)   => client.get('/analytics/occupations', { params }).then((r) => r.data);
