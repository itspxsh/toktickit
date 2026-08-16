# Lab 1 — Peer Review Record

**Author:** Pawarisa Thongchua — 67070501032 — GitHub: @itspxsh
**Peer reviewer:** Peeranat Ngamkiatkajorn — 67070503429 — GitHub: @jarbbie

## Pull Requests I authored (reviewed by my partner)
| PR | Branch | Reviewer verdict |
|----|--------|------------------|
| [#6](https://github.com/itspxsh/toktickit/pull/6) | feature/1-project-foundation | Approved |
| [#7](https://github.com/itspxsh/toktickit/pull/7) | feature/2-health-check | Approved |
| [#8](https://github.com/itspxsh/toktickit/pull/8) | feature/3-category-seed | Approved |
| [#9](https://github.com/itspxsh/toktickit/pull/9) | feature/4-category-list | Approved |

### Reviewer comments I received & responses:
* **Issue 1: Project Foundation**
  - **Comment:** "Frontend starts successfully Bootstrap is installed and visible Backend starts successfully Vitest and Supertest are presents `.gitignore` and `.env.example` are presents README.md is presents LGTM, Approved >:D."
  - **Response:** "Thank you for the thorough review and for testing out the UI! Appreciate it."
* **Issue 2: API Health Check**
  - **Comment:** "HTTP GET request returns expected results React page displayed status on API call finely A useful error message appears when the backend is unavailable Good job, well done! \ ༼ ◕*◕ ༽ /"
  - **Response:** "Thanks for verifying all the states, especially the error handling! I really appreciate the detailed screenshots. ༼ つ ◕*◕ ༽つ"
* **Issue 3: Create and Seed Categories**
  - **Comment:** "Category model contains id, unique name, and createdAt. A migration creates category table. The seed generation is idempotent. Credentials are safe! Approved, could continue! :D"
  - **Response:** "Thanks for double-checking the idempotent seed and the schema setup! Glad the database part is all good to go. On to the final issue! :D"
* **Issue 4: Display Category List**
  - **Comment:** "GET /api/categories could retrieves categories in a predictable order Supertest & Vitest all passed Loading states are verified. Error and Success states are shown. LGTM, Approved!"
  - **Response:** "Thank you for the amazing reviews across all the PRs! I'm glad the final UI and tests are looking great. Ready for the main release!"

---

## Pull Requests I reviewed for my partner
* **Issue 1: Project Foundation**
  - **My comment:** "Everything looks solid! I checked the scaffolding, and both the React frontend and Node backend are set up correctly. Vitest/Supertest configurations are present, and no secrets or node_modules are committed. LGTM! Approved."
  - **Partner response:** "Thank you very much!"
* **Issue 2: API Health Check**
  - **My comment:** "Great job on implementing the health check! I've reviewed the changes across the files and everything aligns perfectly with the criteria. The GET /api/health endpoint returns the correct 200 OK status with the exact JSON payload. The Supertest implementation looks solid. I also see that the React UI correctly handles the API data and has the proper offline error message configured. LGTM! Approved. :D"
  - **Partner response:** "Thank you for your review, I'll start to continue the work >:D"
* **Issue 3: Create and Seed Categories**
  - **My comment:** "I've reviewed the Prisma schema and the migration files. The Category model is set up perfectly with the correct fields, and the seed script successfully inserts the four required categories in an idempotent way. I also verified that no database credentials were leaked. Thanks for including the test logs. LGTM, Approved!"
  - **Partner response:** "Such grateful for testing and reviewing for me, thank you very much krubb ^.^"
* **Issue 4: Display Category List**
  - **My comment:** "Awesome work on the final issue! I verified that the GET /api/categories endpoint pulls data correctly from PostgreSQL and the React UI dynamically renders everything with perfect loading and error states. All the Vitest outputs are looking green and clean. Thanks for being a great peer reviewer for Lab 1! LGTM, Approved! ✨"
  - **Partner response:** "Yay!! (ง🔥⏏🔥)ง Thank you for the review kub!"