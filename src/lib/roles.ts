// Role definitions and permission helpers. Minimal set: 4 roles.
export const ROLES = {
  MANAGER: 'MANAGER',
  WAITER: 'WAITER',
  KITCHEN: 'KITCHEN',
  CASHIER: 'CASHIER',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

export const ALL_ROLES: Role[] = [
  ROLES.MANAGER,
  ROLES.WAITER,
  ROLES.KITCHEN,
  ROLES.CASHIER,
]

// Capability matrix. We check capabilities, not role names, at the API boundary
// so that adding a role later only touches this file.
export type Capability =
  | 'order:create'
  | 'order:read'
  | 'order:edit_items'
  | 'order:advance_item' // status transitions
  | 'order:apply_discount'
  | 'order:record_payment'
  | 'order:close'
  | 'order:void'
  | 'menu:read'
  | 'menu:manage'
  | 'shift:open'
  | 'shift:close'
  | 'staff:manage'
  | 'reports:read'

const CAPABILITY_MAP: Record<Role, Capability[]> = {
  MANAGER: [
    'order:create',
    'order:read',
    'order:edit_items',
    'order:advance_item',
    'order:apply_discount',
    'order:record_payment',
    'order:close',
    'order:void',
    'menu:read',
    'menu:manage',
    'shift:open',
    'shift:close',
    'staff:manage',
    'reports:read',
  ],
  WAITER: [
    'order:create',
    'order:read',
    'order:edit_items',
    'order:advance_item', // waiter can mark READY -> SERVED
    'menu:read',
    'shift:open',
  ],
  KITCHEN: [
    'order:read',
    'order:advance_item', // kitchen marks PENDING -> PREPARING -> READY
    'menu:read',
  ],
  CASHIER: [
    'order:read',
    'order:advance_item',
    'order:apply_discount',
    'order:record_payment',
    'order:close',
    'menu:read',
    'shift:open',
    'reports:read',
  ],
}

export function can(role: string, capability: Capability): boolean {
  const caps = CAPABILITY_MAP[role as Role]
  return !!caps && caps.includes(capability)
}
