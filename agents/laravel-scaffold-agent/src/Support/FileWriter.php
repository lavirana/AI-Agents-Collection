<?php

namespace Acme\ScaffoldAgent\Support;

use Illuminate\Filesystem\Filesystem;

class FileWriter
{
    private Filesystem $files;
    private string $basePath;

    public function __construct(string $basePath)
    {
        $this->files = new Filesystem();
        $this->basePath = rtrim($basePath, '/');
    }

    public function write(string $relativePath, string $contents, bool $force = false): void
    {
        $path = $this->path($relativePath);
        $dir = dirname($path);
        if (!$this->files->exists($dir)) {
            $this->files->makeDirectory($dir, 0755, true);
        }
        if ($this->files->exists($path) && !$force) {
            return; // do not overwrite
        }
        $this->files->put($path, $contents);
    }

    public function appendOnce(string $relativePath, string $append, string $uniqueKey): void
    {
        $path = $this->path($relativePath);
        if (!$this->files->exists($path)) {
            $this->write($relativePath, "<?php\n\n".$append, true);
            return;
        }
        $current = $this->files->get($path);
        if (str_contains($current, $uniqueKey)) {
            return; // already added
        }
        $this->files->append($path, "\n".$append);
    }

    private function path(string $relativePath): string
    {
        return $this->basePath.'/'.$relativePath;
    }
}