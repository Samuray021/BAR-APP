export type StaffRole = 'manager' | 'bartender'

export interface Staff {
  id: string
  name: string
  username: string | null
  role: StaffRole
  active: boolean
  auth_user_id: string | null
}

export interface Ingredient {
  name: string
  amount: string
  unit: string
}

export interface Recipe {
  id: string
  name: string
  category: string
  ingredients: Ingredient[]
  preparation: string | null
  yield: number | null
  vessel: string | null
  cost: number | null
  price: number | null
  note: string | null
  created_at?: string
  updated_at?: string
}
