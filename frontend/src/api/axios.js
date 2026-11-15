import axios from 'axios';
import { createSingleFlight, requestKey } from '../utils/singleFlight';

const api = axios.create({ baseURL: '/api' });

// an identical write that is already on its way is not sent a second time (double click on "Save")
const baseAdapter = axios.getAdapter(api.defaults.adapter);
const once = createSingleFlight();
api.defaults.adapter = (config) => once(requestKey(config), () => baseAdapter(config));

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
