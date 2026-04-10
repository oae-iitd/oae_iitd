import httpClient from '../api/http';
import { API_ENDPOINTS } from '../api/endpoints';

export interface RideBill {
  _id: string;
  rideId?: string | null | {
    _id: string;
    fromLocation: string;
    toLocation: string;
    fare: number;
  };
  userId: string | {
    _id: string;
    username: string;
    email: string;
    name: string;
    enrollmentNumber?: string;
  };
  fromLocation: string;
  toLocation: string;
  fare: number;
  status: 'requested' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';
  reason?: string;
  driver?: string | {
    _id: string;
    username: string;
    name: string;
  };
  rideNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateRideBillDto {
  status?: 'requested' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';
  driver?: string;
  reason?: string;
}

export interface GetRideBillsParams {
  userId?: string;
  status?: 'requested' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';
  search?: string;
}

export interface RideBillStatistics {
  totalBills: number;
  totalRevenue: number;
  pendingBills: number;
  activeBills: number;
  completedBills: number;
  cancelledBills: number;
}

class RideBillsService {
  async getRideBills(params?: GetRideBillsParams): Promise<RideBill[]> {
    const response = await httpClient.get<RideBill[]>(API_ENDPOINTS.RIDE_BILLS.BASE, {
      params,
    });
    return response.data;
  }

  async getStatistics(): Promise<RideBillStatistics> {
    const response = await httpClient.get<Partial<RideBillStatistics>>(
      API_ENDPOINTS.RIDE_BILLS.STATISTICS
    );
    const d = response.data ?? {};
    const num = (k: keyof RideBillStatistics): number => {
      const v = d[k];
      return typeof v === 'number' && Number.isFinite(v) ? v : 0;
    };
    return {
      totalBills: num('totalBills'),
      totalRevenue: num('totalRevenue'),
      pendingBills: num('pendingBills'),
      paidBills: num('paidBills'),
      completedBills: num('completedBills'),
      cancelledBills: num('cancelledBills'),
    };
  }

  async getRideBillById(id: string): Promise<RideBill> {
    const response = await httpClient.get<RideBill>(API_ENDPOINTS.RIDE_BILLS.BY_ID(id));
    return response.data;
  }

  async updateRideBill(id: string, data: UpdateRideBillDto): Promise<RideBill> {
    const response = await httpClient.put<RideBill>(
      API_ENDPOINTS.RIDE_BILLS.BY_ID(id),
      data
    );
    return response.data;
  }

  async deleteRideBill(id: string): Promise<void> {
    await httpClient.delete(API_ENDPOINTS.RIDE_BILLS.BY_ID(id));
  }
}

export const rideBillsService = new RideBillsService();
