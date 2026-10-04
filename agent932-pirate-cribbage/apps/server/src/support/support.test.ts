import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Email } from "../email/mailer.js";
import { signUp, testApp } from "../test/testApp.js";
import { LONG } from "../test/wsClient.js";

let t: Awaited<ReturnType<typeof testApp>>;
let sent: Email[];
beforeEach(async () => {
  sent = [];
  t = await testApp(undefined, LONG, undefined, undefined, async (_config, email) => {
    sent.push(email);
  });
});
afterEach(async () => t.close());

const message = {
  name: "Anne Bonny",
  email: "anne@example.test",
  topic: "bug",
  message: "The pegs stopped hopping after a rematch.",
};
const post = (payload: object, cookie?: string) =>
  t.app.inject({
    method: "POST",
    url: "/api/support",
    headers: cookie ? { cookie } : {},
    payload,
  });

describe("support page", () => {
  it("takes a message without an account and shows it to admins only", async () => {
    const captain = await signUp(t.app, "Captain");
    const crew = await signUp(t.app, "Crew");
    expect((await post(message)).statusCode).toBe(200);

    const forbidden = await t.app.inject({
      url: "/api/admin/support",
      headers: { cookie: crew.cookie },
    });
    expect(forbidden.statusCode).toBe(403);
    const inbox = await t.app.inject({
      url: "/api/admin/support",
      headers: { cookie: captain.cookie },
    });
    expect(inbox.json().messages).toMatchObject([{ ...message, username: null }]);

    const id = inbox.json().messages[0].id as string;
    await t.app.inject({
      method: "DELETE",
      url: `/api/admin/support/${id}`,
      headers: { cookie: captain.cookie },
    });
    const after = await t.app.inject({
      url: "/api/admin/support",
      headers: { cookie: captain.cookie },
    });
    expect(after.json().messages).toEqual([]);
  });

  it("checks the fields, and quietly drops bot submissions", async () => {
    const captain = await signUp(t.app, "Captain");
    expect((await post({ ...message, email: "nope" })).statusCode).toBe(400);
    expect((await post({ ...message, message: "hi" })).statusCode).toBe(400);
    expect((await post({ ...message, website: "http://spam.example" })).statusCode).toBe(200);
    const inbox = await t.app.inject({
      url: "/api/admin/support",
      headers: { cookie: captain.cookie },
    });
    expect(inbox.json().messages).toEqual([]);
  });

  it("emails the admins once email is set up, with replies going to the sender", async () => {
    const captain = await signUp(t.app, "Captain");
    await t.app.inject({
      method: "PUT",
      url: "/api/admin/email",
      headers: { cookie: captain.cookie },
      payload: {
        apiKey: "re_test_0123456789abcd",
        from: "Deckhand Games <crew@deckhand.games>",
        siteUrl: "https://deckhand.games",
      },
    });
    const crew = await signUp(t.app, "Crew");
    await post(message, crew.cookie);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "captain@example.test", replyTo: "anne@example.test" });
    expect(sent[0]!.subject).toContain("Something's broken");
    expect(sent[0]!.text).toContain("signed in as Crew");
  });
});
