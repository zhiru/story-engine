import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, seedUser } from "../test/db.js";
import { createUniverse, listVisibleUniverses } from "./universes.js";

beforeEach(async () => {
  await resetDb();
});

describe("autorização de universos", () => {
  it("estranho NÃO vê universo privado de outro usuário", async () => {
    const a = await seedUser({ email: "a@x.com" });
    const b = await seedUser({ email: "b@x.com" });
    await createUniverse(
      { id: a.id, role: "USER" },
      { title: "U-A", description: "d" },
    ); // privado por padrão
    const seenByB = await listVisibleUniverses({ id: b.id, role: "USER" });
    expect(seenByB.find((u) => u.title === "U-A")).toBeUndefined();
  });

  it("dono vê o próprio; admin vê tudo", async () => {
    const a = await seedUser({ email: "a@x.com" });
    const adm = await seedUser({ email: "adm@x.com", role: "ADMIN" });
    await createUniverse(
      { id: a.id, role: "USER" },
      { title: "U-A", description: "d" },
    );
    expect(
      (await listVisibleUniverses({ id: a.id, role: "USER" })).length,
    ).toBe(1);
    expect(
      (await listVisibleUniverses({ id: adm.id, role: "ADMIN" })).length,
    ).toBe(1);
  });
});
