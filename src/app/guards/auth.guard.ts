import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

export const authGuard: CanActivateFn = async () => {
  const db = inject(SupabaseService);
  const router = inject(Router);
  return (await db.hasSession()) ? true : router.createUrlTree(['/login']);
};