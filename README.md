# TokTickIT - IT Service Desk

TokTickIT is a professional, full-stack IT Service Desk application designed to streamline the request management lifecycle for organizational IT departments. It allows users to create, track, and manage various service requests categorized across Account and Access, Hardware, Software, and Network categories.

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Bootstrap 5 (for styling)
- **Backend**: Node.js, Express, TypeScript (TSX for execution)
- **Database**: PostgreSQL with Prisma ORM
- **Testing**: Vitest (Unit/Integration) and Supertest (API/HTTP assertions)

---

## Prerequisites

Ensure you have the following installed on your machine:
- **Node.js** (v18.x or higher)
- **npm** (v9.x or higher)
- **PostgreSQL** (v14 or higher)

---

## Project Structure

The project is structured as a monorepo containing separate clientside and serverside packages:

```text
toktickit/
├── client/          # Frontend React application (Vite-powered)
│   ├── src/         # UI components, state logic, and API clients
│   └── tests/       # Vitest components and rendering tests
├── server/          # Backend Express application
│   ├── prisma/      # Database schema definitions and seed scripts
│   ├── src/         # API controllers, models, and routes
│   └── tests/       # API integration tests using Supertest
└── README.md
```

---

## Setup & Installation

Follow these steps to clone and set up the project locally:

1. **Install Frontend Dependencies**:
   ```bash
   cd client
   npm install
   cd ..
   ```

2. **Install Backend Dependencies**:
   ```bash
   cd server
   npm install
   cd ..
   ```

---

## Environment Variables

Configure local environment variables before starting the services:

### Frontend Environment Setup
Copy the example environment file inside `client/` and configure:
```bash
cp client/.env.example client/.env
```
Inside `client/.env`:
```env
VITE_API_URL="http://localhost:3000"
```

### Backend Environment Setup
Copy the example environment file inside `server/` and configure:
```bash
cp server/.env.example server/.env
```
Inside `server/.env`:
```env
DATABASE_URL="postgresql://<username>:<password>@localhost:5432/<db_name>?schema=public"
DATABASE_URL_TEST="postgresql://<username>:<password>@localhost:5432/<db_name>_test?schema=public"
PORT=3000
```
*(Make sure to replace `<username>`, `<password>`, and `<db_name>` with your local PostgreSQL credentials).*

---

## Database Setup

Initialize the database schema and populate it with seed data using Prisma:

1. **Create and Apply Migrations**:
   Run the following command inside the `server` directory to apply the database migrations:
   ```bash
   cd server
   npx prisma migrate deploy
   ```

2. **Seed the Database**:
   Populate the database with idempotent categories, related systems, and development requesters:
   ```bash
   npx prisma db seed
   ```

For integration tests, create a separate PostgreSQL database whose name ends in
`_test`, set `DATABASE_URL_TEST` in the environment, and never point it at the
development database. The reset command refuses URLs that are not explicitly
test-scoped, then truncates only the test schema and reruns the reference seed:

```bash
cd server
DATABASE_URL_TEST="postgresql://<username>:<password>@localhost:5432/<db_name>_test?schema=public" npm run db:test:reset
DATABASE_URL_TEST="postgresql://<username>:<password>@localhost:5432/<db_name>_test?schema=public" npm run test
```

Apply migrations to the test database before resetting it by temporarily using
the same URL as `DATABASE_URL`:

```bash
DATABASE_URL="postgresql://<username>:<password>@localhost:5432/<db_name>_test?schema=public" npx prisma migrate deploy
```

---

## Running the Application

To run both services simultaneously for development, open two terminal windows or tabs:

### 1. Start the Backend API
Navigate to the `server/` directory and spin up the Express API server:
```bash
cd server
npm run dev
```
The server will run at `http://localhost:3000`.

### 2. Start the Frontend React Client
Navigate to the `client/` directory and spin up the Vite development server:
```bash
cd client
npm run dev
```
The application will be available in your browser at `http://localhost:5173`.

---

## Running Tests

Automated tests are divided into frontend UI rendering tests and backend API tests:

### Running Backend API Tests
Runs Supertest API checks against Express endpoints:
```bash
cd server
npm run test
```

### Running Frontend UI Tests
Runs Vitest unit and rendering checks:
```bash
cd client
npm run test
```
