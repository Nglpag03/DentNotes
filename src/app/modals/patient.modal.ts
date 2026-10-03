import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, inject, signal } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { SupabaseService } from '../services/supabase.service';

@Component({
  selector: 'app-patient-modal',
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonInput,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ patient ? 'Edit patient' : 'New patient' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">Cancel</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="row">
        <div class="field">
          <label>First name</label>
          <ion-input placeholder="First name" [value]="firstName()"
            (ionInput)="firstName.set($any($event).detail.value ?? '')"></ion-input>
        </div>
        <div class="field">
          <label>Last name</label>
          <ion-input placeholder="Last name" [value]="lastName()"
            (ionInput)="lastName.set($any($event).detail.value ?? '')"></ion-input>
        </div>
      </div>

      <div class="field">
        <label>Chief concern</label>
        <ion-input placeholder="e.g. Sensitivity on upper right molar" [value]="condition()"
          (ionInput)="condition.set($any($event).detail.value ?? '')"></ion-input>
      </div>

      <div class="field">
        <label>Allergies</label>
        <ion-input placeholder="Leave empty if none known" [value]="allergies()"
          (ionInput)="allergies.set($any($event).detail.value ?? '')"></ion-input>
      </div>

      <div class="field">
        <label>Medications</label>
        <ion-input placeholder="Leave empty if none reported" [value]="medications()"
          (ionInput)="medications.set($any($event).detail.value ?? '')"></ion-input>
      </div>

      <p class="error" *ngIf="error()">{{ error() }}</p>

      <ion-button class="save" expand="block" [disabled]="busy()" (click)="save()">
        <ion-spinner *ngIf="busy()" name="dots"></ion-spinner>
        <span *ngIf="!busy()">{{ patient ? 'Save changes' : 'Save patient' }}</span>
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
    ion-input {
      --padding-start: 12px; --padding-end: 12px;
      border: 1px solid #e6deef; border-radius: 10px; min-height: 44px;
      font-size: 13px; background: #fff;
    }
    ion-input:focus-within { border-color: #b79af5; }
    .error { color: #b04a4a; font-size: 11px; margin: 4px 0 12px; }
    .save {
      --background: #3a2153; --background-hover: #2c1940; --color: #fff;
      --border-radius: 10px; --box-shadow: none; text-transform: none;
      font-weight: 800; font-size: 13px; height: 44px; margin-top: 8px;
    }
    @media (max-width: 500px) { .row { grid-template-columns: 1fr; } }
  `],
})
export class PatientModal implements OnInit {
  private db = inject(SupabaseService);
  private modalCtrl = inject(ModalController);

  // set through componentProps when editing; leave empty to create
  @Input() patient?: {
    id: string;
    firstName: string;
    lastName: string;
    concern: string;
    allergies: string;
    medications: string;
  };

  firstName = signal('');
  lastName = signal('');
  condition = signal('');
  allergies = signal('');
  medications = signal('');
  busy = signal(false);
  error = signal<string | null>(null);

  ngOnInit(): void {
    if (!this.patient) return;
    this.firstName.set(this.patient.firstName);
    this.lastName.set(this.patient.lastName);
    this.condition.set(this.patient.concern);
    // the defaults are shown as empty fields
    this.allergies.set(
      this.patient.allergies === 'No known allergies' ? '' : this.patient.allergies
    );
    this.medications.set(
      this.patient.medications === 'None reported' ? '' : this.patient.medications
    );
  }

  cancel(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  async save(): Promise<void> {
    this.error.set(null);

    const first = this.firstName().trim();
    const last = this.lastName().trim();
    if (!first || !last) {
      this.error.set('Please enter the first and last name.');
      return;
    }

    this.busy.set(true);
    try {
      const fields = {
        first_name: first,
        last_name: last,
        condition: this.condition().trim(),
        allergies: this.allergies().trim() || 'No known allergies',
        medications: this.medications().trim() || 'None reported',
      };

      const { error } = this.patient
        ? await this.db.updatePatient(this.patient.id, fields)
        : await this.db.addPatient(fields);
      if (error) throw error;
      await this.modalCtrl.dismiss(null, 'saved');
    } catch (err: any) {
      this.error.set(err?.message ?? 'Could not save the patient.');
    } finally {
      this.busy.set(false);
    }
  }
}