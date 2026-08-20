export interface PitchTemplate {
  id: string;
  niche_name: string;
  pain_points: string;
  mr2_solution: string;
  created_at?: string;
}

export type PitchTemplateInsert = Omit<PitchTemplate, 'id' | 'created_at'>;
export type PitchTemplateUpdate = Partial<PitchTemplateInsert>;

export interface Database {
  public: {
    Tables: {
      pitch_templates: {
        Row: PitchTemplate;
        Insert: PitchTemplateInsert;
        Update: PitchTemplateUpdate;
      };
    };
  };
}
