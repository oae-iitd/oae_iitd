import httpClient from '../api/http';
import { API_ENDPOINTS } from '../api/endpoints';

export interface RideLocation {
  _id: string;
  fromLocation: string;
  toLocation: string;
  fare: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRideLocationDto {
  fromLocation: string;
  toLocation: string;
  fare?: number;
}

export interface UpdateRideLocationDto {
  fromLocation?: string;
  toLocation?: string;
  fare?: number;
}

export interface GetRidesParams {
  search?: string;
}

class RidesService {
  async getRides(params?: GetRidesParams): Promise<RideLocation[]> {
    const response = await httpClient.get<RideLocation[]>(API_ENDPOINTS.RIDES.BASE, {
      params: { ...params, _t: Date.now() },
    });
    return response.data;
  }

  async getRideById(id: string): Promise<RideLocation> {
    const response = await httpClient.get<RideLocation>(API_ENDPOINTS.RIDES.BY_ID(id));
    return response.data;
  }

  async createRide(data: CreateRideLocationDto): Promise<RideLocation> {
    const response = await httpClient.post<RideLocation>(API_ENDPOINTS.RIDES.BASE, data);
    return response.data;
  }

  async updateRide(id: string, data: UpdateRideLocationDto): Promise<RideLocation> {
    const response = await httpClient.put<RideLocation>(
      API_ENDPOINTS.RIDES.BY_ID(id),
      data
    );
    return response.data;
  }

  async deleteRide(id: string): Promise<void> {
    await httpClient.delete(API_ENDPOINTS.RIDES.BY_ID(id));
  }
}

export const ridesService = new RidesService();
