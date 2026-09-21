# Frontend Quick Start

Get the Smart Student Commute Companion frontend running in under 5 minutes.

## Prerequisites

- Node.js 18+ and npm 9+
- Git

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create environment file
cp .env.example .env.local

# 3. Start development server
npm run dev
```

Open **http://localhost:5173** in your browser.

## Available Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm run verify   # Verify Day 1 foundation
npm run icons    # Generate PWA icons
```

## Next Steps

- Read [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) for complete documentation
- Check [PWA_SETUP.md](PWA_SETUP.md) for PWA features
- See [src/components/ui/README.md](src/components/ui/README.md) for components

## Troubleshooting

**Port 5173 in use?**
```bash
npm run dev -- --port 3000
```

**Build errors?**
```bash
rm -rf node_modules package-lock.json
npm install
```

**Need help?**
- Check [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md#troubleshooting)
- Review browser console for errors
- Verify .env.local configuration
