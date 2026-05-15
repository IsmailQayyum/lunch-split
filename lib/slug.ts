import { customAlphabet } from "nanoid";

// 8-char URL-safe slug, ~218 trillion combos — plenty for a small team
const alphabet = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
export const newSlug = customAlphabet(alphabet, 8);
