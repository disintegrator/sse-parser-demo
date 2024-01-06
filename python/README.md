# SSE parsing demo

This is a demo for a server-sent events stream processor in Python. It turns a
`text/event-stream` response into a stream of objects representing server
events.

To run this demo you will need:

- a [llamafile](https://github.com/Mozilla-Ocho/llamafile) server running
- [poetry](https://python-poetry.org/)

After that run:

```
poetry install
poetry run sse-demo
```
