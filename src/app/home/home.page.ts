import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonAvatar,
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonIcon,
  IonNote,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  AlertController,
  ModalController,
  IonSpinner,
  ToastController,
  IonRefresherContent,
  IonRefresher,  
  IonButtons,
  IonHeader,
  IonToolbar
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  add,
  arrowBack,
  arrowForward,
  calendarOutline,
  checkmarkCircle,
  chevronForward,
  gridOutline,
  peopleOutline,
  logOutOutline,
  search,
  timeOutline,
  closeOutline,
  chevronDownCircleOutline,
  sparklesOutline,
  searchOutline,
} from 'ionicons/icons';
import { SupabaseService } from '../services/supabase.service';
import { Session as DbSession } from '../models/session';
import { PatientModal } from '../modals/patient.modal';
import { SessionModal } from '../modals/session.modal';

/* ============================================================
   TYPES (UI shape, separate from the database models)
   ============================================================ */
export type SessionStatus = 'planned' | 'in-progress' | 'completed';

export interface SessionView {
  id: string;
  date: string;
  type: string;
  procedure: string;
  next: string;
  status: SessionStatus;
}

export interface PatientView {
  id: string;
  initials: string;
  firstName: string;
  lastName: string;
  name: string;
  concern: string;
  allergies: string;
  medications: string;
  sessions: SessionView[];
}

/* ============================================================
   STATUS MAPPERS (database uses uppercase, UI uses lowercase)
   ============================================================ */
const fromDbStatus = (s: DbSession['status']): SessionStatus =>
  s === 'COMPLETED' ? 'completed' : s === 'IN PROGRESS' ? 'in-progress' : 'planned';

const toDbStatus = (s: SessionStatus): DbSession['status'] =>
  s === 'completed' ? 'COMPLETED' : s === 'in-progress' ? 'IN PROGRESS' : 'PLANNED';

