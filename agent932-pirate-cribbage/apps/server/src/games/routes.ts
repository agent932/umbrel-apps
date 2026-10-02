import type { FastifyInstance } from "fastify";
import { IllegalActionError, CLASSIC_RULES, PIRATE_RULES, type RuleSet } from "@pirate/engine";
import { z } from "zod";
import { parseBody, requireUser } from "../auth/routes.js";
import type { Db } from "../db/client.js";
import { statsFor } from "../stats/stats.js";
import { ClientAction } from "./actions.js";
import {
  GameNotFoundError,
  abandonAiGame,
  actInAiGame,
  activeAiGame,
  createAiGame,
} from "./aiGames.js";

const NewGameBody = z.object({
  level: z.enum(["easy", "medium"]),
  variant: z.enum(["classic", "pirate"]),
  powerCost: z.union([z.literal(0), z.literal(2)]).default(0),
});

/** The client picks from a menu; it never sends arbitrary rules. */
function rulesFor(body: z.infer<typeof NewGameBody>): RuleSet {
  if (body.variant === "classic") return CLASSIC_RULES;
  return { ...PIRATE_RULES, pirate: { ...PIRATE_RULES.pirate!, powerCost: body.powerCost } };
}

export async function gameRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.post("/api/games", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const body = parseBody(NewGameBody, req.body, reply);
    if (!body) return;
    return reply.code(201).send(await createAiGame(db, user.id, body.level, rulesFor(body)));
  });

  app.get("/api/games/active", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    return { game: await activeAiGame(db, user.id) };
  });

  app.post<{ Params: { id: string } }>("/api/games/:id/actions", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const action = parseBody(ClientAction, req.body, reply);
    if (!action) return;
    try {
      return await actInAiGame(db, user.id, req.params.id, action);
    } catch (e) {
      if (e instanceof IllegalActionError) return reply.code(422).send({ error: e.message });
      if (e instanceof GameNotFoundError) return reply.code(404).send({ error: "Game not found" });
      throw e;
    }
  });

  app.post<{ Params: { id: string } }>("/api/games/:id/abandon", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    await abandonAiGame(db, user.id, req.params.id);
    return { ok: true };
  });

  app.get<{ Querystring: { variant?: string } }>("/api/stats", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const variant = z.enum(["all", "classic", "pirate"]).catch("all").parse(req.query.variant);
    return { variant, buckets: await statsFor(db, user.id, variant) };
  });
}
