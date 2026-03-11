# Time Crunch — Setup Guide

## Prerequisites
- Node.js 18+
- A PostgreSQL database (free options: [Neon](https://neon.tech), [Supabase](https://supabase.com), or local)

## 1. Configure the server

```bash
cd server
cp .env.example .env
```

Edit `.env` and set:
- `DATABASE_URL` — your PostgreSQL connection string
- `JWT_SECRET` — any long random string (e.g. run `openssl rand -hex 32`)

## 2. Run the database schema

Connect to your PostgreSQL database and run:

```bash
psql $DATABASE_URL -f schema.sql
```

Or paste the contents of `server/schema.sql` into your database's SQL editor (Neon/Supabase both have one).

## 3. Create your first admin user

With your server dependencies installed and `.env` set, you can create users via the API:

```bash
# Install deps
cd server && npm install

# Start server
npm run dev

# In another terminal — create an admin:
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"yourpassword","full_name":"Your Name","role":"admin"}'

# Create a worker:
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"worker1","password":"workerpass","full_name":"Worker One","role":"worker"}'
```

## 4. Add some projects

```bash
# First login to get a token
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"yourpassword"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# Add a project
curl -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Project Alpha"}'
```

## 5. Start the client

```bash
cd client && npm install && npm run dev
```

Open http://localhost:5173

## Deployment (Render.com recommended)

1. Push this repo to GitHub
2. Create a Render account
3. Create a **Web Service** for the server (Node, build: `npm install`, start: `npm start`)
4. Create a **Static Site** for the client (build: `npm install && npm run build`, publish: `dist`)
5. Add environment variables in Render's dashboard
6. Update `client/vite.config.js` proxy OR set `VITE_API_URL` env var pointing to your deployed server URL