/* ============================================================
   COMPONENT
   ============================================================ */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    IonAvatar,
    IonBadge,
    IonButton,
    IonRefresherContent,  
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonContent,  
    IonIcon,
    IonNote,
    IonSearchbar,
    IonSegment,
    IonSegmentButton,
    IonSpinner,
    IonRefresher, 
    IonButtons,
  IonHeader,
  IonToolbar 
  ],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage implements OnInit {
  private db = inject(SupabaseService);
  private router = inject(Router);
  private modalCtrl = inject(ModalController);
  private alertCtrl = inject(AlertController);
  deletingPatient = signal(false);
  private toastCtrl = inject(ToastController);
  /* ------------------------------------------------------------
     STATE
     ------------------------------------------------------------ */
  view = signal<'dashboard' | 'patients' | 'patient'>('dashboard');
  activeTab = signal<'overview' | 'sessions' | 'medical'>('overview');
  query = signal('');
  selectedId = signal('');

  patients = signal<PatientView[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  busyIds = signal<Set<string>>(new Set());
  studentName = signal('Student');
  today = new Date();

  /* ------------------------------------------------------------
     COMPUTED
     ------------------------------------------------------------ */
  selected = computed(() =>
    this.patients().find((patient) => patient.id === this.selectedId())
      ?? this.patients()[0]
  );

  filteredPatients = computed(() =>
    this.patients().filter((patient) =>
      `${patient.name} ${patient.concern}`
        .toLowerCase()
        .includes(this.query().toLowerCase())
    )
  );

  upcomingSessions = computed(() =>
    this.patients()
      .flatMap((patient) =>
        patient.sessions
          .filter((session) => session.status !== 'completed')
          .map((session) => ({
            ...session,
            patientName: patient.name,
            patientId: patient.id,
          }))
      )
      .sort((a, b) => a.date.localeCompare(b.date))
  );

  completedSessions = computed(() =>
    this.patients().reduce(
      (total, patient) =>
        total +
        patient.sessions.filter((session) => session.status === 'completed')
          .length,
      0
    )
  );

  firstName = computed(() => {
  const name = this.studentName();
  
  if (name.includes('@')) {
    return name.split('@')[0];
  }
  return name.split(' ')[0];
});me = computed(() => this.studentName().split(' ')[0]);

studentInitials = computed(() => {
  const name = this.studentName();
  
  if (name.includes('@')) {
    return name.split('@')[0].slice(0, 2).toUpperCase();
  }
  return name
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
});

  greeting = computed(() => {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  });

  /* ------------------------------------------------------------
     LIFECYCLE
     ------------------------------------------------------------ */
  constructor() {
    addIcons({
      add,
      arrowBack,
      arrowForward,
      calendarOutline,
      checkmarkCircle,
      chevronForward,
      gridOutline,
      peopleOutline,
      search,
      timeOutline,
      logOutOutline,
      closeOutline,
      chevronDownCircleOutline,
      searchOutline,
      sparklesOutline,
    });
  }

  @ViewChild('dashboardHeading') dashboardHeading?: ElementRef<HTMLElement>;
  @ViewChild('patientsHeading') patientsHeading?: ElementRef<HTMLElement>;
  @ViewChild('patientHeading') patientHeading?: ElementRef<HTMLElement>;
  async ngOnInit(): Promise<void> {
    await this.load();
  }

  /* ------------------------------------------------------------
     DATA LOADING
     ------------------------------------------------------------ */
  // silent = true refreshes the data without showing the full-page spinner
  async load(silent = false): Promise<void> {
    if (!silent) {
      this.loading.set(true);
    }
    this.error.set(null);

    try {
      const user = await this.db.getCurrentUser();
      this.studentName.set(
        user?.user_metadata?.['full_name'] ?? user?.email ?? 'Student'
      );

      const [patientsRes, sessionsRes] = await Promise.all([
        this.db.getPatients(),
        this.db.getSessions(),
      ]);

      if (patientsRes.error || sessionsRes.error) {
        throw patientsRes.error ?? sessionsRes.error;
      }

      const sessions = (sessionsRes.data ?? []) as DbSession[];

      const views: PatientView[] = (patientsRes.data ?? []).map((pt: any) => ({
        id: pt.id,
        firstName: pt.first_name ?? '',
        lastName: pt.last_name ?? '',
        initials: `${pt.first_name?.[0] ?? ''}${pt.last_name?.[0] ?? ''}`.toUpperCase(),
        name: `${pt.first_name ?? ''} ${pt.last_name ?? ''}`.trim(),
        concern: pt.condition ?? '',
        allergies: pt.allergies ?? 'No known allergies',
        medications: pt.medications ?? 'None reported',
        sessions: sessions
          .filter((s) => s.patient_id === pt.id)
          .sort((a, b) => a.session_date.localeCompare(b.session_date))
          .map((s) => ({
            id: s.id!,
            date: s.session_date,
            type: s.title,
            procedure: s.description,
            next: (s as any).next_steps ?? '',
            status: fromDbStatus(s.status),
          })),
      }));

      this.patients.set(views);

      // keep the current selection if it still exists, otherwise pick the first
      if (!views.some((p) => p.id === this.selectedId())) {
        this.selectedId.set(views[0]?.id ?? '');
      }
    } catch (err) {
      console.error('Load failed:', err);
      this.error.set('Could not load data. Make sure you are signed in.');
    } finally {
      this.loading.set(false);
    }
  }
  async handleRefresh(event: CustomEvent): Promise<void> {
    try{
      await this.load(true);
    }finally{
      (event.target as HTMLIonRefresherElement).complete();
    }
  }

  /* ------------------------------------------------------------
     NAVIGATION
     ------------------------------------------------------------ */
    go(view: 'dashboard' | 'patients' | 'patient'): void {
      this.view.set(view);
      this.focusHeading(view);
    }

    openPatient(id: string): void {
      this.selectedId.set(id);
      this.activeTab.set('overview');
      this.view.set('patient');
      this.focusHeading('patient');
    }

  setQuery(event: CustomEvent): void {
    this.query.set(event.detail.value ?? '');
  }
  clearSearch(): void {
  this.query.set('');
  }

  setTab(event: CustomEvent): void {
    this.activeTab.set(event.detail.value);
  }


  /* ------------------------------------------------------------
     HELPERS
     ------------------------------------------------------------ */
  completedCount(patient: PatientView): number {
    return patient.sessions.filter(
      (session) => session.status === 'completed'
    ).length;
  }

  nextSession(patient: PatientView): SessionView | undefined {
    return patient.sessions.find((session) => session.status !== 'completed');
  }

  lastVisit(patient: PatientView): string | undefined {
    return [...patient.sessions]
      .reverse()
      .find((session) => session.status === 'completed')?.date;
  }

  statusLabel(status: SessionStatus): string {
    return status === 'in-progress'
      ? 'In progress'
      : status === 'completed'
        ? 'Completed'
        : 'Planned';
  }

  // session_date is a full timestamp in the database, so parse it directly
  formatDate(date: string): string {
    return new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(date));
  }

  shortDate(date: string): string {
    return new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
    }).format(new Date(date));
  }

