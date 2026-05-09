import { calculatePrizePool, stakePoints, isWithinGymRange } from '../logic';
import { User } from '@/types';

describe('Staking Logic', () => {
  test('calculatePrizePool deducts take rate', () => {
    const pool = calculatePrizePool(10, 100, 0.1); // 1000 - 10%
    expect(pool).toBe(900);
  });

  test('stakePoints deducts from user credits', () => {
    const user: User = { id: '1', name: 'Test', credits: 500 };
    const updatedUser = stakePoints(user, 100);
    expect(updatedUser.credits).toBe(400);
  });

  test('stakePoints throws error if insufficient credits', () => {
    const user: User = { id: '1', name: 'Test', credits: 50 };
    expect(() => stakePoints(user, 100)).toThrow('Insufficient credits');
  });
});

describe('GPS Logic', () => {
  test('isWithinGymRange returns true if close', () => {
    // Approx same location
    const gym = { lat: 34.0522, lng: -118.2437 };
    const user = { lat: 34.0523, lng: -118.2438 };
    expect(isWithinGymRange(user.lat, user.lng, gym.lat, gym.lng)).toBe(true);
  });

  test('isWithinGymRange returns false if far', () => {
    const gym = { lat: 34.0522, lng: -118.2437 };
    const user = { lat: 33.0522, lng: -117.2437 }; // Far away
    expect(isWithinGymRange(user.lat, user.lng, gym.lat, gym.lng)).toBe(false);
  });
});
