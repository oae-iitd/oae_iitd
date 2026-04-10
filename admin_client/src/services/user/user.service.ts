import httpClient from '../api/http';
import { API_ENDPOINTS } from '../api/endpoints';

export interface User {
  _id: string;
  email: string;
  username: string;
  role: string;
  status: string;
  phone?: string;
  name?: string;
  isPhoneVerified?: boolean;
  studentId?: string;
  enrollmentNumber?: string;
  programme?: string;
  course?: string;
  year?: string;
  expiryDate?: string;
  hostel?: string;
  profilePicture?: string;
  disabilityType?: string;
  disabilityPercentage?: number;
  udidNumber?: string;
  disabilityCertificate?: string;
  idProofType?: 'aadhaar' | 'voter' | 'pan' | 'driverLicense' | 'passport';
  idProofDocument?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateUserDto {
  email?: string;
  username?: string;
  password?: string;
  status?: string;
  role: string;
  name?: string;
  phone?: string;
  enrollmentNumber?: string;
  programme?: string;
  year?: string;
  course?: string;
  expiryDate?: string;
  hostel?: string;
  profilePicture?: string;
  disabilityType?: string;
  disabilityPercentage?: number;
  udidNumber?: string;
  disabilityCertificate?: string;
  idProofType?: 'aadhaar' | 'pan' | 'voter' | 'driverLicense' | 'passport';
  idProofDocument?: string;
}

export interface UpdateUserDto {
  email?: string;
  username?: string;
  password?: string;
  role?: string;
  status?: string;
  name?: string;
  phone?: string;
  enrollmentNumber?: string;
  programme?: string;
  year?: string;
  course?: string;
  expiryDate?: string;
  hostel?: string;
  profilePicture?: string;
  disabilityType?: string;
  disabilityPercentage?: number;
  udidNumber?: string;
  disabilityCertificate?: string;
  idProofType?: 'aadhaar' | 'pan' | 'voter' | 'driverLicense' | 'passport';
  idProofDocument?: string;
}

export interface GetUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
}

export interface PaginatedUsersResponse {
  users: User[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function unwrapUserPayload(data: unknown): User {
  if (data && typeof data === 'object' && 'user' in data) {
    const wrapped = data as { user?: User };
    if (wrapped.user && typeof wrapped.user === 'object') {
      return wrapped.user;
    }
  }
  return data as User;
}

class UserService {
  async getUsers(params?: GetUsersParams): Promise<User[]> {
    const response = await httpClient.get<PaginatedUsersResponse | User[]>(
      API_ENDPOINTS.USERS.BASE,
      { params }
    );
    if (Array.isArray(response.data)) return response.data;
    if (response.data && typeof response.data === 'object' && 'users' in response.data) {
      return (response.data as PaginatedUsersResponse).users || [];
    }
    return [];
  }

  async getUserById(id: string): Promise<User> {
    const response = await httpClient.get<unknown>(API_ENDPOINTS.USERS.BY_ID(id));
    return unwrapUserPayload(response.data);
  }

  async createUser(data: CreateUserDto): Promise<User> {
    const response = await httpClient.post<unknown>(API_ENDPOINTS.USERS.BASE, data);
    return unwrapUserPayload(response.data);
  }

  async updateUser(id: string, data: UpdateUserDto): Promise<User> {
    const response = await httpClient.put<unknown>(
      API_ENDPOINTS.USERS.BY_ID(id),
      data
    );
    return unwrapUserPayload(response.data);
  }

  async deleteUser(id: string): Promise<void> {
    await httpClient.delete(API_ENDPOINTS.USERS.BY_ID(id));
  }
}

export const userService = new UserService();
