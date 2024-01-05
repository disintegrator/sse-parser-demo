import { ZodSchema, ZodTypeDef } from "zod";

export type ServerEvent = {
  data: string;
  name: string;
  retry?: number;
  id?: string;
};

export class LineDecoderStream
  implements ReadableWritablePair<Uint8Array, Uint8Array>
{
  public readonly readable: ReadableStream<Uint8Array>;
  public readonly writable: WritableStream<Uint8Array>;

  readonly #channel: EventTarget;
  buffer: Uint8Array;
  position: number;

  constructor() {
    this.#channel = new EventTarget();
    this.buffer = new Uint8Array([]);
    this.position = 0;

    this.writable = new WritableStream<Uint8Array>({
      write: (chunk) => this.write(chunk),
      close: () => this.close(),
    });

    this.readable = readableFromChannel(this.#channel);
  }

  private async write(chunk: Uint8Array) {
    let newBuffer = new Uint8Array(this.buffer.length + chunk.length);
    newBuffer.set(this.buffer);
    newBuffer.set(chunk, this.buffer.length);
    this.buffer = newBuffer;

    for (let i = this.position; i < this.buffer.length; i++) {
      let char = this.buffer[i];
      let seq: Uint8Array | null = null;
      if (char === LF || char === CR) {
        for (const s of MESSAGE_BOUNDARIES) {
          seq = peekSequence(i, this.buffer, s);
          if (seq != null) {
            break;
          }
        }
      }

      if (seq == null) {
        continue;
      }

      this.#channel.dispatchEvent(
        new CustomEvent("message", {
          detail: this.buffer.slice(this.position, i),
        })
      );

      this.position = i + seq.length;
    }

    if (this.position > 0) {
      this.buffer = this.buffer.slice(this.position);
      this.position = 0;
    }
  }

  private close() {
    this.#channel.dispatchEvent(
      new CustomEvent("message", {
        detail: this.buffer,
      })
    );
    this.#channel.dispatchEvent(new Event("close"));
  }
}

export class EventDecoderStream
  implements ReadableWritablePair<ServerEvent, Uint8Array>
{
  public readonly readable: ReadableStream<ServerEvent>;
  public readonly writable: WritableStream<Uint8Array>;

  readonly #channel: EventTarget;

  constructor() {
    this.#channel = new EventTarget();
    this.writable = new WritableStream<Uint8Array>({
      write: (chunk) => this.write(chunk),
      close: () => this.close(),
    });

    this.readable = readableFromChannel(this.#channel);
  }

  private async write(chunk: Uint8Array) {
    if (!chunk.length) {
      return;
    }

    const decoder = new TextDecoder();
    const raw = decoder.decode(chunk);
    const lines = raw.split(/\r?\n|\r/g);
    const event: ServerEvent = { data: "", name: "" };
    let publish = false;

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
          event.data += value + "\n";
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

    if (event.data) {
      event.data = event.data.slice(0, -1);
    }

    if (publish) {
      this.#channel.dispatchEvent(
        new CustomEvent("message", { detail: event })
      );
    }
  }

  private async close() {
    this.#channel.dispatchEvent(new Event("close"));
  }
}

export class ServerEventsDecoderStream
  implements ReadableWritablePair<ServerEvent, Uint8Array>
{
  public readonly readable: ReadableStream<ServerEvent>;
  public readonly writable: WritableStream<Uint8Array>;

  constructor() {
    const lineDecoder = new LineDecoderStream();
    const eventDecoder = new EventDecoderStream();
    this.writable = lineDecoder.writable;
    this.readable = lineDecoder.readable.pipeThrough(eventDecoder);
  }
}

export class ZodDecoderStream<
  Output = any,
  Def extends ZodTypeDef = ZodTypeDef,
  Input = unknown
> implements ReadableWritablePair<Output, Input>
{
  public readonly readable: ReadableStream<Output>;
  public readonly writable: WritableStream<Input>;

  private readonly schema: ZodSchema<Output, Def, Input>;
  readonly #channel: EventTarget;

  constructor(schema: ZodSchema<Output, Def, Input>) {
    this.schema = schema;
    this.#channel = new EventTarget();

    this.readable = readableFromChannel(this.#channel);
    this.writable = new WritableStream<unknown>({
      write: (chunk) => this.write(chunk),
      close: () => this.close(),
    });
  }

  private async write(chunk: unknown) {
    const result = this.schema.safeParse(chunk);
    if (result.success) {
      this.#channel.dispatchEvent(
        new CustomEvent("message", {
          detail: result.data,
        })
      );
    }
  }

  private async close() {
    this.#channel.dispatchEvent(new Event("close"));
  }
}

function readableFromChannel<T>(channel: EventTarget): ReadableStream<T> {
  let onMessage: EventListener | null = null;
  let onCancel: EventListener | null = null;
  return new ReadableStream<T>({
    start: (controller) => {
      onMessage = (event) => {
        if (event instanceof CustomEvent) {
          controller.enqueue(event.detail);
        }
      };
      channel.addEventListener("message", onMessage);

      onCancel = () => {
        controller.close();
      };
      channel.addEventListener("close", onCancel);
    },
    cancel: () => {
      channel.removeEventListener("message", onMessage);
      channel.removeEventListener("close", onCancel);
    },
  });
}

const LF = 0x0a;
const CR = 0x0d;
const MESSAGE_BOUNDARIES = [
  new Uint8Array([CR, LF, CR, LF]),
  new Uint8Array([CR, CR]),
  new Uint8Array([LF, LF]),
];

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
