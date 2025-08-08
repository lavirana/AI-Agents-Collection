# Laravel Scaffold Agent

Generate full CRUD modules (Models, Migrations, Controllers, Routes, Views) from a natural language prompt.

## Installation

Add to an existing Laravel app (v10 or v11):

1. Require via path or VCS:

```bash
composer config repositories.scaffold-agent path /workspace
composer require acme/laravel-scaffold-agent:dev-main
```

2. The service provider auto-registers via package discovery. If disabled, add to `config/app.php` providers:

```php
Acme\ScaffoldAgent\ScaffoldAgentServiceProvider::class,
```

## Usage

Prompt-driven generation:

```bash
php artisan scaffold:module "Create a blog module with title, content:text, published_at:datetime"
```

Or explicit options:

```bash
php artisan scaffold:module --name=Blog --fields=title:string,content:text,published_at:datetime
```

Options:
- `--api`: Generate API controller and register `Route::apiResource` in `routes/api.php`
- `--force`: Overwrite existing files

This will generate:
- `app/Models/Blog.php`
- `database/migrations/*_create_blogs_table.php`
- `app/Http/Controllers/BlogController.php`
- Routes in `routes/web.php` (or `routes/api.php` with `--api`)
- Views in `resources/views/blog/` (index, create, edit, show) for web mode

Then run migrations:

```bash
php artisan migrate
```

## LLM-assisted parsing (optional)
If `OPENAI_API_KEY` is set, the command will call OpenAI to parse the prompt. Otherwise it falls back to heuristics.

Environment variables:
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default `gpt-4o-mini`)

## Notes
- Fields ending with `_id` become `unsignedBigInteger` columns.
- Fields ending with `_at` become `datetime`.
- Common names like `content`/`body`/`description` default to `text`.

## Example

```bash
php artisan scaffold:module "Create a product module with name, description:text, price:decimal, is_active:boolean, published_at"
```

## License
MIT
