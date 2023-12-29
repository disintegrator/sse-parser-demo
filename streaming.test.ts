import { test } from "vitest";
import { ServerEventsDecoderStream } from "./streaming.js";

test("server-sent events", async () => {
  // A mock response that produces server-sent events
  const res = new Response(
    new ReadableStream<string>({
      async start(controller) {
        controller.enqueue("retry: 10000\n\n"); // message boundary
        controller.enqueue("id: 1731\n");
        controller.enqueue("data: line 1\n");
        controller.enqueue("data: line 2\n");
        controller.enqueue("data: line 3\r\n\r\n"); // message boundary
        controller.enqueue("data: line 4\n"); // end of stream without boundary
        controller.close();
      },
    }).pipeThrough(new TextEncoderStream())
  );

  return res.body?.pipeThrough(new ServerEventsDecoderStream()).pipeTo(
    new WritableStream({
      write(ev) {
        console.log("🔔", JSON.stringify(ev));
      },
    })
  );
});
