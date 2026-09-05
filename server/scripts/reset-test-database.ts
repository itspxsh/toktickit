import { resetTestDatabase } from "../tests/helpers/test-database.js";

await resetTestDatabase();
console.log("Test database reset and seeded successfully.");
