# Rork.ai Mobile App Prompt: GYMBET

## Concept
A social fitness competition app where users join leagues, stake credits, and compete for prize pools. The core loop is built on social pressure, habit streaks, and verified gym check-ins.

## Tech Requirements
- Use React Native / Expo.
- Use a state management solution for credits and league data.
- Integrate GPS/Location services for workout verification.

## Core Screens

### 1. Dashboard (Home)
- Header showing user's name and "Credit Balance" (e.g., 500 pts).
- "Log Workout" and "Join League" quick action buttons.
- "Your Active Leagues" section with cards showing league name, prize pool, and "View Leaderboard" link.
- "Recent Activity" feed showing recent gym check-ins and social updates.
- "Stats" card showing current streak (e.g., 🔥 5 Days) and global rank.

### 2. League Discovery
- A list of available public leagues.
- Cards showing: Stake amount, Prize Pool, Member count, and Challenge Type (Consistency, Strength, or Metrics).
- "Join" button that checks if the user has enough credits, deducts the stake, and adds them to the league.

### 3. League Creation
- A form to create a new league.
- Inputs: League Name, Description, Stake Amount (Points), and Challenge Type.
- **Gym Location Picker**: Allow the user to name a "Home Gym" and set its Latitude/Longitude (or search for a location).

### 4. League Detail & Leaderboard
- A high-energy screen with the League Name in bold uppercase.
- **Leaderboard Table**: Shows Rank, Username, and Points/Workouts logged.
- **Trash Talk Wall**: A real-time chat feed where participants can send messages to each other.

### 5. Workout Logging (GPS Check-in)
- Select an active league.
- **Verify Button**: Triggers a GPS check.
- **Verification Logic**: Compare current user location with the league's "Home Gym" coordinates. If within 200 meters, allow logging. If not, show an "Out of Range" error.
- Simple text input for "Workout Notes".
- "Complete Workout" button to update the leaderboard and user history.

## Visual Style
- **Theme**: Dark mode preferred or high-contrast Light mode.
- **Colors**: Vibrant Orange (#EA580C) and Red (#DC2626) for actions/points. Zinc/Gray for backgrounds.
- **Typography**: Bold, athletic, "gym-culture" aesthetic.

## Technical Logic to Implement
- **Staking**: Deduct stake amount from `user.credits` when joining. Calculate `prizePool` as `(participants * stake) * 0.9` (10% app take rate).
- **GPS Verification**: Use the Haversine formula to calculate the distance between the user and the gym.
- **Persistence**: Use local storage or a mock backend for state persistence between sessions.
