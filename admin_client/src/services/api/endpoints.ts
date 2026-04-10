export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/auth/login',
    LOGOUT: '/api/auth/logout',
    ME: '/api/me',
    SEND_OTP: '/api/auth/send-otp',
    VERIFY_OTP: '/api/auth/verify-otp',
    SESSIONS: '/api/sessions',
    SESSION_BY_ID: (id: string) => `/api/sessions/${encodeURIComponent(id)}`,
    LOGIN_HISTORY: '/api/login-history',
  },
  PREFERENCES: '/api/preferences',
  USERS: {
    BASE: '/api/users',
    BY_ID: (id: string) => `/api/users/${id}`,
  },
  REGISTRATIONS: {
    STUDENTS: '/api/registrations/students',
    STUDENT_REVIEW: (id: string | number) => `/api/registrations/students/${id}/review`,
  },
  DRIVERS: {
    BASE: '/api/drivers',
  },
  RIDES: {
    BASE: '/api/ride-locations',
    BY_ID: (id: string) => `/api/ride-locations/${id}`,
  },
  RIDE_BILLS: {
    BASE: '/api/ride-bills',
    STATISTICS: '/api/ride-bills/stats',
    BY_ID: (id: string) => `/api/ride-bills/${id}`,
  },
  FILES: {
    UPLOAD: '/api/upload',
    DELETE: (id: string) => `/api/files/${id}`,
  },
} as const;
