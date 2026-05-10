export interface User {
  id: string;
  name: string;
  avatar?: string;
  credits: number;
}

export interface League {
  id: string;
  name: string;
  description: string;
  stake: number;
  prizePool: number;
  participants: string[]; // User IDs
  startDate: string;
  endDate: string;
  homeGym: {
    name: string;
    lat: number;
    lng: number;
  };
  type: 'consistency' | 'strength' | 'metrics';
}

export interface Workout {
  id: string;
  userId: string;
  leagueId: string;
  timestamp: string;
  location: {
    lat: number;
    lng: number;
  };
  verified: boolean;
  notes: string;
}

export interface TrashTalk {
  id: string;
  userId: string;
  leagueId: string;
  message: string;
  timestamp: string;
}

export interface LeaderboardEntry {
  userId: string;
  userName: string;
  score: number;
  rank: number;
}
