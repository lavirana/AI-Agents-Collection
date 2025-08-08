<?php

namespace Acme\ScaffoldAgent\Support;

use Illuminate\Support\Str;

class NameInflector
{
    private string $base;

    public function __construct(string $baseName)
    {
        $this->base = Str::studly(Str::singular($baseName));
    }

    public function toArray(): array
    {
        $modelName = $this->base;
        $controllerName = $modelName.'Controller';
        $singularSnake = Str::snake($modelName);
        $pluralSnake = Str::snake(Str::pluralStudly($modelName));
        $routeName = Str::kebab(Str::pluralStudly($modelName));
        $routeUri = Str::kebab(Str::pluralStudly($modelName));
        $viewDir = Str::kebab($modelName);
        $tableName = $pluralSnake;

        return [
            'modelName' => $modelName,
            'controllerName' => $controllerName,
            'singularSnake' => $singularSnake,
            'pluralSnake' => $pluralSnake,
            'routeName' => $routeName,
            'routeUri' => $routeUri,
            'viewDir' => $viewDir,
            'tableName' => $tableName,
        ];
    }
}