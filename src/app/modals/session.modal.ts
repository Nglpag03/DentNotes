import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, inject, signal } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { SupabaseService } from '../services/supabase.service';
import { Session } from '../models/session';

@Component({
  selector: 'app-session-modal',
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTextarea,
    IonTitle,
    IonToolbar,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>New session</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">Cancel</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="field">
        <label>Patient</label>
        <ion-select interface="popover" placeholder="Choose a patient"
          [value]="pid()" (ionChange)="pid.set($any($event).detail.value)">
          <ion-select-option *ngFor="let p of patients" [value]="p.id">{{ p.name }}</ion-select-option>
        </ion-select>
      </div>

      <div class="field">
        <label>Session type</label>
        <ion-input placeholder="e.g. Initial assessment" [value]="title()"
          (ionInput)="title.set($any($event).detail.value ?? '')"></ion-input>
      </div>

      <div class="field">
        <label>Procedure</label>
        <ion-textarea rows="3" placeholder="What will be or was done" [value]="description()"
          (ionInput)="description.set($any($event).detail.value ?? '')"></ion-textarea>
      </div>

      <div class="row">
        <div class="field">
          <label>Date and time</label>
          <ion-input type="datetime-local" [value]="date()"
            (ionInput)="date.set($any($event).detail.value ?? '')"></ion-input>
        </div>
        <div class="field">
          <label>Status</label>
          <ion-select interface="popover" [value]="status()"
            (ionChange)="status.set($any($event).detail.value)">
            <ion-select-option value="PLANNED">Planned</ion-select-option>
            <ion-select-option value="IN PROGRESS">In progress</ion-select-option>
            <ion-select-option value="COMPLETED">Completed</ion-select-option>
          </ion-select>
        </div>
      </div>

      <div class="field">
        <label>Next steps (optional)</label>
        <ion-textarea rows="2" placeholder="e.g. Review sensitivity in 4 weeks" [value]="next()"
          (ionInput)="next.set($any($event).detail.value ?? '')"></ion-textarea>
      </div>

      <p class="error" *ngIf="error()">{{ error() }}</p>

      <ion-button class="save" expand="block" [disabled]="busy()" (click)="save()">
        <ion-spinner *ngIf="busy()" name="dots"></ion-spinner>
        <span *ngIf="!busy()">Save session</span>
      </ion-button>
    </ion-content>
  `,
  styles: [`
    :host { font-family: 'Manrope', system-ui, sans-serif; color: #43265d; }
    ion-toolbar { --background: #f5f1fb; --color: #43265d; }
    ion-title { font-weight: 800; font-size: 15px; }
    ion-content { --background: #fbf9ff; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .field { margin-bottom: 14px; }
    label {
      display: block; font-size: 10px; font-weight: 800; letter-spacing: .1em;
      text-transform: uppercase; color: #89769a; margin-bottom: 6px;
    }
    ion-input, ion-textarea, ion-select {
      --padding-start: 12px; --padding-end: 12px;
      border: 1px solid #e6deef; border-radius: 10px; min-height: 44px;
      font-size: 13px; background: #fff;
    }
    ion-textarea { --padding-top: 10px; --padding-bottom: 10px; }
    ion-input:focus-within, ion-textarea:focus-within { border-color: #b79af5; }
    .error { color: #b04a4a; font-size: 11px; margin: 4px 0 12px; }
    .save {
      --background: #3a2153; --background-hover: #2c1940; --color: #fff;
      --border-radius: 10px; --box-shadow: none; text-transform: none;
      font-weight: 800; font-size: 13px; height: 44px; margin-top: 8px;
    }
    @media (max-width: 500px) { .row { grid-template-columns: 1fr; } }
  `],
})
export class SessionModal implements OnInit {
  private db = inject(SupabaseService);
  private modalCtrl = inject(ModalController);

  // set through componentProps from the home page
  @Input() patients: { id: string; name: string }[] = [];
  @Input() patientId?: string;

  pid = signal('');
  title = signal('');
  description = signal('');
  date = signal('');
  status = signal<Session['status']>('PLANNED');
  next = signal('');
  busy = signal(false);
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.pid.set(this.patientId ?? '');
    this.date.set(this.nowLocal());
  }

  // "YYYY-MM-DDTHH:mm" in the user's local time, as datetime-local expects
  private nowLocal(): string {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  cancel(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  async save(): Promise<void> {
    this.error.set(null);

    if (!this.pid()) {
      this.error.set('Please choose a patient.');
      return;
    }
    if (!this.title().trim()) {
      this.error.set('Please enter the session type.');
      return;
    }
    const when = new Date(this.date());
    if (isNaN(when.getTime())) {
      this.error.set('Please enter a valid date and time.');
      return;
    }

    this.busy.set(true);
    try {
      const { error } = await this.db.addSession({
        patient_id: this.pid(),
        title: this.title().trim(),
        description: this.description().trim(),
        session_date: when.toISOString(),
        status: this.status(),
        next_steps: this.next().trim() || undefined,
      });
      if (error) throw error;
      await this.modalCtrl.dismiss(null, 'saved');
    } catch (err: any) {
      this.error.set(err?.message ?? 'Could not save the session.');
    } finally {
      this.busy.set(false);
    }
  }
}