async toggleSession(sessionId: string): Promise<void> {
  if (this.isBusy(sessionId)) return;

  const patient = this.selected();
  const session = patient?.sessions.find((s) => s.id === sessionId);
  if (!patient || !session) return;

  const previous = this.patients();
  const status: SessionStatus =
    session.status === 'completed' ? 'planned' : 'completed';

  // optimistic update
  this.patients.update((list) =>
    list.map((p) =>
      p.id !== patient.id
        ? p
        : {
            ...p,
            sessions: p.sessions.map((s) =>
              s.id === sessionId ? { ...s, status } : s
            ),
          }
    )
  );

  this.markBusy(sessionId);
  try {
    const { error } = await this.db.updateSessionStatus(
      sessionId,
      toDbStatus(status)
    );

    if (error) {
      console.error('Update failed:', error);
      this.patients.set(previous);
      await this.toast('Could not update the session.', 'danger');
      return;
    }

    await this.toast(
      status === 'completed' ? 'Session marked complete' : 'Session reopened'
    );
  } finally {
    this.clearBusy(sessionId);
  }
}

  async addPatient(): Promise<void> {
    const modal = await this.modalCtrl.create({ component: PatientModal });
    await modal.present();

    const { role } = await modal.onWillDismiss();
    if (role === 'saved') {
      await this.load(true);
    }
  }

  async editPatient(): Promise<void> {
    const patient = this.selected();
    if (!patient) return;

    const modal = await this.modalCtrl.create({
      component: PatientModal,
      componentProps: {
        patient: {
          id: patient.id,
          firstName: patient.firstName,
          lastName: patient.lastName,
          concern: patient.concern,
          allergies: patient.allergies,
          medications: patient.medications,
        },
      },
    });
    await modal.present();

    const { role } = await modal.onWillDismiss();
    if (role === 'saved') {
      await this.load(true);
    }
  }

  async addSession(): Promise<void> {
  if (this.patients().length === 0) {
    await this.toast(
      'Add a patient first, then you can add sessions for them.',
      'warning'
    );
    return;
  }

    const modal = await this.modalCtrl.create({
      component: SessionModal,
      componentProps: {
        patients: this.patients().map((p) => ({ id: p.id, name: p.name })),
        // preselect the open patient when adding from a patient page
        patientId: this.view() === 'patient' ? this.selected()?.id : undefined,
      },
    });
    await modal.present();

    const { role } = await modal.onWillDismiss();
    if (role === 'saved') {
      await this.load(true);
    }
  }

  async signOut(): Promise<void> {
    await this.db.signOut();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
   todaySessions = computed(() =>
    this.upcomingSessions().filter((s) => this.sameDay(new Date(s.date), new Date()))
  );

  overdueCount = computed(
    () => this.upcomingSessions().filter((s) => this.isOverdue(s.date)).length
  );

  focus = computed(() => {
    const today = this.todaySessions();
    const upcoming = this.upcomingSessions();
    const next = upcoming[0];
    const overdue = this.overdueCount();

    if (today.length) {
      const s = today[0];
      return {
        eyebrow: 'Today at the clinic',
        title: `${today.length} session${today.length === 1 ? '' : 's'} today`,
        text: `Up next: ${s.patientName} · ${s.type}`,
        action: 'Open patient',
        kind: 'open' as 'open' | 'session' | 'patient',
        patientId: s.patientId,
      };
    }
    if (overdue) {
      return {
        eyebrow: 'Needs your attention',
        title: `${overdue} overdue session${overdue === 1 ? '' : 's'}`,
        text: `Oldest: ${next.patientName} · ${this.whenLabel(next.date)}`,
        action: 'Open patient',
        kind: 'open' as 'open' | 'session' | 'patient',
        patientId: next.patientId,
      };
    }
    if (next) {
      return {
        eyebrow: 'Your week ahead',
        title: 'Nothing scheduled today',
        text: `Next up: ${next.patientName} · ${this.whenLabel(next.date)}`,
        action: 'Open patient',
        kind: 'open' as 'open' | 'session' | 'patient',
        patientId: next.patientId,
      };
    }
    if (this.patients().length) {
      return {
        eyebrow: 'Your clinical workspace',
        title: 'No sessions planned yet',
        text: 'Plan your next visit so nothing gets missed.',
        action: 'Add a session',
        kind: 'session' as 'open' | 'session' | 'patient',
        patientId: '',
      };
    }
    return {
      eyebrow: 'Your clinical workspace',
      title: 'Let’s add your first patient',
      text: 'Track patient details, plan sessions, and reflect on your work in one calm notebook.',
      action: 'Create a patient record',
      kind: 'patient' as 'open' | 'session' | 'patient',
      patientId: '',
    };
  });

  downloadReport(): void {
    window.print();
  }
private async toast(
  message: string,
  color: 'success' | 'danger' | 'medium' | 'warning' = 'success'
): Promise<void> {
  const t = await this.toastCtrl.create({
    message,
    duration: 2200,
    color,
    position: 'bottom',
    buttons: [{ icon: 'close-outline', role: 'cancel', side: 'end' }],
  });
  await t.present();
}

/* ------------------------------------------------------------
   FOCUS MANAGEMENT
   ------------------------------------------------------------ */
private focusHeading(view: 'dashboard' | 'patients' | 'patient'): void {
  // Wait for Angular to render the new view, then move focus.
  setTimeout(() => {
    const ref =
      view === 'dashboard'
        ? this.dashboardHeading
        : view === 'patients'
          ? this.patientsHeading
          : this.patientHeading;

    const el = ref?.nativeElement;
    if (!el) return;

    el.focus({ preventScroll: false });
    // Announce the change to screen readers
    el.setAttribute('aria-live', 'polite');
  }, 0);
}
private async confirmDelete(header: string, message: string): Promise<boolean> {
  const alert = await this.alertCtrl.create({
    header,
    message,
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Delete',
        role: 'confirm',
        cssClass: 'alert-danger',   // ← add this
      },
    ],
  });
  await alert.present();
  const { role } = await alert.onDidDismiss();
  return role === 'confirm';
}

