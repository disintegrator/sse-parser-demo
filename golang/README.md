# SSE parsing demo

This is a demo for a server-sent events stream processor in Go. It turns a
`text/event-stream` response into a stream of `ServerEvent` values contain
unmarshalled data that an application can consume.

To run this demo you will need a [llamafile][llamafile] server running. After
that run:

```
go run main.go
```

[llamafile]: https://github.com/Mozilla-Ocho/llamafile
