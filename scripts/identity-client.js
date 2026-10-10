import {
  login, logout, signup, getUser, handleAuthCallback, acceptInvite,
  requestPasswordRecovery, updateUser, onAuthChange, AUTH_EVENTS,
} from '@netlify/identity';

window.cloudIdentity = {
  login, logout, signup, getUser, handleAuthCallback, acceptInvite,
  requestPasswordRecovery, updateUser, onAuthChange, AUTH_EVENTS,
};
window.initializeCloud();
