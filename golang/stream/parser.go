package stream

import (
	"bufio"
	"bytes"
	"io"
	"regexp"
	"strconv"
	"strings"
)

type ServerEvent[T any] struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Data  T      `json:"data"`
	Retry int64  `json:"retry"`
	Empty bool   `json:"empty"`
}

var boundary = regexp.MustCompile(`\r\n\r\n|\r\r|\n\n`)
var lineEnding = regexp.MustCompile(`\r?\n|\r`)

func scanServerEvents(data []byte, atEOF bool) (advance int, token []byte, err error) {
	if atEOF && len(data) == 0 {
		return 0, nil, nil
	}

	result := boundary.FindIndex(data)
	if result != nil {
		return result[1], data[:result[0]], nil
	}

	if atEOF {
		return len(data), bytes.TrimRight(data, "\r\n"), nil
	}

	return 0, nil, nil
}

type EventStream[T any] struct {
	r            io.ReadCloser
	scanner      *bufio.Scanner
	unmarshaller func(b []byte) (T, error)

	err error
	val *ServerEvent[T]
}

func NewEventStream[T any](
	source io.Reader,
	unmarshaller func(b []byte) (T, error),
) *EventStream[T] {
	scanner := bufio.NewScanner(source)
	scanner.Split(scanServerEvents)

	var src io.ReadCloser
	if s, ok := source.(io.ReadCloser); ok {
		src = s
	} else {
		src = io.NopCloser(source)
	}

	return &EventStream[T]{
		r:            src,
		scanner:      scanner,
		unmarshaller: unmarshaller,
	}
}

// Next waits for the next event from a stream which will be available
// through the Value() method. It returns false when the stream is done or
// an error occurred. After this method returns false, the Err method is used
// to check for any errors that occurred while parsing the stream.
func (es *EventStream[T]) Next() bool {
	if es.err != nil {
		return false
	}

	if !es.scanner.Scan() {
		return false
	}

	es.err = es.scanner.Err()
	if es.err != nil {
		return false
	}

	b := es.scanner.Bytes()

	var event ServerEvent[T]
	lines := lineEnding.Split(string(b), -1)
	publish := false
	for _, line := range lines {
		if line == "" {
			continue
		}

		delim := strings.Index(line, ":")
		if delim == 0 {
			continue
		}

		field := ""
		value := ""
		if delim > 0 {
			field = line[:delim]
		}
		if delim > 0 && delim < len(line)-1 {
			value = line[delim+1:]
		}

		switch field {
		case "id":
			publish = true
			event.ID = value
		case "event":
			publish = true
			event.Name = value
		case "retry":
			retry, err := strconv.ParseInt(value, 10, 64)
			if err == nil {
				publish = true
				event.Retry = retry
			}
		case "data":
			publish = true
			var err error
			event.Data, err = es.unmarshaller([]byte(value))
			if err != nil {
				es.err = err
				return false
			}
		}
	}

	event.Empty = !publish
	es.val = &event

	return true
}

// Value returns the most recent event that was generated from a call to Next
func (es *EventStream[T]) Value() *ServerEvent[T] {
	return es.val
}

// Err returns the first non-EOF error that was encountered
func (es *EventStream[T]) Err() error {
	return es.err
}

// Close will release underlying resources held by an event stream. It must
// always be called.
func (es *EventStream[T]) Close() error {
	return es.r.Close()
}