async deletePatient(): Promise<void> {
  const patient = this.selected();
  if (!patient) return;
  if (this.deletingPatient()) return;

  const n = patient.sessions.length;
  const ok = await this.confirmDelete(
    'Delete this patient?',
    n > 0
      ? `${patient.name} and ${n} session${n === 1 ? '' : 's'} will be permanently deleted. This can't be undone.`
      : `${patient.name} will be permanently deleted. This can't be undone.`
  );
  if (!ok) return;

  this.deletingPatient.set(true);
  try {
    const { error } = await this.db.deletePatient(patient.id);
    if (error) {
      console.error('Delete failed:', error);
      await this.toast('Could not delete the patient.', 'danger');
      return;
    }

    this.view.set('patients');
    await this.load(true);
    await this.toast('Patient deleted');
  } finally {
    this.deletingPatient.set(false);
  }
}

async deleteSession(sessionId: string): Promise<void> {
  if (this.isBusy(sessionId)) return;

  const patient = this.selected();
  const session = patient?.sessions.find((s) => s.id === sessionId);
  if (!patient || !session) return;

  const ok = await this.confirmDelete(
    'Delete session?',
    `"${session.type}" on ${this.formatDate(session.date)} will be permanently deleted.`
  );
  if (!ok) return;

  const previous = this.patients();

  // remove it from the screen right away
  this.patients.update((list) =>
    list.map((p) =>
      p.id !== patient.id
        ? p
        : { ...p, sessions: p.sessions.filter((s) => s.id !== sessionId) }
    )
  );

  this.markBusy(sessionId);
  try {
    const { error } = await this.db.deleteSession(sessionId);

    if (error) {
      console.error('Delete failed:', error);
      this.patients.set(previous);
      await this.toast('Could not delete the session.', 'danger');
      return;
    }

    await this.toast('Session deleted');
  } finally {
    this.clearBusy(sessionId);
  }
}
    private sameDay(a: Date, b: Date): boolean {
    return a.toDateString() === b.toDateString();
  }

