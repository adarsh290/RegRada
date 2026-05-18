import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5000/api",
});

export const getCirculars = async () => {
  const response = await api.get("/circulars");
  return response.data;
};

export const ingestCircular = async (data: { title: string; source: string; raw_text: string }) => {
  const response = await api.post("/circulars", data);
  return response.data;
};

export default api;
