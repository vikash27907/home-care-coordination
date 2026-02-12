# Home Care Coordination MVP

Pilot-ready Nurse Home Care Coordination app with manual operations, role-based visibility, and admin-controlled approvals.

## Local Preview (What to run now)

1. Open terminal in project folder:
   `c:\Users\vikas\Desktop\vikash\Home Care\Test02`
2. Install dependencies:
   `npm install`
3. Start server:
   `npm start`
4. Open in browser:
   `http://localhost:3000`

Health check:
- `http://localhost:3000/health`

## Default Admin Login

- Email: `admin@homecare.local`
- Password: `Admin@123`

## Role Access

- Public:
  - `/`
  - `/nurses`
  - `/nurses/:id`
  - `/request-care`
  - `/login`
- Admin:
  - `/admin`
  - `/admin/nurses`
  - `/admin/patients`
  - `/admin/agents`
- Agent:
  - `/agent`
  - `/agent/patients/new`
  - `/agent/nurses/new`
  - `/agent/agents/new`
- Nurse:
  - `/nurse/profile`

## Environment Variables

Copy `.env.example` values to your hosting env settings (or local env):

- `NODE_ENV`
- `PORT`
- `SESSION_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `DATABASE_URL` (required for persistent cloud data on Render free instance)
- `PGSSLMODE` (optional, defaults to SSL mode)

## Publish-Ready Setup Included

- `render.yaml` for Render deployment (free plan compatible)
- `Dockerfile` for container deployment
- Production-safe session cookie settings in `server.js`
- Health endpoint: `/health`

## Deploy on Render + Neon (Zero-Cost Trial Path)

1. Push this project to GitHub.
2. Create a free Postgres project at Neon: `https://neon.tech`.
3. Copy Neon connection string as `DATABASE_URL`.
4. In Render: `New +` -> `Blueprint`.
5. Select your repo (Render reads `render.yaml`).
6. In Render environment variables, set:
   - `ADMIN_PASSWORD`
   - `DATABASE_URL`
7. Deploy and open your generated Render URL.

## Notes

- If `DATABASE_URL` is set, data is stored in Postgres (`app_store` table).
- If `DATABASE_URL` is not set, data is stored in `data/store.json`.
- Nurse/Agent accounts are created by approved agents and require admin approval.
- Patient requests are public and created as `New`.
- Public nurse profiles never expose contact details.
- Patient budget range is optional.
- PWA basics are included via `/manifest.webmanifest` and `/sw.js`.
