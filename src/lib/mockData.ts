import { User, League, TrashTalk, Workout } from '../types';

export const currentUser: User = {
  id: 'u1',
  name: 'Alex "The Beast"',
  credits: 500,
};

export const mockUsers: User[] = [
  currentUser,
  { id: 'u2', name: 'Jordan Shreds', credits: 1200 },
  { id: 'u3', name: 'Casey Gains', credits: 300 },
];

export const mockLeagues: League[] = [
  {
    id: 'l1',
    name: 'Summer Shred 2024',
    description: 'Consistency challenge. Check in at least 4 times a week.',
    stake: 50,
    prizePool: 500,
    participants: ['u1', 'u2', 'u3'],
    startDate: '2024-05-01',
    endDate: '2024-06-01',
    homeGym: {
      name: 'Iron Paradise',
      lat: 34.0522,
      lng: -118.2437,
    },
    type: 'consistency',
  },
  {
    id: 'l2',
    name: 'Heavy Hitters PR League',
    description: 'Strength challenge for Bench, Squat, and Deadlift.',
    stake: 100,
    prizePool: 1000,
    participants: ['u2', 'u3'],
    startDate: '2024-05-15',
    endDate: '2024-07-15',
    homeGym: {
      name: 'Gold\'s Gym',
      lat: 33.9912,
      lng: -118.4716,
    },
    type: 'strength',
  },
];

export const mockTrashTalk: TrashTalk[] = [
  {
    id: 't1',
    userId: 'u2',
    leagueId: 'l1',
    message: 'Who else is hitting the gym today? I don\'t see any movement on the leaderboard!',
    timestamp: '2024-05-08T09:00:00Z',
  },
  {
    id: 't2',
    userId: 'u3',
    leagueId: 'l1',
    message: 'Just finished my leg day. Good luck catching up!',
    timestamp: '2024-05-08T10:30:00Z',
  },
];

export const mockWorkouts: Workout[] = [
  {
    id: 'w1',
    userId: 'u1',
    leagueId: 'l1',
    timestamp: '2024-05-07T18:00:00Z',
    location: { lat: 34.0523, lng: -118.2438 },
    verified: true,
    notes: 'Push day was intense.',
  },
];
