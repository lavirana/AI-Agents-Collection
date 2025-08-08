<?php

namespace Acme\ScaffoldAgent\Console;

use Acme\ScaffoldAgent\Support\FileWriter;
use Acme\ScaffoldAgent\Support\NameInflector;
use Acme\ScaffoldAgent\Support\PromptParser;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

class ScaffoldModuleCommand extends Command
{
    protected $signature = 'scaffold:module
        {prompt?* : Natural language prompt, e.g., "Create a blog module with title, content, published_at"}
        {--name= : Explicit module name (overrides parsed)}
        {--fields= : Comma-separated fields with optional types, e.g., title:string,content:text,published_at:datetime}
        {--force : Overwrite existing files}
        {--api : Generate API controller and routes (uses routes/api.php)}';

    protected $description = 'Generate a full CRUD module (Model, Migration, Controller, Routes, Views) from a natural language prompt.';

    public function handle(): int
    {
        $prompt = trim(implode(' ', $this->argument('prompt') ?? []));
        $explicitName = $this->option('name');
        $explicitFields = $this->option('fields');
        $force = (bool) $this->option('force');
        $isApi = (bool) $this->option('api');

        if ($prompt === '' && !$explicitName && !$explicitFields) {
            $this->error('Provide a prompt or --name and --fields.');
            return self::INVALID;
        }

        $parser = new PromptParser();
        $spec = $parser->parse($prompt, [
            'name' => $explicitName,
            'fields' => $explicitFields,
        ]);

        if (!$spec || empty($spec['name']) || empty($spec['fields'])) {
            $this->error('Could not parse the prompt/options into a module spec.');
            return self::INVALID;
        }

        $inflector = new NameInflector($spec['name']);
        $names = $inflector->toArray();

        $this->line('Module: <info>'.$names['modelName'].'</info>');
        $this->line('Table: <info>'.$names['tableName'].'</info>');
        $this->line('Fields: <info>'.implode(', ', array_map(fn($f) => $f['name'].':'.$f['type'], $spec['fields'])).'</info>');

        $writer = new FileWriter($this->laravel->basePath());

        // Generate Model
        $this->generateModel($writer, $names, $spec['fields'], $force);

        // Generate Migration
        $this->generateMigration($writer, $names, $spec['fields'], $force);

        // Generate Controller
        $this->generateController($writer, $names, $spec['fields'], $force, $isApi);

        // Generate Views (only for web)
        if (!$isApi) {
            $this->generateViews($writer, $names, $spec['fields'], $force);
        }

        // Update Routes
        $this->updateRoutes($writer, $names, $isApi);

        $this->info('Scaffold complete. Run migrations with: php artisan migrate');

        return self::SUCCESS;
    }

    private function generateModel(FileWriter $writer, array $names, array $fields, bool $force): void
    {
        $fillable = array_map(fn($f) => "'{$f['name']}'", $fields);
        $casts = [];
        foreach ($fields as $field) {
            $type = $field['type'];
            if (in_array($type, ['datetime', 'timestamp', 'date'])) {
                $casts[] = "'{$field['name']}' => '{$type}'";
            } elseif (in_array($type, ['boolean'])) {
                $casts[] = "'{$field['name']}' => 'boolean'";
            }
        }

        $castsBlock = empty($casts) ? '' : "\n    protected $casts = [\n        ".implode(",\n        ", $casts)."\n    ];\n";

        $modelContent = <<<PHP
<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;
use Illuminate\\Database\\Eloquent\\Model;

class {$names['modelName']} extends Model
{
    use HasFactory;

    protected \$fillable = [
        {$this->implodeIndented($fillable)}
    ];
{$castsBlock}}
PHP;

        $path = 'app/Models/'.$names['modelName'].'.php';
        $writer->write($path, $modelContent, $force);
        $this->info('Model created: '.$path);
    }

    private function generateMigration(FileWriter $writer, array $names, array $fields, bool $force): void
    {
        $timestamp = date('Y_m_d_His');
        $filename = $timestamp.'_create_'.$names['tableName'].'_table.php';
        $path = 'database/migrations/'.$filename;

        $columns = [];
        foreach ($fields as $field) {
            $columns[] = '            '.$this->columnForField($field);
        }
        $columns[] = '            $table->timestamps();';

        $migration = <<<PHP
<?php

use Illuminate\\Database\\Migrations\\Migration;
use Illuminate\\Database\\Schema\\Blueprint;
use Illuminate\\Support\\Facades\\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('{$names['tableName']}', function (Blueprint $table) {
            $table->id();
{$this->implodeLines($columns)}
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('{$names['tableName']}');
    }
};
PHP;

        $writer->write($path, $migration, $force);
        $this->info('Migration created: '.$path);
    }

