import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Blocks unauthenticated users; redirects them to /login with a return path. */
export const authGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenReady();

  if (auth.isAuthenticated()) return true;

  return router.createUrlTree(['/login'], {
    queryParams: { redirect: route.url.map((s) => s.path).join('/') },
  });
};

/** Keeps authenticated users out of /login; sends them home (or to redirect). */
export const guestGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenReady();

  if (!auth.isAuthenticated()) return true;

  const redirect = route.queryParamMap.get('redirect');
  return router.parseUrl(redirect ? `/${redirect}` : '/');
};
