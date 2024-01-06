import re
from typing import Callable, Generic, Iterator, TypeVar

T = TypeVar("T")


class ServerEvent(Generic[T]):
    id: str | None = None
    name: str | None = None
    data: T | None = None
    retry: int | None = None


MESSAGE_BOUNDARIES = [
    b"\r\n\r\n",
    b"\n\n",
    b"\r\r",
]


def decode_raw(b: bytes):
    return b.decode()


def stream_events(stream: Iterator[bytes], decoder: Callable[[str], T] = decode_raw):
    buffer = bytearray()
    position = 0
    for chunk in stream:
        buffer += chunk
        for i in range(position, len(buffer)):
            char = buffer[i : i + 1]
            seq: bytes | None = None
            if char in [b"\r", b"\n"]:
                for s in MESSAGE_BOUNDARIES:
                    seq = _peek_sequence(i, buffer, s)
                    if seq is not None:
                        break
            if seq is None:
                continue

            block = buffer[position:i]
            position = i + len(seq)
            event = _parse_event(block, decoder)
            if event is not None:
                yield event

        if position > 0:
            buffer = buffer[position:]
            position = 0

    event = _parse_event(buffer, decoder)
    if event is not None:
        yield event


def _parse_event(raw: bytearray, decoder: Callable[[str], T]):
    block = raw.decode()
    lines = re.split(r"\r?\n|\r", block)
    publish = False
    event = ServerEvent[T]()
    data = ""
    for line in lines:
        if not line:
            continue

        delim = line.find(":")
        if delim <= 0:
            continue

        field = line[0:delim]
        value = line[delim + 1 :] if delim < len(line) - 1 else ""
        if len(value) and value[0] == " ":
            value = value[1:]

        if field == "event":
            event.name = value
            publish = True
        elif field == "data":
            data += value + "\n"
            publish = True
        elif field == "id":
            event.id = value
            publish = True
        elif field == "retry":
            event.retry = int(value) if value.isdigit() else None
            publish = True

    if data:
        data = data[:-1]
        event.data = decoder(data)

    return event if publish else None


def _peek_sequence(position: int, buffer: bytearray, sequence: bytes):
    if len(sequence) > (len(buffer) - position):
        return None

    for i in range(0, len(sequence)):
        if buffer[position + i] != sequence[i]:
            return None

    return sequence
