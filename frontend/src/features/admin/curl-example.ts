const BASE_URL_TOKEN = "__BASE_URL__"

const CURL_EXAMPLE_TEMPLATE = `# OpenAI streaming chat
  curl ${BASE_URL_TOKEN}/v1/chat/completions \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer YOUR_API_KEY" \
    -d '{
      "model": "qwen3.6-plus",
      "messages": [{"role": "user", "content": "Hello"}],
      "stream": true
    }'

  # Upload one file first (the response contains a reusable content_block)
  curl ${BASE_URL_TOKEN}/v1/files \
    -H "Authorization: Bearer YOUR_API_KEY" \
    -F "file=@./context.txt"

  # OpenAI + attachment
  curl ${BASE_URL_TOKEN}/v1/chat/completions \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer YOUR_API_KEY" \
    -d '{
      "model": "qwen3.6-plus",
      "stream": false,
      "messages": [
        {
          "role": "user",
          "content": [
            {"type": "text", "text": "Read the uploaded file and summarize the key points."},
            {"type": "input_file", "file_id": "FILE_ID_FROM_UPLOAD", "filename": "context.txt", "mime_type": "text/plain"}
          ]
        }
      ]
    }'

  # Anthropic / Claude Code + attachment
  curl ${BASE_URL_TOKEN}/anthropic/v1/messages \
    -H "Content-Type: application/json" \
    -H "x-api-key: YOUR_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -d '{
      "model": "claude-sonnet-4-6",
      "max_tokens": 1024,
      "messages": [
        {
          "role": "user",
          "content": [
            {"type": "text", "text": "Read the uploaded file and summarize the key points."},
            {"type": "input_file", "file_id": "FILE_ID_FROM_UPLOAD", "filename": "context.txt", "mime_type": "text/plain"}
          ]
        }
      ]
    }'

  # Gemini
  curl ${BASE_URL_TOKEN}/v1beta/models/qwen3.6-plus:generateContent \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer YOUR_API_KEY" \
    -d '{
      "contents": [{"parts": [{"text": "Hello"}]}]
    }'

  # Images
  curl ${BASE_URL_TOKEN}/v1/images/generations \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer YOUR_API_KEY" \
    -d '{
      "model": "dall-e-3",
      "prompt": "A cyberpunk cat with neon lights, ultra realistic",
      "n": 1,
      "size": "1024x1024",
      "response_format": "url"
    }'

  # Video (reserved path)
  curl ${BASE_URL_TOKEN}/v1/chat/completions \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer YOUR_API_KEY" \
    -d '{
      "model": "qwen3.6-plus",
      "stream": false,
      "messages": [{"role": "user", "content": "Generate a slow-motion ocean-wave video."}]
    }'`

export function buildCurlExample(baseUrl: string) {
  return CURL_EXAMPLE_TEMPLATE.replaceAll(BASE_URL_TOKEN, baseUrl)
}
