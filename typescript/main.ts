import { body } from "./request.js";
import { ServerEventsDecoderStream, ZodDecoderStream } from "./streaming.js";
import { Writable } from "node:stream";
import * as z from "zod";

const schema = z
  .object({
    data: z
      .string()
      .default("{}")
      .transform((v) => JSON.parse(v)),
  })
  .transform((v) => v.data?.content)
  .pipe(z.string().default(""));

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

await res.body
  .pipeThrough(/*   💅    */ new ServerEventsDecoderStream())
  .pipeThrough(new ZodDecoderStream(schema))
  .pipeTo(Writable.toWeb(process.stdout));

/*
The above code is sugar for:

await res.body
  .pipeThrough(new LineDecoderStream())
  .pipeThrough(new EventDecoderStream())
  .pipeThrough(new ZodDecoderStream(schema))
  .pipeTo(Writable.toWeb(process.stdout));
*/
