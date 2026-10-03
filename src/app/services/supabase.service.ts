import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Patient } from '../models/patient';
import { Session } from '../models/session';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      environment.supabaseUrl,
      environment.supabaseKey
    );
  }

  // --- AUTH ---
  async signIn(email: string, password: string) {
    return await this.supabase.auth.signInWithPassword({ email, password });
  }

  async signUp(fullName: string, email: string, password: string) {
    return await this.supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
  }

  async signOut() {
    return await this.supabase.auth.signOut();
  }

  async hasSession(): Promise<boolean> {
    const { data } = await this.supabase.auth.getSession();
    return !!data.session;
  }

  async sendPasswordReset(email: string) {
    return await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
  }

  async updatePassword(password: string) {
    return await this.supabase.auth.updateUser({ password });
  }

  // returns a function that stops listening
  onAuthChange(callback: (event: string) => void): () => void {
    const { data } = this.supabase.auth.onAuthStateChange((event) => callback(event));
    return () => data.subscription.unsubscribe();
  }

  async getCurrentUser() {
    const { data } = await this.supabase.auth.getUser();
    return data.user;
  }

  // --- PATIENTS ---
  async getPatients() {
    return await this.supabase
      .from('patients')
      .select('*')
      .order('created_at', { ascending: false });
  }

  async addPatient(patient: Omit<Patient, 'id' | 'created_at' | 'user_id'>) {
    const { data: { user } } = await this.supabase.auth.getUser();
    return await this.supabase
      .from('patients')
      .insert({ ...patient, user_id: user?.id })
      .select()
      .single();
  }

  async updatePatient(
    id: string,
    patient: Partial<Omit<Patient, 'id' | 'created_at' | 'user_id'>>
  ) {
    return await this.supabase
      .from('patients')
      .update(patient)
      .eq('id', id)
      .select()
      .single();
  }

  async deletePatient(id: string) {
    // sessions are removed too (ON DELETE CASCADE)
    return await this.supabase.from('patients').delete().eq('id', id);
  }

  // --- SESSIONS ---
  async getSessions() {
    return await this.supabase
      .from('sessions')
      .select('*, patients(first_name, last_name)')
      .order('session_date', { ascending: true });
  }

  async addSession(session: Omit<Session, 'id' | 'user_id' | 'patients'>) {
    const { data: { user } } = await this.supabase.auth.getUser();
    return await this.supabase
      .from('sessions')
      .insert({ ...session, user_id: user?.id })
      .select()
      .single();
  }

  async updateSessionStatus(id: string, status: Session['status']) {
    return await this.supabase
      .from('sessions')
      .update({ status })
      .eq('id', id)
      .select()
      .single();
  }

  async deleteSession(id: string) {
    return await this.supabase.from('sessions').delete().eq('id', id);
  }

  // --- UTILITY ---
  async testConnection() {
    const { data, error } = await this.supabase.from('patients').select('*');
    console.log('Supabase response:', data, 'Error:', error);
    return { data, error };
  }
}