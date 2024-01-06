import { expect, test } from "vitest";
import { consumeStream } from "./streaming.js";

test("server-sent events", async () => {
  // A mock response that produces server-sent events
  const res = new Response(
    new ReadableStream<string>({
      async start(controller) {
        controller.enqueue("retry: 12000\n\n"); // message boundary
        controller.enqueue("id: 1731\n");
        controller.enqueue("data: line 1\n");
        controller.enqueue("data: line 2\n");
        controller.enqueue(": comment is discarded\n");
        controller.enqueue("data: line 3\r\n\r\n"); // message boundary
        controller.enqueue("event: end\n");
        controller.enqueue("data: line 5"); // end of stream without boundary
        controller.close();
      },
    }).pipeThrough(new TextEncoderStream())
  );

  if (res.body == null) {
    expect.fail("No response body found");
  }

  for await (const event of consumeStream(res.body, (data) => data)) {
    console.log("🔔", JSON.stringify(event));
  }
});
