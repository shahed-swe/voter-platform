import client from './client';

export const overview              = ()         => client.get('/analytics/overview').then((r) => r.data);
export const supportDistribution   = ()         => client.get('/analytics/support-distribution').then((r) => r.data);
export const demographics          = ()         => client.get('/analytics/demographics').then((r) => r.data);
export const villagePerformance    = (params)   => client.get('/analytics/village-performance', { params }).then((r) => r.data);
export const canvasserPerformance  = (params)   => client.get('/analytics/canvasser-performance', { params }).then((r) => r.data);
export const dailyTrends           = (params)   => client.get('/analytics/daily-trends', { params }).then((r) => r.data);
export const issues                = (params)   => client.get('/analytics/issues', { params }).then((r) => r.data);
export const canvassingRecords     = (params)   => client.get('/analytics/canvassing-records', { params }).then((r) => r.data);
