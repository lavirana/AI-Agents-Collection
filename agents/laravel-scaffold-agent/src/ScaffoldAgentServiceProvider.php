<?php

namespace Acme\ScaffoldAgent;

use Illuminate\Support\ServiceProvider;

class ScaffoldAgentServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        if ($this->app->runningInConsole()) {
            $this->commands([
                \Acme\ScaffoldAgent\Console\ScaffoldModuleCommand::class,
            ]);
        }
    }
}