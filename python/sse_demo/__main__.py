from dataclasses import dataclass
from dataclasses_json import dataclass_json
import requests

from sse_demo.parser import stream_events

u = "http://localhost:8080/completion"

headers = {"accept": "text/event-stream",
           "cache-control": "no-cache", "content-type": "application/json"}

body = {
    "stream": True,
    "n_predict": 400,
    "temperature": 0.7,
    "stop": ["</s>", "Llama:", "User:"],
    "repeat_last_n": 256,
    "repeat_penalty": 1.18,
    "top_k": 40,
    "top_p": 0.5,
    "tfs_z": 1,
    "typical_p": 1,
    "presence_penalty": 0,
    "frequency_penalty": 0,
    "mirostat": 0,
    "mirostat_tau": 5,
    "mirostat_eta": 0.1,
    "grammar": "",
    "n_probs": 0,
    "image_data": [],
    "cache_prompt": True,
    "slot_id": -1,
    "prompt":
    "This is a conversation between User and Llama, a friendly chatbot. Llama is helpful, kind, honest, good at writing, and never fails to answer any requests immediately and with precision.\n" +
    "\n" +
    "User: Tell me about Maine Coon cats?\n" +
    "\n" +
    "You are an expert veterinarian, cat groomer and competition judge. You have decades of experience on different cats including their temperaments, intelligence, cleanliness, diets and diseases.\n" +
    "Llama:",
}


@dataclass_json
@dataclass
class CompletionEvent:
    content: str


def decode_completion(raw: str) -> CompletionEvent:
    return CompletionEvent.from_json(raw)


def main():
    s = requests.Session()
    with s.post(u, stream=True, json=body, headers=headers) as r:
        r.raise_for_status()
        for event in stream_events(r.iter_content(None), decode_completion):
            print(event.data.content, end="", flush=True)
