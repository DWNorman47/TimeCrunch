import { useAuth } from '../contexts/AuthContext';
import { getT } from '../i18n';

export function useT() {
  const { user } = useAuth();
  return getT(user?.language);
}
