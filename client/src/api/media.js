import client from './client';

export const upload = (file, { canvassId, voterId, fileType, durationSeconds }) => {
    const form = new FormData();
    form.append('file', file);
    form.append('canvass_id', canvassId);
    form.append('voter_id', voterId);
    form.append('file_type', fileType);
    if (durationSeconds) form.append('duration_seconds', durationSeconds);
    return client
        .post('/media/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
        .then((r) => r.data);
};

export const byCanvass   = (id)  => client.get(`/media/canvass/${id}`).then((r) => r.data);
export const byVoter     = (id)  => client.get(`/media/voter/${id}`).then((r) => r.data);
export const getById     = (id)  => client.get(`/media/${id}`).then((r) => r.data);
export const serveUrl    = (id)  => `/api/media/serve/${id}`;
export const deletePhoto = (canvassId) => client.delete(`/media/delete/photo/${canvassId}`).then((r) => r.data);
export const deleteAudio = (canvassId) => client.delete(`/media/delete/audio/${canvassId}`).then((r) => r.data);
