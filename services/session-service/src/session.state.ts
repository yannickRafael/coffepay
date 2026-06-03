// The session state machine lives in @coffepay/shared (reused by the payment
// result handler). Re-exported here for local imports.
export { ALLOWED_TRANSITIONS, assertTransition, transitionSession } from '@coffepay/shared';
