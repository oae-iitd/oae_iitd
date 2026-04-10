import httpClient from '../api/http';
import { API_ENDPOINTS } from '../api/endpoints';

export interface UploadFileResponse {
  id: string;
  url: string;
  filename: string;
  originalName: string;
  size: number;
  mimetype: string;
}

class FilesService {
  async uploadFile(
    file: File,
    category: 'profile' | 'document' | 'certificate' | 'idproof'
  ): Promise<UploadFileResponse> {
    const formData = new FormData();
    formData.append('file', file);
    const url = `${API_ENDPOINTS.FILES.UPLOAD}?category=${category}`;
    const response = await httpClient.post<UploadFileResponse>(url, formData);
    return response.data;
  }

  async deleteFile(id: string): Promise<void> {
    await httpClient.delete(API_ENDPOINTS.FILES.DELETE(id));
  }

  getFileUrl(
    filename: string,
    category: 'profiles' | 'documents' | 'certificates' | 'idproofs'
  ): string {
    if (filename.startsWith('http://') || filename.startsWith('https://')) {
      return filename;
    }
    const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
    if (!baseUrl) {
      return `/files/${category}/${filename}`;
    }
    return `${baseUrl}/files/${category}/${filename}`;
  }
}

export const filesService = new FilesService();
