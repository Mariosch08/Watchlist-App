import { useQuery } from '@tanstack/react-query';
import { useUser } from '../auth/AuthContext.jsx';
import { fetchFriends } from '../lib/api/friends.js';

export const friendKeys = {
  all: (userId) => ['friends', userId],
  recommendations: (userId) => ['friends', userId, 'recommendations'],
  activity: (userId) => ['friends', userId, 'activity'],
  onTitle: (userId, mediaType, tmdbId) => ['friends', userId, 'title', mediaType, String(tmdbId)],
};

// Friends and open requests; `accepted` is what most screens need.
export function useFriends() {
  const user = useUser();
  const query = useQuery({ queryKey: friendKeys.all(user.id), queryFn: fetchFriends, staleTime: 60_000 });
  const list = query.data ?? [];
  return { ...query, accepted: list.filter((f) => f.status === 'accepted'), list };
}
