export type Database = {
  public: {
    Tables: {
      properties: {
        Row: {
          id: string
          name: string | null
          address: string | null
          user_id: string
        }
        Insert: {
          id?: string
          name?: string | null
          address?: string | null
          user_id: string
        }
        Update: {
          name?: string | null
          address?: string | null
        }
      }

      property_members: {
        Row: {
          property_id: string
          user_id: string
        }
        Insert: {
          property_id: string
          user_id: string
        }
        Update: {}
      }

      locations: {
        Row: {
          id: string
          name: string
          parent_id: string | null
          property_id: string
        }
        Insert: any
        Update: any
      }

      items: {
        Row: any
        Insert: any
        Update: any
      }

      item_photos: {
        Row: any
        Insert: any
        Update: any
      }
    }
  }
}