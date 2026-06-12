/// <reference types="@angular/localize" />

import { bootstrapApplication } from '@angular/platform-browser';
import * as Sentry from '@sentry/angular';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';
import { APP_COMMIT, APP_VERSION } from './version.generated';

// ngDevMode é truthy em dev e definido como false pelo optimizer em builds
// de produção — gate barato pra não poluir o Sentry com erros de ng serve.
const isProdBuild = typeof ngDevMode === 'undefined' || !ngDevMode;

if (environment.sentryDsn && isProdBuild) {
  Sentry.init({
    dsn: environment.sentryDsn,
    release: `karaoke-live@${APP_VERSION}+${APP_COMMIT}`,
    environment: 'production',
    // Só error monitoring por enquanto — sem tracing/replay pra não pesar
    // o bundle num app mobile-first.
    sendDefaultPii: false,
  });
}

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
