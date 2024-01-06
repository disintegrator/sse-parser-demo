export type ServerEvent<T = string> = {
  data?: T;
  name?: string;
  retry?: number;
  id?: string;
};

const LF = 0x0a;
const CR = 0x0d;
const NEWLINE_CHARS = new Set([LF, CR]);
const MESSAGE_BOUNDARIES = [
  new Uint8Array([CR, LF, CR, LF]),
  new Uint8Array([CR, CR]),
  new Uint8Array([LF, LF]),
];

export async function* consumeStream<T>(
  stream: ReadableStream<Uint8Array>,
  decoder: (data: string) => T
): AsyncGenerator<ServerEvent<T>> {
  const reader = stream.getReader();
  let buffer = new Uint8Array([]);
  let position = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      let newBuffer = new Uint8Array(buffer.length + value.length);
      newBuffer.set(buffer);
      newBuffer.set(value, buffer.length);
      buffer = newBuffer;

      for (let i = position; i < buffer.length; i++) {
        const boundary = findBoundary(buffer, i);
        if (boundary == null) {
          continue;
        }

        const chunk = buffer.slice(position, i);
        position = i + boundary.length;
        const event = parseEvent(chunk, decoder);
        if (event != null) {
          yield event;
        }
      }

      if (position > 0) {
        buffer = buffer.slice(position);
        position = 0;
      }
    }

    if (buffer.length > 0) {
      const event = parseEvent(buffer, decoder);
      if (event != null) {
        yield event;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function findBoundary(buffer: Uint8Array, start: number): Uint8Array | null {
  let char1 = buffer[start];
  let char2 = buffer[start + 1];

  // Don't bother checking if the first two characters are not new line
  // characters.
  if (
    char1 == null ||
    char2 == null ||
    !NEWLINE_CHARS.has(char1) ||
    !NEWLINE_CHARS.has(char2)
  ) {
    return null;
  }

  for (const s of MESSAGE_BOUNDARIES) {
    const seq = peekSequence(start, buffer, s);
    if (seq != null) {
      return seq;
    }
  }

  return null;
}

function peekSequence(
  position: number,
  buffer: Uint8Array,
  sequence: Uint8Array
): Uint8Array | null {
  if (sequence.length > buffer.length - position) {
    return null;
  }

  for (let i = 0; i < sequence.length; i++) {
    if (buffer[position + i] !== sequence[i]) {
      return null;
    }
  }

  return sequence;
}

function parseEvent<T>(chunk: Uint8Array, decoder: (data: string) => T) {
  if (!chunk.length) {
    return null;
  }

  const td = new TextDecoder();
  const raw = td.decode(chunk);
  const lines = raw.split(/\r?\n|\r/g);
  let publish = false;
  let data: string | null = "";
  const event: ServerEvent<T> = {};

  for (const line of lines) {
    if (!line) {
      continue;
    }

    const delim = line.indexOf(":");
    // Lines starting with a colon are ignored.
    if (delim === 0) {
      continue;
    }

    const field = delim > 0 ? line.substring(0, delim) : "";
    let value = delim > 0 ? line.substring(delim + 1) : "";
    if (value.charAt(0) === " ") {
      value = value.substring(1);
    }

    switch (field) {
      case "event": {
        publish = true;
        event.name = value;
        break;
      }
      case "data": {
        publish = true;
        data ??= "";
        data += value + "\n";
        break;
      }
      case "id": {
        publish = true;
        event.id = value;
        break;
      }
      case "retry": {
        const retry = parseInt(value, 10);
        if (!Number.isNaN(retry)) {
          publish = true;
          event.retry = retry;
        }
        break;
      }
    }
  }

  if (data != null) {
    event.data = decoder(data.slice(0, -1));
  }

  return publish ? event : null;
}
