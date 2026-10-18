import { withRetry } from "./src/assets/loader.js";

let attempts = 0;

const result = await withRetry(async () => {
  attempts++;

  if (attempts < 3) {
    throw new Error("Тимчасова помилка мережі");
  }

  return "OK";
}, {
  attempts: 3,
  baseMs: 10
});

console.log("Результат:", result);
console.log("Спроб:", attempts);
