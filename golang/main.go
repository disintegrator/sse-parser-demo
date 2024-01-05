package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/disintegrator/sse-parser-demo/stream"
)

type Completion struct {
	Content string `json:"content"`
}

func main() {
	log.SetOutput(os.Stderr)

	flag.Parse()

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "http://localhost:8080/completion", body)
	if err != nil {
		log.Fatalf("failed to creat request: %s", err)
	}

	req.Header.Set("accept", "text/event-stream")
	req.Header.Set("cache-control", "no-cache")
	req.Header.Set("content-type", "application/json")

	client := http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		log.Fatalf("request failed: %s", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("unexpected status code received: %s\n", resp.Status)
		if data, err := io.ReadAll(resp.Body); err == nil {
			log.Printf("data:\n%s\n\n", string(data))
		}
		log.Fatalf("exited due to failed request")
	}

	stream := stream.NewEventStream(resp.Body, func(b []byte) (string, error) {
		cmp := Completion{}
		err := json.Unmarshal(b, &cmp)

		return cmp.Content, err
	})
	defer stream.Close()

	for stream.Next() {
		if event := stream.Value(); event != nil {
			fmt.Print(event.Data)
		}
	}
	if err := stream.Err(); err != nil {
		log.Fatalf("stream error: %s", err)
	}
}

var body = bytes.NewBufferString(`{
  "stream": true,
  "n_predict": 400,
  "temperature": 0.7,
  "stop": [
    "</s>",
    "Llama:",
    "User:"
  ],
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
  "cache_prompt": true,
  "slot_id": -1,
  "prompt": "This is a conversation between User and Llama, a friendly chatbot. Llama is helpful, kind, honest, good at writing, and never fails to answer any requests immediately and with precision.\n\nUser: Tell me about Maine Coon cats?\n\nYou are an expert veterinarian, cat groomer and competition judge. You have decades of experience on different cats including their temperaments, intelligence, cleanliness, diets and diseases.\nLlama:"
}`)
