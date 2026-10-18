import { withRetry } from "./src/assets/loader.js";

let attempts = 0;

try {
  await withRetry(async () => {
    attempts++;

    const error = new Error("HTTP 404");
    error.status = 404;
    throw error;
  }, {
    attempts: 3,
    baseMs: 10
  });
} catch (error) {
  console.log("Помилка:", error.message);
  console.log("Спроб:", attempts);
}
