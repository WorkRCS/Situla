# Situla

Situla is a movie metadata catalog with a password-protected admin dashboard.

## Status

Initial backend scaffold is being established. The backend uses Node.js, Express, MongoDB Atlas, and TMDB metadata. Movie discovery/import is manual and requires admin approval.

## Local setup

1. Copy `.env.example` to `.env` and fill in your own values.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open `http://localhost:3000`.

Never commit `.env` or production secrets.
