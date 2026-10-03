import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonInput, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { eyeOffOutline, eyeOutline } from 'ionicons/icons';
import { SupabaseService } from '../services/supabase.service';

type State = 'checking' | 'ready' | 'invalid' | 'done';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, IonButton, IonContent, IonIcon, IonInput, IonSpinner],
  templateUrl: './reset-password.page.html',
  // reuses the login page look
  styleUrl: '../login/login.page.scss',
})
export class ResetPasswordPage implements OnInit, OnDestroy {
  private db = inject(SupabaseService);
  private router = inject(Router);
  private stopListening?: () => void;

  state = signal<State>('checking');
  password = signal('');
  confirm = signal('');
  showPassword = signal(false);
  submitted = signal(false);
  busy = signal(false);
  error = signal<string | null>(null);

  passwordError = computed(() => {
    const p = this.password();
    if (!p) return 'Enter a new password.';
    if (p.length < 8) return 'Use at least 8 characters.';
    return '';
  });

  confirmError = computed(() =>
    this.confirm() !== this.password() ? 'The passwords do not match.' : ''
  );

  strength = computed(() => {
    const p = this.password();
    if (!p) return 0;
    let score = 0;
    if (p.length >= 8) score++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++;
    if (/\d/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p) || p.length >= 12) score++;
    return score;
  });

  strengthLabel = computed(() => ['', 'Weak', 'Fair', 'Good', 'Strong'][this.strength()]);

  constructor() {
    addIcons({ eyeOffOutline, eyeOutline });
  }

  async ngOnInit(): Promise<void> {
    // Supabase reads the link in the background and signals a recovery session
    this.stopListening = this.db.onAuthChange((event) => {
      if (event === 'PASSWORD_RECOVERY') this.state.set('ready');
    });

    for (let i = 0; i < 8; i++) {
      if (this.state() === 'ready') return;
      if (await this.db.hasSession()) {
        this.state.set('ready');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    if (this.state() === 'checking') this.state.set('invalid');
  }

  ngOnDestroy(): void {
    this.stopListening?.();
  }

  onInput(field: 'password' | 'confirm', event: Event): void {
    const value = (event as CustomEvent).detail.value ?? '';
    if (field === 'password') this.password.set(value);
    else this.confirm.set(value);
    this.error.set(null);
  }

  togglePassword(): void {
    this.showPassword.set(!this.showPassword());
  }

  async submit(): Promise<void> {
    if (this.busy()) return;

    this.submitted.set(true);
    this.error.set(null);
    if (this.passwordError() || this.confirmError()) return;

    this.busy.set(true);
    try {
      const { error } = await this.db.updatePassword(this.password());
      if (error) throw error;

      this.state.set('done');
      setTimeout(() => this.router.navigateByUrl('/home', { replaceUrl: true }), 1800);
    } catch (err: any) {
      const msg = String(err?.message ?? '').toLowerCase();
      this.error.set(
        msg.includes('different from the old')
          ? 'Choose a password that is different from your old one.'
          : err?.message || 'Could not update the password. Please try again.'
      );
    } finally {
      this.busy.set(false);
    }
  }

  backToLogin(): void {
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}