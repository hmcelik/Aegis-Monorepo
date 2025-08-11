// src/hooks/useAuth.js

import { create } from 'zustand';

export const useAuth = create((set) => ({
  user: null,
  token: null, // Add this line
  isAuthenticated: false,
  isLoading: true,
  login: (userData, token) => { // Update the login function
    set({ user: userData, token: token, isAuthenticated: true, isLoading: false })
  },
  logout: () => set({ user: null, token: null, isAuthenticated: false, isLoading: false }),
}));