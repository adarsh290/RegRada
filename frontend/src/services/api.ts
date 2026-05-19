import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5000/api",
});

export const getCirculars = async () => {
  const response = await api.get("/circulars");
  return response.data;
};

export const getCircularById = async (id: string) => {
  const response = await api.get(`/circulars/${id}`);
  return response.data;
};

export const ingestCircular = async (data: { title: string; source: string; raw_text: string }) => {
  const response = await api.post("/circulars", data);
  return response.data;
};

export const ingestCircularPDF = async (formData: FormData) => {
  const response = await api.post("/circulars/upload-pdf", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

export const submitProof = async (formData: FormData) => {
  const response = await api.post("/submissions", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

export const getSubmissions = async (department?: string) => {
  const params = department ? { department } : {};
  const response = await api.get("/submissions", { params });
  return response.data;
};

export const getOverdueMAPs = async () => {
  const response = await api.get("/circulars/overdue");
  return response.data;
};

export default api;