    private function generateController(FileWriter $writer, array $names, array $fields, bool $force, bool $isApi): void
    {
        $validationRules = [];
        foreach ($fields as $field) {
            $validationRules[] = "            '{$field['name']}' => '".$this->validationForType($field['type'])."',";
        }
        $fillableAssign = [];
        foreach ($fields as $field) {
            $fillableAssign[] = "            '{$field['name']}' => \$request->input('{$field['name']}'),";
        }

        $paramVar = $names['singularSnake'];
        $compactVar = $paramVar;

        if ($isApi) {
            $controllerContent = <<<PHP
<?php

namespace App\\Http\\Controllers;

use App\\Models\\{$names['modelName']};
use Illuminate\\Http\\Request;

class {$names['controllerName']} extends Controller
{
    public function index()
    {
        return {$names['modelName']}::paginate();
    }

    public function store(Request $request)
    {
        \$validated = \$request->validate([
{$this->implodeLines($validationRules)}
        ]);

        \${$paramVar} = {$names['modelName']}::create(\$validated);
        return response()->json(\${$paramVar}, 201);
    }

    public function show({$names['modelName']} \${$paramVar})
    {
        return \$${paramVar};
    }

    public function update(Request \$request, {$names['modelName']} \${$paramVar})
    {
        \$validated = \$request->validate([
{$this->implodeLines($validationRules)}
        ]);

        \$${$paramVar}->update(\$validated);
        return \$${paramVar};
    }

    public function destroy({$names['modelName']} \${$paramVar})
    {
        \$${$paramVar}->delete();
        return response()->noContent();
    }
}
PHP;
        } else {
            $controllerContent = <<<PHP
<?php

namespace App\\Http\\Controllers;

use App\\Models\\{$names['modelName']};
use Illuminate\\Http\\Request;

class {$names['controllerName']} extends Controller
{
    public function index()
    {
        \$items = {$names['modelName']}::latest()->paginate();
        return view('{$names['viewDir']}.index', compact('items'));
    }

    public function create()
    {
        return view('{$names['viewDir']}.create');
    }

    public function store(Request \$request)
    {
        \$validated = \$request->validate([
{$this->implodeLines($validationRules)}
        ]);

        {$names['modelName']}::create(\$validated);
        return redirect()->route('{$names['routeName']}.index')->with('status', '{$names['modelName']} created');
    }

    public function show({$names['modelName']} \${$paramVar})
    {
        return view('{$names['viewDir']}.show', compact('{$compactVar}'));
    }

    public function edit({$names['modelName']} \${$paramVar})
    {
        return view('{$names['viewDir']}.edit', compact('{$compactVar}'));
    }

    public function update(Request \$request, {$names['modelName']} \${$paramVar})
    {
        \$validated = \$request->validate([
{$this->implodeLines($validationRules)}
        ]);

        \$${$paramVar}->update(\$validated);
        return redirect()->route('{$names['routeName']}.index')->with('status', '{$names['modelName']} updated');
    }

    public function destroy({$names['modelName']} \${$paramVar})
    {
        \$${$paramVar}->delete();
        return redirect()->route('{$names['routeName']}.index')->with('status', '{$names['modelName']} deleted');
    }
}
PHP;
        }

        $path = 'app/Http/Controllers/'.$names['controllerName'].'.php';
        $writer->write($path, $controllerContent, $force);
        $this->info('Controller created: '.$path);
    }

