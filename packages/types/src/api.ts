// API types and interfaces
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AuthRequest {
  chatId: string;
  userId: string;
  authData: Record<string, any>;
}

export interface AuthResponse {
  token: string;
  expiresAt: string;
  user: {
    id: string;
    username?: string;
    firstName?: string;
    lastName?: string;
  };
}
