// Order & OrderItem status state machine.
// The server is the single source of truth for valid transitions. The client
// may request any transition; we reject illegal ones with 409 Conflict.
// This is the concurrency-safety boundary for the order workflow.

export const ORDER_STATUS = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  VOIDED: 'VOIDED',
} as const
export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS]

export const ORDER_ITEM_STATUS = {
  PENDING: 'PENDING',
  PREPARING: 'PREPARING',
  READY: 'READY',
  SERVED: 'SERVED',
  CANCELLED: 'CANCELLED',
} as const
export type OrderItemStatus =
  typeof ORDER_ITEM_STATUS[keyof typeof ORDER_ITEM_STATUS]

// Allowed transitions. Anything not in this map is illegal.
const ORDER_ITEM_TRANSITIONS: Record<OrderItemStatus, OrderItemStatus[]> = {
  PENDING: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'], // kitchen can cancel mid-prep if e.g. out of stock
  READY: ['SERVED'],
  SERVED: [], // terminal (for the item; the order may still be open)
  CANCELLED: [], // terminal
}

export function isValidItemTransition(
  from: string,
  to: string,
): boolean {
  const allowed = ORDER_ITEM_TRANSITIONS[from as OrderItemStatus]
  if (!allowed) return false
  return allowed.includes(to as OrderItemStatus)
}

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  OPEN: ['CLOSED', 'VOIDED'],
  CLOSED: ['VOIDED'], // a closed order can still be voided (refund/correction)
  VOIDED: [], // terminal
}

export function isValidOrderTransition(from: string, to: string): boolean {
  const allowed = ORDER_TRANSITIONS[from as OrderStatus]
  if (!allowed) return false
  return allowed.includes(to as OrderStatus)
}

// Which roles are allowed to perform which item-status transition.
// This is the role boundary for the kitchen workflow.
const ITEM_TRANSITION_ROLES: Record<string, string[]> = {
  // PENDING -> PREPARING : kitchen starts cooking
  'PENDING->PREPARING': ['KITCHEN', 'MANAGER'],
  // PREPARING -> READY : kitchen finishes
  'PREPARING->READY': ['KITCHEN', 'MANAGER'],
  // READY -> SERVED : waiter delivers to table
  'READY->SERVED': ['WAITER', 'CASHIER', 'MANAGER'],
  // -> CANCELLED : manager or kitchen (if not yet served)
  'PENDING->CANCELLED': ['WAITER', 'KITCHEN', 'CASHIER', 'MANAGER'],
  'PREPARING->CANCELLED': ['MANAGER', 'KITCHEN'], // void mid-prep = authority needed
}

export function canRoleTransitionItem(
  role: string,
  from: string,
  to: string,
): boolean {
  const key = `${from}->${to}`
  const roles = ITEM_TRANSITION_ROLES[key]
  return !!roles && roles.includes(role)
}
