// IMPORTANT: Replace with your VPS IP address
export const API_URL = 'http://YOUR_VPS_IP:3000';
export const WS_URL = 'http://YOUR_VPS_IP:3000';

export const ENDPOINTS = {
  LOGIN: '/api/login',
  REGISTER: '/api/register',
  BALANCE: '/api/balance',
  DEVICES: '/api/devices',
  CREATE_DEVICE: '/api/devices',
  REGISTER_SIM: '/api/sims/register',
  REQUEST_ORDER: '/api/orders/request',
  GET_ORDER: '/api/orders/:orderId',
  ACTIVATE_ORDER: '/api/orders/activate',
  WITHDRAW: '/api/withdraw',
  WITHDRAWALS: '/api/withdrawals',
  REFERRAL_LINK: '/api/referral-link',
  REFERRALS: '/api/referrals'
};

export const CONFIG = {
  MIN_WITHDRAWAL: 10,
  MAX_WITHDRAWAL: 10000,
  SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours
  HEARTBEAT_INTERVAL: 30000, // 30 seconds
};
