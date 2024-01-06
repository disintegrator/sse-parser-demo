import { body } from "./request.js";
import { consumeStream } from "./streaming.js";
import * as z from "zod";

const schema = z
  .object({
    content: z.string().default(""),
  })
  .transform((v) => v.content);

const res = await fetch("http://localhost:8080/completion", {
  headers: {
    accept: "text/event-stream",
    "cache-control": "no-cache",
    "content-type": "application/json",
  },
  body,
  method: "POST",
  mode: "cors",
  credentials: "omit",
});

if (res.body == null) {
  throw new TypeError("No response body found");
}

const parseMessage = (data: string) => schema.parse(JSON.parse(data));

for await (const event of consumeStream(res.body, parseMessage)) {
  if (!event.data) {
    continue;
  }
  process.stdout.write(event.data);
}
