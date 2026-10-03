export interface Session {
  id?: string;
  patient_id: string;
  title: string;
  description: string;
  session_date: string;
  status: 'IN PROGRESS' | 'PLANNED' | 'COMPLETED';
  next_steps?: string;
  user_id?: string;
  patients?: { first_name: string; last_name: string };
}