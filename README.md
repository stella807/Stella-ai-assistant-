# GYMBET 🏋️‍♂️💰

Gym Bet is a social fitness platform where users form leagues, stake points/credits, and compete for prize pools through verified gym workouts.

## 🚀 Getting Started

### Prerequisites

- Node.js 18.x or later
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

### Development

Run the development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🚢 Deployment

### Vercel (Recommended)

Next.js projects are best deployed on [Vercel](https://vercel.com).

1. Push your code to a GitHub/GitLab/Bitbucket repository.
2. Import the project into Vercel.
3. Vercel will automatically detect Next.js and handle the build and deployment.

### Manual Production Build

If you want to run the production build locally or on your own server:

1. Build the application:
   ```bash
   npm run build
   ```
2. Start the production server:
   ```bash
   npm start
   ```

### Docker

You can also containerize the application:

1. Create a `Dockerfile` in the root (standard Next.js Dockerfile).
2. Build and run:
   ```bash
   docker build -t gymbet .
   docker run -p 3000:3000 gymbet
   ```

## 🛠 Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS 4
- **Language**: TypeScript
- **State Management**: React Context
- **Testing**: Jest & Playwright

## 🧪 Testing

Run unit tests for staking and GPS logic:
```bash
npx jest
```

## 🔐 Key Features

- **Leagues**: Create or join leagues with custom stakes and rules.
- **Staking**: Points are deducted upon joining and pooled for the winner.
- **GPS Verification**: Workouts must be verified using the browser's Geolocation API within 200m of the league's "Home Gym".
- **Trash Talk**: Interactive social feed for league participants.
- **Leaderboards**: Dynamic ranking based on workout consistency.
