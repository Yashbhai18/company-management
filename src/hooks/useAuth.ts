import React from 'react';
import api, { setAccessToken } from '../lib/api';

interface AuthState {
  user: any | null;
  isLoading: boolean;
}

export const useAuth = () => {
  const [state, setState] = React.useState<AuthState>({ user: null, isLoading: false });

  const login = async (identifier: string, password: string, rememberMe = false, targetRole?: 'organization' | 'employee', orgSlug?: string) => {
    setState((s) => ({ ...s, isLoading: true }));
    try {
      const res = await api.post('/auth/login', { identifier, password, rememberMe, targetRole, orgSlug });
      if (res.data.requires2fa || res.data.requiresPasswordReset) {
        setState((s) => ({ ...s, isLoading: false }));
        return res.data;
      }
      const { accessToken, user } = res.data;
      setAccessToken(accessToken);
      setState({ user, isLoading: false });
      return user;
    } catch (err) {
      setState((s) => ({ ...s, isLoading: false }));
      throw err;
    }
  };

  const logout = async () => {
    await api.post('/auth/logout');
    setAccessToken(null);
    setState({ user: null, isLoading: false });
  };

  const whoami = async () => {
    try {
      const res = await api.get('/auth/me');
      setState((s) => ({ ...s, user: res.data.user }));
      return res.data.user;
    } catch {
      setAccessToken(null);
      setState({ user: null, isLoading: false });
      return null;
    }
  };

  return { ...state, login, logout, whoami };
};

export default useAuth;
