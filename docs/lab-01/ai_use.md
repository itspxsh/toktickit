# Lab 1 — AI Use and Reflection

**LLM/agent used:** Antigravity (Gemini 3.5 Flash)

## Selected key prompts (6–10)
| # | Prompt (summarised) | What I did with the result |
|---|---------------------|----------------------------|
| 1 | Requested analysis of the course PDFs to outline the lab objectives, recommended token-efficient model setup, and a task-delegation plan. | Reviewed the analysis to understand the lab constraints, branch model, and target requirements before starting development. |
| 2 | Instructed the agent to reset the git commit, exclude `node_modules/` via `.gitignore`, and force-push the cleaned project structure. | Executed git commands to perform a mixed reset, created a root `.gitignore`, re-committed the files without `node_modules/`, and pushed it to the repository. |
| 3 | Requested step-by-step code to add the `/api/health` API endpoint on the backend, verify it via Supertest, and connect the React frontend to fetch and display the status. | Implemented the health route on the Express server, updated the frontend API module, and configured loading and error indicators in `App.tsx`. |
| 4 | Requested instructions to define the Prisma database schema for categories, run migrations, create an idempotent seed script using upsert, and avoid hardcoding database secrets. | Defined the `Category` model, created the PostgreSQL database, ran Prisma migrations/client generation, and wrote the idempotent seeding script. |
| 5 | Requested the implementation of the `/api/categories` Express endpoint, its Supertest suite, integration with the React client, and Vitest assertions to check UI states. | Created the category list route, implemented the frontend fetch integration, updated the rendering logic, and wrote Vitest assertions for successful/failed API checks. |
| 6 | Requested the creation of a new Git branch named `feature/Lab1Doc` for documenting the lab submission. | Executed the git checkout command to create and switch to the new documentation branch. |
| 7 | Asked for an overview of the purpose of the markdown files in `docs/lab-01/` and the details required to fill them out. | Used the breakdown to gather necessary information, test results, and prompts to populate the documentation. |
| 8 | Instructed the agent to run backend and frontend test suites, mark tests as passed in the `tests.md` summary table, and append the actual terminal logs to the document. | Ran `vitest run` on both the client and server projects, confirmed all tests passed, and updated the `tests.md` file with the results. |
| 9 | Requested the generation of a comprehensive `README.md` file detailing the project architecture, dependencies, installation steps, database migrations, and testing commands. | Generated the markdown and overwrote the root `README.md` file with detailed instructions for other developers. |

## Reflection
Adding step-by-step constraints and specific acceptance criteria to each prompt significantly improved the precision of the generated code and minimized back-and-forth edits. However, I had to actively correct the workflow when `node_modules/` was accidentally committed and pushed, requiring a git reset and gitignore cleanup prompt to resolve the issue. This experience highlighted the importance of combining detailed prompts with manual safety checkpoints to prevent tracking environment folders.
