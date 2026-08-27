// @vitest-environment node
import { describeStoreContract } from "./contract.js";
import { createMemoryStore } from "../memory.js";
import { DEFAULT_LIMITS } from "../types.js";
import { createLocalCipher, generateLocalKek } from "../../secrets/index.js";

const LIMITS = { ...DEFAULT_LIMITS, maxWidgets: 5 };

describeStoreContract("memory", async () => ({
  store: createMemoryStore([], LIMITS, { cipher: createLocalCipher(generateLocalKek()) }),
  maxWidgets: LIMITS.maxWidgets
}));
