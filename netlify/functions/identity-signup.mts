import type { UserSignupEvent } from '@netlify/functions';
import { ownerEmail } from '../../server/access.mjs';

export default {
  userSignup(event: UserSignupEvent) {
    if (event.user.email?.trim().toLowerCase() !== ownerEmail()) return event.deny();
    return { user: { ...event.user, appMetadata: { ...event.user.appMetadata, roles: ['admin'] } } };
  },
};
