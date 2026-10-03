export interface Patient {
  id?: string;
  first_name: string;
  last_name: string;
  condition: string;
  allergies?: string;
  medications?: string;
  created_at?: string;
  user_id?: string;
}