    private function generateViews(FileWriter $writer, array $names, array $fields, bool $force): void
    {
        $viewsDir = 'resources/views/'.$names['viewDir'];
        $paramVar = $names['singularSnake'];

        $formFields = [];
        foreach ($fields as $field) {
            $label = Str::title(str_replace('_', ' ', $field['name']));
            $input = $this->inputForType($field['name'], $field['type']);
            $formFields[] = "    <div>\n        <label>{$label}</label><br>\n        {$input}\n    </div>";
        }

        $index = <<<BLADE
<h1>{$names['modelName']} List</h1>
<p><a href="{{ route('{$names['routeName']}.create') }}">Create</a></p>
@if(session('status'))<div>{{ session('status') }}</div>@endif
<table border="1" cellpadding="6" cellspacing="0">
    <thead>
        <tr>
            <th>ID</th>
BLADE;
        foreach ($fields as $field) {
            $index .= "            <th>".Str::title(str_replace('_',' ', $field['name']))."</th>\n";
        }
        $index .= "            <th>Actions</th>\n        </tr>\n    </thead>\n    <tbody>\n    @foreach(\$items as \$item)\n        <tr>\n            <td>{{ \$item->id }}</td>\n";
        foreach ($fields as $field) {
            $index .= "            <td>{{ \$item->{$field['name']} }}</td>\n";
        }
        $index .= "            <td>\n                <a href=\"{{ route('{$names['routeName']}.show', \$item) }}\">Show</a> |\n                <a href=\"{{ route('{$names['routeName']}.edit', \$item) }}\">Edit</a> |\n                <form method=\"POST\" action=\"{{ route('{$names['routeName']}.destroy', \$item) }}\" style=\"display:inline\">\n                    @csrf @method('DELETE')\n                    <button type=\"submit\" onclick=\"return confirm('Delete?')\">Delete</button>\n                </form>\n            </td>\n        </tr>\n    @endforeach\n    </tbody>\n</table>\n{{ \$items->links() }}\n";

        $create = <<<BLADE
<h1>Create {$names['modelName']}</h1>
<form method="POST" action="{{ route('{$names['routeName']}.store') }}">
    @csrf
{$this->implodeLines($formFields)}
    <button type="submit">Save</button>
</form>
BLADE;

        $editFields = [];
        foreach ($fields as $field) {
            $label = Str::title(str_replace('_', ' ', $field['name']));
            $valueBinding = "{{ old('{$field['name']}', \${$paramVar}->{$field['name']}) }}";
            $editFields[] = "    <div>\n        <label>{$label}</label><br>\n        ".$this->inputForType($field['name'], $field['type'], $valueBinding)."\n    </div>";
        }

        $edit = <<<BLADE
<h1>Edit {$names['modelName']}</h1>
<form method="POST" action="{{ route('{$names['routeName']}.update', \${$paramVar}) }}">
    @csrf
    @method('PUT')
{$this->implodeLines($editFields)}
    <button type="submit">Update</button>
</form>
BLADE;

        $showRows = [];
        foreach ($fields as $field) {
            $label = Str::title(str_replace('_', ' ', $field['name']));
            $showRows[] = "    <tr><th>{$label}</th><td>{{ \\${$paramVar}->{$field['name']} }}</td></tr>";
        }

        $show = <<<BLADE
<h1>Show {$names['modelName']}</h1>
<table border="1" cellpadding="6" cellspacing="0">
{$this->implodeLines($showRows)}
</table>
BLADE;

        $writer->write($viewsDir.'/index.blade.php', $index, $force);
        $writer->write($viewsDir.'/create.blade.php', $create, $force);
        $writer->write($viewsDir.'/edit.blade.php', $edit, $force);
        $writer->write($viewsDir.'/show.blade.php', $show, $force);
        $this->info('Views created in: '.$viewsDir);
    }

    private function updateRoutes(FileWriter $writer, array $names, bool $isApi): void
    {
        $routeFile = $isApi ? 'routes/api.php' : 'routes/web.php';
        $routeResource = $isApi
            ? "Route::apiResource('{$names['routeUri']}', \\App\\Http\\Controllers\\{$names['controllerName']}::class);"
            : "Route::resource('{$names['routeUri']}', \\App\\Http\\Controllers\\{$names['controllerName']}::class);";

        $append = $routeResource."\n";

        $writer->appendOnce($routeFile, $append, $names['controllerName']);
        $this->info('Routes updated: '.$routeFile.' (resource: '.$names['routeName'].')');
    }

    private function columnForField(array $field): string
    {
        $name = $field['name'];
        $type = $field['type'];
        return match ($type) {
            'id', 'bigint', 'unsignedBigInteger' => "\$table->unsignedBigInteger('{$name}');",
            'string' => "\$table->string('{$name}');",
            'text' => "\$table->text('{$name}');",
            'integer' => "\$table->integer('{$name}');",
            'bigInteger' => "\$table->bigInteger('{$name}');",
            'boolean' => "\$table->boolean('{$name}');",
            'date' => "\$table->date('{$name}');",
            'datetime', 'timestamp' => "\$table->dateTime('{$name}');",
            'decimal' => "\$table->decimal('{$name}', 10, 2);",
            default => "\$table->string('{$name}');",
        };
    }

    private function validationForType(string $type): string
    {
        return match ($type) {
            'text' => 'required|string',
            'string' => 'required|string|max:255',
            'integer', 'bigInteger' => 'required|integer',
            'boolean' => 'required|boolean',
            'date' => 'required|date',
            'datetime', 'timestamp' => 'required|date',
            'decimal' => 'required|numeric',
            default => 'required',
        };
    }

    private function inputForType(string $name, string $type, string $valueBinding = null): string
    {
        $value = $valueBinding ? $valueBinding : "{{ old('{$name}') }}";
        return match ($type) {
            'text' => "<textarea name=\"{$name}\">{$value}</textarea>",
            'boolean' => "<input type=\"checkbox\" name=\"{$name}\" value=\"1\" {{ old('{$name}') ? 'checked' : '' }}>",
            'date' => "<input type=\"date\" name=\"{$name}\" value=\"{$value}\">",
            'datetime', 'timestamp' => "<input type=\"datetime-local\" name=\"{$name}\" value=\"{$value}\">",
            'integer', 'bigInteger', 'decimal' => "<input type=\"number\" name=\"{$name}\" value=\"{$value}\">",
            default => "<input type=\"text\" name=\"{$name}\" value=\"{$value}\">",
        };
    }

    private function implodeIndented(array $items, string $indent = '        '): string
    {
        return implode(",\n{$indent}", $items);
    }

    private function implodeLines(array $lines): string
    {
        return implode("\n", $lines);
    }
}