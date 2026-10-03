import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonSpinner,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { eyeOffOutline, eyeOutline } from 'ionicons/icons';
import { SupabaseService } from '../services/supabase.service';

type Mode = 'signin' | 'signup' | 'forgot';
const EMAIL_KEY = 'dentnotes.lastEmail';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, IonButton, IonContent, IonIcon, IonInput, IonSpinner],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
})
export class LoginPage implements OnInit, AfterViewInit {
  private db = inject(SupabaseService);
  private router = inject(Router);

  @ViewChild('nameInput') nameInput?: IonInput;
  @ViewChild('emailInput') emailInput?: IonInput;
  @ViewChild('passwordInput') passwordInput?: IonInput;

  mode = signal<Mode>('signin');
  fullName = signal('');
  email = signal('');
  password = signal('');
  showPassword = signal(false);
  submitted = signal(false);
  busy = signal(false);
  checking = signal(true); // checking for an existing session
  error = signal<string | null>(null);
  info = signal<string | null>(null);
  cooldown = signal(0); // seconds before another reset email can be sent
  private timer?: ReturnType<typeof setInterval>;

  /* ---------- live validation (shown after the first submit) ---------- */
  nameError = computed(() =>
    this.mode() === 'signup' && !this.fullName().trim() ? 'Enter your full name.' : ''
  );

  emailError = computed(() => {
    const e = this.email().trim();
    if (!e) return 'Enter your email.';
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? '' : 'Enter a valid email address.';
  });

  passwordError = computed(() => {
    if (this.mode() === 'forgot') return '';
    const p = this.password();
    if (!p) return 'Enter your password.';
    if (this.mode() === 'signup' && p.length < 8) return 'Use at least 8 characters.';
    return '';
  });

  /* ---------- password strength (sign-up only) ---------- */
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
    // already signed in? skip the login page
    if (await this.db.hasSession()) {
      await this.router.navigateByUrl('/home', { replaceUrl: true });
      return;
    }

    // remember the last email used on this device
    try {
      const saved = localStorage.getItem(EMAIL_KEY);
      if (saved) this.email.set(saved);
    } catch {
      /* storage not available, ignore */
    }

    this.checking.set(false);
    setTimeout(() => this.focusFirst(), 200);
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.focusFirst(), 300);
  }

  private focusFirst(): void {
    if (this.mode() === 'signup') {
      this.nameInput?.setFocus();
    } else if (this.email() && this.mode() === 'signin') {
      this.passwordInput?.setFocus();
    } else {
      this.emailInput?.setFocus();
    }
  }

  setMode(mode: Mode): void {
    if (this.mode() === mode) return;
    this.mode.set(mode);
    this.submitted.set(false);
    this.error.set(null);
    this.info.set(null);
    this.showPassword.set(false);
    setTimeout(() => this.focusFirst(), 100);
  }

  onInput(field: 'name' | 'email' | 'password', event: Event): void {
    const value = (event as CustomEvent).detail.value ?? '';
    if (field === 'name') this.fullName.set(value);
    if (field === 'email') this.email.set(value);
    if (field === 'password') this.password.set(value);
    this.error.set(null); // clear the old error as soon as they type
  }

  togglePassword(): void {
    this.showPassword.set(!this.showPassword());
  }

  async submit(): Promise<void> {
    if (this.busy()) return;

    this.submitted.set(true);
    this.error.set(null);
    this.info.set(null);

    if (this.nameError() || this.emailError() || this.passwordError()) {
      return;
    }

    const email = this.email().trim();
    this.busy.set(true);

    try {
      if (this.mode() === 'forgot') {
        const { error } = await this.db.sendPasswordReset(email);
        if (error) throw error;
        this.info.set(
          `If an account exists for ${email}, a reset link is on its way. Check your inbox and spam folder.`
        );
        this.startCooldown(60);
      } else if (this.mode() === 'signin') {
        const { error } = await this.db.signIn(email, this.password());
        if (error) throw error;
        this.rememberEmail(email);
        await this.router.navigateByUrl('/home', { replaceUrl: true });
      } else {
        const { data, error } = await this.db.signUp(
          this.fullName().trim(),
          email,
          this.password()
        );
        if (error) throw error;
        this.rememberEmail(email);

        if (data.session) {
          await this.router.navigateByUrl('/home', { replaceUrl: true });
        } else {
          // email confirmation is turned on in Supabase
          this.mode.set('signin');
          this.password.set('');
          this.submitted.set(false);
          this.info.set(`Account created. We sent a confirmation link to ${email}. Confirm it, then sign in.`);
        }
      }
    } catch (err: any) {
      this.error.set(this.friendlyError(err));
    } finally {
      this.busy.set(false);
    }
  }

  private startCooldown(seconds: number): void {
    clearInterval(this.timer);
    this.cooldown.set(seconds);
    this.timer = setInterval(() => {
      const next = this.cooldown() - 1;
      this.cooldown.set(Math.max(next, 0));
      if (next <= 0) clearInterval(this.timer);
    }, 1000);
  }

  private rememberEmail(email: string): void {
    try {
      localStorage.setItem(EMAIL_KEY, email);
    } catch {
      /* ignore */
    }
  }

  private friendlyError(err: any): string {
    const msg = String(err?.message ?? '').toLowerCase();

    if (err?.status === 429 || msg.includes('rate limit')) {
      return 'Too many emails were sent. Please wait a while and try again.';
    }
    if (msg.includes('invalid login')) {
      return 'Wrong email or password. Please check and try again.';
    }
    if (msg.includes('email not confirmed')) {
      return 'Please confirm your email first. Check your inbox for the link.';
    }
    if (msg.includes('already registered') || msg.includes('already been registered')) {
      return 'This email already has an account. Try signing in instead.';
    }
    if (msg.includes('fetch') || msg.includes('network')) {
      return 'Connection problem. Check your internet and try again.';
    }
    return err?.message || 'Something went wrong. Please try again.';
  }
}