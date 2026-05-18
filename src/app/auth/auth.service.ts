import { Injectable, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import type { Session, User } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase.service';
import { Profile } from '../types';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly session = signal<Session | null>(null);
  readonly user = computed<User | null>(() => this.session()?.user ?? null);
  readonly profile = signal<Profile | null>(null);
  readonly isAuthenticated = computed(() => this.user() !== null);

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;

    void this.supabase.client.auth.getSession().then(({ data }) => {
      this.session.set(data.session);
      if (data.session?.user) {
        void this.loadProfile(data.session.user.id);
      }
    });

    this.supabase.client.auth.onAuthStateChange((_event, session) => {
      this.session.set(session);
      if (session?.user) {
        void this.loadProfile(session.user.id);
      } else {
        this.profile.set(null);
      }
    });
  }

  async signInWithGoogle(redirectTo?: string): Promise<void> {
    await this.supabase.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo ?? window.location.origin },
    });
  }

  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
  }

  private async loadProfile(userId: string): Promise<void> {
    const { data } = await this.supabase.client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    this.profile.set(data);
  }
}
