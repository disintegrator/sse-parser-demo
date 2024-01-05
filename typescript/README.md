# SSE parsing demo

This is a demo for a server-sent events stream processor in TypeScript that uses
the Web Streams API and Zod. It turns a `text/event-stream` response into a
stream of validated and typed objects representing events.

To run this demo you will need a [llamafile][llamafile] server running. After
that run:

```
npm i
npm start
```

[llamafile]: https://github.com/Mozilla-Ocho/llamafile
