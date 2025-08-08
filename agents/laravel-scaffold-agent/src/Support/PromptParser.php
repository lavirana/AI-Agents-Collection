<?php

namespace Acme\ScaffoldAgent\Support;

use Illuminate\Support\Str;
use Illuminate\Support\Facades\Http;

class PromptParser
{
    /**
     * Parse prompt and/or explicit options into a spec:
     * [ 'name' => string, 'fields' => [ ['name'=>string,'type'=>string], ... ] ]
     */
    public function parse(string $prompt, array $options = []): ?array
    {
        $name = $options['name'] ?? null;
        $fieldsLine = $options['fields'] ?? null;

        if ($fieldsLine) {
            $fields = $this->parseFieldsList($fieldsLine);
        }

        if (!$name || empty($fields)) {
            $fromPrompt = $this->parseWithLLMOrHeuristics($prompt);
            if ($fromPrompt) {
                $name = $name ?: ($fromPrompt['name'] ?? null);
                $fields = !empty($fields) ? $fields : ($fromPrompt['fields'] ?? []);
            }
        }

        if (!$name || empty($fields)) {
            return null;
        }

        // Normalize
        $name = Str::of($name)->snake('-')->replace('-', ' ')->trim()->explode(' ')->first();
        $name = Str::singular((string) $name);

        $normalizedFields = [];
        foreach ($fields as $field) {
            $fname = Str::snake($field['name']);
            $ftype = strtolower($field['type'] ?? 'string');
            $normalizedFields[] = [
                'name' => $fname,
                'type' => $this->normalizeType($fname, $ftype),
            ];
        }

        return [
            'name' => $name,
            'fields' => $normalizedFields,
        ];
    }

    private function parseFieldsList(string $line): array
    {
        $parts = array_filter(array_map('trim', explode(',', $line)));
        $fields = [];
        foreach ($parts as $part) {
            if (str_contains($part, ':')) {
                [$n, $t] = array_map('trim', explode(':', $part, 2));
                $fields[] = ['name' => $n, 'type' => $t];
            } else {
                $fields[] = ['name' => $part, 'type' => $this->guessType($part)];
            }
        }
        return $fields;
    }

    private function parseWithLLMOrHeuristics(string $prompt): ?array
    {
        $prompt = trim($prompt);
        if ($prompt === '') {
            return null;
        }

        $apiKey = env('OPENAI_API_KEY');
        if ($apiKey) {
            try {
                $resp = Http::withToken($apiKey)
                    ->timeout(15)
                    ->post('https://api.openai.com/v1/chat/completions', [
                        'model' => env('OPENAI_MODEL', 'gpt-4o-mini'),
                        'messages' => [
                            [
                                'role' => 'system',
                                'content' => 'You extract a Laravel module spec from a prompt. Respond as strict JSON with keys: name (singular), fields (array of {name,type}). Types are one of: string,text,integer,bigInteger,boolean,date,datetime,timestamp,decimal.'
                            ],
                            [ 'role' => 'user', 'content' => $prompt ],
                        ],
                        'temperature' => 0.2,
                    ]);
                if ($resp->successful()) {
                    $json = $resp->json('choices.0.message.content');
                    $data = json_decode($json, true);
                    if (is_array($data) && !empty($data['name']) && !empty($data['fields'])) {
                        return $data;
                    }
                }
            } catch (\Throwable $e) {
                // fall through to heuristics
            }
        }

        // Heuristic parsing: "Create a blog module with title, content, published_at"
        $name = null;
        $fields = [];

        $lower = strtolower($prompt);
        // Find name near "create a <name> module"
        if (preg_match('/create\s+(?:an?\s+)?([a-z0-9_\-]+)\s+module/i', $prompt, $m)) {
            $name = $m[1];
        }
        // Find fields after "with ..." or "having ..."
        if (preg_match('/(?:with|having)\s+([a-z0-9_,\s:\-]+)/i', $prompt, $m2)) {
            $fieldsLine = trim($m2[1]);
            $fields = $this->parseFieldsList($fieldsLine);
        }

        if (!$name) {
            // fallback: first word
            $tokens = preg_split('/\s+/', trim($prompt));
            $name = $tokens[0] ?? 'item';
        }
        if (empty($fields)) {
            // fallback: guess from text commas
            $tokens = [];
            if (preg_match_all('/([a-zA-Z_][a-zA-Z0-9_]*)(?=,|\s|$)/', $prompt, $mm)) {
                foreach ($mm[1] as $t) {
                    if (!in_array(strtolower($t), ['create','module','with','having','and'])) {
                        $tokens[] = $t;
                    }
                }
            }
            $tokens = array_slice($tokens, 1, 5);
            foreach ($tokens as $t) {
                $fields[] = ['name' => $t, 'type' => $this->guessType($t)];
            }
        }

        if ($name && !empty($fields)) {
            return [ 'name' => $name, 'fields' => $fields ];
        }
        return null;
    }

    private function normalizeType(string $name, string $type): string
    {
        $type = strtolower($type);
        return match (true) {
            str_ends_with($name, '_id') => 'unsignedBigInteger',
            str_ends_with($name, '_at') => 'datetime',
            in_array($type, ['string','text','integer','biginteger','boolean','date','datetime','timestamp','decimal']) => $type === 'biginteger' ? 'bigInteger' : $type,
            default => $this->guessType($name),
        };
    }

    private function guessType(string $name): string
    {
        $lname = strtolower($name);
        return match (true) {
            str_contains($lname, 'content') || str_contains($lname, 'body') || str_contains($lname, 'description') => 'text',
            str_ends_with($lname, '_id') => 'unsignedBigInteger',
            str_ends_with($lname, '_at') => 'datetime',
            str_starts_with($lname, 'is_') || str_starts_with($lname, 'has_') => 'boolean',
            default => 'string',
        };
    }
}