isOverdue(date: string): boolean {
  const d = new Date(date);
  if (d.getHours() === 0 && d.getMinutes() === 0) {
    const endOfDay = new Date(d);
    endOfDay.setHours(23, 59, 59, 999);
    return endOfDay.getTime() < Date.now();
  }
  return d.getTime() < Date.now();
}

  dayLabel(date: string): string {
    const d = new Date(date);
    const now = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(now.getDate() + 1);
    if (this.sameDay(d, now)) return 'Today';
    if (this.sameDay(d, tomorrow)) return 'Tomorrow';
    return this.shortDate(date);
  }

  // "Today · 2:30 PM" (the time is left out for midnight, i.e. date-only entries)
  whenLabel(date: string): string {
    const d = new Date(date);
    const time =
      d.getHours() === 0 && d.getMinutes() === 0
        ? ''
        : new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(d);
    return time ? `${this.dayLabel(date)} · ${time}` : this.dayLabel(date);
  }

  runFocus(): void {
    const f = this.focus();
    if (f.kind === 'open') this.openPatient(f.patientId);
    else if (f.kind === 'session') this.addSession();
    else this.addPatient();
  }
async completeSession(
  patientId: string,
  sessionId: string,
  event?: Event
): Promise<void> {
  event?.stopPropagation();
  if (this.isBusy(sessionId)) return;

  const previous = this.patients();
  this.patients.update((list) =>
    list.map((p) =>
      p.id !== patientId
        ? p
        : {
            ...p,
            sessions: p.sessions.map((s) =>
              s.id === sessionId
                ? { ...s, status: 'completed' as SessionStatus }
                : s
            ),
          }
    )
  );

  this.markBusy(sessionId);
  try {
    const { error } = await this.db.updateSessionStatus(
      sessionId,
      toDbStatus('completed')
    );

    if (error) {
      console.error('Update failed:', error);
      this.patients.set(previous);
      await this.toast('Could not update the session.', 'danger');
      return;
    }

    await this.toast('Session marked complete');
  } finally {
    this.clearBusy(sessionId);
  }
}
  /* ------------------------------------------------------------
   BUSY STATE (per-row action guards)
   ------------------------------------------------------------ */
private markBusy(id: string): void {
  this.busyIds.update((set) => {
    const next = new Set(set);
    next.add(id);
    return next;
  });
}

private clearBusy(id: string): void {
  this.busyIds.update((set) => {
    const next = new Set(set);
    next.delete(id);
    return next;
  });
}

isBusy(id: string): boolean {
  return this.busyIds().has(id);
}


}