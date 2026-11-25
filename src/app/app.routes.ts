import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/landing/landing.component').then((m) => m.LandingComponent),
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'privacy',
    loadComponent: () => import('./pages/privacy/privacy.component').then((m) => m.PrivacyComponent),
  },
  {
    path: 'local/:slug',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/venue-detail/venue-detail.component').then((m) => m.VenueDetailComponent),
  },
  {
    path: 'mobile',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/mobile/mobile.component').then((m) => m.MobileComponent),
  },
  {
    path: 'mobile/:code',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/mobile/mobile.component').then((m) => m.MobileComponent),
  },
  {
    path: 'host-dashboard/:roomId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/host-dashboard/host-dashboard.component').then((m) => m.HostDashboardComponent),
  },
  {
    path: '**',
    loadComponent: () =>
      import('./pages/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
];
