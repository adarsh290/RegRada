import axios, { type AxiosRequestConfig } from "axios";

export const authEventEmitter = new EventTarget();
let isRedirecting = false;

// BUG-SEC-037: Prevent silent fallback to localhost in production
const baseURL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? "/api" : "http://localhost:5000/api");

const api = axios.create({
  baseURL,
  withCredentials: true,
});

api.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    // BUG-FE2-002: Reset redirect flag on any successful response so future 401s are caught
    isRedirecting = false;
    return response;
  },
  (error) => {
    if (error.response?.status === 401 && !isRedirecting) {
      isRedirecting = true;
      authEventEmitter.dispatchEvent(new Event("logout"));
    }
    return Promise.reject(error);
  }
);

export const getCirculars = async (config?: AxiosRequestConfig) => {
  const response = await api.get("/circulars", config);
  return response.data;
};

export const getCircularById = async (id: string, config?: AxiosRequestConfig) => {
  const response = await api.get(`/circulars/${id}`, config);
  return response.data;
};

export const ingestCircular = async (data: { title: string; source: string; raw_text: string }, config?: AxiosRequestConfig) => {
  const response = await api.post("/circulars", data, config);
  return response.data;
};

export const ingestCircularPDF = async (formData: FormData, config?: AxiosRequestConfig) => {
  const response = await api.post("/circulars/upload-pdf", formData, config);
  return response.data;
};

export const submitProof = async (formData: FormData, config?: AxiosRequestConfig) => {
  const response = await api.post("/submissions", formData, config);
  return response.data;
};

export const getSubmissions = async (department?: string, config?: AxiosRequestConfig) => {
  const params = department ? { department } : {};
  const response = await api.get("/submissions", { ...config, params: { ...config?.params, ...params } });
  return response.data;
};

export const getOverdueMAPs = async (config?: AxiosRequestConfig) => {
  const response = await api.get("/circulars/overdue", config);
  return response.data;
};

// ── Sources API ─────────────────────────────────────────────
export const getSources = async (config?: AxiosRequestConfig) => {
  const response = await api.get("/sources", config);
  return response.data;
};

export const addSource = async (data: { name: string; url: string }, config?: AxiosRequestConfig) => {
  const response = await api.post("/sources", data, config);
  return response.data;
};

export const scrapeSource = async (id: string, config?: AxiosRequestConfig) => {
  const response = await api.post(`/sources/${id}/scrape`, null, config);
  return response.data;
};

export const getObligationGraph = async (circularId: string, config?: AxiosRequestConfig) => {
  const response = await api.get(`/circulars/${circularId}/obligation-graph`, config);
  return response.data;
};

export const getConflicts = async (config?: AxiosRequestConfig) => {
  const response = await api.get("/circulars/conflicts", config);
  return response.data;
};

export const queryMaps = async (query: string, config?: AxiosRequestConfig) => {
  const response = await api.post("/circulars/query", { query }, config);
  return response.data;
};

export const resolveConflict = async (circularId: string, conflictIndex: number, resolved_by_co: string, config?: AxiosRequestConfig) => {
  const response = await api.put(`/circulars/${circularId}/conflicts/${conflictIndex}/resolve`, { resolved_by_co }, config);
  return response.data;
};

export const approveMAP = async (circularId: string, mapId: string, config?: AxiosRequestConfig) => {
  const response = await api.put(`/circulars/${circularId}/maps/${mapId}/approve`, null, config);
  return response.data;
};

export const overrideSubmission = async (submissionId: string, verdict: string, comment: string, config?: AxiosRequestConfig) => {
  const response = await api.put(`/submissions/${submissionId}/override`, { verdict, comment }, config);
  return response.data;
};

export const assignMAP = async (circularId: string, mapId: string, assigned_to: string, config?: AxiosRequestConfig) => {
  const response = await api.put(`/circulars/${circularId}/maps/${mapId}/assign`, { assigned_to }, config);
  return response.data;
};

export const rejectMAP = async (circularId: string, mapId: string, reason: string, config?: AxiosRequestConfig) => {
  const response = await api.post(`/circulars/${circularId}/maps/${mapId}/reject`, { reason }, config);
  return response.data;
};

export const getSubmissionsByCircular = async (circularId: string, config?: AxiosRequestConfig) => {
  const response = await api.get(`/submissions/circular/${circularId}`, config);
  return response.data;
};

export default api;
