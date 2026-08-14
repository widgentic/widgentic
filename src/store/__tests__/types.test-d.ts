import { describe, it, expectTypeOf } from "vitest";
import type {
  CreatedKey,
  StoredKey,
  WidgetStore,
  WritableWidgetStore
} from "../index.js";

describe("store types", () => {
  it("a read-only handle exposes no write methods", () => {
    // Holding the narrow port type is itself the guarantee: the write
    // half simply does not exist on it.
    expectTypeOf<WidgetStore>().not.toHaveProperty("putWidget");
    expectTypeOf<WidgetStore>().not.toHaveProperty("putTheme");
    expectTypeOf<WidgetStore>().not.toHaveProperty("removeWidget");
    expectTypeOf<WidgetStore>().not.toHaveProperty("removeTheme");
    expectTypeOf<WidgetStore>().not.toHaveProperty("ensurePrincipal");
    expectTypeOf<WidgetStore>().not.toHaveProperty("createKey");
    expectTypeOf<WidgetStore>().not.toHaveProperty("revokeKey");
  });

  it("the writable port narrows to the read-only one, not the reverse", () => {
    expectTypeOf<WritableWidgetStore>().toMatchTypeOf<WidgetStore>();
    expectTypeOf<WidgetStore>().not.toMatchTypeOf<WritableWidgetStore>();
  });

  it("stored key metadata carries no raw key field", () => {
    expectTypeOf<StoredKey>().not.toHaveProperty("key");
    expectTypeOf<StoredKey>().not.toHaveProperty("digest");
    expectTypeOf<CreatedKey>().toHaveProperty("key");
  });
});
